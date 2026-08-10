import type { NovaOutput, CausaProblema } from "./nova";
import type { RutaOutput, EstadoEvidencia, NivelConfianza } from "./ruta";

// ============================================================
// Tipos
// ============================================================

export type EnfoqueMetodologico = "cuantitativo" | "cualitativo" | "mixto";

export type NivelBloom =
  | "recordar"
  | "comprender"
  | "aplicar"
  | "analizar"
  | "evaluar"
  | "crear";

export interface ObjetivoEspecifico {
  texto: string;
  verbo_bloom: string;
  nivel_bloom: NivelBloom;
  // Trazabilidad obligatoria — debe coincidir textualmente (o casi) con
  // el texto de una causa en NovaOutput.nucleo_causas_estructuradas.
  // Null solo permitido si el objetivo específico es de apropiación social
  // o transversal y no invierte una causa puntual (caso documentado en la
  // skill redactor-objetivos-q1: OE de apropiación social).
  causa_asociada: string | null;
}

// Solo aplica cuando enfoque incluye componente cuantitativo (cuantitativo o mixto)
export interface HipotesisPar {
  h1: string; // hipótesis alterna, causal y direccional
  h0: string; // hipótesis nula
  objetivo_especifico_asociado: string; // texto del OE al que responde esta hipótesis
}

// Solo aplica cuando enfoque incluye componente cuantitativo (cuantitativo o mixto)
export interface Variable {
  nombre: string;
  tipo: "independiente" | "dependiente" | "moderadora";
  definicion_conceptual: string;
  definicion_operacional: string;
  nivel_medicion: "nominal" | "ordinal" | "intervalo" | "razon";
  indicadores: string[];
}

// Solo aplica cuando enfoque es cualitativo o mixto (componente cualitativo)
export interface CategoriaAnalisis {
  nombre: string;
  definicion: string;
  pregunta_orientadora: string;
  objetivo_especifico_asociado: string;
}

// Fila de la matriz de consistencia — SE ENSAMBLA EN CÓDIGO, no la genera el LLM
export interface FilaMatrizConsistencia {
  objetivo_especifico: string;
  causa_asociada: string | null;
  hipotesis: string | null; // h1, si existe
  variable_o_categoria: string | null; // nombre de variable o de categoría de análisis
  indicador: string | null;
}

export interface ObjetivosOutput {
  enfoque_metodologico: EnfoqueMetodologico;

  objetivo_general: string; // inversión positiva del problema central de RUTA
  verbo_bloom_general: string;

  objetivos_especificos: ObjetivoEspecifico[];

  // Ramas condicionales por enfoque — SIEMPRE declarar el array vacío si no aplica,
  // nunca omitir el campo (honestidad estructural: el campo vacío dice "no aplica
  // a este enfoque", no "el agente lo olvidó").
  hipotesis: HipotesisPar[];
  variables: Variable[];
  categorias_analisis: CategoriaAnalisis[];

  estado_evidencia: EstadoEvidencia;
  nivel_confianza_agente: NivelConfianza;
  preguntas_para_el_usuario: string[];
}

// ============================================================
// Bifurcación por enfoque metodológico (mismo patrón que
// medidaAvanceParaProyecto en tipologiaProyecto.ts)
// ============================================================

export function estructuraSegunEnfoque(mu: string): EnfoqueMetodologico {
  const normalizado = mu.toLowerCase();
  if (normalizado.includes("cualitativ") && normalizado.includes("cuantitativ")) {
    return "mixto";
  }
  if (normalizado.includes("cualitativ")) return "cualitativo";
  return "cuantitativo"; // default seguro: mu no reconocido se trata como cuantitativo
}

// ============================================================
// CAMPOS_OBLIGATORIOS_OBJETIVOS
// ============================================================

export const CAMPOS_OBLIGATORIOS_OBJETIVOS: (keyof ObjetivosOutput)[] = [
  "objetivo_general",
  "objetivos_especificos",
];
// Nota: "hipotesis"/"variables"/"categorias_analisis" NO son obligatorios de forma
// incondicional — su obligatoriedad depende de enfoque_metodologico, se valida
// aparte en el endpoint, no aquí (calcularOmega recibe la lista correcta según
// el enfoque ya resuelto antes de llamarla).

