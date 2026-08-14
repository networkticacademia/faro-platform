import type { EstadoEvidencia, NivelConfianza, RutaOutput } from "./ruta";
import type { NovaOutput } from "./nova";
import type { ObjetivosOutput } from "./objetivos";
import type { MetodologiaOutput } from "./metodologia";
import type { TipoProyecto } from "./types";
import type { SubtipoDti } from "./tipologiaProyecto";

// ============================================================
// Nodo Impactos y Delimitación — fundamentado contra 2 documentos
// verificados (RICYT/OCDE para impactos; Fidias Arias 2012 para
// recursos/limitaciones/riesgos) + skills impactos-proyecto-q1 y
// delimitacion-proyecto-q1. Incorpora el Triángulo de Hierro (Barnes,
// 1969): la duración declarada del proyecto es una restricción dura,
// no un dato decorativo — condiciona qué limitaciones/riesgos son
// realistas y qué impactos son plausibles en ese horizonte.
// ============================================================

export type TipoImpacto =
  | "cientifico"
  | "tecnologico"
  | "social"
  | "economico"
  | "ambiental"
  | "cultural"
  | "politico";

export const TIPO_IMPACTO_LABEL: Record<TipoImpacto, string> = {
  cientifico: "Científico",
  tecnologico: "Tecnológico",
  social: "Social",
  economico: "Económico",
  ambiental: "Ambiental",
  cultural: "Cultural",
  politico: "Político",
};

export interface ImpactoDeclarado {
  tipo: TipoImpacto;
  descripcion: string; // proyección cualitativa fundamentada — NUNCA una cifra inventada
  indicador_verificacion_futura: string; // cómo se comprobará en el futuro, no un valor ya calculado
}

export type CategoriaRecurso = "humano" | "material_infraestructura" | "tecnologico" | "financiero";

export interface RecursoDetalle {
  categoria: CategoriaRecurso;
  descripcion: string; // específico y verificable, no genérico
}

export interface Limitacion {
  descripcion: string;
  justificacion: string; // por qué es una restricción estructural insalvable, NUNCA una carencia del investigador
}

export type NivelProbabilidadImpacto = "baja" | "media" | "alta";

export interface Riesgo {
  descripcion: string;
  probabilidad: NivelProbabilidadImpacto;
  impacto: NivelProbabilidadImpacto;
  mitigacion: string;
}

export interface ImpactosDelimitacionOutput {
  impactos: ImpactoDeclarado[]; // 1 a 7 — solo los tipos que genuinamente aplican
  recursos: RecursoDetalle[]; // cubriendo las 4 categorías cuando aplique
  limitaciones: Limitacion[];
  riesgos: Riesgo[];

  estado_evidencia: EstadoEvidencia;
  nivel_confianza_agente: NivelConfianza;
  preguntas_para_el_usuario: string[];
}

export const CAMPOS_OBLIGATORIOS_IMPACTOS_DELIMITACION: (keyof ImpactosDelimitacionOutput)[] = [
  "impactos",
  "recursos",
  "limitaciones",
  "riesgos",
];

// ============================================================
// Duración por defecto según tipo de proyecto — determinística,
// verificada en skill delimitacion-proyecto-q1. Para convocatoria,
// el valor real debe salir de la rúbrica/términos de referencia ya
// cargada (rubrica.ts) — esta función solo da el rango orientativo
// cuando no hay rúbrica todavía.
// ============================================================

export function duracionDefaultMeses(nu: string): { meses: number | null; fuente: string; requiereConfirmacion: boolean } {
  switch (nu) {
    case "pregrado":
      return { meses: 6, fuente: "Estándar institucional universidades colombianas (pregrado)", requiereConfirmacion: true };
    case "maestria":
      return { meses: 12, fuente: "Estándar institucional universidades colombianas (maestría)", requiereConfirmacion: true };
    case "doctorado":
      return { meses: 18, fuente: "Estándar institucional universidades colombianas (doctorado, rango 12-24)", requiereConfirmacion: true };
    case "convocatoria":
      return { meses: null, fuente: "Debe extraerse de los términos de referencia de la convocatoria específica — no hay default genérico válido", requiereConfirmacion: true };
    default:
      return { meses: null, fuente: "Tipo de proyecto no reconocido", requiereConfirmacion: true };
  }
}

