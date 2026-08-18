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
import { evaluarCircuitoConvergencia, type DetalleLFaroNodoResumen, type BypassCircuito } from "./circuitoConvergencia";
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
  nodo_ids: string[]; // todos los grafo_nodos.id históricos que aportaron preguntas a este grupo — solo trazabilidad, ejecutarPropagacion() regenera por nodo_tipo, no por nodo_id
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

  // Agrupado por nodo_tipo (no por nodo_id): una respuesta puede resolver
  // preguntas repartidas en varias iteraciones históricas distintas del
  // MISMO tipo de nodo (ej. dos preguntas sobre "dron multiespectral"
  // nacidas en iteraciones diferentes de IMPACTOS_DELIMITACION) — deben
  // colapsar en UNA sola entrada, porque ejecutarPropagacion() regenera
  // por nodo_tipo (siempre la última iteración confirmada), no por
  // nodo_id puntual. Agrupar por nodo_id producía una entrada por cada
  // iteración histórica tocada, y el formulador terminaba confirmando N
  // regeneraciones del mismo nodo por una sola respuesta real — bug
  // confirmado en producción (proyecto piña, madrugada del 18-ago-2026:
  // IMPACTOS_DELIMITACION y RUTA con iteraciones duplicadas creadas a
  // segundos de diferencia).
  const porTipo = new Map<NodoTipo, NodoAfectado>();
  for (const p of todas) {
    const tipo = p.nodo_tipo as NodoTipo;
    const existente = porTipo.get(tipo);
    if (existente) {
      existente.preguntas_que_resuelve.push(p.id);
      if (!existente.nodo_ids.includes(p.nodo_id)) existente.nodo_ids.push(p.nodo_id);
    } else {
      porTipo.set(tipo, {
        nodo_ids: [p.nodo_id],
        nodo_tipo: tipo,
        preguntas_que_resuelve: [p.id],
      });
    }
  }

  return { pregunta_raiz_id, nodos_afectados: Array.from(porTipo.values()) };
}

export interface ResultadoPropagacion {
  nodos_regenerados: { nodo_tipo: NodoTipo; exito: boolean; error?: string }[];
  preguntas_marcadas_resueltas: number;
  profundidad_agotada: boolean;
  // true = el circuito de corte a nivel de proyecto detuvo esta ejecución
  // ANTES de regenerar nada (ver circuitoConvergencia.ts). Cuando es true,
  // nodos_regenerados queda vacío y preguntas_marcadas_resueltas es 0 — no
  // se tocó nada, a propósito.
  circuito_detenido: boolean;
  motivo_circuito: string | null;
  // Desglose de L_FARO por nodo (mismo dato que TarjetaConvergencia) — solo
  // presente cuando circuito_detenido=true, para mostrar diagnóstico en el
  // mismo bloque de bloqueo sin una llamada nueva. null en el resto de casos.
  detalle_l_faro_por_nodo: DetalleLFaroNodoResumen[] | null;
}

export async function ejecutarPropagacion(
  supabase: SupabaseClient,
  params: {
    project_id: string;
    pregunta_raiz_id: string;
    respuesta: string;
    procedencia: Procedencia;
    nodosConfirmados: NodoAfectado[];
    // Presente = un humano ya revisó el bloqueo y decidió continuar de
    // todas formas para ESTE intento puntual ("Ya revisé, continuar de
    // todas formas" en TriagePregunta.tsx). No desactiva el circuito para
    // intentos futuros — ver registrarOverrideCircuito().
    bypassCircuito?: { confirmadoPor: string };
  }
): Promise<ResultadoPropagacion> {
  const { project_id, pregunta_raiz_id, respuesta, procedencia, nodosConfirmados, bypassCircuito } = params;

  const circuito = await evaluarCircuitoConvergencia(supabase, project_id);
  if (circuito.detenido && !bypassCircuito) {
    return {
      nodos_regenerados: [],
      preguntas_marcadas_resueltas: 0,
      profundidad_agotada: false,
      circuito_detenido: true,
      motivo_circuito: circuito.motivo,
      detalle_l_faro_por_nodo: circuito.ultimo_detalle_l_faro_por_nodo,
    };
  }
  // El registro de auditoría del override YA NO se hace aquí a nivel de
  // toda la operación — se delega a verificarCircuitoAntesDeRegenerar()
  // (circuitoConvergencia.ts), llamada dentro de cada generarXCore() más
  // abajo, pasando `bypassCircuito`. Antes, ese registro solo pasaba a
  // nivel general y esta bandera nunca llegaba a la llamada interna de
  // verificarCircuitoAntesDeRegenerar() de cada nodo — esa llamada volvía a
  // evaluar el circuito sin saber que hubo bypass, lo encontraba detenido
  // otra vez (la fila de auditoría se excluye a propósito del cálculo de
  // mejora) y volvía a lanzar. Resultado real: cada nodo fallaba en
  // silencio dentro del try/catch de abajo, pero la pregunta se marcaba
  // "resuelta" igual — el override nunca regeneraba nada. Corregido
  // pasando bypassCircuito explícitamente hasta el nivel que de verdad
  // ejecuta la regeneración.

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
      const resultadoNodo = await regenerarNodoConFeedback(
        supabase,
        nodo.nodo_tipo,
        project_id,
        feedback,
        bypassCircuito ? { confirmadoPor: bypassCircuito.confirmadoPor, preguntaRaizId: pregunta_raiz_id } : undefined
      );
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
    circuito_detenido: false,
    motivo_circuito: null,
    detalle_l_faro_por_nodo: null,
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
  feedback: string,
  bypassCircuito?: BypassCircuito
): Promise<{ nodo: { id: string } }> {
  const tipoUpper = nodoTipo.toUpperCase();
  switch (tipoUpper) {
    case "RUTA":
      return await generarRutaCore(supabase, { project_id, feedback, bypassCircuito });
    case "NOVA":
      return await generarNovaCore(supabase, { project_id, feedback, bypassCircuito });
    case "OBJETIVOS":
      return await generarObjetivosCore(supabase, { project_id, feedback, bypassCircuito });
    case "METODOLOGIA":
      return await generarMetodologiaCore(supabase, { project_id, feedback, bypassCircuito });
    case "MARCO_REFERENCIAL":
      return await generarMarcoReferencialCore(supabase, { project_id, feedback, bypassCircuito });
    case "IMPACTOS":
    case "IMPACTOS_DELIMITACION":
      return await generarImpactosCore(supabase, { project_id, feedback, bypassCircuito });
    default:
      throw new Error(`Tipo de nodo desconocido para regeneración: ${nodoTipo}`);
  }
}
