import type { RutaOutput, EstadoEvidencia, NivelConfianza } from "./ruta";
import type { NovaOutput } from "./nova";
import type { ObjetivosOutput } from "./objetivos";
import type { TipoProyecto } from "./types";
import type { SubtipoDti } from "./tipologiaProyecto";

// ============================================================
// Nodo Marco Referencial — fundamentado contra 5 documentos
// verificados (Sautu et al. 2005, Lazarsfeld 1974, jerarquía Kelsen
// Colombia, Cortez Torrez 2018, entre otros). Distinto de RSL/Estado
// del Arte: el Marco Referencial responde "desde qué perspectiva se
// examina el problema", no "qué se ha investigado recientemente"
// (eso ya lo resuelve RSL — no se duplica aquí).
// ============================================================

export type TipoMarco = "teorico" | "conceptual" | "contextual" | "legal" | "historico";
export type Obligatoriedad = "obligatorio" | "opcional" | "no_aplica";

export interface MarcoTeorico {
  incluido: boolean; // SIEMPRE true — el único marco obligatorio en todos los casos
  postura_teorica: string; // paradigma/perspectiva teórica adoptada
  teorias_sustantivas: string[]; // teorías específicas aplicadas al problema
  texto: string; // prosa completa, patrón afirmación→cita
}

export interface DefinicionConceptual {
  termino: string;
  definicion: string;
  variable_o_categoria_id: string | null; // referencia a Objetivos (VAR-N o CAT-N), si aplica
}

export interface MarcoConceptual {
  incluido: boolean;
  definiciones: DefinicionConceptual[];
  texto: string;
}

export interface MarcoContextual {
  incluido: boolean;
  dimension_geografica_territorial: string;
  dimension_institucional_organizacional: string;
  dimension_sectorial: string;
  texto: string;
}

export interface NormaLegal {
  tipo: "constitucion" | "ley" | "decreto" | "resolucion" | "otro";
  identificacion: string; // ej. "Ley 1286 de 2009"
  relevancia: string; // por qué aplica a este proyecto
}

export interface MarcoLegal {
  incluido: boolean;
  normas: NormaLegal[];
  texto: string;
}

export interface MarcoHistorico {
  incluido: boolean; // el menos frecuente — solo si el problema está históricamente determinado
  linea_descriptiva: string | null;
  linea_explicativa: string | null;
  linea_normativa: string | null;
  texto: string;
}

export interface MarcoReferencialOutput {
  marco_teorico: MarcoTeorico;
  marco_conceptual: MarcoConceptual;
  marco_contextual: MarcoContextual;
  marco_legal: MarcoLegal;
  marco_historico: MarcoHistorico;

  estado_evidencia: EstadoEvidencia;
  nivel_confianza_agente: NivelConfianza;
  preguntas_para_el_usuario: string[];
}

export const CAMPOS_OBLIGATORIOS_MARCO_REFERENCIAL: (keyof MarcoReferencialOutput)[] = [
  "marco_teorico",
];

// ============================================================
// Tabla de obligatoriedad por tipo de proyecto (Documento 5,
// verificado — ver memoria de sesión) — determinística, no la
// decide el LLM.
// ============================================================

export function marcosAplicablesParaProyecto(
  tau: TipoProyecto,
  subtipoDti: SubtipoDti | null
): Record<TipoMarco, Obligatoriedad> {
  if (tau === "basica") {
    return {
      teorico: "obligatorio",
      conceptual: "obligatorio",
      contextual: "opcional",
      legal: "no_aplica",
      historico: "opcional",
    };
  }
  if (tau === "aplicada") {
    return {
      teorico: "obligatorio",
      conceptual: "obligatorio",
      contextual: "obligatorio",
      legal: "opcional", // condicional: obligatorio si usa recursos públicos/PI/sector regulado
      historico: "opcional",
    };
  }
  // dti (desarrollo tecnológico e innovación)
  return {
    teorico: "obligatorio",
    conceptual: "obligatorio",
    contextual: "obligatorio",
    legal: "obligatorio", // DTI casi siempre involucra PI, patentes o sector regulado
    historico: "no_aplica",
  };
}

// ============================================================
// construirPromptMarcoReferencial()
// ============================================================

