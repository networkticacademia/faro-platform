/**
 * Herramientas de IA de referencia por fase del ciclo investigativo.
 * Fuente: Capítulo 3, "Formulación de Proyectos de Investigación Asistida por IA",
 * Chaparro Mesa (2026).
 *
 * `enUso: true` marca las herramientas que FARO integra activamente en su pipeline
 * (no solo mencionadas como referencia educativa). Esto determina si aparecen en la
 * sección destacada o en la sección colapsada del panel.
 */

export type FamiliaHerramienta =
  | "generativa"
  | "rag"
  | "redaccion"
  | "analisis"
  | "bibliografica"
  | "mapeo_lit"
  | "precaucion";

export interface HerramientaReferencia {
  nombre: string;
  url: string;
  familia: FamiliaHerramienta;
  uso: string;
  capRef?: string;
  enUso?: boolean;
}

export interface FaseHerramientas {
  id: string;
  nombre: string;
  icono: string;
  herramientas: HerramientaReferencia[];
}

export const FAMILIA_LABEL: Record<FamiliaHerramienta, string> = {
  generativa: "Generativa / LLM",
  rag: "RAG / Corpus propio",
  redaccion: "Redacción y edición",
  analisis: "Análisis de datos",
  bibliografica: "Gestión bibliográfica",
  mapeo_lit: "Mapeo de literatura",
  precaucion: "Uso con precaución",
};

