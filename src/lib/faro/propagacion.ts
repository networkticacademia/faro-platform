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
 *
 * TOPE DE PROFUNDIDAD CAUSAL (2 niveles, uniforme en los 6 nodos):
 * pregunta 1 = intento directo, pregunta 2 = una profundización (técnica de
 * los porqués). Si tras la 2 la procedencia SIGUE sin ser sólida
 * (fuente_oficial/articulo_cientifico/conocimiento_directo), NO se pide una
 * 3ª pregunta más profunda — se acepta la respuesta como causa raíz
 * operativa (queda explícita en el feedback al nodo) y se deja trazable
 * mediante una pregunta de verificación formal nueva, P1, abierta (para que
 * el Gate C0/C1 existente la bloquee sin lógica de Gate nueva).
 *
 * nivel_profundidad_causal / pregunta_padre_causal_id son campos DISTINTOS
 * de pregunta_raiz_id (ese es agrupamiento semántico entre nodos —
 * agrupamiento.ts — un concepto no relacionado). "profundidad_agotada" NO
 * es un valor de estado ni un término emparentado con el protocolo L1/L2/L3
 * de Δ en mci.ts — ese protocolo cubre declaración-vs-evidencia RSL, un
 * mecanismo completamente distinto.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NodoTipo } from "./clasificacionPreguntas";
import { esProcedenciaConfirmada, type Procedencia } from "./procedencia";
import { hashTexto } from "./preguntas";
import { obtenerNodosAfectados } from "./clasificacionPreguntas";
import { generarRutaCore } from "@/app/api/mci/ruta/generar/route";
import { generarNovaCore } from "@/app/api/mci/nova/generar/route";
import { generarObjetivosCore } from "@/app/api/mci/objetivos/generar/route";
import { generarMetodologiaCore } from "@/app/api/mci/metodologia/generar/route";
import { generarMarcoReferencialCore } from "@/app/api/mci/marco-referencial/generar/route";
import { generarImpactosCore } from "@/app/api/mci/impactos-delimitacion/generar/route";

