import type { PesosU0 } from "./types";

/**
 * Instrumento M0 — VALIDADO.
 * Texto exacto extraído de "FARO — Diagnóstico Inicial M0 — Unitrópico 2025
 * (respuestas)", el mismo instrumento que produjo los datos ya reportados
 * en el artículo (20 ítems, α de Cronbach = 0.941; por dimensión: U1=0.880,
 * U2=0.850, U3=0.883, U4=0.845). Verificado contra una fila real: el cálculo
 * de Ud y U0 de este archivo reproduce exactamente los valores de la
 * columna U0_Global del Excel. No modificar el texto de los ítems sin
 * volver a correr el análisis de confiabilidad — el alfa reportado
 * corresponde a esta redacción exacta.
 */

export type EscalaItem = "likert5" | "abcd" | "disponibilidad" | "estado_proyecto";

export interface ItemDiagnostico {
  id: string; // C1-C5, M1-M5, V1-V5, E1-E5
  dimension: "u1" | "u2" | "u3" | "u4";
  texto: string;
  escala: EscalaItem;
  opciones: { valor: number; etiqueta: string }[];
  permiteNoSabe: boolean;
}

const LIKERT5: ItemDiagnostico["opciones"] = [
  { valor: 1, etiqueta: "1 — Muy en desacuerdo" },
  { valor: 2, etiqueta: "2" },
  { valor: 3, etiqueta: "3" },
  { valor: 4, etiqueta: "4" },
  { valor: 5, etiqueta: "5 — Muy de acuerdo" },
];

