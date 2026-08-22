/**
 * lib/faro/gate.ts
 *
 * Verificación de Gate/Checkpoint — invocada bajo demanda (al intentar
 * avanzar de pestaña, o desde la insignia flotante de bloqueos).
 *
 * La parte de preguntas P1 es lectura pura, determinística, sin costo.
 * Para C1 específicamente, además compone la verificación semántica ya
 * existente (gateSemantico.ts → verificadorSemantico.ts): si se pide
 * explícitamente (opts.incluirVerificacionSemantica=true), hace 1-2
 * llamadas LLM y persiste el resultado (lo hace el caller, no esta
 * función); si no se pide, lee el último resultado cacheado en
 * projects.gate_semantico_ultimo (lectura barata, sin LLM) — y lo
 * invalida (semantico_desactualizado=true) si algún nodo relevante fue
 * reabierto/regenerado/reconfirmado después de ese cálculo, comparando
 * iteraciones confirmadas. Importante: esto solo afecta la INSIGNIA
 * ambiental — el gate real que bloquea el avance de pestaña siempre pide
 * incluirVerificacionSemantica=true y por lo tanto recalcula fresco, sin
 * depender nunca del caché.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NodoTipo } from "./clasificacionPreguntas";
import {
  evaluarCoherenciaSemanticaCheckpoint,
  hayContradiccionCritica,
  obtenerIteracionesConfirmadas,
  iteracionesCoinciden,
} from "./gateSemantico";
import type { ResultadoCoherenciaPar } from "./verificadorSemantico";

export type Checkpoint = "C0" | "C1" | "C2" | "C3";

interface ConfigCheckpoint {
  nodosEvaluados: NodoTipo[];
  activo: boolean;
}

const CONFIG_CHECKPOINTS: Record<Checkpoint, ConfigCheckpoint> = {
  C0: { nodosEvaluados: ["RUTA", "NOVA"], activo: true },
  C1: { nodosEvaluados: ["RUTA", "NOVA", "OBJETIVOS"], activo: true },
  C2: { nodosEvaluados: ["METODOLOGIA"], activo: false },
  C3: { nodosEvaluados: [], activo: false }, // ya cubierto por TarjetaConvergencia
};

/** Checkpoints activos hoy — usado por la insignia flotante para saber cuáles consultar. */
export function obtenerCheckpointsActivos(): Checkpoint[] {
  return (Object.keys(CONFIG_CHECKPOINTS) as Checkpoint[]).filter((cp) => CONFIG_CHECKPOINTS[cp].activo);
}

export interface PreguntaBloqueante {
  id: string;
  nodo_tipo: string;
  campo_origen: string | null;
  texto_pregunta: string;
  nodos_afectados: string[];
}

/** Forma cacheada en projects.gate_semantico_ultimo. */
interface CacheSemanticoGate {
  checkpoint: Checkpoint;
  pares: ResultadoCoherenciaPar[];
  evaluado_en: string;
  iteraciones: Record<string, number>; // snapshot de iteración confirmada por nodo, al momento del cálculo
}

export interface ResultadoGate {
  checkpoint: Checkpoint;
  bloqueado: boolean;
  activo: boolean; // si el checkpoint todavía no está activado, bloqueado siempre es false
  preguntas_bloqueantes: PreguntaBloqueante[];
  // null = no aplica a este checkpoint, o no se ha evaluado/cacheado todavía,
  // o el caché existente quedó desactualizado (ver semantico_desactualizado)
  contradicciones_semanticas: ResultadoCoherenciaPar[] | null;
  semantico_evaluado_en: string | null;
  // true = había un resultado cacheado pero algún nodo relevante cambió
  // desde entonces (reabierto/regenerado/reconfirmado) — el caché se
  // descarta en vez de mostrarse como si siguiera vigente.
  semantico_desactualizado: boolean;
  // snapshot de iteraciones usado en ESTE cálculo fresco (solo presente
  // cuando opts.incluirVerificacionSemantica=true) — el caller lo persiste
  // junto con contradicciones_semanticas para poder detectar staleness después.
  semantico_iteraciones: Record<string, number> | null;
}

