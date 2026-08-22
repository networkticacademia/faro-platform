/**
 * capaDecision.ts — Capa de transducción y decisión terminal de FARO.
 * 
 * Transduce L_FARO_proyecto (función de estado del grafo) en probabilidades calibradas
 * de convergencia mediante un modelo ordinal de odds proporcionales con compuertas duras.
 * 
 * RESTRICCIÓN ARQUITECTÓNICA:
 * Este módulo NO modifica L_FARO, ni delta_i, ni kappa_i. Es puramente una capa de
 * decisión posterior (post-hoc) pura y desacoplada.
 */

import type { CondicionConvergencia } from "./convergenciaProyecto";

// ============================================================================
// PARÁMETROS PROVISIONALES — PENDIENTES DE ESTIMACIÓN EMPÍRICA CON DATASET
// ⚠️ NO están calibrados contra el banco Minciencias todavía.
// ============================================================================
export const PARAMETROS_PROVISIONALES = {
  beta_0: 2.0,      // Intercepto base de la variable latente eta
  beta_1: -8.0,     // Coeficiente negativo: a mayor L_FARO_proyecto, menor probabilidad de converger
  theta_1: -1.0,    // Umbral de corte inferior (NO_CONVERGE vs REVISION)
  theta_2: 1.0,     // Umbral de corte superior (REVISION vs CONVERGE)
  T_0: 1.0,         // Escala base de temperatura
  T_min: 0.2,       // Temperatura mínima para evitar división por cero o rigidez infinita
} as const;

// Validación interna de consistencia ordinal
if (PARAMETROS_PROVISIONALES.theta_1 >= PARAMETROS_PROVISIONALES.theta_2) {
  throw new Error("Violación de invariante: theta_1 debe ser estrictamente menor que theta_2");
}

export type EstadoTerminalDecision = "NO_CONVERGE" | "REVISION" | "CONVERGE";

export interface ProbabilidadesDecision {
  no_converge: number;
  revision: number;
  converge: number;
}

export interface EvaluacionCompuertas {
  aprobadas: boolean;
  fallidas: string[];
}

export interface ResultadoDecisionCapa {
  estado: EstadoTerminalDecision;
  probabilidades: ProbabilidadesDecision;
  probabilidades_porcentaje: {
    no_converge: number;
    revision: number;
    converge: number;
  };
  eta: number;
  temperatura: number;
  compuertas_aprobadas: boolean;
  compuertas_fallidas: string[];
  razones: string[];
  es_preliminar: true;
}

/**
 * Función sigmoide logística estándar: Lambda(x) = 1 / (1 + exp(-x))
 */
export function lambdaLogistica(x: number): number {
  if (x >= 40) return 1;
  if (x <= -40) return 0;
  return 1 / (1 + Math.exp(-x));
}

/**
 * Acoplamiento de la temperatura al rigor metodológico: T = g(SE_tau)
 * Mayor rigor (SE_tau alto) produce T menor -> transición más abrupta y banda más estrecha.
 */
export function calcularTemperatura(
  seTau: number,
  t0 = PARAMETROS_PROVISIONALES.T_0,
  tMin = PARAMETROS_PROVISIONALES.T_min
): number {
  const seClamp = Math.max(0, Math.min(1, seTau));
  return Math.max(tMin, Math.round((t0 * (1 - seClamp) + tMin) * 1000) / 1000);
}

/**
 * Calcula la variable latente continua:
 * eta = (beta_0 + beta_1 * L_FARO_proyecto) / T
 */
export function calcularEta(
  lFaroProyecto: number,
  seTau: number,
  params = PARAMETROS_PROVISIONALES
): { eta: number; T: number } {
  const T = calcularTemperatura(seTau, params.T_0, params.T_min);
  const eta = (params.beta_0 + params.beta_1 * lFaroProyecto) / T;
  return {
    eta: Math.round(eta * 1000) / 1000,
    T,
  };
}

