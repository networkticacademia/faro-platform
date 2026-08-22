/**
 * lib/faro/circuitoConvergencia.ts
 *
 * Circuito de corte a NIVEL DE PROYECTO — distinto del tope de
 * profundidad causal por pregunta (nivel_profundidad_causal /
 * pregunta_padre_causal_id, en propagacion.ts, que este módulo NO toca).
 * Ese tope limita cuántas veces se profundiza UNA línea causal puntual;
 * este mecanismo detecta cuando el ciclo completo "responder críticas →
 * regenerar → verificar convergencia" deja de mejorar el proyecto en su
 * conjunto, sin importar qué pregunta puntual se esté respondiendo.
 *
 * No crea una tabla nueva para el contador: convergencia_proyecto ya es
 * insert-always con {project_id, resultado, calculado_en} — cada fila
 * calculada ES el cierre de una ronda ("verificar convergencia"), así que
 * el historial de rondas ya existe. El "contador" se DERIVA leyendo las
 * últimas filas, no es un estado nuevo que haya que mantener sincronizado.
 *
 * Confirmado por inspección de código (no asumido) antes de construir
 * esto: Checkpoint C3 en gate.ts está activo:false, nodosEvaluados:[],
 * con el comentario "ya cubierto por TarjetaConvergencia" — es un stub
 * inerte; verificarGate() corta temprano para cualquier checkpoint
 * inactivo (líneas 94-105 de gate.ts) sin ejecutar ninguna lógica propia.
 * Extenderlo habría significado reconstruir ahí, desde cero, exactamente
 * la lectura de historial que convergencia_proyecto ya provee — el
 * mecanismo paralelo que se pidió evitar, solo que viviendo dentro de
 * gate.ts en vez de al lado. Por eso este módulo vive junto a
 * convergenciaProyecto.ts, no dentro de gate.ts.
 *
 * OVERRIDE ("Ya revisé, continuar de todas formas", sesión 18-ago-2026):
 * registrarOverrideCircuito() inserta una fila de AUDITORÍA en la misma
 * tabla convergencia_proyecto (sin tabla nueva) — un resultado sin
 * l_faro_proyecto, marcado con tipo_evento. evaluarCircuitoConvergencia()
 * filtra esas filas al construir el historial de cálculos reales, así que
 * el override queda registrado (quién/cuándo, consultable) pero NO
 * manipula la ventana de detección de mejora: la PRÓXIMA evaluación real
 * usa exactamente las mismas 3 últimas filas de cálculo real que habría
 * usado si el override no hubiera ocurrido — el "reset" es que esa ronda
 * puntual se dejó pasar sin bloquear, no que el circuito quede desarmado.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { NODOS_REQUERIDOS } from "./resumenNodos";

// 3 filas = 2 transiciones consecutivas comparables — "2 rondas completas sin mejora".
const RONDAS_EVALUADAS = 3;
// Por debajo de esto, una baja de L_FARO_proyecto no cuenta como mejora real (ruido de redondeo/cálculo).
const UMBRAL_MEJORA_MINIMA = 0.005;
// Margen de filas a traer antes de filtrar auditorías de override — evita una segunda ida a la BD.
const MARGEN_CONSULTA = RONDAS_EVALUADAS * 4;

export const TIPO_EVENTO_OVERRIDE = "override_circuito_convergencia" as const;

export interface DetalleLFaroNodoResumen {
  nodo: string;
  l_faro: number;
  confianza_agente: string | null;
  num_preguntas_pendientes: number;
  sugerencia: string;
}

export interface ResultadoConvergenciaAlmacenado {
  l_faro_proyecto?: number;
  tau_c_proyecto?: number;
  convergio?: boolean;
  es_provisional?: boolean;
  detalle_l_faro_por_nodo?: DetalleLFaroNodoResumen[];
  tipo_evento?: string;
}

interface FilaHistorial {
  calculado_en: string;
  l_faro_proyecto: number | null;
  preguntas_pendientes_netas: number | null;
}

export interface ResultadoCircuito {
  detenido: boolean;
  motivo: string | null;
  rondas_evaluadas: number;
  historial: FilaHistorial[];
  // Desglose de L_FARO por nodo de la ÚLTIMA fila de cálculo real (mismo
  // dato que TarjetaConvergencia muestra) — null si nunca se ha calculado
  // convergencia para este proyecto. Se entrega aquí para que el bloqueo
  // pueda mostrarlo sin una llamada nueva.
  ultimo_detalle_l_faro_por_nodo: DetalleLFaroNodoResumen[] | null;
}

function sumaPreguntasPendientes(resultado: ResultadoConvergenciaAlmacenado | null): number | null {
  const detalle = resultado?.detalle_l_faro_por_nodo;
  if (!Array.isArray(detalle)) return null;
  return detalle.reduce((acc, d) => acc + (typeof d?.num_preguntas_pendientes === "number" ? d.num_preguntas_pendientes : 0), 0);
}

/**
 * Trae filas de convergencia_proyecto EXCLUYENDO auditorías de override
 * (tipo_evento=override_circuito_convergencia, sin l_faro_proyecto) —
 * fuente única para cualquier lector que necesite "la última convergencia
 * REAL", no la última fila a secas. Antes de que existiera esta función,
 * dashboard/page.tsx y sintesisFinal.ts leían la última fila con
 * .limit(1) sin filtrar — una fila de auditoría de override habría hecho
 * que el Dashboard mostrara "convergio: false, no provisional,
 * L_FARO: null" (falso) en vez de ignorarla. Confirmado y corregido antes
 * de insertar la primera fila de auditoría real (sesión 18-ago-2026).
 */
