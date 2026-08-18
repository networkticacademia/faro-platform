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
  id: string; // asignado en código tras la generación (OE-1, OE-2...), NO por el LLM
  texto: string;
  verbo_bloom: string;
  nivel_bloom: NivelBloom;
  // Trazabilidad textual (se conserva tal cual, cero riesgo de romper lo
  // que ya funciona) — debe coincidir con el texto de una causa en NOVA.
  causa_asociada: string | null;
  // NUEVO — trazabilidad estructural: el ID EXACTO de la causa en
  // NovaOutput.nucleo_causas_estructuradas (ej. "CAUSA-1"), declarado por
  // el LLM a partir de la lista de causas CON id que recibe en el prompt.
  // Null si es transversal/apropiación social, igual que causa_asociada.
  causa_id: string | null;
}

// Solo aplica cuando enfoque incluye componente cuantitativo (cuantitativo o mixto)
export interface HipotesisPar {
  h1: string; // hipótesis alterna, causal y direccional
  h0: string; // hipótesis nula
  objetivo_especifico_asociado: string; // texto del OE al que responde esta hipótesis
}

// Solo aplica cuando enfoque incluye componente cuantitativo (cuantitativo o mixto)
export interface Variable {
  id: string; // asignado en código tras la generación (VAR-1, VAR-2...), NO por el LLM
  nombre: string;
  tipo: "independiente" | "dependiente" | "moderadora";
  definicion_conceptual: string;
  definicion_operacional: string;
  nivel_medicion: "nominal" | "ordinal" | "intervalo" | "razon";
  indicadores: string[];
  objetivo_especifico_asociado: string; // texto del OE que esta variable opera/mide
}

// Solo aplica cuando enfoque es cualitativo o mixto (componente cualitativo)
export interface CategoriaAnalisis {
  id: string; // asignado en código tras la generación (CAT-1, CAT-2...), NO por el LLM
  nombre: string;
  definicion: string;
  pregunta_orientadora: string;
  objetivo_especifico_asociado: string;
}

// Fila de la matriz de consistencia — SE ENSAMBLA EN CÓDIGO, no la genera el LLM
export interface FilaMatrizConsistencia {
  objetivo_id: string;
  objetivo_especifico: string;
  causa_id: string | null;
  causa_asociada: string | null;
  hipotesis: string | null; // h1, si existe
  variable_id: string | null;
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
    const variableAsociada = output.variables.find(
      (v) => v.objetivo_especifico_asociado === oe.texto
    );

    return {
      objetivo_id: oe.id,
      objetivo_especifico: oe.texto,
      causa_id: oe.causa_id,
      causa_asociada: oe.causa_asociada,
      hipotesis: hipotesisAsociada?.h1 ?? null,
      variable_id: variableAsociada?.id ?? categoriaAsociada?.id ?? null,
      variable_o_categoria:
        variableAsociada?.nombre ?? categoriaAsociada?.nombre ?? null,
      indicador: variableAsociada?.indicadores?.[0] ?? null,
    };
  });
}

// ============================================================
// Asignación determinística de IDs estables — NO la hace el LLM.
// Se llama en el endpoint justo después de parsear la respuesta del
// orquestador y ANTES de ensamblarMatrizConsistencia() y de persistir.
// Esto es lo que le da a Metodología (y a cualquier verificador futuro,
// SIGMA Guard incluido) una referencia determinística en vez de tener
// que volver a adivinar por coincidencia de texto.
// ============================================================

export function asignarIdsObjetivos(output: ObjetivosOutput): ObjetivosOutput {
  return {
    ...output,
    objetivos_especificos: output.objetivos_especificos.map((oe, i) => ({
      ...oe,
      id: `OE-${i + 1}`,
    })),
    variables: output.variables.map((v, i) => ({ ...v, id: `VAR-${i + 1}` })),
    categorias_analisis: output.categorias_analisis.map((c, i) => ({
      ...c,
      id: `CAT-${i + 1}`,
    })),
  };
}

// ============================================================
// construirPromptObjetivos()
// ============================================================