/**
 * Modelo ordinal de odds proporcionales con dos umbrales (theta_1 < theta_2):
 * P(no_converge) = Lambda(theta_1 - eta)
 * P(revision)    = Lambda(theta_2 - eta) - Lambda(theta_1 - eta)
 * P(converge)    = 1 - Lambda(theta_2 - eta)
 */
export function calcularProbabilidades(
  eta: number,
  params = PARAMETROS_PROVISIONALES
): ProbabilidadesDecision {
  const pNoConverge = lambdaLogistica(params.theta_1 - eta);
  const pRevision = Math.max(0, lambdaLogistica(params.theta_2 - eta) - pNoConverge);
  const pConverge = Math.max(0, 1 - lambdaLogistica(params.theta_2 - eta));

  // Normalización estricta para garantizar suma 1 exacta
  const suma = pNoConverge + pRevision + pConverge;
  return {
    no_converge: pNoConverge / suma,
    revision: pRevision / suma,
    converge: pConverge / suma,
  };
}

/**
 * Evaluación de compuertas duras determinísticas:
 * 1. Completitud de nodos requeridos.
 * 2. Estructura sin brechas críticas (Xi(G)).
 * 3. Ausencia de contradicciones L2/L3 abiertas.
 * 4. Cronograma dentro de duración pactada.
 */
export function evaluarCompuertas(condiciones: CondicionConvergencia[]): EvaluacionCompuertas {
  const fallidas: string[] = [];

  for (const c of condiciones) {
    if (!c.cumple && c.id !== "l_faro") {
      fallidas.push(`${c.nombre}: ${c.explicacion}`);
    }
  }

  return {
    aprobadas: fallidas.length === 0,
    fallidas,
  };
}

/**
 * Transducción y decisión terminal:
 * Orden obligatorio: Compuertas duras primero -> Probabilidad después.
 */
export function decidirTerminacion(input: {
  lFaroProyecto: number;
  seTau: number;
  condiciones: CondicionConvergencia[];
  params?: typeof PARAMETROS_PROVISIONALES;
}): ResultadoDecisionCapa {
  const params = input.params ?? PARAMETROS_PROVISIONALES;
  const { eta, T } = calcularEta(input.lFaroProyecto, input.seTau, params);
  const probs = calcularProbabilidades(eta, params);
  const compuertas = evaluarCompuertas(input.condiciones);

  const razones: string[] = [];
  let estado: EstadoTerminalDecision;

  if (!compuertas.aprobadas) {
    // Las compuertas duras fallaron: bloquea CONVERGE inmediatamente
    estado = "NO_CONVERGE";
    razones.push(
      `Bloqueo por compuertas duras (${compuertas.fallidas.length} fallida(s)). La probabilidad matemática no anula los requisitos binarios.`
    );
  } else {
    // Si las compuertas están aprobadas, decidir por región ordinal de eta
    if (eta <= params.theta_1) {
      estado = "NO_CONVERGE";
      razones.push(
        `Variable latente eta (${eta.toFixed(3)}) <= theta_1 (${params.theta_1.toFixed(3)}) — alta incertidumbre residual en el grafo.`
      );
    } else if (eta <= params.theta_2) {
      estado = "REVISION";
      razones.push(
        `Variable latente eta (${eta.toFixed(3)}) en banda de rechazo (theta_1 < eta <= theta_2) — requiere derivación a riesgos y validación contextual.`
      );
    } else {
      estado = "CONVERGE";
      razones.push(
        `Variable latente eta (${eta.toFixed(3)}) > theta_2 (${params.theta_2.toFixed(3)}) con compuertas satisfechas — proyecto listo para exportación.`
      );
    }
  }

  return {
    estado,
    probabilidades: probs,
    probabilidades_porcentaje: {
      no_converge: Math.round(probs.no_converge * 100),
      revision: Math.round(probs.revision * 100),
      converge: Math.round(probs.converge * 100),
    },
    eta,
    temperatura: T,
    compuertas_aprobadas: compuertas.aprobadas,
    compuertas_fallidas: compuertas.fallidas,
    razones,
    es_preliminar: true,
  };
}