async function filasRealesRecientes(
  supabase: SupabaseClient,
  project_id: string,
  limite: number
): Promise<{ resultado: ResultadoConvergenciaAlmacenado | null; calculado_en: string }[]> {
  const { data } = await supabase
    .from("convergencia_proyecto")
    .select("resultado, calculado_en")
    .eq("project_id", project_id)
    .order("calculado_en", { ascending: false })
    .limit(limite);

  return (data ?? [])
    .map((f) => ({ resultado: f.resultado as ResultadoConvergenciaAlmacenado | null, calculado_en: f.calculado_en as string }))
    .filter((f) => typeof f.resultado?.l_faro_proyecto === "number");
}

export async function obtenerUltimaConvergenciaReal(
  supabase: SupabaseClient,
  project_id: string
): Promise<{ resultado: ResultadoConvergenciaAlmacenado; calculado_en: string } | null> {
  const filas = await filasRealesRecientes(supabase, project_id, MARGEN_CONSULTA);
  const ultima = filas[0];
  return ultima ? { resultado: ultima.resultado as ResultadoConvergenciaAlmacenado, calculado_en: ultima.calculado_en } : null;
}

/**
 * Nodos cuya ÚLTIMA iteración generada todavía no está confirmada por un
 * humano. L_FARO_proyecto solo lee iteraciones CONFIRMADAS (decisión de
 * diseño correcta, ver convergencia/calcular/route.ts) — así que trabajo
 * real ya generado (respuestas a preguntas, regeneraciones) no cuenta para
 * la convergencia hasta que alguien lo confirme en la pantalla del nodo.
 * Confirmado en producción (proyecto piña, 18-ago-2026): el circuito se
 * detuvo repetidamente por "sin mejora medible" mientras 4 de 6 nodos
 * tenían iteraciones más recientes sin confirmar — el mensaje genérico no
 * lo dejaba ver.
 */