export async function verificarGate(
  supabase: SupabaseClient,
  project_id: string,
  checkpoint: Checkpoint,
  opts: { incluirVerificacionSemantica?: boolean } = {}
): Promise<ResultadoGate> {
  const config = CONFIG_CHECKPOINTS[checkpoint];

  if (!config.activo) {
    return {
      checkpoint,
      bloqueado: false,
      activo: false,
      preguntas_bloqueantes: [],
      contradicciones_semanticas: null,
      semantico_evaluado_en: null,
      semantico_desactualizado: false,
      semantico_iteraciones: null,
    };
  }

  const { data, error } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, campo_origen, texto_pregunta, nodos_afectados")
    .eq("project_id", project_id)
    .eq("estado", "abierta")
    .eq("prioridad", "P1")
    .is("depende_de", null)
    .in("nodo_tipo", config.nodosEvaluados);

  if (error) {
    console.error("[verificarGate] error:", error.message);
    // Fail-open deliberado: un error de lectura no debe impedir trabajar.
    return {
      checkpoint,
      bloqueado: false,
      activo: true,
      preguntas_bloqueantes: [],
      contradicciones_semanticas: null,
      semantico_evaluado_en: null,
      semantico_desactualizado: false,
      semantico_iteraciones: null,
    };
  }

  const preguntas = (data ?? []) as PreguntaBloqueante[];

  // Verificación semántica compuesta: SOLO para C1 (alcance de esta
  // pieza; C2/C3 no se tocan). Bloquea aunque preguntas.length===0,
  // porque el problema puede ser una contradicción entre dos nodos ya
  // completos, no falta de dato.
  let contradiccionesSemanticas: ResultadoCoherenciaPar[] | null = null;
  let semanticoEvaluadoEn: string | null = null;
  let semanticoDesactualizado = false;
  let semanticoIteraciones: Record<string, number> | null = null;

  if (checkpoint === "C1") {
    if (opts.incluirVerificacionSemantica) {
      const [pares, iteraciones] = await Promise.all([
        evaluarCoherenciaSemanticaCheckpoint(supabase, project_id, config.nodosEvaluados),
        obtenerIteracionesConfirmadas(supabase, project_id, config.nodosEvaluados),
      ]);
      contradiccionesSemanticas = pares;
      semanticoEvaluadoEn = new Date().toISOString();
      semanticoIteraciones = iteraciones;
    } else {
      const { data: proyecto, error: errorCache } = await supabase
        .from("projects")
        .select("gate_semantico_ultimo")
        .eq("id", project_id)
        .maybeSingle();
      if (errorCache) {
        // Fail-open deliberado, igual que con las preguntas P1: si no se
        // puede leer el caché (p.ej. la columna aún no existe porque la
        // migración no se ha aplicado), se trata como "sin caché" — no
        // se bloquea ni se marca desactualizado por un error de lectura.
        console.error("[verificarGate] error leyendo gate_semantico_ultimo:", errorCache.message);
      }
      const cache = (proyecto?.gate_semantico_ultimo ?? null) as CacheSemanticoGate | null;

      if (cache && cache.checkpoint === checkpoint) {
        const iteracionesActuales = await obtenerIteracionesConfirmadas(supabase, project_id, config.nodosEvaluados);
        if (iteracionesCoinciden(cache.iteraciones ?? {}, iteracionesActuales)) {
          contradiccionesSemanticas = cache.pares;
          semanticoEvaluadoEn = cache.evaluado_en;
        } else {
          // Algún nodo cambió desde que se calculó el caché — no lo
          // presentamos como vigente (evita el falso "todo bien").
          semanticoDesactualizado = true;
        }
      }
    }
  }

  const bloqueoSemantico = checkpoint === "C1"
    ? false // C1 no bloquea por contradicciones semánticas (degradado a advertencia L3)
    : (contradiccionesSemanticas ? hayContradiccionCritica(contradiccionesSemanticas) : false);

  return {
    checkpoint,
    bloqueado: preguntas.length > 0 || bloqueoSemantico,
    activo: true,
    preguntas_bloqueantes: preguntas,
    contradicciones_semanticas: contradiccionesSemanticas,
    semantico_evaluado_en: semanticoEvaluadoEn,
    semantico_desactualizado: semanticoDesactualizado,
    semantico_iteraciones: semanticoIteraciones,
  };
}
