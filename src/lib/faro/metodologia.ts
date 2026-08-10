import type { RutaOutput } from "./ruta";
import type { NovaOutput } from "./nova";
import type { ObjetivosOutput, FilaMatrizConsistencia, EnfoqueMetodologico } from "./objetivos";
import type { EstadoEvidencia, NivelConfianza } from "./ruta";

// ============================================================
// Tipos
// ============================================================

export interface TecnicaInstrumento {
  tecnica: string; // ej. "Encuesta estructurada", "Entrevista semiestructurada", "Sensor IoT NPK"
  instrumento: string; // ej. "Cuestionario validado", "Guía de entrevista", "Datalogger"
  variable_o_categoria_asociada: string; // debe coincidir con el nombre de una Variable o CategoriaAnalisis de Objetivos
}

export interface ActividadProducto {
  actividad: string; // verbo + acción concreta, ej. "Instalar sensores NPK en 10 parcelas piloto"
  producto: string; // entregable verificable, ej. "Base de datos de mediciones foliares (n=10 parcelas)"
  indicador_gestion: string; // indicador de avance/cumplimiento MGA, distinto del indicador científico de Objetivos
  tiempo_estimado: string; // ej. "Mes 1-2", "Semana 3"
}

export interface PlanPorObjetivo {
  objetivo_especifico: string; // debe coincidir textualmente con un objetivo_especifico de Objetivos
  actividades: ActividadProducto[];
}

export interface MetodologiaOutput {
  enfoque_metodologico: EnfoqueMetodologico; // heredado de Objetivos, no se re-decide aquí

  diseno_metodologico: string; // ej. "Cuasi-experimental, corte longitudinal" / "Estudio de caso instrumental"
  tipo_investigacion: string; // aplicada/descriptiva/correlacional/explicativa/exploratoria (mismo eje que en Objetivos)

  poblacion: string;
  muestra: string; // tipo de muestreo + tamaño si aplica; si es cualitativo, criterio de saturación teórica

  tecnicas_instrumentos: TecnicaInstrumento[];

  plan_por_objetivo: PlanPorObjetivo[]; // el hilo conductor: actividades/productos por cada objetivo específico

  plan_analisis_datos: string; // pruebas estadísticas (cuantitativo) o técnica de análisis cualitativo (codificación, etc.)
  consideraciones_eticas: string;

  estado_evidencia: EstadoEvidencia;
  nivel_confianza_agente: NivelConfianza;
  preguntas_para_el_usuario: string[];
}

// Extiende la fila de Objetivos con las columnas de gestión — ensamblado
// determinístico en código, igual que la matriz base de objetivos.ts.
export interface FilaMatrizConsistenciaExtendida extends FilaMatrizConsistencia {
  actividades: string[];
  productos: string[];
  indicadores_gestion: string[];
}

// ============================================================
// CAMPOS_OBLIGATORIOS_METODOLOGIA
// ============================================================

export const CAMPOS_OBLIGATORIOS_METODOLOGIA: (keyof MetodologiaOutput)[] = [
  "diseno_metodologico",
  "tipo_investigacion",
  "poblacion",
  "muestra",
  "tecnicas_instrumentos",
  "plan_por_objetivo",
  "plan_analisis_datos",
];

// ============================================================
// Ensamblaje determinístico de la matriz extendida
// (NO generado por el LLM — combina la matriz base de Objetivos
// con las actividades/productos que Metodología produjo)
// ============================================================

export function ensamblarMatrizExtendida(
  matrizBase: FilaMatrizConsistencia[],
  planPorObjetivo: PlanPorObjetivo[]
): FilaMatrizConsistenciaExtendida[] {
  return matrizBase.map((fila) => {
    const plan = planPorObjetivo.find(
      (p) => p.objetivo_especifico === fila.objetivo_especifico
    );
    return {
      ...fila,
      actividades: plan?.actividades.map((a) => a.actividad) ?? [],
      productos: plan?.actividades.map((a) => a.producto) ?? [],
      indicadores_gestion: plan?.actividades.map((a) => a.indicador_gestion) ?? [],
    };
  });
}

// ============================================================
// construirPromptMetodologia()
// ============================================================

