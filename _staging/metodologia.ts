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
  variable_o_categoria_asociada: string; // texto — debe coincidir con el nombre de una Variable o CategoriaAnalisis de Objetivos
  // NUEVO — trazabilidad estructural: el ID EXACTO de la Variable o
  // CategoriaAnalisis en Objetivos (ej. "VAR-1", "CAT-1"), declarado por
  // el LLM a partir de la lista con id que recibe en el prompt.
  variable_id: string | null;
}

// Los 15 rubros oficiales del formato de presupuesto Colombia Científica/Minciencias
export type RubroPresupuesto =
  | "equipos"
  | "materiales_insumos"
  | "material_bibliografico"
  | "software_especializado"
  | "consultoria_especializada"
  | "eventos_academicos"
  | "publicaciones_difusion"
  | "talento_humano"
  | "servicios_tecnologicos"
  | "proteccion_conocimiento"
  | "salidas_campo"
  | "gastos_viaje"
  | "gastos_administracion"
  | "registros_certificaciones"
  | "propiedad_intelectual";

export const RUBRO_PRESUPUESTO_LABEL: Record<RubroPresupuesto, string> = {
  equipos: "01. Equipos",
  materiales_insumos: "02. Materiales e insumos",
  material_bibliografico: "03. Material Bibliográfico",
  software_especializado: "04. Software Especializado",
  consultoria_especializada: "05. Consultoría Especializada",
  eventos_academicos: "06. Eventos académicos y de capacitación",
  publicaciones_difusion: "07. Publicaciones y difusión de resultados",
  talento_humano: "08. Talento humano",
  servicios_tecnologicos: "09. Servicios tecnológicos y pruebas",
  proteccion_conocimiento: "10. Protección de conocimiento y divulgación",
  salidas_campo: "11. Salidas de Campo",
  gastos_viaje: "12. Gastos de viaje",
  gastos_administracion: "13. Gastos de Administración",
  registros_certificaciones: "14. Registros y certificaciones",
  propiedad_intelectual: "15. Gastos de propiedad intelectual",
};

// Cofinanciación — misma estructura de 3 columnas del formato oficial
export type FuentePresupuesto =
  | "contrapartida_especie"
  | "contrapartida_efectivo"
  | "financiador_efectivo";

export const FUENTE_PRESUPUESTO_LABEL: Record<FuentePresupuesto, string> = {
  contrapartida_especie: "Contrapartida — Especie",
  contrapartida_efectivo: "Contrapartida — Efectivo",
  financiador_efectivo: "Financiador — Efectivo",
};

// El formulador la ingresa manualmente — el LLM NUNCA genera valores de
// presupuesto (misma honestidad epistémica que las cifras de contexto de
// NOVA: inventar un costo sería precisión falsa, igual que un tamaño de
// muestra inventado).
export interface ItemPresupuesto {
  rubro: RubroPresupuesto;
  descripcion: string; // el "insumo" del formato oficial
  cantidad: number;
  valor_unitario: number;
  fuente: FuentePresupuesto;
}

export interface ActividadProducto {
  actividad: string; // verbo + acción concreta, ej. "Instalar sensores NPK en 10 parcelas piloto"
  producto: string; // entregable verificable, ej. "Base de datos de mediciones foliares (n=10 parcelas)"
  indicador_gestion: string; // indicador de avance/cumplimiento MGA, distinto del indicador científico de Objetivos
  tiempo_estimado: string; // ej. "Mes 1-2", "Semana 3"
  presupuesto: ItemPresupuesto[]; // SIEMPRE vacío al generar — lo llena el formulador
}

export function valorTotalItem(item: ItemPresupuesto): number {
  return item.cantidad * item.valor_unitario;
}

export function totalPresupuestoActividad(actividad: ActividadProducto): number {
  return actividad.presupuesto.reduce((acc, item) => acc + valorTotalItem(item), 0);
}