export function construirPromptMarcoReferencial(params: {
  nu: string;
  tau: TipoProyecto;
  subtipoDti: SubtipoDti | null;
  rutaOutput: RutaOutput;
  novaOutput: NovaOutput;
  objetivosOutput: ObjetivosOutput;
  feedbackIteracionAnterior?: string;
}): string {
  const { nu, tau, subtipoDti, rutaOutput, novaOutput, objetivosOutput, feedbackIteracionAnterior } = params;

  const aplicables = marcosAplicablesParaProyecto(tau, subtipoDti);

  const variablesOCategoriasTexto =
    objetivosOutput.enfoque_metodologico === "cualitativo"
      ? objetivosOutput.categorias_analisis.map((c) => `${c.id} — ${c.nombre}: ${c.definicion}`).join("\n")
      : objetivosOutput.variables.map((v) => `${v.id} — ${v.nombre}: ${v.definicion_conceptual}`).join("\n");

  return `Eres el agente Marco Referencial de FARO. Tu tarea es construir el marco teórico, conceptual, contextual, legal e histórico del proyecto — NO el estado del arte (eso ya lo resuelve RSL, no lo dupliques).

DISTINCIÓN CRÍTICA — Marco Teórico vs Estado del Arte (verificada contra fuentes primarias): el estado del arte responde "¿qué se ha investigado recientemente sobre este tema?" (RSL). El marco teórico responde "¿desde qué perspectiva teórica se va a examinar el problema?" — son preguntas distintas, no las mezcles. Construcción en dos etapas: (1) selección de las teorías que sustentan el estudio, (2) adopción explícita de una postura teórica, integrando supuestos paradigmáticos → teorías generales → teorías sustantivas aplicadas al problema específico.

OBLIGATORIEDAD DE CADA MARCO PARA ESTE PROYECTO (tabla de decisión ya fundamentada, no la vuelvas a decidir):
- Marco Teórico: ${aplicables.teorico} (declara incluido=true SIEMPRE, sin excepción)
- Marco Conceptual: ${aplicables.conceptual}
- Marco Contextual: ${aplicables.contextual}
- Marco Legal: ${aplicables.legal}
- Marco Histórico: ${aplicables.historico}

Para cada marco marcado "no_aplica": declara incluido=false y deja los demás campos vacíos ("" o []) — NO escribas texto igual, ni inventes contenido para un marco que no corresponde.
Para cada marco marcado "opcional": decide tú si el problema específico lo amerita; si decides que NO aplica, decláralo igual que "no_aplica" pero agrega una pregunta_para_el_usuario explicando por qué lo omitiste, para que el formulador pueda corregirte si está en desacuerdo.
Para cada marco marcado "obligatorio": incluido=true siempre.

CONTEXTO DEL PROYECTO:
- Nivel: ${nu} · Tipo: ${tau}${subtipoDti ? ` (subtipo: ${subtipoDti})` : ""}

PROBLEMA CENTRAL Y DELIMITACIÓN (RUTA): "${rutaOutput.problema}"
Objeto de estudio: "${rutaOutput.objeto_estudio}" · Población/contexto: "${rutaOutput.poblacion_contexto}"

BRECHA DE CONOCIMIENTO Y PROBLEMA FORMULADO (NOVA): "${novaOutput.nucleo_brecha_conocimiento}"
${novaOutput.problema_formulado}

${objetivosOutput.enfoque_metodologico === "cualitativo" ? "CATEGORÍAS DE ANÁLISIS" : "VARIABLES"} YA DEFINIDAS (Objetivos — el Marco Conceptual debe operacionalizar estos términos, usando el ID exacto en variable_o_categoria_id):
${variablesOCategoriasTexto}

INSTRUCCIONES POR MARCO (cuando aplique):

MARCO CONCEPTUAL — operacionalización en 4 etapas (Lazarsfeld, verificado): representación literaria/conceptual → especificación de dimensiones → selección de indicadores → construcción de ítems. Cada definicion debe corresponder a un término técnico específico del proyecto (no vocabulario general), y vincularse a variable_o_categoria_id cuando el término ya está operacionalizado en Objetivos.

MARCO CONTEXTUAL — 3 dimensiones obligatorias si incluido=true: geográfica-territorial, institucional-organizacional, sectorial. REGLA CRÍTICA para no duplicar con RUTA: el alcance de RUTA es el "recorte" (qué queda dentro/fuera del proyecto en espacio/tiempo/población); el Marco Contextual es la descripción cualitativa DENTRO de esas fronteras ya delimitadas — no repitas la delimitación, descríbela.

MARCO LEGAL — diferencia entre Marco Legal (leyes/decretos con fuerza coactiva estatal) y Marco Normativo (estándares técnicos ISO/OMS/sectoriales sin fuerza de ley, NO es esto). Si aplica, cita jerarquía piramidal cuando sea pertinente: Constitución → Leyes → Decretos → Resoluciones. No inventes números de norma que no conozcas con certeza — si no tienes certeza de la identificación exacta, decláralo en preguntas_para_el_usuario en vez de inventar un número de ley/decreto.

MARCO HISTÓRICO (el menos frecuente) — solo si el problema está históricamente determinado (dinámicas comunitarias, políticas públicas, tecnologías acumulativas). Si incluido=true, usa 1 a 3 líneas: descriptiva, explicativa, normativa — completa solo las que apliquen, las demás null.

REGLA CRÍTICA — honestidad epistémica: no inventes normas legales, teorías o cifras sin certeza real. Si te falta información para construir bien alguna sección, decláralo en preguntas_para_el_usuario.
${feedbackIteracionAnterior ? `\nRETROALIMENTACIÓN DE LA ITERACIÓN ANTERIOR (corrige esto):\n${feedbackIteracionAnterior}` : ""}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "marco_teorico": {"incluido": true, "postura_teorica": "string", "teorias_sustantivas": ["string"], "texto": "string"},
  "marco_conceptual": {"incluido": boolean, "definiciones": [{"termino": "string", "definicion": "string", "variable_o_categoria_id": "string"|null}], "texto": "string"},
  "marco_contextual": {"incluido": boolean, "dimension_geografica_territorial": "string", "dimension_institucional_organizacional": "string", "dimension_sectorial": "string", "texto": "string"},
  "marco_legal": {"incluido": boolean, "normas": [{"tipo": "constitucion"|"ley"|"decreto"|"resolucion"|"otro", "identificacion": "string", "relevancia": "string"}], "texto": "string"},
  "marco_historico": {"incluido": boolean, "linea_descriptiva": "string"|null, "linea_explicativa": "string"|null, "linea_normativa": "string"|null, "texto": "string"},
  "estado_evidencia": "sin_verificar" | "confirmado_por_rsl" | "contradicho_por_rsl",
  "nivel_confianza_agente": "alta" | "media" | "baja",
  "preguntas_para_el_usuario": ["string"]
}
`;
}
