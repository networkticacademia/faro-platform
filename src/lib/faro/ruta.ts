/**
 * Esquema de salida del operador RUTA = (R, U, T, A)
 * R = Región, U = Usuarios, T = Tema, A = Alcance
 *
 * Regla de diseño (sesión del 2026-08-03): el "vacío de conocimiento o
 * problema práctico" NUNCA se declara como hecho verificado por RUTA —
 * se declara como hipótesis con estado_evidencia explícito, porque RUTA
 * no tiene acceso a literatura real (eso es RSL, que llega en F4). Esto
 * conecta con Delta en L_FARO: cuando RSL exista, comparará esta
 * hipótesis contra evidencia real y actualizará estado_evidencia.
 */

export type EstadoEvidencia = "sin_verificar" | "confirmado_por_rsl" | "contradicho_por_rsl";
export type NivelConfianza = "alta" | "media" | "baja";

export interface VacioConocimientoHipotesis {
  afirmacion: string;
  estado_evidencia: EstadoEvidencia;
  confianza_agente: NivelConfianza;
}

export interface RutaOutput {
  tema: string;
  problema: string;
  pregunta_investigacion: string;
  objeto_estudio: string;
  poblacion_contexto: string;
  alcance_temporal: string;
  alcance_espacial: string;
  justificacion_breve: string;
  vacio_conocimiento_hipotesis: VacioConocimientoHipotesis;
  nivel_confianza_agente: NivelConfianza;
  preguntas_para_el_usuario: string[];
}

/**
 * Construye el prompt para el orquestador. El nivel de rigor y profundidad
 * se ajusta por nu/tau como PARÁMETROS del prompt, no como plantillas
 * separadas (decisión de diseño: un esquema universal, rigor variable).
 */
export function construirPromptRuta(params: {
  nu: string;
  tau: string;
  mu: string;
  alphaArea: string;
  lambdaTrl: number | null;
  u0: number;
  tituloProvisional?: string;
  feedbackIteracionAnterior?: string;
}): string {
  const { nu, tau, mu, alphaArea, lambdaTrl, u0, tituloProvisional, feedbackIteracionAnterior } = params;

  const rigor =
    nu === "doctorado" ? "alto rigor académico, exigiendo justificación teórica profunda"
    : nu === "maestria" ? "rigor académico intermedio, con justificación clara pero no exhaustiva"
    : nu === "convocatoria" ? "rigor orientado a criterios de evaluación de convocatoria pública, con foco en pertinencia y viabilidad"
    : "rigor apropiado para un proyecto de pregrado, priorizando claridad sobre exhaustividad";

  const vacioTipo =
    tau === "basica"
      ? "un vacío de conocimiento teórico (qué no se sabe aún)"
      : "un problema práctico no resuelto (qué situación real requiere intervención)";

  return `Eres RUTA, el agente especializado en delimitación de proyectos de investigación dentro de FARO.

CONTEXTO DEL PROYECTO:
- Nivel: ${nu} (aplica ${rigor})
- Tipo: ${tau}
- Enfoque metodológico: ${mu}
- Área de conocimiento: ${alphaArea}
- TRL objetivo: ${lambdaTrl ?? "no aplica"}
- Incertidumbre inicial U0: ${u0.toFixed(3)}
${tituloProvisional ? `- Título provisional: ${tituloProvisional}` : ""}
${feedbackIteracionAnterior ? `\nRETROALIMENTACIÓN DE LA ITERACIÓN ANTERIOR (corrige esto):\n${feedbackIteracionAnterior}` : ""}

TU TAREA: producir una delimitación RUTA (Región, Usuarios, Tema, Alcance) siguiendo el operador D(θ)=(R,U,T,A).

REGLA CRÍTICA: no tienes acceso a literatura científica real. NUNCA afirmes que "no existe investigación previa" o que "hay un vacío confirmado" como hecho. Todo vacío de conocimiento o problema práctico que identifiques debe declararse como HIPÓTESIS, con estado_evidencia="sin_verificar" — será contrastado después contra evidencia bibliográfica real por otro agente (RSL). Identifica ${vacioTipo}, pero como hipótesis, no como afirmación verificada.

Si tienes baja confianza en algún aspecto o necesitas que el usuario aclare algo, decláralo explícitamente en preguntas_para_el_usuario — no inventes información que no tienes.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "tema": "string",
  "problema": "string",
  "pregunta_investigacion": "string",
  "objeto_estudio": "string",
  "poblacion_contexto": "string",
  "alcance_temporal": "string",
  "alcance_espacial": "string",
  "justificacion_breve": "string",
  "vacio_conocimiento_hipotesis": {
    "afirmacion": "string",
    "estado_evidencia": "sin_verificar",
    "confianza_agente": "alta" | "media" | "baja"
  },
  "nivel_confianza_agente": "alta" | "media" | "baja",
  "preguntas_para_el_usuario": ["string"]
}`;
}