export function totalPresupuestoObjetivo(plan: PlanPorObjetivo): number {
  return plan.actividades.reduce((acc, a) => acc + totalPresupuestoActividad(a), 0);
}

export function totalPresupuestoProyecto(planPorObjetivo: PlanPorObjetivo[]): number {
  return planPorObjetivo.reduce((acc, p) => acc + totalPresupuestoObjetivo(p), 0);
}

// Resumen por rubro y por fuente — para la vista tipo "RESUMEN" del formato oficial
export function resumenPorRubro(
  planPorObjetivo: PlanPorObjetivo[]
): Record<RubroPresupuesto, number> {
  const resumen = {} as Record<RubroPresupuesto, number>;
  for (const rubro of Object.keys(RUBRO_PRESUPUESTO_LABEL) as RubroPresupuesto[]) {
    resumen[rubro] = 0;
  }
  for (const plan of planPorObjetivo) {
    for (const actividad of plan.actividades) {
      for (const item of actividad.presupuesto) {
        resumen[item.rubro] += valorTotalItem(item);
      }
    }
  }
  return resumen;
}

export function resumenPorFuente(
  planPorObjetivo: PlanPorObjetivo[]
): Record<FuentePresupuesto, number> {
  const resumen = {
    contrapartida_especie: 0,
    contrapartida_efectivo: 0,
    financiador_efectivo: 0,
  } as Record<FuentePresupuesto, number>;
  for (const plan of planPorObjetivo) {
    for (const actividad of plan.actividades) {
      for (const item of actividad.presupuesto) {
        resumen[item.fuente] += valorTotalItem(item);
      }
    }
  }
  return resumen;
}

export interface PlanPorObjetivo {
  objetivo_especifico: string; // texto — debe coincidir con un objetivo_especifico de Objetivos
  // NUEVO — trazabilidad estructural: el ID EXACTO del objetivo específico
  // en Objetivos (ej. "OE-1"), declarado por el LLM a partir de la lista
  // con id que recibe en el prompt.
  objetivo_id: string;
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
    // Empareja primero por ID (determinístico, sin ambigüedad). Si algún
    // dato viejo no trae objetivo_id (nodos generados antes de este
    // cambio), cae al emparejamiento por texto como respaldo — no rompe
    // proyectos ya existentes.
    const plan =
      planPorObjetivo.find((p) => p.objetivo_id && p.objetivo_id === fila.objetivo_id) ??
      planPorObjetivo.find((p) => p.objetivo_especifico === fila.objetivo_especifico);
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
    .map((oe) => `${oe.id}: ${oe.texto}`)
    .join("\n");

