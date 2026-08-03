import { PESOS_U0_DEFAULT, type PesosU0, type RutaActivacion, type VectorIncertidumbre } from "./types";
import { INSTRUMENTO_M0, sMaxDeEscala, type ItemDiagnostico } from "./instrumento";

/**
 * Respuestas crudas del usuario: { r01: 3, r02: 0 (NS), ... }
 * NS (no sabe) se codifica como 0, según el protocolo de honestidad
 * epistémica documentado (NS = incertidumbre máxima, no invalida la respuesta).
 */
export type RespuestasInstrumento = Record<string, number | null>;

/**
 * Ud = 1 - (sum si) / (nd * smax)
 * Calcula la incertidumbre de UNA dimensión a partir de las respuestas crudas.
 */
export function calcularUd(
  dimension: ItemDiagnostico["dimension"],
  respuestas: RespuestasInstrumento,
  instrumento: ItemDiagnostico[] = INSTRUMENTO_M0
): number {
  const items = instrumento.filter((i) => i.dimension === dimension);
  if (items.length === 0) return 0;

  let sumaSi = 0;
  let sumaSmax = 0;

  for (const item of items) {
    const respuesta = respuestas[item.id];
    const si = respuesta === null || respuesta === undefined ? 0 : respuesta; // NS -> 0
    sumaSi += si;
    sumaSmax += sMaxDeEscala(item.escala);
  }

  const ud = 1 - sumaSi / sumaSmax;
  return Math.round(ud * 1000) / 1000;
}

/** Calcula las 4 dimensiones Ud de una sola vez a partir de las respuestas crudas. */
export function calcularVectorIncertidumbre(
  respuestas: RespuestasInstrumento,
  instrumento: ItemDiagnostico[] = INSTRUMENTO_M0
): VectorIncertidumbre {
  return {
    u1_claridad_conceptual: calcularUd("u1", respuestas, instrumento),
    u2_competencia_metodologica: calcularUd("u2", respuestas, instrumento),
    u3_viabilidad_contextual: calcularUd("u3", respuestas, instrumento),
    u4_encaje_estructural: calcularUd("u4", respuestas, instrumento),
  };
}


/**
 * Ud = 1 - (sum si) / (nd * smax)
 * En el formulario, cada Uᵈ ya llega calculado a partir de los ítems (0-1).
 * Esta función solo agrega el U0 global: U0 = sum(alpha_d * Ud)
 * Debe coincidir exactamente con public.calcular_u0() en la migración SQL.
 */
export function calcularU0(u: VectorIncertidumbre, pesos: PesosU0 = PESOS_U0_DEFAULT): number {
  const suma =
    u.u1_claridad_conceptual * pesos.u1 +
    u.u2_competencia_metodologica * pesos.u2 +
    u.u3_viabilidad_contextual * pesos.u3 +
    u.u4_encaje_estructural * pesos.u4;

  return Math.round(suma * 1000) / 1000;
}

/**
 * Interpretación de U0 según la tabla de rangos documentada:
 * 0.00-0.20 baja | 0.21-0.40 moderada | 0.41-0.60 media-alta
 * 0.61-0.80 alta | 0.81-1.00 crítica
 */
export function clasificarRuta(u0: number): RutaActivacion {
  if (u0 <= 0.2) return "directa";
  if (u0 <= 0.4) return "guiada_breve";
  if (u0 <= 0.8) return "reforzamiento"; // agrupa media-alta y alta para el MVP
  return "nivelacion_previa";
}

export const INTERPRETACION_U0: Record<RutaActivacion, string> = {
  directa: "Incertidumbre baja — activación directa de módulos especializados.",
  guiada_breve: "Incertidumbre moderada — ruta guiada breve con verificación puntual.",
  reforzamiento: "Incertidumbre media-alta/alta — reforzar delimitación, problema y literatura antes de avanzar.",
  nivelacion_previa: "Incertidumbre crítica — no iniciar formulación formal; nivelar condiciones de entrada primero.",
};

/**
 * SE_tau = eta1*SE_nivel + eta2*SE_tipo + eta3*SE_convocatoria + eta4*g(U0)
 * g(U0) simplificado para F1: g(U0) = U0 (relación directa, se calibra en F2+)
 */
export function calcularSeTau(params: {
  seNivel: number;
  seTipo: number;
  seConvocatoria: number;
  u0: number;
  eta?: { eta1: number; eta2: number; eta3: number; eta4: number };
}): number {
  const eta = params.eta ?? { eta1: 0.3, eta2: 0.3, eta3: 0.2, eta4: 0.2 };
  const gU0 = params.u0; // placeholder — se calibra empíricamente en F2

  const seTau =
    eta.eta1 * params.seNivel +
    eta.eta2 * params.seTipo +
    eta.eta3 * params.seConvocatoria +
    eta.eta4 * gU0;

  return Math.round(seTau * 1000) / 1000;
}

/** tau_c = tau0 * (1 - SE_tau) */
export function calcularTauC(tau0: number, seTau: number): number {
  return Math.round(tau0 * (1 - seTau) * 1000) / 1000;
}
