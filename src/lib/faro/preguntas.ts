/**
 * lib/faro/preguntas.ts
 *
 * Sincroniza `preguntas_para_el_usuario` (ya generadas por el LLM dentro del
 * contenido del nodo) hacia la tabla normalizada `preguntas_pendientes`.
 *
 * NO genera preguntas nuevas. NO llama al LLM. Es un post-step de lectura
 * que se invoca UNA VEZ al final de cada endpoint /api/mci/{nodo}/generar
 * ya existente.
 *
 * Por defecto, si insertó preguntas nuevas, dispara reagruparPreguntasAbiertas
 * (llamada al LLM orquestador) para ese proyecto. Al procesar muchos nodos en
 * lote (ver scripts/backfill_preguntas_pendientes.ts) pasar
 * `{ reagrupar: false }` para evitar una llamada al LLM por cada nodo — el
 * caller debe invocar reagruparPreguntasAbiertas manualmente una sola vez al
 * final, por proyecto.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clasificarPrioridad,
  obtenerNodosAfectados,
  type NodoTipo,
} from "./clasificacionPreguntas";
import { reagruparPreguntasAbiertas } from "./agrupamiento";
import { registrarRiesgo } from "./riesgos";

interface PreguntaExtraida {
  campo_origen: string | null;
  texto_pregunta: string;
}

/** Hash simple y determinístico (no criptográfico) para deduplicar por nodo. */
export function hashTexto(texto: string): string {
  const normalizado = texto.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalizado.length; i++) {
    hash = (hash << 5) - hash + normalizado.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function extraerPreguntasDelNodo(contenido: unknown): PreguntaExtraida[] {
  const preguntas = (contenido as { preguntas_para_el_usuario?: unknown })
    ?.preguntas_para_el_usuario;
  if (!Array.isArray(preguntas)) return [];

  return preguntas
    .map((p): PreguntaExtraida | null => {
      if (typeof p === "string") {
        return { campo_origen: null, texto_pregunta: p };
      }
      if (p && typeof p === "object" && "pregunta" in p) {
        const obj = p as { campo?: string; pregunta: string };
        return { campo_origen: obj.campo ?? null, texto_pregunta: obj.pregunta };
      }
      return null;
    })
    .filter((p): p is PreguntaExtraida => p !== null && p.texto_pregunta.trim().length > 0);
}

function mapearNodoTipoAGrafoTipo(nodoTipo: NodoTipo): string {
  if (nodoTipo === "IMPACTOS") return "IMPACTOS_DELIMITACION";
  return nodoTipo;
}

export interface PreguntaSincronizada {
  id: string;
  texto_pregunta: string;
}

export async function sincronizarPreguntasPendientes(
  supabase: SupabaseClient,
  params: { project_id: string; nodo_id: string; nodo_tipo: NodoTipo; contenido: unknown; iteracion?: number },
  opciones?: { reagrupar?: boolean }
): Promise<{ insertadas: number; omitidas_duplicadas: number; preguntas: PreguntaSincronizada[] }> {
  const { project_id, nodo_id, nodo_tipo, contenido, iteracion } = params;
  const reagrupar = opciones?.reagrupar ?? true;
  const extraidas = extraerPreguntasDelNodo(contenido);

  if (extraidas.length === 0) {
    return { insertadas: 0, omitidas_duplicadas: 0, preguntas: [] };
  }

  // 1. Consultar hashes de preguntas existentes en este proyecto y tipo de nodo para deduplicación en código
  const { data: existentes, error: errorExistentes } = await supabase
    .from("preguntas_pendientes")
    .select("texto_hash")
    .eq("project_id", project_id)
    .eq("nodo_tipo", nodo_tipo);

  if (errorExistentes) {
    console.error("[sincronizarPreguntasPendientes] error consultando existentes:", errorExistentes.message);
  }
  const hashesExistentes = new Set((existentes ?? []).map((q) => q.texto_hash));

  // Filtrar duplicados
  const nuevasPreguntas = extraidas.filter((p) => !hashesExistentes.has(hashTexto(p.texto_pregunta)));
  const omitidas_duplicadas = extraidas.length - nuevasPreguntas.length;

  if (nuevasPreguntas.length === 0) {
    return { insertadas: 0, omitidas_duplicadas, preguntas: [] };
  }

  // 2. Determinar si es "génesis" (iteracion === 0) o "regeneración/checkpoint" (iteracion > 0)
  let esRegeneracion: boolean;
  if (typeof iteracion === "number") {
    esRegeneracion = iteracion > 0;
  } else {
    const dbTipoGrafo = mapearNodoTipoAGrafoTipo(nodo_tipo);
    const { data: nodosPrevios, error: errorNodos } = await supabase
      .from("grafo_nodos")
      .select("iteracion")
      .eq("project_id", project_id)
      .eq("tipo", dbTipoGrafo)
      .order("iteracion", { ascending: false })
      .limit(1);

    if (errorNodos) {
      console.error("[sincronizarPreguntasPendientes] error consultando nodos previos:", errorNodos.message);
    }
    const maxIteracion = nodosPrevios?.[0]?.iteracion ?? 0;
    esRegeneracion = maxIteracion > 0 || hashesExistentes.size > 0;
  }

  // 3. Aplicar regla de tope graduado determinístico post-LLM
  const filasParaInsertar: any[] = [];
  const excedentesParaRiesgos: { texto_pregunta: string; prioridad: string }[] = [];
  const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };

  if (esRegeneracion) {
    // Regeneración (iteracion > 0): MÁXIMO 1 pregunta nueva (la de mayor prioridad)
    const ordenadas = nuevasPreguntas.map((p) => ({
      pregunta: p,
      prioridad: clasificarPrioridad(nodo_tipo, p.texto_pregunta),
    })).sort((a, b) => {
      const pA = priorityOrder[a.prioridad] ?? 2;
      const pB = priorityOrder[b.prioridad] ?? 2;
      return pA - pB;
    });

    ordenadas.forEach((item, idx) => {
      const deBajoTope = idx === 0;
      if (deBajoTope) {
        filasParaInsertar.push({
          project_id,
          nodo_id,
          nodo_tipo,
          campo_origen: item.pregunta.campo_origen,
          texto_pregunta: item.pregunta.texto_pregunta,
          texto_hash: hashTexto(item.pregunta.texto_pregunta),
          prioridad: item.prioridad,
          nodos_afectados: obtenerNodosAfectados(nodo_tipo),
          estado: "abierta",
          estado_procedencia: null,
        });
      } else {
        excedentesParaRiesgos.push({
          texto_pregunta: item.pregunta.texto_pregunta,
          prioridad: item.prioridad,
        });
      }
    });
  } else {
    // Génesis (iteracion === 0): todas las P0/P1, y P2/P3 hasta MAX_GENESIS = 5
    const MAX_GENESIS = 5;
    let lowPriorityCount = 0;

    nuevasPreguntas.forEach((p) => {
      const prioridad = clasificarPrioridad(nodo_tipo, p.texto_pregunta);
      const esBaja = prioridad === "P2" || prioridad === "P3";

      if (esBaja) {
        if (lowPriorityCount < MAX_GENESIS) {
          lowPriorityCount++;
          filasParaInsertar.push({
            project_id,
            nodo_id,
            nodo_tipo,
            campo_origen: p.campo_origen,
            texto_pregunta: p.texto_pregunta,
            texto_hash: hashTexto(p.texto_pregunta),
            prioridad,
            nodos_afectados: obtenerNodosAfectados(nodo_tipo),
            estado: "abierta",
            estado_procedencia: null,
          });
        } else {
          excedentesParaRiesgos.push({
            texto_pregunta: p.texto_pregunta,
            prioridad,
          });
        }
      } else {
        filasParaInsertar.push({
          project_id,
          nodo_id,
          nodo_tipo,
          campo_origen: p.campo_origen,
          texto_pregunta: p.texto_pregunta,
          texto_hash: hashTexto(p.texto_pregunta),
          prioridad,
          nodos_afectados: obtenerNodosAfectados(nodo_tipo),
          estado: "abierta",
          estado_procedencia: null,
        });
      }
    });
  }

  // 4. Guardar preguntas admitidas en preguntas_pendientes
  let preguntasAbiertas: PreguntaSincronizada[] = [];
  if (filasParaInsertar.length > 0) {
    const { data, error } = await supabase
      .from("preguntas_pendientes")
      .upsert(filasParaInsertar, { onConflict: "nodo_id,texto_hash", ignoreDuplicates: true })
      .select("id, texto_pregunta, estado");

    if (error) {
      console.error("[sincronizarPreguntasPendientes] error en upsert:", error.message);
    } else {
      preguntasAbiertas = (data ?? [])
        .filter((d) => d.estado === "abierta")
        .map((d) => ({
          id: d.id as string,
          texto_pregunta: d.texto_pregunta as string,
        }));
    }
  }

  // 5. Las preguntas excedentes del tope graduado se insertan en riesgos_proyecto con origen='excedente_tope'
  if (excedentesParaRiesgos.length > 0) {
    for (const exc of excedentesParaRiesgos) {
      const severidad = exc.prioridad === "P0" ? "alta" : exc.prioridad === "P1" ? "media" : "baja";
      await registrarRiesgo(supabase, {
        project_id,
        origen: "excedente_tope",
        nodo_tipo,
        descripcion: `[Excedente Tope Post-LLM] ${exc.texto_pregunta}`,
        severidad,
        estado: "abierto",
      });
    }
  }

  const insertadas = preguntasAbiertas.length;
  if (insertadas > 0 && reagrupar) {
    try {
      await reagruparPreguntasAbiertas(supabase, project_id);
    } catch (e) {
      console.error("[sincronizarPreguntasPendientes] error al reagrupar:", e);
    }
  }

  return { insertadas, omitidas_duplicadas: omitidas_duplicadas + (filasParaInsertar.length - insertadas), preguntas: preguntasAbiertas };
}