async function nodosConIteracionSinConfirmar(
  supabase: SupabaseClient,
  project_id: string
): Promise<string[]> {
  const sinConfirmar: string[] = [];
  for (const tipo of NODOS_REQUERIDOS) {
    const { data: ultima } = await supabase
      .from("grafo_nodos")
      .select("confirmado_humano")
      .eq("project_id", project_id)
      .eq("tipo", tipo)
      .order("iteracion", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultima && !ultima.confirmado_humano) {
      sinConfirmar.push(tipo);
    }
  }
  return sinConfirmar;
}

export async function evaluarCircuitoConvergencia(
  supabase: SupabaseClient,
  project_id: string
): Promise<ResultadoCircuito> {
  const filasReales = await filasRealesRecientes(supabase, project_id, MARGEN_CONSULTA);

  const ultimaFilaReal = filasReales[0] ?? null;
  const ultimoDetalle = ultimaFilaReal?.resultado?.detalle_l_faro_por_nodo ?? null;

  // Más antigua primero, para leer las transiciones en orden cronológico.
  const filas: FilaHistorial[] = filasReales
    .slice(0, RONDAS_EVALUADAS)
    .map((f) => {
      const resultado = f.resultado as ResultadoConvergenciaAlmacenado | null;
      return {
        calculado_en: f.calculado_en as string,
        l_faro_proyecto: resultado?.l_faro_proyecto ?? null,
        preguntas_pendientes_netas: sumaPreguntasPendientes(resultado),
      };
    })
    .reverse();

  if (filas.length < RONDAS_EVALUADAS) {
    return { detenido: false, motivo: null, rondas_evaluadas: filas.length, historial: filas, ultimo_detalle_l_faro_por_nodo: ultimoDetalle };
  }

  const deltas: { deltaLFaro: number | null; deltaPreguntas: number | null }[] = [];
  for (let i = 1; i < filas.length; i++) {
    const anterior = filas[i - 1];
    const actual = filas[i];
    deltas.push({
      deltaLFaro:
        anterior.l_faro_proyecto !== null && actual.l_faro_proyecto !== null
          ? actual.l_faro_proyecto - anterior.l_faro_proyecto
          : null,
      deltaPreguntas:
        anterior.preguntas_pendientes_netas !== null && actual.preguntas_pendientes_netas !== null
          ? actual.preguntas_pendientes_netas - anterior.preguntas_pendientes_netas
          : null,
    });
  }

  const sinMejoraLFaro = deltas.every((d) => d.deltaLFaro !== null && d.deltaLFaro >= -UMBRAL_MEJORA_MINIMA);
  const preguntasCreciendo = deltas.every((d) => d.deltaPreguntas !== null && d.deltaPreguntas > 0);

  if (sinMejoraLFaro || preguntasCreciendo) {
    const serieLFaro = filas.map((f) => f.l_faro_proyecto ?? "?").join(" → ");
    const seriePreguntas = filas.map((f) => f.preguntas_pendientes_netas ?? "?").join(" → ");
    const diagnostico = preguntasCreciendo
      ? `Las últimas ${deltas.length} rondas muestran preguntas pendientes netas creciendo en vez de reducirse (${seriePreguntas}).`
      : `Las últimas ${deltas.length} rondas no muestran mejora medible en L_FARO_proyecto (${serieLFaro}).`;

    // No cambia QUÉ mide el circuito (sigue siendo L_FARO_proyecto de
    // iteraciones confirmadas) — solo verifica, antes de redactar el
    // mensaje de bloqueo, si la causa más probable es simplemente que hay
    // trabajo sin confirmar todavía. Si la hay, esa es la acción correcta a
    // sugerir primero — forzar "continuar de todas formas" sin haber
    // confirmado nada no va a mover L_FARO_proyecto en la próxima ronda.
    const nodosSinConfirmar = await nodosConIteracionSinConfirmar(supabase, project_id);

    const motivo =
      nodosSinConfirmar.length > 0
        ? `Convergencia automática detenida — ${diagnostico} Hay trabajo reciente sin confirmar en ${nodosSinConfirmar.join(", ")} — revíselo y confírmelo en la pantalla de cada nodo, puede que eso resuelva la falta de mejora antes de forzar continuar.`
        : `Convergencia automática detenida — ${diagnostico} Requiere revisión manual antes de seguir regenerando nodos automáticamente.`;

    return {
      detenido: true,
      motivo,
      rondas_evaluadas: filas.length,
      historial: filas,
      ultimo_detalle_l_faro_por_nodo: ultimoDetalle,
    };
  }

  return { detenido: false, motivo: null, rondas_evaluadas: filas.length, historial: filas, ultimo_detalle_l_faro_por_nodo: ultimoDetalle };
}