export function camposObligatoriosParaEnfoque(
  enfoque: EnfoqueMetodologico
): (keyof ObjetivosOutput)[] {
  if (enfoque === "cuantitativo") {
    return [...CAMPOS_OBLIGATORIOS_OBJETIVOS, "hipotesis", "variables"];
  }
  if (enfoque === "cualitativo") {
    return [...CAMPOS_OBLIGATORIOS_OBJETIVOS, "categorias_analisis"];
  }
  // mixto: exige ambas ramas
  return [
    ...CAMPOS_OBLIGATORIOS_OBJETIVOS,
    "hipotesis",
    "variables",
    "categorias_analisis",
  ];
}

// ============================================================
// Ensamblaje determinístico de la matriz de consistencia
// (NO generado por el LLM — construido en código a partir de
// lo que el LLM ya produjo, para garantizar coherencia por
// construcción, mismo principio de verificación física de RSL)
// ============================================================

export function ensamblarMatrizConsistencia(
  output: ObjetivosOutput
): FilaMatrizConsistencia[] {
  return output.objetivos_especificos.map((oe) => {
    const hipotesisAsociada = output.hipotesis.find(
      (h) => h.objetivo_especifico_asociado === oe.texto
    );
    const categoriaAsociada = output.categorias_analisis.find(
      (c) => c.objetivo_especifico_asociado === oe.texto
    );
    // Si hay hipótesis, la variable dependiente es la que corresponde a esa
    // hipótesis por proximidad textual; heurística simple, revisable por el
    // formulador en la UI — no se afirma con falsa precisión.
    const variableAsociada = output.variables.find((v) =>
      hipotesisAsociada?.h1.toLowerCase().includes(v.nombre.toLowerCase())
    );

    return {
      objetivo_especifico: oe.texto,
      causa_asociada: oe.causa_asociada,
      hipotesis: hipotesisAsociada?.h1 ?? null,
      variable_o_categoria:
        variableAsociada?.nombre ?? categoriaAsociada?.nombre ?? null,
      indicador: variableAsociada?.indicadores?.[0] ?? null,
    };
  });
}

// ============================================================
// construirPromptObjetivos()
// ============================================================