const TOPE_PROFUNDIDAD_CAUSAL = 2;
// Nivel asignado a la pregunta sintética de verificación formal cuando se
// agota la profundidad — deliberadamente > TOPE para que, si alguna vez
// esa pregunta se vuelve a responder con procedencia débil, no reinicie
// el ciclo de profundización (es terminal, no una línea causal nueva).
const NIVEL_PREGUNTA_VERIFICACION = 3;

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
  profundidad_agotada: boolean;
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

  // Nivel de la pregunta que se está respondiendo AHORA — default 1 para
  // filas legacy (creadas antes de esta migración, sin el campo poblado).
  const { data: preguntaActual } = await supabase
    .from("preguntas_pendientes")
    .select("nivel_profundidad_causal")
    .eq("id", pregunta_raiz_id)
    .maybeSingle();
  const nivelActual: number = preguntaActual?.nivel_profundidad_causal ?? 1;

  const profundidadAgotada = !confiable && nivelActual >= TOPE_PROFUNDIDAD_CAUSAL;

  const feedback = construirFeedbackPropagado(respuesta, procedencia, confiable, profundidadAgotada);

  const resultados: ResultadoPropagacion["nodos_regenerados"] = [];
  let idsResueltos: string[] = [];

  for (const nodo of nodosConfirmados) {
    try {
      const resultadoNodo = await regenerarNodoConFeedback(supabase, nodo.nodo_tipo, project_id, feedback);
      resultados.push({ nodo_tipo: nodo.nodo_tipo, exito: true });
      idsResueltos.push(...nodo.preguntas_que_resuelve);

      if (!confiable) {
        if (!profundidadAgotada) {
          // Nivel 1→2 (o legacy sin nivel→2): las preguntas que el propio
          // LLM acaba de sincronizar para este nodo (nodo_id recién creado,
          // por lo tanto todas nuevas) son la profundización — se etiquetan
          // como hijas causales de la que se acaba de responder.
          await supabase
            .from("preguntas_pendientes")
            .update({
              nivel_profundidad_causal: nivelActual + 1,
              pregunta_padre_causal_id: pregunta_raiz_id,
            })
            .eq("nodo_id", resultadoNodo.nodo.id);
        } else {
          // Tope alcanzado: NO dejar que se cuele una 3ª pregunta de
          // profundización. En vez de confiar en que el LLM obedezca la
          // instrucción del feedback, se inserta directamente (sin LLM)
          // una única pregunta de verificación formal — determinística,
          // P1 forzado, abierta, para que el Gate C0/C1 la capture sin
          // depender de que el texto generado coincida con las palabras
          // clave de clasificarPrioridad().
          const textoVerificacion = construirTextoVerificacionFormal(respuesta, procedencia);
          await supabase.from("preguntas_pendientes").insert({
            project_id,
            nodo_id: resultadoNodo.nodo.id,
            nodo_tipo: nodo.nodo_tipo,
            campo_origen: null,
            texto_pregunta: textoVerificacion,
            texto_hash: hashTexto(textoVerificacion),
            prioridad: "P1",
            nodos_afectados: obtenerNodosAfectados(nodo.nodo_tipo),
            estado: "abierta",
            nivel_profundidad_causal: NIVEL_PREGUNTA_VERIFICACION,
            pregunta_padre_causal_id: pregunta_raiz_id,
          });
        }
      }
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

  return {
    nodos_regenerados: resultados,
    preguntas_marcadas_resueltas: idsResueltos.length,
    profundidad_agotada: profundidadAgotada,
  };
}

function construirFeedbackPropagado(
  respuesta: string,
  procedencia: Procedencia,
  confiable: boolean,
  profundidadAgotada: boolean
): string {
  if (confiable) {
    return `El investigador confirmó: "${respuesta}" (procedencia: ${procedencia}). Trátelo como dato verificado.`;
  }
  if (profundidadAgotada) {
    return `El investigador aportó: "${respuesta}" (procedencia declarada: "${procedencia}"). Esta línea causal ya se profundizó dos veces (intento directo + una profundización adicional) sin llegar a procedencia sólida (fuente oficial, artículo científico o conocimiento directo). NO genere una pregunta adicional pidiendo profundizar más este punto específico — incorpore la respuesta como causa raíz operativa del análisis, dejando explícito en el contenido que es un supuesto de trabajo sin verificación formal (procedencia: ${procedencia}), no como hecho confirmado. Ya se registrará por separado una pregunta de verificación formal para este punto — no la duplique.`;
  }
  return `El investigador aportó: "${respuesta}", pero la procedencia declarada es "${procedencia}" — NO está verificado. Incorpórelo como supuesto de trabajo explícito, no como hecho confirmado, y si es relevante, genere una pregunta de seguimiento pidiendo la verificación formal.`;
}

function construirTextoVerificacionFormal(respuesta: string, procedencia: Procedencia): string {
  const respuestaCorta = respuesta.length > 150 ? `${respuesta.slice(0, 150)}...` : respuesta;
  return `Verificación pendiente: se aceptó "${respuestaCorta}" como causa raíz operativa tras dos niveles de profundización, sin llegar a procedencia sólida (declarada: "${procedencia}"). Aporte una fuente oficial, artículo científico o confirmación de conocimiento directo verificable antes de tratarla como hecho confirmado.`;
}

/**
 * Invoca directamente la lógica core de regeneración de cada nodo con
 * feedback, y devuelve el nodo resultante (necesario para poder etiquetar
 * las preguntas recién sincronizadas con su nivel de profundidad causal).
 */
async function regenerarNodoConFeedback(
  supabase: SupabaseClient,
  nodoTipo: string,
  project_id: string,
  feedback: string
): Promise<{ nodo: { id: string } }> {
  const tipoUpper = nodoTipo.toUpperCase();
  switch (tipoUpper) {
    case "RUTA":
      return await generarRutaCore(supabase, { project_id, feedback });
    case "NOVA":
      return await generarNovaCore(supabase, { project_id, feedback });
    case "OBJETIVOS":
      return await generarObjetivosCore(supabase, { project_id, feedback });
    case "METODOLOGIA":
      return await generarMetodologiaCore(supabase, { project_id, feedback });
    case "MARCO_REFERENCIAL":
      return await generarMarcoReferencialCore(supabase, { project_id, feedback });
    case "IMPACTOS":
    case "IMPACTOS_DELIMITACION":
      return await generarImpactosCore(supabase, { project_id, feedback });
    default:
      throw new Error(`Tipo de nodo desconocido para regeneración: ${nodoTipo}`);
  }
}