export function construirPromptMetodologia(params: {
  nu: string;
  tau: string;
  rutaOutput: RutaOutput;
  novaOutput: NovaOutput;
  objetivosOutput: ObjetivosOutput;
  feedbackIteracionAnterior?: string;
}): string {
  const { nu, tau, rutaOutput, novaOutput, objetivosOutput, feedbackIteracionAnterior } = params;

  const enfoque = objetivosOutput.enfoque_metodologico;

  const objetivosTexto = objetivosOutput.objetivos_especificos
    .map((oe, i) => `${i + 1}. ${oe.texto}`)
    .join("\n");

  const variablesOCategorias =
    enfoque === "cualitativo"
      ? objetivosOutput.categorias_analisis.map((c) => `- ${c.nombre}: ${c.definicion}`).join("\n")
      : objetivosOutput.variables.map((v) => `- ${v.nombre} (${v.tipo}, ${v.nivel_medicion}): ${v.definicion_conceptual}`).join("\n");

  const bloqueEnfoque =
    enfoque === "cuantitativo"
      ? `ENFOQUE CUANTITATIVO — el diseño debe especificar: tipo de diseño (experimental/cuasi-experimental/no experimental-correlacional/no experimental-transeccional), población y muestra con tipo de muestreo (probabilístico/no probabilístico) y tamaño si es calculable, y plan de análisis con pruebas estadísticas concretas coherentes con el nivel de medición de cada variable ya definido en Objetivos.`
      : enfoque === "cualitativo"
      ? `ENFOQUE CUALITATIVO — el diseño debe especificar: tradición metodológica (estudio de caso, etnografía, teoría fundamentada, fenomenología, u otra), población/participantes y criterio de muestreo (intencional, teórico, bola de nieve) con criterio de saturación en vez de tamaño fijo, y plan de análisis cualitativo (codificación abierta/axial/selectiva, análisis de contenido, u otra técnica coherente con la tradición elegida).`
      : `ENFOQUE MIXTO — especifica ambos componentes por separado (diseño, población/muestra, técnicas, análisis para la parte cuantitativa Y para la parte cualitativa), y declara el modelo de integración (secuencial explicativo, secuencial exploratorio, concurrente/convergente, u otro) que justifique cómo y cuándo se combinan.`;

  const arbolDecisionTRL = `ÁRBOL DE DECISIÓN METODOLÓGICO SEGÚN TIPO DE PROYECTO Y TRL (obligatorio consultar antes de elegir el diseño — fundamentación verificada, no es opcional):

- Investigación BÁSICA (TRL 1-2): diseño analítico puro / modelado conceptual matemático / revisión sistemática de literatura. No hay prototipo físico ni sistema integrado — un diseño experimental carece de operatividad en este nivel.
- Investigación APLICADA (TRL 3-4): diseño experimental puro, cuasi-experimental, o simulación experimental por computadora. Se necesita prueba de concepto o pre-prototipo para validar que la hipótesis científica es viable empíricamente, con aislamiento riguroso de variables extrañas.
- DESARROLLO TECNOLÓGICO (TRL 5-7): Design Science Research (DSR) como metodología central — Hevner et al. (2004) y Peffers et al. (2007). El foco se desplaza del principio aislado de laboratorio a la interacción del prototipo integrado con su contexto relevante de destino. Complementa con enfoque de ingeniería (Modelo en V) o experimentos de caso único en contexto real.
  - Fases de Peffers et al. (2007) a seguir en plan_por_objetivo: (1) identificación del problema y motivación, (2) definición de objetivos de la solución, (3) diseño y desarrollo del artefacto, (4) demostración, (5) evaluación, (6) comunicación.
  - Los tres ciclos de Hevner (2007) deben quedar reflejados: Ciclo de Relevancia (requisitos y criterios de aceptación desde el entorno real), Ciclo de Rigor (teorías de base y métodos ya existentes que sustentan el diseño), Ciclo de Diseño (construcción y evaluación iterativa del artefacto).
  - Diferencia clave frente al diseño experimental clásico: DSR evalúa utilidad y efectividad práctica del artefacto en su entorno relevante, no busca aislar variables para inferencia causal pura.
- INNOVACIÓN Y TRANSFERENCIA (TRL 8-9): diseño no experimental correlacional (modelos de adopción tipo TAM/UTAUT), no experimental longitudinal de panel, o investigación-acción participativa para la gobernanza de la transferencia. El foco ya no es la optimización técnica del artefacto sino su adopción, sostenibilidad y efectos socioeconómicos a escala real.

Si el proyecto es de tipo "aplicada" pero declaró subtipo DTI con TRL objetivo en Objetivos/NOVA, prioriza la rama de TRL sobre la rama genérica de "aplicada" — el TRL manda cuando ambos criterios están disponibles.`;

  return `Eres el agente Metodología de FARO. Tu tarea es diseñar cómo se ejecutarán los objetivos específicos ya definidos, manteniendo el mismo hilo conductor que viene desde el árbol de causas de NOVA: cada objetivo específico invierte una causa, y ahora cada objetivo específico necesita su propio plan de actividades, productos e indicadores de gestión.

REGLA ARQUITECTÓNICA NO NEGOCIABLE — trazabilidad completa del hilo:
plan_por_objetivo debe tener exactamente una entrada por cada objetivo específico ya definido (ni más, ni menos), y el campo objetivo_especifico de cada entrada debe coincidir textualmente (o casi) con el texto del objetivo específico correspondiente. No agregues actividades sueltas que no respondan a ningún objetivo específico.

${arbolDecisionTRL}

CONTEXTO DEL PROYECTO:
- Nivel: ${nu} · Tipo: ${tau}
- Enfoque metodológico (ya resuelto en Objetivos, no lo vuelvas a decidir): ${enfoque}

PROBLEMA CENTRAL (RUTA): "${rutaOutput.problema}"

OBJETIVOS ESPECÍFICOS (Objetivos — cada uno necesita su plan de actividades):
${objetivosTexto}

${enfoque === "cualitativo" ? "CATEGORÍAS DE ANÁLISIS" : "VARIABLES"} (Objetivos — tus técnicas/instrumentos deben poder capturarlas):
${variablesOCategorias}

${bloqueEnfoque}

ACTIVIDADES Y PRODUCTOS (por cada objetivo específico): cada actividad debe ser una acción concreta y verificable (no una descripción vaga), cada producto un entregable tangible que demuestre que la actividad se completó, y cada indicador de gestión una métrica de avance/cumplimiento (distinta del indicador científico ya definido en Objetivos — este mide ejecución del proyecto, no el fenómeno de investigación). Ejemplo de la diferencia: indicador científico = "concentración de nitrógeno foliar (%)"; indicador de gestión = "número de parcelas piloto instrumentadas / total de parcelas planificadas".

REGLA CRÍTICA — misma honestidad epistémica que los nodos anteriores: no inventes tamaños de muestra con precisión falsa si no hay datos previos para calcularlos — la fórmula de población infinita (n₀=Z²pq/e²) y finita (corrección FPC) solo son válidas si tienes los parámetros reales (Z, p, N); si falta alguno, declara el criterio de cálculo pendiente en preguntas_para_el_usuario en vez de inventar un valor. Para enfoque cualitativo, usa criterio de saturación teórica (documentado, no un número fijo), no fuerces un tamaño de muestra cuantitativo. Al proponer técnicas_instrumentos, si sugieres un instrumento de escala (tipo Likert), menciona que su confiabilidad deberá verificarse con Alfa de Cronbach o, si hay cargas factoriales desiguales esperadas, Omega de McDonald — no asumas que cualquier instrumento nuevo ya es confiable sin esa verificación. No inventes pruebas estadísticas que no correspondan al nivel de medición real de cada variable.
${feedbackIteracionAnterior ? `\nRETROALIMENTACIÓN DE LA ITERACIÓN ANTERIOR (corrige esto):\n${feedbackIteracionAnterior}` : ""}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "enfoque_metodologico": "${enfoque}",
  "diseno_metodologico": "string",
  "tipo_investigacion": "string",
  "poblacion": "string",
  "muestra": "string",
  "tecnicas_instrumentos": [{"tecnica": "string", "instrumento": "string", "variable_o_categoria_asociada": "string"}],
  "plan_por_objetivo": [{"objetivo_especifico": "string", "actividades": [{"actividad": "string", "producto": "string", "indicador_gestion": "string", "tiempo_estimado": "string"}]}],
  "plan_analisis_datos": "string",
  "consideraciones_eticas": "string",
  "estado_evidencia": "sin_verificar" | "confirmado_por_rsl" | "contradicho_por_rsl",
  "nivel_confianza_agente": "alta" | "media" | "baja",
  "preguntas_para_el_usuario": ["string"]
}
`;
}