export function construirPromptObjetivos(params: {
  nu: string;
  mu: string;
  rutaOutput: RutaOutput;
  novaOutput: NovaOutput;
  feedbackIteracionAnterior?: string;
}): string {
  const { nu, mu, rutaOutput, novaOutput, feedbackIteracionAnterior } = params;

  const enfoque = estructuraSegunEnfoque(mu);

  const rigor =
    nu === "doctorado"
      ? "alto rigor académico — objetivos de nivel Crear/Evaluar (Bloom), hipótesis causales exigentes"
      : nu === "maestria"
      ? "rigor intermedio — objetivos de nivel Analizar/Evaluar, hipótesis claras sin exigir novedad doctoral"
      : nu === "convocatoria"
      ? "rigor orientado a criterios de convocatoria pública tipo MGA/Minciencias, con trazabilidad causa→objetivo explícita"
      : "rigor apropiado para pregrado — objetivos de nivel Aplicar/Analizar, priorizando claridad y factibilidad";

  const causasTexto = novaOutput.nucleo_causas_estructuradas
    .map((c: CausaProblema, i: number) => `${i + 1}. [${c.tipo}] ${c.texto}`)
    .join("\n");

  const bloqueEnfoque =
    enfoque === "cuantitativo"
      ? `ENFOQUE CUANTITATIVO — debes producir:
- hipotesis: un par H1/H0 por cada objetivo específico que lo requiera (objetivos de caracterización pura pueden no necesitar hipótesis explícita — decláralo así si aplica).
- variables: cada variable con definición conceptual Y operacional, nivel de medición (nominal/ordinal/intervalo/razón), e indicadores concretos. Las variables independientes deben corresponder a las causas del árbol de NOVA; las dependientes, al problema central o sus efectos.
- categorias_analisis: array VACÍO (no aplica a este enfoque).`
      : enfoque === "cualitativo"
      ? `ENFOQUE CUALITATIVO — debes producir:
- categorias_analisis: para cada objetivo específico que lo requiera, una categoría de análisis con definición y pregunta orientadora (NO hipótesis positivista — la investigación cualitativa no predice un resultado a contrastar, explora e interpreta un fenómeno).
- hipotesis: array VACÍO (no aplica a este enfoque; si el usuario intenta forzar hipótesis cuantitativas aquí, señálalo en preguntas_para_el_usuario en vez de inventarlas).
- variables: array VACÍO (no aplica a este enfoque).`
      : `ENFOQUE MIXTO — debes producir AMBAS ramas: hipotesis + variables para el componente cuantitativo del diseño, Y categorias_analisis para el componente cualitativo. Sé explícito en qué objetivos específicos corresponden a cada componente — no mezcles una hipótesis cuantitativa con una categoría cualitativa para el mismo objetivo específico.`;

  return `Eres el agente Objetivos de FARO. Tu tarea es derivar el objetivo general, los objetivos específicos, y (según el enfoque metodológico) las hipótesis/variables o categorías de análisis del proyecto, a partir del problema ya delimitado por RUTA y del árbol de problemas ya construido por NOVA.

REGLA ARQUITECTÓNICA NO NEGOCIABLE — inversión del árbol de problemas (MGA, ya documentado en la fundamentación teórica de FARO):
El objetivo general es la inversión positiva del problema central. Cada objetivo específico es la inversión de UNA causa del árbol de NOVA — no inventes objetivos que no correspondan a ninguna causa real, y no fusiones dos causas en un solo objetivo.

CONTEXTO DEL PROYECTO:
- Nivel: ${nu} (aplica ${rigor})
- Enfoque metodológico declarado: "${mu}" → clasificado como: ${enfoque}

PROBLEMA CENTRAL (RUTA, D(θ) — el objetivo general debe invertirlo en positivo, sin reformular su alcance):
"${rutaOutput.problema}"

CAUSAS DEL ÁRBOL DE PROBLEMAS (NOVA — cada objetivo específico debe invertir UNA de estas, citando cuál en causa_asociada con el texto exacto o casi exacto de la causa):
${causasTexto}

${bloqueEnfoque}

TAXONOMÍA DE BLOOM — VERBOS OBLIGATORIOS (nunca uses "conocer", "entender", "estudiar", "analizar" sin objeto preciso, "revisar", "observar" — son verbos de bajo nivel cognitivo y señalan bajo rigor a un evaluador):
- Objetivo general: nivel Crear o Evaluar → Desarrollar, Diseñar, Construir, Validar, Formular, Evaluar, Comparar, Proponer, Establecer.
- Objetivos específicos técnicos: nivel Aplicar/Analizar → Implementar, Caracterizar, Cuantificar, Comparar, Determinar.
- Objetivos específicos de apropiación social (si aplica): Implementar, Transferir, Fortalecer, Co-diseñar, Formar.

VERBOS POR TIPO DE INVESTIGACIÓN (eje complementario a Bloom — usa este para elegir el verbo según el diseño, y Bloom para verificar su nivel cognitivo):
- Aplicada: Implementar, evaluar, desarrollar, optimizar, validar, probar, mejorar, monitorear, diseñar.
- Descriptiva: Describir, registrar, clasificar, caracterizar, comparar, cuantificar, diagnosticar, identificar, medir.
- Correlacional: Correlacionar, relacionar, comparar, asociar, contrastar, determinar.
- Explicativa: Explicar, demostrar, comprobar, determinar, establecer, verificar.
- Exploratoria: Explorar, identificar, descubrir, sondear, detectar, indagar (NUNCA "conocer" ni "estudiar", aunque aparezcan en algunas fuentes — violan el filtro de verbo conductual).

ESTRUCTURA SINTÁCTICA — dos formulaciones válidas, elige la más útil según el caso (si el problema y la unidad de estudio coinciden, usa la simple; si necesitas declarar variable, unidad de estudio, contexto y horizonte temporal por separado, usa la de seis elementos):
1. Simple: VERBO INFINITIVO + OBJETO DE ESTUDIO PRECISO + FINALIDAD + MEDIACIÓN TÉCNICA (si aplica).
2. Seis elementos (Hinojosa Mamani et al., 2024): Verbo + Propósito + Variable(s) + Unidad de Estudio + Contexto + Horizonte Temporal.
Un objetivo enuncia QUÉ se logrará, nunca CÓMO (eso es metodología) — si el objetivo necesita explicarse para entenderse, está mal formulado, no le agregues explicación, refórmulalo.

NOTA DE CONVENCIÓN EDITORIAL (aplica solo si el destino final es un manuscrito Q1 en inglés, no a la versión MGA/español): las revistas Q1 en inglés separan "aims" (propósito abstracto) de "objectives" (pasos operativos) y EXCLUYEN la mediación técnica del objetivo mismo — ej. NO "to conduct a regression analysis to determine..." sino "to determine the relationship between X and Y". Si nu indica destino de artículo Q1 en inglés, aplica esta versión sin mediación técnica; si el destino es MGA/convocatoria en español, incluye la mediación técnica normalmente.

FILTRO SMART — aplícalo a cada objetivo específico antes de declararlo definitivo: Específico (nombra el fenómeno preciso, no "el sistema" o "las variables"), Medible (indicador cuantificable o medible desde línea base empírica si no hay datos previos), Alcanzable dentro del alcance ya delimitado por RUTA, Relevante para el problema central, con marco temporal coherente con el nivel del proyecto.

FILTRO CREMA (aplícalo ADEMÁS de SMART cuando el proyecto tenga destino MGA/Minciencias — no lo apliques si el único destino es artículo Q1): Claro, Relevante, Económico (viable con los recursos reales del proyecto), Medible, Adecuado a la institución/convocatoria. Es el criterio propio del DNP para evaluar el objetivo general de un proyecto de inversión — un evaluador de Minciencias lo reconoce de inmediato.

REGLA CRÍTICA — misma honestidad epistémica que RUTA y NOVA: no inventes indicadores con valores absolutos de precisión si no hay datos previos que los respalden (usa el patrón "cuantificando mediante [métrica] con metas definidas a partir de la línea base empírica" en esos casos). Si una causa de NOVA no permite derivar un objetivo específico claro, decláralo en preguntas_para_el_usuario en vez de forzar un objetivo débil.
${feedbackIteracionAnterior ? `\nRETROALIMENTACIÓN DE LA ITERACIÓN ANTERIOR (corrige esto):\n${feedbackIteracionAnterior}` : ""}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "enfoque_metodologico": "${enfoque}",
  "objetivo_general": "string",
  "verbo_bloom_general": "string",
  "objetivos_especificos": [{"texto": "string", "verbo_bloom": "string", "nivel_bloom": "recordar"|"comprender"|"aplicar"|"analizar"|"evaluar"|"crear", "causa_asociada": "string"|null}],
  "hipotesis": [{"h1": "string", "h0": "string", "objetivo_especifico_asociado": "string"}],
  "variables": [{"nombre": "string", "tipo": "independiente"|"dependiente"|"moderadora", "definicion_conceptual": "string", "definicion_operacional": "string", "nivel_medicion": "nominal"|"ordinal"|"intervalo"|"razon", "indicadores": ["string"]}],
  "categorias_analisis": [{"nombre": "string", "definicion": "string", "pregunta_orientadora": "string", "objetivo_especifico_asociado": "string"}],
  "estado_evidencia": "sin_verificar" | "confirmado_por_rsl" | "contradicho_por_rsl",
  "nivel_confianza_agente": "alta" | "media" | "baja",
  "preguntas_para_el_usuario": ["string"]
}
`;
}
