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
    const motivo = preguntasCreciendo
      ? `Las últimas ${deltas.length} rondas muestran preguntas pendientes netas creciendo en vez de reducirse (${seriePreguntas}).`
      : `Las últimas ${deltas.length} rondas no muestran mejora medible en L_FARO_proyecto (${serieLFaro}).`;
    return {
      detenido: true,
      motivo: `Convergencia automática detenida — ${motivo} Requiere revisión manual antes de seguir regenerando nodos automáticamente.`,
      rondas_evaluadas: filas.length,
      historial: filas,
      ultimo_detalle_l_faro_por_nodo: ultimoDetalle,
    };
  }

  return { detenido: false, motivo: null, rondas_evaluadas: filas.length, historial: filas, ultimo_detalle_l_faro_por_nodo: ultimoDetalle };
}

/**
 * Registra que un humano revisó el bloqueo y decidió continuar de todas
 * formas — auditoría insertada en convergencia_proyecto (sin tabla
 * nueva), excluida del cálculo de mejora por no tener l_faro_proyecto.
 */
export async function registrarOverrideCircuito(
  supabase: SupabaseClient,
  params: { project_id: string; confirmado_por: string; pregunta_raiz_id: string; motivo_circuito_original: string | null }
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