  const variablesOCategorias =
    enfoque === "cualitativo"
      ? objetivosOutput.categorias_analisis.map((c) => `${c.id} — ${c.nombre}: ${c.definicion}`).join("\n")
      : objetivosOutput.variables.map((v) => `${v.id} — ${v.nombre} (${v.tipo}, ${v.nivel_medicion}): ${v.definicion_conceptual}`).join("\n");

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
plan_por_objetivo debe tener exactamente una entrada por cada objetivo específico ya definido (ni más, ni menos). Cada entrada debe declarar DOS cosas sobre el objetivo que ejecuta: objetivo_especifico (el texto, para que un humano lo lea) Y objetivo_id (el identificador EXACTO que aparece al inicio de la línea correspondiente abajo, ej. "OE-1" — cópialo tal cual, no lo inventes). No agregues actividades sueltas que no respondan a ningún objetivo específico. De la misma forma, cada técnica/instrumento debe declarar variable_o_categoria_asociada (texto) Y variable_id (el ID exacto de la lista de variables/categorías de abajo, ej. "VAR-1" o "CAT-1"; null solo si la técnica no mide ninguna variable puntual).

${arbolDecisionTRL}

CONTEXTO DEL PROYECTO:
- Nivel: ${nu} · Tipo: ${tau}
- Enfoque metodológico (ya resuelto en Objetivos, no lo vuelvas a decidir): ${enfoque}

PROBLEMA CENTRAL (RUTA): "${rutaOutput.problema}"

OBJETIVOS ESPECÍFICOS (Objetivos — cada uno necesita su plan de actividades; usa el ID exacto al inicio de cada línea para objetivo_id):
${objetivosTexto}

${enfoque === "cualitativo" ? "CATEGORÍAS DE ANÁLISIS" : "VARIABLES"} (Objetivos — tus técnicas/instrumentos deben poder capturarlas; usa el ID exacto al inicio de cada línea para variable_id):
${variablesOCategorias}

${bloqueEnfoque}

ACTIVIDADES Y PRODUCTOS (por cada objetivo específico): cada actividad debe ser una acción concreta y verificable (no una descripción vaga), cada producto un entregable tangible que demuestre que la actividad se completó, y cada indicador de gestión una métrica de avance/cumplimiento (distinta del indicador científico ya definido en Objetivos — este mide ejecución del proyecto, no el fenómeno de investigación). Ejemplo de la diferencia: indicador científico = "concentración de nitrógeno foliar (%)"; indicador de gestión = "número de parcelas piloto instrumentadas / total de parcelas planificadas".

PRESUPUESTO — SIEMPRE array vacío []: no propongas valores de presupuesto, cantidades de personal, precios de equipos ni rubros de costo bajo ninguna circunstancia, aunque el contexto del proyecto sugiera cifras plausibles. El presupuesto lo completa el formulador manualmente en la plataforma, con datos reales de cotizaciones y costos institucionales — un valor inventado por el modelo, aunque parezca razonable, es exactamente el tipo de precisión falsa que este framework prohíbe explícitamente (mismo principio que rige tamaños de muestra e indicadores científicos).

REGLA CRÍTICA — misma honestidad epistémica que los nodos anteriores: no inventes tamaños de muestra con precisión falsa si no hay datos previos para calcularlos — la fórmula de población infinita (n₀=Z²pq/e²) y finita (corrección FPC) solo son válidas si tienes los parámetros reales (Z, p, N); si falta alguno, declara el criterio de cálculo pendiente en preguntas_para_el_usuario en vez de inventar un valor. Para enfoque cualitativo, usa criterio de saturación teórica (documentado, no un número fijo), no fuerces un tamaño de muestra cuantitativo. Al proponer técnicas_instrumentos, si sugieres un instrumento de escala (tipo Likert), menciona que su confiabilidad deberá verificarse con Alfa de Cronbach o, si hay cargas factoriales desiguales esperadas, Omega de McDonald — no asumas que cualquier instrumento nuevo ya es confiable sin esa verificación. No inventes pruebas estadísticas que no correspondan al nivel de medición real de cada variable.
${feedbackIteracionAnterior ? `\nRETROALIMENTACIÓN DE LA ITERACIÓN ANTERIOR (corrige esto):\n${feedbackIteracionAnterior}` : ""}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "enfoque_metodologico": "${enfoque}",
  "diseno_metodologico": "string",
  "tipo_investigacion": "string",
  "poblacion": "string",
  "muestra": "string",
  "tecnicas_instrumentos": [{"tecnica": "string", "instrumento": "string", "variable_o_categoria_asociada": "string", "variable_id": "string"|null}],
  "plan_por_objetivo": [{"objetivo_especifico": "string", "objetivo_id": "string", "actividades": [{"actividad": "string", "producto": "string", "indicador_gestion": "string", "tiempo_estimado": "string", "presupuesto": []}]}],
  "plan_analisis_datos": "string",
  "consideraciones_eticas": "string",
  "estado_evidencia": "sin_verificar" | "confirmado_por_rsl" | "contradicho_por_rsl",
  "nivel_confianza_agente": "alta" | "media" | "baja",
  "preguntas_para_el_usuario": ["string"]
}
`;
}