export const INSTRUMENTO_M0: ItemDiagnostico[] = [
  // ---- U1: Claridad conceptual ----
  { id: "C1", dimension: "u1", texto: "Tengo claro el tema general de mi proyecto.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "C2", dimension: "u1", texto: "Puedo describir el problema específico en 2-3 oraciones.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "C3", dimension: "u1", texto: "Tengo identificada la población o el fenómeno de estudio.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "C4", dimension: "u1", texto: "Tengo una pregunta de investigación preliminar formulada.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "C5", dimension: "u1", texto: "Tengo al menos un objetivo general tentativo.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },

  // ---- U2: Competencia metodológica ----
  { id: "M1", dimension: "u2", texto: "Conozco el enfoque metodológico que usaré y por qué es el adecuado.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "M2", dimension: "u2", texto: "Sé qué tipo de diseño de investigación aplicaré.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "M3", dimension: "u2", texto: "He realizado antes una revisión sistemática de literatura o sé cómo hacerla.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "M4", dimension: "u2", texto: "Sé qué técnicas de análisis de datos usaré en mi proyecto.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "M5", dimension: "u2", texto: "He usado herramientas de IA o software especializado para investigación.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },

  // ---- U3: Viabilidad contextual ----
  { id: "V1", dimension: "u3", texto: "Tengo el tiempo suficiente para desarrollar este proyecto según el plazo disponible.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "V2", dimension: "u3", texto: "Tengo acceso a los datos, muestras o fuentes de información que necesito.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "V3", dimension: "u3", texto: "Cuento con los recursos financieros o institucionales necesarios.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "V4", dimension: "u3", texto: "Conozco las restricciones éticas, legales o institucionales que aplican.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "V5", dimension: "u3", texto: "Tengo claridad sobre quién más participa en el proyecto (director, co-investigador, entidades).", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },

  // ---- U4: Encaje estructural ----
  { id: "E1", dimension: "u4", texto: "El nivel declarado del proyecto corresponde al alcance real que puedo demostrar.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "E2", dimension: "u4", texto: "El tipo de investigación coincide con los productos reales que planeo obtener.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "E3", dimension: "u4", texto: "Si hay rúbrica de evaluación, conozco sus criterios y mi proyecto puede cumplirlos.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "E4", dimension: "u4", texto: "El TRL declarado es coherente con lo que puedo lograr en el plazo disponible.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
  { id: "E5", dimension: "u4", texto: "Sé a qué revista, fondo o destino dirigiré los resultados de este proyecto.", escala: "likert5", opciones: LIKERT5, permiteNoSabe: true },
];

/**
 * Pesos alpha_d REALES por tipo de proyecto (tau), extraídos de la fórmula
 * de la celda U0_Global del instrumento validado (no adivinados):
 *   básica:   =IF(...,0.35*U1+0.3*U2+0.2*U3+0.15*U4,...)
 *   aplicada: =IF(...,0.25*U1+0.25*U2+0.3*U3+0.2*U4,...)
 *   dti:      =IF(...,0.2*U1+0.2*U2+0.35*U3+0.25*U4,...)
 *   default:  0.25 cada una (cuando tau no está definido)
 */
export const PESOS_U0_POR_TAU: Record<string, PesosU0> = {
  basica: { u1: 0.35, u2: 0.30, u3: 0.20, u4: 0.15 },
  aplicada: { u1: 0.25, u2: 0.25, u3: 0.30, u4: 0.20 },
  dti: { u1: 0.20, u2: 0.20, u3: 0.35, u4: 0.25 },
};

export const PESOS_U0_IGUALES: PesosU0 = { u1: 0.25, u2: 0.25, u3: 0.25, u4: 0.25 };

export function pesosU0ParaTau(tau: string | undefined | null): PesosU0 {
  if (tau && PESOS_U0_POR_TAU[tau]) return PESOS_U0_POR_TAU[tau];
  return PESOS_U0_IGUALES;
}

export function sMaxDeEscala(escala: EscalaItem): number {
  switch (escala) {
    case "likert5":
    case "estado_proyecto":
      return 5;
    case "abcd":
      return 4;
    case "disponibilidad":
      return 3;
  }
}

// ============================================================
// Preguntas de CONTEXTO (z0* sin u0) — texto exacto del instrumento
// ============================================================

export type OpcionCerteza = "confirmado" | "tentativo" | "nosabe";

export const OPCIONES_CERTEZA: { valor: OpcionCerteza; etiqueta: string }[] = [
  { valor: "confirmado", etiqueta: "Confirmado — estoy completamente seguro" },
  { valor: "tentativo", etiqueta: "Tentativo — creo que es así pero podría cambiar" },
  { valor: "nosabe", etiqueta: "No sé — no tengo claridad sobre esto" },
];

export const OPCIONES_NIVEL = [
  { valor: "pregrado", etiqueta: "Pregrado / Trabajo de grado" },
  { valor: "maestria", etiqueta: "Maestría" },
  { valor: "doctorado", etiqueta: "Doctorado" },
  { valor: "convocatoria", etiqueta: "Convocatoria institucional o pública (Minciencias, SENA, OCAD, etc.)" },
];

export const OPCIONES_TIPO = [
  { valor: "basica", etiqueta: "Investigación básica (generación de conocimiento teórico)" },
  { valor: "aplicada", etiqueta: "Investigación aplicada (solución de un problema concreto)" },
  { valor: "dti", etiqueta: "Desarrollo Tecnológico e Innovación — DTI (prototipo, sistema, servicio)" },
];

export const OPCIONES_ENFOQUE = [
  { valor: "cuantitativo", etiqueta: "Cuantitativo (datos numéricos, modelos estadísticos, métricas medibles)" },
  { valor: "cualitativo", etiqueta: "Cualitativo (entrevistas, observación, análisis de discurso)" },
  { valor: "mixto", etiqueta: "Mixto (combina cuantitativo y cualitativo de forma articulada)" },
];

export const OPCIONES_INSUMOS_SIGMA = [
  { valor: "A", etiqueta: "A — Tengo artículos científicos de referencia identificados (con DOI o título)" },
  { valor: "B", etiqueta: "B — Tengo palabras clave claras del tema (3 o más términos)" },
  { valor: "C", etiqueta: "C — Tengo claro un objetivo o resultado esperado, aunque no sé si ya existe" },
  { valor: "D", etiqueta: "D — Solo tengo un tema amplio sin mayor precisión" },
  { valor: "E", etiqueta: "E — No tengo ningún insumo todavía" },
];

export const OPCIONES_TRL = [
  { valor: 1, etiqueta: "TRL 1-2: Solo existe la idea o el principio básico (investigación teórica)" },
  { valor: 3, etiqueta: "TRL 3-4: Prueba de concepto o validación en laboratorio" },
  { valor: 5, etiqueta: "TRL 5-6: Validación en entorno relevante o demostración funcional" },
  { valor: 7, etiqueta: "TRL 7-8: Sistema completo demostrado en entorno real" },
  { valor: 9, etiqueta: "TRL 9: Sistema desplegado y operando en condiciones reales" },
  { valor: 0, etiqueta: "No aplica — es investigación básica sin producto tecnológico" },
];

export const OPCIONES_CONVOCATORIA_RHO = [
  { valor: "si_documento", etiqueta: "Sí — tengo el documento de la convocatoria o rúbrica de evaluación" },
  { valor: "si_sin_documento", etiqueta: "Sí — pero no tengo el documento todavía" },
  { valor: "no", etiqueta: "No — es un proyecto de libre iniciativa" },
  { valor: "no_seguro", etiqueta: "No estoy seguro" },
];
