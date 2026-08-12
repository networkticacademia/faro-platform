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

export interface Referencia {
  autor: string; // ej. "Sautu, R., Boniolo, P., Dalle, P., & Elbert, R."
  año: string; // ej. "2005" — string para admitir "s.f." si no hay certeza
  titulo: string;
  fuente: string; // revista/editorial/institución
  doi_o_isbn: string | null; // null si no hay certeza — NUNCA inventado
  nivel_confianza: "alta" | "media" | "baja"; // qué tan seguro está el agente de esta cita exacta
}

export interface MarcoTeorico {
  incluido: boolean; // SIEMPRE true — el único marco obligatorio en todos los casos
  postura_teorica: string; // paradigma/perspectiva teórica adoptada
  teorias_sustantivas: string[]; // teorías específicas aplicadas al problema
  texto: string; // prosa completa, patrón afirmación→cita OBLIGATORIO
  referencias: Referencia[];
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
  referencias: Referencia[];
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

export function todasLasReferencias(output: MarcoReferencialOutput): Referencia[] {
  return [
    ...output.marco_teorico.referencias,
    ...output.marco_conceptual.referencias,
  ];
}

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
// Generador de prompts de fundamentación teórica — determinístico,
// SIN costo de LLM, mismo patrón que proponerCadenaBusqueda() de RSL.
// Arma los 4 prompts (NotebookLM búsqueda/extracción, Perplexity
// búsqueda/extracción) con el problema real del proyecto ya insertado,
// para que el formulador solo copie y pegue en la herramienta externa.
// ============================================================

export interface PromptsFundamentacionTeorica {
  notebooklmBusqueda: string;
  notebooklmExtraccion: string;
  perplexityBusqueda: string;
  perplexityExtraccion: string;
}

export function generarPromptsFundamentacionTeorica(
  problemaProyecto: string
): PromptsFundamentacionTeorica {
  const problema = problemaProyecto.trim();

  const notebooklmBusqueda = `Busca y agrega a este cuaderno fuentes académicas sobre las teorías o marcos conceptuales fundacionales que explican el siguiente problema de investigación:

"${problema}"

Prioriza las obras ORIGINALES/fundacionales de cada teoría (no aplicaciones recientes — eso ya está cubierto por otra búsqueda aparte), en español o inglés, con autor claramente identificable. Si el problema involucra un término técnico específico que requiera definición formal, busca también esa definición en un artículo científico o manual técnico reconocido del área.

No me entregues el documento todavía — solo confirma qué fuentes agregaste.`;

  const notebooklmExtraccion = `Ya tienes cargadas las fuentes sobre el marco teórico de este problema:
"${problema}"

Entrega un documento con una ficha por cada teoría/fuente relevante que encontraste en el corpus, en este formato exacto:

- Autor(es):
- Año:
- Título completo:
- Fuente (editorial/revista):
- DOI o ISBN (si existe en el corpus):
- Postura o idea central de la teoría (2-3 líneas, en tus propias palabras):
- Por qué aplica a este problema específico (2-3 líneas):

Usa EXCLUSIVAMENTE el corpus cargado — si algo no está cubierto, dilo explícitamente en vez de completarlo con conocimiento general fuera del corpus. Al final, una sección "Cobertura del corpus" indicando qué quedó sin respaldo suficiente.`;

  const perplexityBusqueda = `Busca fuentes académicas y peer-reviewed (prioriza artículos con DOI, libros con ISBN, o repositorios institucionales — evita blogs y páginas de divulgación general) sobre las teorías o marcos conceptuales fundacionales que explican el siguiente problema:

"${problema}"

Devuélveme SOLO una lista de fuentes candidatas, sin desarrollar el contenido todavía: título, autor, año, editorial/revista, y por qué parece relevante en una línea. Prioriza las obras originales de cada teoría, no artículos de aplicación reciente. Limita a las 6-8 fuentes más pertinentes.`;

  const perplexityExtraccion = `De las fuentes que acabas de listar, dame ahora una ficha completa por cada una, en este formato exacto:

- Autor(es):
- Año:
- Título completo:
- Fuente (editorial/revista):
- DOI o ISBN:
- Postura o idea central de la teoría (2-3 líneas):
- Por qué aplica al problema que te di (2-3 líneas):

REGLA CRÍTICA: si no tienes certeza del DOI, ISBN o año exacto de alguna fuente, dilo explícitamente ("dato no verificado con certeza") en vez de completarlo con un valor aproximado. Prefiero una ficha incompleta pero honesta a una completa pero fabricada.`;

  return { notebooklmBusqueda, notebooklmExtraccion, perplexityBusqueda, perplexityExtraccion };
}



export function construirPromptMarcoReferencial(params: {
  nu: string;
  tau: TipoProyecto;
  subtipoDti: SubtipoDti | null;
  rutaOutput: RutaOutput;
  novaOutput: NovaOutput;
  objetivosOutput: ObjetivosOutput;
  fuentesExternasVerificadas?: string;
  feedbackIteracionAnterior?: string;
}): string {
  const { nu, tau, subtipoDti, rutaOutput, novaOutput, objetivosOutput, fuentesExternasVerificadas, feedbackIteracionAnterior } = params;

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

REGLA OBLIGATORIA — PATRÓN ASEVERACIÓN→CITA, SIN EXCEPCIÓN (esto es innegociable, no un estilo opcional): cada afirmación teórica o conceptual en marco_teorico.texto y marco_conceptual.texto debe ir acompañada de su cita (autor, año) inmediatamente después, igual que un texto académico real — nunca escribas una afirmación teórica sin atribución. Por cada autor/teoría que menciones en el texto, debes agregar la ficha completa correspondiente en el array "referencias" de ese marco.
${fuentesExternasVerificadas ? `\nFUENTES YA VERIFICADAS POR EL FORMULADOR (autor/año/DOI confirmados manualmente contra fuentes reales — CITA DE AQUÍ CON PRIORIDAD ABSOLUTA antes de recurrir a tu propio conocimiento; si una fuente de esta lista aplica al problema, úsala en vez de citar otra que solo recuerdes de tu entrenamiento):\n"""\n${fuentesExternasVerificadas}\n"""\n` : ""}
HONESTIDAD EPISTÉMICA ESTRICTA SOBRE CITAS — esto es tan importante como la regla anterior: NUNCA inventes un DOI, ISBN, año exacto o título de obra que no conozcas con certeza real. Si vas a citar un autor/teoría de la que tienes conocimiento general pero no recuerdas con precisión el año exacto, el título exacto de la obra, o el DOI/ISBN, declara nivel_confianza="baja" y deja doi_o_isbn=null — NO complete esos campos con un valor inventado que parezca plausible. Es preferible una cita con nivel_confianza baja y datos incompletos honestos, que una cita completa pero fabricada — el formulador va a verificar cada referencia contra fuentes reales antes de publicar, y una cita inventada detectada destruye la confianza en todo el documento.

MARCO CONTEXTUAL — 3 dimensiones obligatorias si incluido=true: geográfica-territorial, institucional-organizacional, sectorial. REGLA CRÍTICA para no duplicar con RUTA: el alcance de RUTA es el "recorte" (qué queda dentro/fuera del proyecto en espacio/tiempo/población); el Marco Contextual es la descripción cualitativa DENTRO de esas fronteras ya delimitadas — no repitas la delimitación, descríbela.

MARCO LEGAL — diferencia entre Marco Legal (leyes/decretos con fuerza coactiva estatal) y Marco Normativo (estándares técnicos ISO/OMS/sectoriales sin fuerza de ley, NO es esto). Si aplica, cita jerarquía piramidal cuando sea pertinente: Constitución → Leyes → Decretos → Resoluciones. No inventes números de norma que no conozcas con certeza — si no tienes certeza de la identificación exacta, decláralo en preguntas_para_el_usuario en vez de inventar un número de ley/decreto.

MARCO HISTÓRICO (el menos frecuente) — solo si el problema está históricamente determinado (dinámicas comunitarias, políticas públicas, tecnologías acumulativas). Si incluido=true, usa 1 a 3 líneas: descriptiva, explicativa, normativa — completa solo las que apliquen, las demás null.

REGLA CRÍTICA — honestidad epistémica: no inventes normas legales, teorías o cifras sin certeza real. Si te falta información para construir bien alguna sección, decláralo en preguntas_para_el_usuario.
${feedbackIteracionAnterior ? `\nRETROALIMENTACIÓN DE LA ITERACIÓN ANTERIOR (corrige esto):\n${feedbackIteracionAnterior}` : ""}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "marco_teorico": {"incluido": true, "postura_teorica": "string", "teorias_sustantivas": ["string"], "texto": "string", "referencias": [{"autor": "string", "año": "string", "titulo": "string", "fuente": "string", "doi_o_isbn": "string"|null, "nivel_confianza": "alta"|"media"|"baja"}]},
  "marco_conceptual": {"incluido": boolean, "definiciones": [{"termino": "string", "definicion": "string", "variable_o_categoria_id": "string"|null}], "texto": "string", "referencias": [{"autor": "string", "año": "string", "titulo": "string", "fuente": "string", "doi_o_isbn": "string"|null, "nivel_confianza": "alta"|"media"|"baja"}]},
  "marco_contextual": {"incluido": boolean, "dimension_geografica_territorial": "string", "dimension_institucional_organizacional": "string", "dimension_sectorial": "string", "texto": "string"},
  "marco_legal": {"incluido": boolean, "normas": [{"tipo": "constitucion"|"ley"|"decreto"|"resolucion"|"otro", "identificacion": "string", "relevancia": "string"}], "texto": "string"},
  "marco_historico": {"incluido": boolean, "linea_descriptiva": "string"|null, "linea_explicativa": "string"|null, "linea_normativa": "string"|null, "texto": "string"},
  "estado_evidencia": "sin_verificar" | "confirmado_por_rsl" | "contradicho_por_rsl",
  "nivel_confianza_agente": "alta" | "media" | "baja",
  "preguntas_para_el_usuario": ["string"]
}
`;
}
