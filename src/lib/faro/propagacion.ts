/**
 * lib/faro/propagacion.ts
 *
 * Propagación quirúrgica (requisito #20 de la auditoría original).
 *
 * Dos fases separadas:
 *  - previsualizarPropagacion(): solo lectura, dice qué nodos se verían
 *    afectados si se responde esta pregunta raíz.
 *  - ejecutarPropagacion(): regenera cada nodo afectado con esa respuesta
 *    como feedback y marca como resueltas las preguntas del grupo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NodoTipo } from "./clasificacionPreguntas";
import { esProcedenciaConfirmada, type Procedencia } from "./procedencia";
import { generarRutaCore } from "@/app/api/mci/ruta/generar/route";
import { generarNovaCore } from "@/app/api/mci/nova/generar/route";
import { generarObjetivosCore } from "@/app/api/mci/objetivos/generar/route";
import { generarMetodologiaCore } from "@/app/api/mci/metodologia/generar/route";
import { generarMarcoReferencialCore } from "@/app/api/mci/marco-referencial/generar/route";
import { generarImpactosCore } from "@/app/api/mci/impactos-delimitacion/generar/route";

interface NodoAfectado {
  nodo_id: string;
  nodo_tipo: NodoTipo;
  preguntas_que_resuelve: string[]; // ids de preguntas_pendientes
}

export interface PrevisualizacionPropagacion {
  pregunta_raiz_id: string;
  nodos_afectados: NodoAfectado[];
}

export async function previsualizarPropagacion(
  supabase: SupabaseClient,
  pregunta_raiz_id: string
): Promise<PrevisualizacionPropagacion> {
  const { data: raiz } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_id, nodo_tipo")
    .eq("id", pregunta_raiz_id)
    .single();

  const { data: hijas } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_id, nodo_tipo")
    .eq("pregunta_raiz_id", pregunta_raiz_id)
    .eq("estado", "abierta");

  const todas = [...(raiz ? [raiz] : []), ...(hijas ?? [])];

  const porNodo = new Map<string, NodoAfectado>();
  for (const p of todas) {
    const existente = porNodo.get(p.nodo_id);
    if (existente) {
      existente.preguntas_que_resuelve.push(p.id);
    } else {
      porNodo.set(p.nodo_id, {
        nodo_id: p.nodo_id,
        nodo_tipo: p.nodo_tipo as NodoTipo,
        preguntas_que_resuelve: [p.id],
      });
    }
  }

  return { pregunta_raiz_id, nodos_afectados: Array.from(porNodo.values()) };
}

export interface ResultadoPropagacion {
  nodos_regenerados: { nodo_tipo: NodoTipo; exito: boolean; error?: string }[];
  preguntas_marcadas_resueltas: number;
}

export async function ejecutarPropagacion(
  supabase: SupabaseClient,
  params: {
    project_id: string;
    pregunta_raiz_id: string;
    respuesta: string;
    procedencia: Procedencia;
    nodosConfirmados: NodoAfectado[];
  }
): Promise<ResultadoPropagacion> {
  const { project_id, pregunta_raiz_id, respuesta, procedencia, nodosConfirmados } = params;

  const confiable = esProcedenciaConfirmada(procedencia);
  const feedback = construirFeedbackPropagado(respuesta, procedencia, confiable);

  const resultados: ResultadoPropagacion["nodos_regenerados"] = [];
  let idsResueltos: string[] = [];

  for (const nodo of nodosConfirmados) {
    try {
      await regenerarNodoConFeedback(supabase, nodo.nodo_tipo, project_id, feedback);
      resultados.push({ nodo_tipo: nodo.nodo_tipo, exito: true });
      idsResueltos.push(...nodo.preguntas_que_resuelve);
    } catch (e) {
      resultados.push({
        nodo_tipo: nodo.nodo_tipo,
        exito: false,
        error: e instanceof Error ? e.message : "error desconocido",
      });
    }
  }

  idsResueltos = Array.from(new Set([pregunta_raiz_id, ...idsResueltos]));

  if (idsResueltos.length > 0) {
    await supabase
      .from("preguntas_pendientes")
      .update({
        respuesta,
        estado_procedencia: procedencia,
        estado: "resuelta",
        resolved_at: new Date().toISOString(),
      })
      .in("id", idsResueltos);
  }

  return { nodos_regenerados: resultados, preguntas_marcadas_resueltas: idsResueltos.length };
}

function construirFeedbackPropagado(
  respuesta: string,
  procedencia: Procedencia,
  confiable: boolean
): string {
  if (confiable) {
    return `El investigador confirmó: "${respuesta}" (procedencia: ${procedencia}). Trátelo como dato verificado.`;
  }
  return `El investigador aportó: "${respuesta}", pero la procedencia declarada es "${procedencia}" — NO está verificado. Incorpórelo como supuesto de trabajo explícito, no como hecho confirmado, y si es relevante, genere una pregunta de seguimiento pidiendo la verificación formal.`;
}

/**
 * Invoca directamente la lógica core de regeneración de cada nodo con feedback.
 */
async function regenerarNodoConFeedback(
  supabase: SupabaseClient,
  nodoTipo: string,
  project_id: string,
  feedback: string
): Promise<void> {
  const tipoUpper = nodoTipo.toUpperCase();
  switch (tipoUpper) {
    case "RUTA":
      await generarRutaCore(supabase, { project_id, feedback });
      break;
    case "NOVA":
      await generarNovaCore(supabase, { project_id, feedback });
      break;
    case "OBJETIVOS":
      await generarObjetivosCore(supabase, { project_id, feedback });
      break;
    case "METODOLOGIA":
      await generarMetodologiaCore(supabase, { project_id, feedback });
      break;
    case "MARCO_REFERENCIAL":
      await generarMarcoReferencialCore(supabase, { project_id, feedback });
      break;
    case "IMPACTOS":
    case "IMPACTOS_DELIMITACION":
      await generarImpactosCore(supabase, { project_id, feedback });
      break;
    default:
      throw new Error(`Tipo de nodo desconocido para regeneración: ${nodoTipo}`);
  }
}
