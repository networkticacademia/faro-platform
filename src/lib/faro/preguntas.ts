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

export async function sincronizarPreguntasPendientes(
  supabase: SupabaseClient,
  params: { project_id: string; nodo_id: string; nodo_tipo: NodoTipo; contenido: unknown },
  opciones?: { reagrupar?: boolean }
): Promise<{ insertadas: number; omitidas_duplicadas: number; idsInsertados: string[] }> {
  const { project_id, nodo_id, nodo_tipo, contenido } = params;
  const reagrupar = opciones?.reagrupar ?? true;
  const extraidas = extraerPreguntasDelNodo(contenido);

  if (extraidas.length === 0) {
    return { insertadas: 0, omitidas_duplicadas: 0, idsInsertados: [] };
  }

  const filas = extraidas.map((p) => ({
    project_id,
    nodo_id,
    nodo_tipo,
    campo_origen: p.campo_origen,
    texto_pregunta: p.texto_pregunta,
    texto_hash: hashTexto(p.texto_pregunta),
    prioridad: clasificarPrioridad(nodo_tipo, p.texto_pregunta),
    nodos_afectados: obtenerNodosAfectados(nodo_tipo),
  }));

  // upsert por (nodo_id, texto_hash) — evita duplicar si el nodo se regenera
  // y vuelve a producir la misma pregunta textualmente.
  const { data, error } = await supabase
    .from("preguntas_pendientes")
    .upsert(filas, { onConflict: "nodo_id,texto_hash", ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.error("[sincronizarPreguntasPendientes] error:", error.message);
    return { insertadas: 0, omitidas_duplicadas: 0, idsInsertados: [] };
  }

  const idsInsertados = (data ?? []).map((d) => d.id as string);
  const insertadas = idsInsertados.length;
  if (insertadas > 0 && reagrupar) {
    try {
      await reagruparPreguntasAbiertas(supabase, project_id);
    } catch (e) {
      console.error("[sincronizarPreguntasPendientes] error al reagrupar:", e);
    }
  }

  return { insertadas, omitidas_duplicadas: filas.length - insertadas, idsInsertados };
}