/**
 * Punto ÚNICO de aplicación del circuito para TODOS los caminos de
 * regeneración — no solo TriagePregunta.tsx/propagacion.ts. Descubierto
 * 18-ago-2026: existe un segundo camino, "Regenerar propuesta →" en las
 * 6 pantallas FormulacionXxx.tsx (RUTA, NOVA, OBJETIVOS, METODOLOGIA,
 * MARCO_REFERENCIAL, IMPACTOS_DELIMITACION), que llama directo a
 * /api/mci/{nodo}/generar sin pasar por ejecutarPropagacion() — ese
 * camino no tenía NINGUNA protección.
 *
 * DISCRIMINADOR — corregido 18-ago-2026: NO es "feedback presente". La
 * primera versión de este fix usaba `if (feedback)` como proxy, pero eso
 * deja un hueco real: "Regenerar propuesta →" con la caja de texto y las
 * preguntas incrustadas vacías manda feedback=undefined (ver
 * FormulacionImpactosDelimitacion.tsx: `generar(feedbackCompleto ||
 * undefined)`), y ese es exactamente el caso que MÁS debería bloquearse
 * — regenerar sin darle ninguna instrucción nueva al agente no tiene
 * ninguna razón para mejorar. El discriminador real y confiable es si YA
 * EXISTE una iteración previa de este mismo (project_id, nodo_tipo) en
 * grafo_nodos — es la misma condición que ya usa cada pantalla para
 * decidir si mostrar el botón "Generar propuesta" (nodoActual ausente)
 * o la UI de confirmación/regeneración (nodoActual presente). Si no
 * existe ninguna iteración previa, es la primera generación real —
 * nunca hay nada que comparar, nunca se bloquea. Si ya existe al menos
 * una, CUALQUIER llamada posterior (con o sin feedback) es una
 * regeneración y se evalúa el circuito.
 *
 * ejecutarPropagacion() (propagacion.ts) SIGUE haciendo su propia llamada
 * explícita a evaluarCircuitoConvergencia() antes de esto — no es lógica
 * duplicada (la evaluación en sí vive solo ahí, en evaluarCircuitoConvergencia),
 * es para poder devolver el diagnóstico completo (detalle_l_faro_por_nodo,
 * etc.) de una sola vez a TriagePregunta.tsx en vez de un simple error de
 * texto por nodo, Y para poder cortar ANTES de intentar regenerar ningún
 * nodo cuando NO hay bypass (evita tocar la BD si de todas formas se va a
 * bloquear). El camino que SÍ depende de esta función en exclusiva es el
 * directo desde las 6 pantallas de nodo.
 *
 * BUG REAL CORREGIDO (19-ago-2026, hallado al construir el camino directo
 * de item 3): la nota anterior de este comentario llamaba a la doble
 * evaluación "redundante pero barata" — cierto solo en el caso SIN bypass
 * (ambas coinciden en bloquear). Cuando SÍ había bypass, ejecutarPropagacion
 * registraba el override y avanzaba, pero esta función volvía a evaluar el
 * circuito SIN saber que hubo bypass —seguía viendo la misma tendencia sin
 * mejora, porque la fila de auditoría del override se excluye a propósito
 * del cálculo— y volvía a lanzar. El resultado real en producción: cada
 * regeneración de cada nodo dentro de un "Ya revisé, continuar de todas
 * formas" fallaba en silencio (regenerarNodoConFeedback la atrapaba como
 * exito:false por nodo), pero la pregunta se marcaba "resuelta" igual
 * (ejecutarPropagacion añade pregunta_raiz_id a idsResueltos sin condicionar
 * al éxito de la regeneración) — el override nunca regeneraba nada, y no
 * había ninguna señal de que había fallado. Corregido pasando `bypass`
 * explícitamente desde el nivel que autorizó el override (ejecutarPropagacion
 * o, ahora, cada POST /api/mci/{nodo}/generar) hasta aquí.
 */