export const FASES_HERRAMIENTAS: FaseHerramientas[] = [
  {
    id: "tema_especifico",
    nombre: "Tema específico",
    icono: "🔍",
    herramientas: [
      {
        nombre: "ChatGPT",
        url: "https://chatgpt.com",
        familia: "generativa",
        uso: "Formular ideas de temas, mapas de subtemas, delimitar contextos disciplinarios y refinar títulos tentativos. Siempre contrastar con bases académicas.",
        capRef: "Cap. 3",
      },
      {
        nombre: "Claude",
        url: "https://claude.ai",
        familia: "generativa",
        uso: "Formular ideas de temas, mapas de subtemas, delimitar contextos disciplinarios y refinar títulos tentativos.",
        capRef: "Cap. 3",
        enUso: true,
      },
      {
        nombre: "Gemini",
        url: "https://gemini.google.com",
        familia: "generativa",
        uso: "Destaca por su integración con Google Scholar y acceso a literatura reciente.",
        capRef: "Cap. 3",
      },
      {
        nombre: "Perplexity",
        url: "https://www.perplexity.ai",
        familia: "generativa",
        uso: "Exploración inicial de temas con respuestas basadas en fuentes actuales.",
        capRef: "Cap. 3",
        enUso: true,
      },
      {
        nombre: "Semantic Scholar",
        url: "https://www.semanticscholar.org",
        familia: "mapeo_lit",
        uso: "Buscar palabras clave, contar artículos recientes, comprobar que el tema no está vacío ni saturado.",
        capRef: "Cap. 3",
        enUso: true,
      },
      {
        nombre: "Elicit",
        url: "https://elicit.com",
        familia: "mapeo_lit",
        uso: "Validación de viabilidad bibliográfica del tema antes de comprometerse con él.",
        capRef: "Cap. 3",
      },
      {
        nombre: "Google Scholar",
        url: "https://scholar.google.com",
        familia: "mapeo_lit",
        uso: "Verificación cruzada de tendencias y volumen de literatura sobre el tema.",
        capRef: "Cap. 3",
      },
    ],
  },
  {
    id: "problema",
    nombre: "Problema",
    icono: "⚠️",
    herramientas: [
      {
        nombre: "ChatGPT",
        url: "https://chatgpt.com",
        familia: "generativa",
        uso: "Transformar un tema amplio en problema específico, generar versiones alternativas de la pregunta (PICO/PEO).",
        capRef: "Cap. 5",
      },
      {
        nombre: "Elicit",
        url: "https://elicit.com",
        familia: "generativa",
        uso: "Verificar coherencia de la pregunta con la literatura disponible.",
        capRef: "Cap. 5",
      },
      {
        nombre: "SciSpace",
        url: "https://scispace.com",
        familia: "generativa",
        uso: "Apoyo en la formulación de la pregunta de investigación contrastada con artículos clave.",
        capRef: "Cap. 5",
      },
      {
        nombre: "ResearchRabbit",
        url: "https://www.researchrabbit.ai",
        familia: "mapeo_lit",
        uso: "Visualizar agrupaciones de artículos y localizar huecos en el mapa de literatura.",
        capRef: "Cap. 5",
      },
      {
        nombre: "Connected Papers",
        url: "https://www.connectedpapers.com",
        familia: "mapeo_lit",
        uso: "Derivar la brecha que justifica el problema a partir del mapa de citas.",
        capRef: "Cap. 5",
      },
      {
        nombre: "Litmaps",
        url: "https://www.litmaps.com",
        familia: "mapeo_lit",
        uso: "Exportar el mapa de literatura como figura para el proyecto.",
        capRef: "Cap. 5",
      },
    ],
  },
  {
    id: "antecedentes_estado_arte",
    nombre: "Antecedentes / Estado del Arte",
    icono: "📚",
    herramientas: [
      {
        nombre: "OpenAlex",
        url: "https://openalex.org",
        familia: "mapeo_lit",
        uso: "Fuente académica primaria de RSL en FARO — búsqueda paralela junto a Crossref y Semantic Scholar.",
        enUso: true,
      },
      {
        nombre: "Crossref",
        url: "https://www.crossref.org",
        familia: "mapeo_lit",
        uso: "Fuente académica primaria de RSL en FARO — verificación de DOI y metadatos bibliográficos.",
        enUso: true,
      },
      {
        nombre: "Semantic Scholar",
        url: "https://www.semanticscholar.org",
        familia: "mapeo_lit",
        uso: "Fuente académica primaria de RSL en FARO — consulta paralela vía API con clave dedicada.",
        capRef: "Cap. 6",
        enUso: true,
      },
      {
        nombre: "Lens.org",
        url: "https://www.lens.org",
        familia: "mapeo_lit",
        uso: "Fuente adicional condicional de RSL en FARO, activa cuando hay token institucional configurado.",
        enUso: true,
      },
      {
        nombre: "NotebookLM",
        url: "https://notebooklm.google",
        familia: "rag",
        uso: "Disponible en paralelo desde el inicio de cada búsqueda en RSL — interrogar el corpus propio con citas verificables al fragmento exacto del PDF de origen.",
        capRef: "Cap. 6",
        enUso: true,
      },
      {
        nombre: "Perplexity",
        url: "https://www.perplexity.ai",
        familia: "generativa",
        uso: "Reporte externo aceptado por el parser asistido de Fuentes en FARO.",
        enUso: true,
      },
      {
        nombre: "Elicit",
        url: "https://elicit.com",
        familia: "mapeo_lit",
        uso: "Construcción del corpus bibliográfico, extracción sistemática con alta precisión en datos estructurados. Reporte aceptado por el parser asistido de Fuentes en FARO.",
        capRef: "Cap. 6",
        enUso: true,
      },
      {
        nombre: "SciSpace",
        url: "https://scispace.com",
        familia: "rag",
        uso: "Resúmenes estructurados, extracción de objetivos, métodos, resultados y limitaciones. Reporte aceptado por el parser asistido de Fuentes en FARO.",
        capRef: "Cap. 6",
        enUso: true,
      },
      {
        nombre: "Scite",
        url: "https://scite.ai",
        familia: "mapeo_lit",
        uso: "Revisar cómo se citan los artículos entre sí — apoyo o contraste (Smart Citations).",
        capRef: "Cap. 6",
      },
      {
        nombre: "ResearchRabbit",
        url: "https://www.researchrabbit.ai",
        familia: "mapeo_lit",
        uso: "Seguir cadenas de citas y detectar artículos clave del corpus inicial.",
        capRef: "Cap. 6",
      },
      {
        nombre: "Scholarcy",
        url: "https://www.scholarcy.com",
        familia: "rag",
        uso: "Lectura rápida y síntesis de artículos individuales.",
        capRef: "Cap. 6",
      },
      {
        nombre: "ChatPDF",
        url: "https://www.chatpdf.com",
        familia: "rag",
        uso: "Extracción y organización de evidencia a partir de PDFs individuales.",
        capRef: "Cap. 6",
      },
      {
        nombre: "STORM (Stanford)",
        url: "https://storm.genie.stanford.edu",
        familia: "precaucion",
        uso: "Genera artículos tipo Wikipedia con citas reales, pero con riesgos metodológicos serios: selección automática de fuentes sin criterio del investigador, posible omisión de literatura crítica, riesgo de presentar el output como estado del arte propio. Uso legítimo solo para exploración inicial de un campo desconocido, nunca como sustituto de la RSL. Toda fuente debe verificarse manualmente.",
        capRef: "Cap. 6",
      },
    ],
  },
  {
    id: "justificacion",
    nombre: "Justificación",
    icono: "✅",
    herramientas: [
      {
        nombre: "ChatGPT",
        url: "https://chatgpt.com",
        familia: "generativa",
        uso: "Organizar argumentos de relevancia social, teórica y metodológica a partir de notas de antecedentes.",
        capRef: "Cap. 5",
      },
      {
        nombre: "Claude",
        url: "https://claude.ai",
        familia: "generativa",
        uso: "Construcción del argumento de pertinencia del proyecto.",
        capRef: "Cap. 5",
        enUso: true,
      },
      {
        nombre: "Consensus",
        url: "https://consensus.app",
        familia: "mapeo_lit",
        uso: "Preguntas tipo '¿qué evidencia existe sobre…?' con peso de evidencia agregado de literatura.",
        capRef: "Cap. 5",
      },
      {
        nombre: "Elicit",
        url: "https://elicit.com",
        familia: "mapeo_lit",
        uso: "Soporte de evidencia para el argumento de justificación.",
        capRef: "Cap. 5",
      },
    ],
  },
  {
    id: "hipotesis",
    nombre: "Hipótesis / Preguntas específicas",
    icono: "🔬",
    herramientas: [
      {
        nombre: "ChatGPT",
        url: "https://chatgpt.com",
        familia: "generativa",
        uso: "Refinar redacción de hipótesis a partir de variables, población y diseño.",
        capRef: "Cap. 8",
      },
      {
        nombre: "Claude",
        url: "https://claude.ai",
        familia: "generativa",
        uso: "Refinar redacción a partir de variables, población y diseño; verificar congruencia hipótesis-variables-métodos.",
        capRef: "Cap. 8",
        enUso: true,
      },
      {
        nombre: "Elicit",
        url: "https://elicit.com",
        familia: "generativa",
        uso: "Contraste de hipótesis contra evidencia empírica disponible.",
        capRef: "Cap. 8",
      },
      {
        nombre: "SciSpace",
        url: "https://scispace.com",
        familia: "generativa",
        uso: "Alinear la hipótesis con marcos teóricos predominantes revisando artículos clave del campo.",
        capRef: "Cap. 8",
      },
    ],
  },
  {
    id: "objetivos",
    nombre: "Objetivos",
    icono: "🎯",
    herramientas: [
      {
        nombre: "ChatGPT",
        url: "https://chatgpt.com",
        familia: "generativa",
        uso: "Transformar hipótesis y preguntas en objetivos medibles con verbos de Bloom.",
        capRef: "Cap. 8",
      },
      {
        nombre: "Claude",
        url: "https://claude.ai",
        familia: "generativa",
        uso: "Redacción con taxonomía de Bloom, generación de versiones alternativas de objetivos.",
        capRef: "Cap. 8",
        enUso: true,
      },
      {
        nombre: "Paperpal",
        url: "https://paperpal.com",
        familia: "redaccion",
        uso: "Detectar incoherencias problema–objetivos–método.",
        capRef: "Cap. 8",
      },
      {
        nombre: "Thesify",
        url: "https://www.thesify.ai",
        familia: "analisis",
        uso: "Auditor de lógica argumental — evalúa claridad de la tesis y saltos lógicos.",
        capRef: "Cap. 8",
      },
    ],
  },
  {
    id: "marco_referencial",
    nombre: "Marco Referencial",
    icono: "📖",
    herramientas: [
      {
        nombre: "ResearchRabbit",
        url: "https://www.researchrabbit.ai",
        familia: "mapeo_lit",
        uso: "Agrupar teorías por corrientes, entender genealogías de autores.",
        capRef: "Cap. 7",
      },
      {
        nombre: "Connected Papers",
        url: "https://www.connectedpapers.com",
        familia: "mapeo_lit",
        uso: "Organizar bloques temáticos del marco teórico.",
        capRef: "Cap. 7",
      },
      {
        nombre: "NotebookLM",
        url: "https://notebooklm.google",
        familia: "rag",
        uso: "Interrogar el corpus teórico propio ya reunido.",
        capRef: "Cap. 7",
        enUso: true,
      },
      {
        nombre: "Zotero",
        url: "https://www.zotero.org",
        familia: "bibliografica",
        uso: "Organizar referencias por colección temática antes de redactar.",
        capRef: "Cap. 7",
      },
      {
        nombre: "Claude",
        url: "https://claude.ai",
        familia: "redaccion",
        uso: "Generar borradores del marco teórico y conceptual a partir de notas propias.",
        capRef: "Cap. 7",
        enUso: true,
      },
      {
        nombre: "Jenni",
        url: "https://jenni.ai",
        familia: "redaccion",
        uso: "Borrador inicial con revisión de estilo del marco teórico.",
        capRef: "Cap. 7",
      },
      {
        nombre: "Writefull",
        url: "https://www.writefull.com",
        familia: "redaccion",
        uso: "Depuración de prosa académica.",
        capRef: "Cap. 7",
      },
    ],
  },
  {
    id: "metodologia",
    nombre: "Metodología",
    icono: "⚙️",
    herramientas: [
      {
        nombre: "ChatGPT",
        url: "https://chatgpt.com",
        familia: "generativa",
        uso: "Comparar tipos de diseño usados en estudios similares.",
        capRef: "Cap. 10",
      },
      {
        nombre: "Claude",
        url: "https://claude.ai",
        familia: "generativa",
        uso: "Redactar secciones de enfoque (cuantitativo, cualitativo, mixto), diseño de instrumentos.",
        capRef: "Cap. 10",
        enUso: true,
      },
      {
        nombre: "SciSpace",
        url: "https://scispace.com",
        familia: "generativa",
        uso: "Revisión de aplicación del diseño metodológico en el campo específico.",
        capRef: "Cap. 10",
      },
      {
        nombre: "Elicit",
        url: "https://elicit.com",
        familia: "analisis",
        uso: "Revisar qué pruebas o modelos estadísticos usan estudios similares.",
        capRef: "Cap. 11",
      },
      {
        nombre: "GitHub Copilot",
        url: "https://github.com/features/copilot",
        familia: "analisis",
        uso: "Código R/Python reproducible para análisis cuantitativo.",
        capRef: "Cap. 11",
      },
      {
        nombre: "NVivo (IA)",
        url: "https://lumivero.com/products/nvivo",
        familia: "analisis",
        uso: "Sugerir esquemas de codificación y categorías preliminares para análisis cualitativo.",
        capRef: "Cap. 11",
      },
      {
        nombre: "ATLAS.ti (IA)",
        url: "https://atlasti.com",
        familia: "analisis",
        uso: "Organización inicial del análisis cualitativo — interpretación y saturación teórica siguen siendo responsabilidad del investigador.",
        capRef: "Cap. 11",
      },
    ],
  },
  {
    id: "gestion_bibliografica",
    nombre: "Gestión Bibliográfica",
    icono: "📑",
    herramientas: [
      {
        nombre: "Zotero",
        url: "https://www.zotero.org",
        familia: "bibliografica",
        uso: "Organizar artículos, deduplicar referencias, etiquetar por categoría. Con Better BibTeX, exportación automática al .bib de Overleaf.",
        capRef: "Cap. 14",
      },
      {
        nombre: "Mendeley",
        url: "https://www.mendeley.com",
        familia: "bibliografica",
        uso: "Sincronización con Word o LaTeX/BibLaTeX.",
        capRef: "Cap. 14",
      },
    ],
  },
  {
    id: "documento_final",
    nombre: "Documento Final",
    icono: "📄",
    herramientas: [
      {
        nombre: "Claude",
        url: "https://claude.ai",
        familia: "redaccion",
        uso: "Ensamblar texto a partir de secciones ya trabajadas, verificar coherencia global.",
        capRef: "Cap. 21",
        enUso: true,
      },
      {
        nombre: "Jenni",
        url: "https://jenni.ai",
        familia: "redaccion",
        uso: "Ensamblaje y coherencia global del borrador completo.",
        capRef: "Cap. 21",
      },
      {
        nombre: "Writefull",
        url: "https://www.writefull.com",
        familia: "redaccion",
        uso: "Pulido de gramática y estilo académico.",
        capRef: "Cap. 21",
      },
      {
        nombre: "Paperpal",
        url: "https://paperpal.com",
        familia: "redaccion",
        uso: "Preflight — checklist pre-sumisión.",
        capRef: "Cap. 21",
      },
      {
        nombre: "Trinka",
        url: "https://www.trinka.ai",
        familia: "redaccion",
        uso: "Revisión gramatical especializada en escritura científica.",
        capRef: "Cap. 21",
      },
      {
        nombre: "Turnitin",
        url: "https://www.turnitin.com",
        familia: "precaucion",
        uso: "Verificar similitud, citación adecuada y posibles problemas de parafraseo excesivo antes de entrega o publicación.",
        capRef: "Cap. 20",
      },
      {
        nombre: "iThenticate",
        url: "https://www.ithenticate.com",
        familia: "precaucion",
        uso: "Control de originalidad previo a publicación en revista.",
        capRef: "Cap. 20",
      },
    ],
  },
];

export function obtenerFase(id: string): FaseHerramientas | undefined {
  return FASES_HERRAMIENTAS.find((f) => f.id === id);
}
