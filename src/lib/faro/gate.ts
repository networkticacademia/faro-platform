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
 * projects.gate_semantico_ultimo (lectura barata, sin LLM). Ver
 * gateSemantico.ts para el detalle de esa composición.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NodoTipo } from "./clasificacionPreguntas";
import { evaluarCoherenciaSemanticaCheckpoint, hayContradiccionCritica } from "./gateSemantico";
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
}

export interface ResultadoGate {
  checkpoint: Checkpoint;
  bloqueado: boolean;
  activo: boolean; // si el checkpoint todavía no está activado, bloqueado siempre es false
  preguntas_bloqueantes: PreguntaBloqueante[];
  // null = no aplica a este checkpoint, o no se ha evaluado/cacheado todavía
  contradicciones_semanticas: ResultadoCoherenciaPar[] | null;
  semantico_evaluado_en: string | null;
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
    };
  }

  const { data, error } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, campo_origen, texto_pregunta, nodos_afectados")
    .eq("project_id", project_id)
    .eq("estado", "abierta")
    .eq("prioridad", "P1")
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
    };
  }

  const preguntas = (data ?? []) as PreguntaBloqueante[];

  // Verificación semántica compuesta: SOLO para C1 (alcance de esta
  // pieza; C2/C3 no se tocan). Bloquea aunque preguntas.length===0,
  // porque el problema puede ser una contradicción entre dos nodos ya
  // completos, no falta de dato.
  let contradiccionesSemanticas: ResultadoCoherenciaPar[] | null = null;
  let semanticoEvaluadoEn: string | null = null;

  if (checkpoint === "C1") {
    if (opts.incluirVerificacionSemantica) {
      contradiccionesSemanticas = await evaluarCoherenciaSemanticaCheckpoint(
        supabase,
        project_id,
        config.nodosEvaluados
      );
      semanticoEvaluadoEn = new Date().toISOString();
    } else {
      const { data: proyecto } = await supabase
        .from("projects")
        .select("gate_semantico_ultimo")
        .eq("id", project_id)
        .maybeSingle();
      const cache = (proyecto?.gate_semantico_ultimo ?? null) as CacheSemanticoGate | null;
      if (cache && cache.checkpoint === checkpoint) {
        contradiccionesSemanticas = cache.pares;
        semanticoEvaluadoEn = cache.evaluado_en;
      }
    }
  }

  const bloqueoSemantico = contradiccionesSemanticas
    ? hayContradiccionCritica(contradiccionesSemanticas)
    : false;

  return {
    checkpoint,
    bloqueado: preguntas.length > 0 || bloqueoSemantico,
    activo: true,
    preguntas_bloqueantes: preguntas,
    contradicciones_semanticas: contradiccionesSemanticas,
    semantico_evaluado_en: semanticoEvaluadoEn,
  };
}