// Compartido entre propagacion.ts y los 6 {nodo}/generar/route.ts — evita
// repetir el tipo inline en cada uno con riesgo de que diverjan.
export interface BypassCircuito {
  confirmadoPor: string;
  preguntaRaizId?: string | null;
}

export class CircuitoDetenidoError extends Error {
  circuito: ResultadoCircuito;
  constructor(circuito: ResultadoCircuito) {
    super(circuito.motivo ?? "Convergencia automática detenida — revise manualmente antes de continuar.");
    this.name = "CircuitoDetenidoError";
    this.circuito = circuito;
  }
}

export async function verificarCircuitoAntesDeRegenerar(
  supabase: SupabaseClient,
  project_id: string,
  nodo_tipo: string,
  // Presente = quien llamó YA autorizó saltar el bloqueo para este intento
  // puntual. Registra la auditoría aquí mismo — es el único punto que sabe
  // con certeza que el bloqueo se saltó de verdad para ESTE nodo_tipo (a
  // diferencia de un registro genérico a nivel de toda la operación).
  bypass?: BypassCircuito
): Promise<void> {
  const { data: previos } = await supabase
    .from("grafo_nodos")
    .select("id, sellado")
    .eq("project_id", project_id)
    .eq("tipo", nodo_tipo)
    .order("iteracion", { ascending: false })
    .limit(1);

  const nodoMasReciente = previos?.[0];
  if (nodoMasReciente?.sellado) {
    throw new Error(`[diodo] El nodo ${nodo_tipo} está sellado — escritura en origen bloqueada. Debe reabrir el nodo explícitamente para regenerarlo.`);
  }

  const esRegeneracion = (previos?.length ?? 0) > 0;
  if (!esRegeneracion) return; // primera generación real del nodo — nada que comparar, nunca se bloquea

  const circuito = await evaluarCircuitoConvergencia(supabase, project_id);
  if (!circuito.detenido) return;

  if (bypass) {
    await registrarOverrideCircuito(supabase, {
      project_id,
      confirmado_por: bypass.confirmadoPor,
      pregunta_raiz_id: bypass.preguntaRaizId ?? null,
      motivo_circuito_original: circuito.motivo,
    });
    return;
  }

  throw new CircuitoDetenidoError(circuito);
}

/**
 * Registra que un humano revisó el bloqueo y decidió continuar de todas
 * formas — auditoría insertada en convergencia_proyecto (sin tabla
 * nueva), excluida del cálculo de mejora por no tener l_faro_proyecto.
 * pregunta_raiz_id es null cuando el override ocurre en el camino directo
 * de regeneración (pantallas FormulacionXxx.tsx, sin responder una
 * pregunta puntual) en vez de vía propagación.
 */
export async function registrarOverrideCircuito(
  supabase: SupabaseClient,
  params: { project_id: string; confirmado_por: string; pregunta_raiz_id: string | null; motivo_circuito_original: string | null }
): Promise<void> {
  await supabase.from("convergencia_proyecto").insert({
    project_id: params.project_id,
    resultado: {
      tipo_evento: TIPO_EVENTO_OVERRIDE,
      confirmado_por: params.confirmado_por,
      confirmado_en: new Date().toISOString(),
      pregunta_raiz_id: params.pregunta_raiz_id,
      motivo_circuito_original: params.motivo_circuito_original,
    },
  });
}