export function construirPromptObjetivos(params: {
  nu: string;
  mu: string;
  rutaOutput: RutaOutput;
  novaOutput: NovaOutput;
  duracionMesesProyecto?: number | null;
  feedbackIteracionAnterior?: string;
  /** Hechos ya respondidos por el formulador en iteraciones previas de
   *  ESTE nodo — ver lib/faro/contextoAcumulado.ts. */
  hechosVerificados?: string;
}): string {
  const { nu, mu, rutaOutput, novaOutput, duracionMesesProyecto, feedbackIteracionAnterior, hechosVerificados } = params;

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
    .map((c: CausaProblema) => `${c.id} [${c.tipo}]: ${c.texto}`)
    .join("\n");

  const bloqueEnfoque =
    enfoque === "cuantitativo"
      ? `ENFOQUE CUANTITATIVO — debes producir:
- hipotesis: un par H1/H0 por cada objetivo específico que lo requiera (objetivos de caracterización pura pueden no necesitar hipótesis explícita — decláralo así si aplica).
- variables: cada variable con definición conceptual Y operacional, nivel de medición (nominal/ordinal/intervalo/razón), indicadores concretos, Y el campo objetivo_especifico_asociado con el TEXTO EXACTO del objetivo específico que esa variable mide u opera (obligatorio, no lo omitas — es lo que permite construir la matriz de consistencia sin ambigüedad). Las variables independientes deben corresponder a las causas del árbol de NOVA; las dependientes, al problema central o sus efectos.
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
${duracionMesesProyecto
    ? `- DURACIÓN CONFIRMADA DEL PROYECTO: ${duracionMesesProyecto} MESES — restricción dura (Triángulo de Hierro: Tiempo-Alcance-Presupuesto, Barnes 1969). El número y la ambición de los objetivos específicos deben ser REALISTAS para ejecutarse completos en ${duracionMesesProyecto} meses, incluyendo tiempo de análisis y escritura. Para un horizonte de 6 meses o menos, 2-3 objetivos específicos acotados son más apropiados que 5 objetivos ambiciosos que no alcanzan a completarse. NO propongas un alcance que un cronograma real de ${duracionMesesProyecto} meses no pueda sostener.`
    : `- DURACIÓN DEL PROYECTO: no confirmada todavía. Agrega una pregunta_para_el_usuario pidiendo que se confirme la duración en RUTA antes de considerar el alcance de objetivos como definitivo — sin ese dato, el número de objetivos podría no ser realista.`}

PROBLEMA CENTRAL (RUTA, D(θ) — el objetivo general debe invertirlo en positivo, sin reformular su alcance):
"${rutaOutput.problema}"

CAUSAS DEL ÁRBOL DE PROBLEMAS (NOVA — cada objetivo específico debe invertir UNA de estas). Cada objetivo específico debe declarar DOS cosas sobre la causa que invierte: causa_asociada (el texto, para que un humano lo lea) Y causa_id (el identificador EXACTO que aparece al inicio de la línea correspondiente abajo, ej. "CAUSA-1" — cópialo tal cual, no lo inventes ni lo modifiques):
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
${hechosVerificados ? `\n${hechosVerificados}\n` : ""}
${feedbackIteracionAnterior ? `\nRETROALIMENTACIÓN DE LA ITERACIÓN ANTERIOR (corrige esto):\n${feedbackIteracionAnterior}\n\nREGLA ANTI-PREGUNTAS-INFINITAS — esta es una iteración de REFINAMIENTO, no la primera vez: el formulador ya respondió preguntas anteriores. NO generes una nueva ronda extensa de preguntas de la misma naturaleza que las que ya respondió. Genera como máximo 1-2 preguntas NUEVAS, y solo si son genuinamente distintas, críticas e insalvables sin esa información específica. Para cualquier otra incertidumbre menor, haz el supuesto más razonable, decláralo EXPLÍCITAMENTE en el texto generado, y avanza — no lo conviertas en otra pregunta.` : ""}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "enfoque_metodologico": "${enfoque}",
  "objetivo_general": "string",
  "verbo_bloom_general": "string",
  "objetivos_especificos": [{"texto": "string", "verbo_bloom": "string", "nivel_bloom": "recordar"|"comprender"|"aplicar"|"analizar"|"evaluar"|"crear", "causa_asociada": "string"|null, "causa_id": "string"|null}],
  "hipotesis": [{"h1": "string", "h0": "string", "objetivo_especifico_asociado": "string"}],
  "variables": [{"nombre": "string", "tipo": "independiente"|"dependiente"|"moderadora", "definicion_conceptual": "string", "definicion_operacional": "string", "nivel_medicion": "nominal"|"ordinal"|"intervalo"|"razon", "indicadores": ["string"], "objetivo_especifico_asociado": "string"}],
  "categorias_analisis": [{"nombre": "string", "definicion": "string", "pregunta_orientadora": "string", "objetivo_especifico_asociado": "string"}],
  "estado_evidencia": "sin_verificar" | "confirmado_por_rsl" | "contradicho_por_rsl",
  "nivel_confianza_agente": "alta" | "media" | "baja",
  "preguntas_para_el_usuario": ["string"]
}
`;
}
