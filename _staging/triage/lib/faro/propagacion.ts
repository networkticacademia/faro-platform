/**
 * lib/faro/propagacion.ts
 *
 * Propagación quirúrgica (requisito #20 de la auditoría original).
 *
 * Dos fases separadas a propósito:
 *  - previsualizarPropagacion(): solo lectura, dice qué nodos se verían
 *    afectados si se responde esta pregunta raíz. Se usa para mostrarle
 *    al formulador la confirmación antes de gastar tokens regenerando.
 *  - ejecutarPropagacion(): ya con la respuesta confirmada, regenera
 *    cada nodo afectado con esa respuesta como feedback, y marca como
 *    resueltas todas las preguntas del grupo.
 *
 * IMPORTANTE PARA ANTIGRAVITY — esta es la pieza que más necesita
 * verificación contra el código real antes de integrar:
 * `regenerarNodoConFeedback()` al final de este archivo asume que existe
 * (o se puede extraer) una función interna reutilizable de regeneración
 * por nodo, separada del handler HTTP de cada /api/mci/{nodo}/generar.
 * Si esa extracción no existe todavía, dos opciones, en orden de
 * preferencia:
 *   (a) Refactor mínimo: extraer la lógica de generación de cada uno de
 *       los 6 endpoints /generar a una función exportada
 *       (ej. `generarRuta(project_id, feedback?)`), que el propio
 *       endpoint HTTP también use — evita duplicar prompts y lógica MCI.
 *   (b) Si el refactor es riesgoso de hacer ahora, invocar los 6
 *       endpoints existentes vía fetch interno (server-to-server) con
 *       el mismo mecanismo de autenticación que ya use el resto del
 *       backend para llamadas internas — más lento y menos elegante,
 *       pero no toca los endpoints existentes.
 * Detente y pregúntale a Jorge cuál prefiere si no es obvio por el
 * código real.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NodoTipo } from "./clasificacionPreguntas";
import { esProcedenciaConfirmada, type Procedencia } from "./procedencia";

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
    nodosConfirmados: NodoAfectado[]; // el subconjunto que el usuario confirmó regenerar
  }
): Promise<ResultadoPropagacion> {
  const { project_id, pregunta_raiz_id, respuesta, procedencia, nodosConfirmados } = params;

  const confiable = esProcedenciaConfirmada(procedencia);
  const feedback = construirFeedbackPropagado(respuesta, procedencia, confiable);

  const resultados: ResultadoPropagacion["nodos_regenerados"] = [];
  let idsResueltos: string[] = [];

  for (const nodo of nodosConfirmados) {
    try {
      await regenerarNodoConFeedback(nodo.nodo_tipo, project_id, feedback);
      resultados.push({ nodo_tipo: nodo.nodo_tipo, exito: true });
      idsResueltos.push(...nodo.preguntas_que_resuelve);
    } catch (e) {
      resultados.push({
        nodo_tipo: nodo.nodo_tipo,
        exito: false,
        error: e instanceof Error ? e.message : "error desconocido",
      });
      // Si un nodo falla, sus preguntas NO se marcan resueltas — quedan
      // abiertas para reintento manual, no se pierden silenciosamente.
    }
  }

  // La pregunta raíz misma siempre se marca resuelta si llegó hasta aquí
  // (el formulador ya la respondió, independiente de si algún nodo falló).
  idsResueltos = [...new Set([pregunta_raiz_id, ...idsResueltos])];

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
 * VER NOTA AL INICIO DEL ARCHIVO — implementación placeholder.
 * Antigravity debe reemplazar esto por la invocación real (opción a o b).
 */
async function regenerarNodoConFeedback(
  nodoTipo: NodoTipo,
  project_id: string,
  feedback: string
): Promise<void> {
  throw new Error(
    `regenerarNodoConFeedback no implementado — Antigravity debe conectar esto a la ` +
      `lógica real de regeneración de ${nodoTipo} para project_id=${project_id}. ` +
      `Feedback a pasar: ${feedback.slice(0, 80)}...`
  );
}