// ============================================================
// construirPromptImpactosDelimitacion()
// ============================================================

export function construirPromptImpactosDelimitacion(params: {
  nu: string;
  tau: TipoProyecto;
  subtipoDti: SubtipoDti | null;
  duracionMesesProyecto: number | null;
  rutaOutput: RutaOutput;
  novaOutput: NovaOutput;
  objetivosOutput: ObjetivosOutput;
  metodologiaOutput: MetodologiaOutput;
  feedbackIteracionAnterior?: string;
}): string {
  const {
    nu, tau, subtipoDti, duracionMesesProyecto,
    rutaOutput, novaOutput, objetivosOutput, metodologiaOutput,
    feedbackIteracionAnterior,
  } = params;

  const productosTexto = metodologiaOutput.plan_por_objetivo
    .flatMap((p) => p.productos.map((prod) => `- ${prod.nombre_producto} (objetivo: ${p.objetivo_especifico.slice(0, 60)}...)`))
    .join("\n");

  const tecnicasTexto = metodologiaOutput.tecnicas_instrumentos
    .map((t) => `- ${t.tecnica}: ${t.instrumento}`)
    .join("\n");

  return `Eres el agente de Impactos y Delimitación de FARO. Tu tarea tiene dos partes distintas — no las mezcles:

PARTE A — IMPACTOS: proyectar los efectos de largo plazo del proyecto, MÁS ALLÁ de lo que el proyecto entrega directamente.
PARTE B — DELIMITACIÓN COMPLEMENTARIA: catalogar recursos necesarios, limitaciones del estudio, y riesgos operativos — NO repitas la delimitación clásica de espacio/tiempo/población que ya hizo RUTA, esto es distinto y complementario.

=== REGLA DE ORO — DISTINCIÓN PRODUCTO → EFECTO → IMPACTO ===
Producto (lo que el proyecto entrega directamente, ver lista de Metodología abajo) NO es lo mismo que Impacto (cambio sistémico de largo plazo, fuera del control directo del proyecto). Si algo lo entrega directamente el equipo, es un producto — no lo declares como impacto.

=== REGLA DE HONESTIDAD EPISTÉMICA — INNEGOCIABLE PARA IMPACTOS ===
La literatura es categórica (Tejer Impacto, AGROSAVIA 2023): en fase de propuesta, el impacto se declara como PROYECCIÓN CUALITATIVA FUNDAMENTADA con un indicador de VERIFICACIÓN FUTURA — NUNCA como una cifra exacta ya calculada. Prohibido escribir algo como "reducirá los costos en 34%" — eso es precisión falsa, exactamente lo que este framework prohíbe en todos sus nodos. Formato correcto: "[tipo] esperado: [descripción cualitativa argumentada], verificable mediante [indicador que se medirá EN EL FUTURO, no un valor ya disponible]".

TIPOS DE IMPACTO — usa SOLO los que genuinamente aplican (no fuerces los 7 por completitud aparente): Científico, Tecnológico, Social, Económico, Ambiental, Cultural, Político.

=== REGLA DE HONESTIDAD PARA LIMITACIONES ===
Cita textual obligatoria de aplicar (Fidias Arias, 2012): "que el investigador no disponga de tiempo, carezca de recursos financieros personales o no posea habilidades técnicas NO constituye una limitación científica". NUNCA declares como limitación algo que sea en realidad una carencia del formulador — las limitaciones son restricciones del DISEÑO/ALCANCE/POBLACIÓN, insalvables, reconocidas de antemano.

=== DISTINCIÓN LIMITACIONES vs. RIESGOS ===
Limitación = restricción estructural cierta, reconocida ex-ante (ej. tamaño de muestra reducido por baja prevalencia). Riesgo = evento incierto y futuro que podría o no ocurrir, con probabilidad/impacto/mitigación (ej. demora aduanera en equipos importados).

=== RESTRICCIÓN DURA DE TIEMPO (Triángulo de Hierro — Barnes, 1969) ===
${duracionMesesProyecto
    ? `Este proyecto tiene una duración CONFIRMADA de ${duracionMesesProyecto} meses. Los riesgos y limitaciones deben ser realistas para ESE horizonte — no declares riesgos o limitaciones propios de un proyecto de mucho mayor duración. Si algún recurso o actividad de Metodología parece requerir más tiempo del disponible, decláralo explícitamente como una limitación o riesgo de cronograma, no lo ignores.`
    : `Este proyecto NO tiene todavía una duración confirmada. Agrega una pregunta_para_el_usuario pidiendo que se confirme la duración del proyecto antes de dar por completo el análisis de riesgos y limitaciones — sin ese dato, no se puede evaluar realismo temporal.`}

CONTEXTO DEL PROYECTO:
- Nivel: ${nu} · Tipo: ${tau}${subtipoDti ? ` (subtipo: ${subtipoDti})` : ""}
- Duración: ${duracionMesesProyecto ? `${duracionMesesProyecto} meses` : "no confirmada"}

PROBLEMA (NOVA): ${novaOutput.problema_formulado}

CONTRIBUCIÓN Y JUSTIFICACIÓN YA DECLARADAS (NOVA — la base para proyectar impactos, no la repitas, constrúyela hacia el futuro):
${novaOutput.valor_contribucion}
${novaOutput.valor_justificacion_social}

PRODUCTOS YA COMPROMETIDOS (Metodología — esto NO son impactos, son la base de la que parten):
${productosTexto}

TÉCNICAS/INSTRUMENTOS YA DEFINIDOS (Metodología — orienta qué recursos tecnológicos/materiales son necesarios):
${tecnicasTexto}

REGLA CRÍTICA GENERAL — misma honestidad epistémica que todos los nodos anteriores: si te falta información para construir bien alguna sección, decláralo en preguntas_para_el_usuario en vez de inventar.
${feedbackIteracionAnterior ? `\nRETROALIMENTACIÓN DE LA ITERACIÓN ANTERIOR (corrige esto):\n${feedbackIteracionAnterior}\n\nREGLA ANTI-PREGUNTAS-INFINITAS — esta es una iteración de REFINAMIENTO, no la primera vez: el formulador ya respondió preguntas anteriores. NO generes una nueva ronda extensa de preguntas de la misma naturaleza que las que ya respondió. Genera como máximo 1-2 preguntas NUEVAS, y solo si son genuinamente distintas, críticas e insalvables sin esa información específica. Para cualquier otra incertidumbre menor, haz el supuesto más razonable, decláralo EXPLÍCITAMENTE en el texto generado, y avanza — no lo conviertas en otra pregunta.` : ""}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "impactos": [{"tipo": "cientifico"|"tecnologico"|"social"|"economico"|"ambiental"|"cultural"|"politico", "descripcion": "string", "indicador_verificacion_futura": "string"}],
  "recursos": [{"categoria": "humano"|"material_infraestructura"|"tecnologico"|"financiero", "descripcion": "string"}],
  "limitaciones": [{"descripcion": "string", "justificacion": "string"}],
  "riesgos": [{"descripcion": "string", "probabilidad": "baja"|"media"|"alta", "impacto": "baja"|"media"|"alta", "mitigacion": "string"}],
  "estado_evidencia": "sin_verificar" | "confirmado_por_rsl" | "contradicho_por_rsl",
  "nivel_confianza_agente": "alta" | "media" | "baja",
  "preguntas_para_el_usuario": ["string"]
}
`;
}
