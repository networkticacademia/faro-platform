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
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// 3 filas = 2 transiciones consecutivas comparables — "2 rondas completas sin mejora".
const RONDAS_EVALUADAS = 3;
// Por debajo de esto, una baja de L_FARO_proyecto no cuenta como mejora real (ruido de redondeo/cálculo).
const UMBRAL_MEJORA_MINIMA = 0.005;

interface ResultadoConvergenciaAlmacenado {
  l_faro_proyecto?: number;
  detalle_l_faro_por_nodo?: { num_preguntas_pendientes?: number }[];
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
}

function sumaPreguntasPendientes(resultado: ResultadoConvergenciaAlmacenado | null): number | null {
  const detalle = resultado?.detalle_l_faro_por_nodo;
  if (!Array.isArray(detalle)) return null;
  return detalle.reduce((acc, d) => acc + (typeof d?.num_preguntas_pendientes === "number" ? d.num_preguntas_pendientes : 0), 0);
}

export async function evaluarCircuitoConvergencia(
  supabase: SupabaseClient,
  project_id: string
): Promise<ResultadoCircuito> {
  const { data } = await supabase
    .from("convergencia_proyecto")
    .select("resultado, calculado_en")
    .eq("project_id", project_id)
    .order("calculado_en", { ascending: false })
    .limit(RONDAS_EVALUADAS);

  // Más antigua primero, para leer las transiciones en orden cronológico.
  const filas: FilaHistorial[] = (data ?? [])
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
    return { detenido: false, motivo: null, rondas_evaluadas: filas.length, historial: filas };
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
    };
  }

  return { detenido: false, motivo: null, rondas_evaluadas: filas.length, historial: filas };
}
