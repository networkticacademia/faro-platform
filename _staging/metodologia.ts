import type { RutaOutput } from "./ruta";
import type { NovaOutput } from "./nova";
import type { ObjetivosOutput, FilaMatrizConsistencia, EnfoqueMetodologico } from "./objetivos";
import type { EstadoEvidencia, NivelConfianza } from "./ruta";

// ============================================================
// Tipos
// ============================================================

export interface TecnicaInstrumento {
  tecnica: string;
  instrumento: string;
  variable_o_categoria_asociada: string;
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

export type FuentePresupuesto =
  | "contrapartida_especie"
  | "contrapartida_efectivo"
  | "financiador_efectivo";

export const FUENTE_PRESUPUESTO_LABEL: Record<FuentePresupuesto, string> = {
  contrapartida_especie: "Contrapartida — Especie",
  contrapartida_efectivo: "Contrapartida — Efectivo",
  financiador_efectivo: "Financiador — Efectivo",
};

export interface ItemPresupuesto {
  rubro: RubroPresupuesto;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  fuente: FuentePresupuesto;
}

// ============================================================
// Jerarquía real MGA (verificada contra Documento_conceptual_2023.pdf
// del DNP, sección 3.4 "Cadena de Valor"): Objetivo → N Productos → cada
// Producto con SU PROPIO indicador (metodología CREMA) → N Actividades
// que lo generan (mínimo 2, según el manual: "cada bien o servicio es el
// resultado de dos o más actividades"). El presupuesto se asigna a nivel
// de actividad (los insumos se transforman a través de las actividades).
// ============================================================

export interface Actividad {
  actividad: string; // verbo + acción concreta
  indicador_gestion: string; // avance/cumplimiento de ESTA actividad (ej. "% de ejecución"), distinto del indicador de producto
  tiempo_estimado: string; // texto legible, ej. "Semanas 1-3" — se conserva para mostrar
  semana_inicio: number; // NUEVO — número de semana del proyecto en que inicia (1 = primera semana)
  semana_fin: number; // NUEVO — número de semana del proyecto en que termina (inclusive)
  presupuesto: ItemPresupuesto[]; // SIEMPRE vacío al generar — lo llena el formulador
}

// Total de semanas de un cronograma — usa el máximo semana_fin de todas las
// actividades, no la suma (las actividades de distintos objetivos pueden
// correr en paralelo, un cronograma real no es una sola fila secuencial).
export function semanaFinalCronograma(planPorObjetivo: PlanPorObjetivo[]): number {
  let maxSemana = 0;
  for (const plan of planPorObjetivo) {
    for (const producto of plan.productos ?? []) {
      for (const actividad of producto.actividades ?? []) {
        if (actividad.semana_fin > maxSemana) maxSemana = actividad.semana_fin;
      }
    }
  }
  return maxSemana;
}

export interface Producto {
  nombre_producto: string; // el bien o servicio entregado, ej. "Modelo de estimación de nitrógeno foliar validado"
  indicador_producto: string; // indicador CREMA (Claro, Relevante, Económico, Medible, Adecuado) del DNP
  unidad_medida: string; // ej. "Documento", "Número de parcelas", "Porcentaje"
  meta: string; // valor objetivo de ese indicador
  actividades: Actividad[]; // mínimo 2, según el manual DNP
}

export function valorTotalItem(item: ItemPresupuesto): number {
  return item.cantidad * item.valor_unitario;
}

export function totalPresupuestoActividad(actividad: Actividad): number {
  return (actividad.presupuesto ?? []).reduce((acc, item) => acc + valorTotalItem(item), 0);
}

export function totalPresupuestoProducto(producto: Producto): number {
  return (producto.actividades ?? []).reduce((acc, a) => acc + totalPresupuestoActividad(a), 0);
}

export function totalPresupuestoObjetivo(plan: PlanPorObjetivo): number {
  return (plan.productos ?? []).reduce((acc, p) => acc + totalPresupuestoProducto(p), 0);
}

export function totalPresupuestoProyecto(planPorObjetivo: PlanPorObjetivo[]): number {
  return planPorObjetivo.reduce((acc, p) => acc + totalPresupuestoObjetivo(p), 0);
}

export function resumenPorRubro(
  planPorObjetivo: PlanPorObjetivo[]
): Record<RubroPresupuesto, number> {
  const resumen = {} as Record<RubroPresupuesto, number>;
  for (const rubro of Object.keys(RUBRO_PRESUPUESTO_LABEL) as RubroPresupuesto[]) {
    resumen[rubro] = 0;
  }
  for (const plan of planPorObjetivo) {
    for (const producto of plan.productos ?? []) {
      for (const actividad of producto.actividades ?? []) {
        for (const item of actividad.presupuesto ?? []) {
          resumen[item.rubro] += valorTotalItem(item);
        }
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
    for (const producto of plan.productos ?? []) {
      for (const actividad of producto.actividades ?? []) {
        for (const item of actividad.presupuesto ?? []) {
          resumen[item.fuente] += valorTotalItem(item);
        }
      }
    }
  }
  return resumen;
}

export interface PlanPorObjetivo {
  objetivo_especifico: string;
  objetivo_id: string;
  productos: Producto[]; // CAMBIO DE ESTRUCTURA (2026-08-11): antes "actividades" plano, ahora Objetivo→Productos→Actividades, jerarquía real MGA verificada contra manual DNP 2023.
}

export interface MetodologiaOutput {
  enfoque_metodologico: EnfoqueMetodologico;

  diseno_metodologico: string;
  tipo_investigacion: string;

  poblacion: string;
  muestra: string;

  tecnicas_instrumentos: TecnicaInstrumento[];

  plan_por_objetivo: PlanPorObjetivo[];

  plan_analisis_datos: string;
  consideraciones_eticas: string;

  estado_evidencia: EstadoEvidencia;
  nivel_confianza_agente: NivelConfianza;
  preguntas_para_el_usuario: string[];
}

// Extiende la fila de Objetivos con la cadena de valor completa —
// ensamblado determinístico en código, igual que la matriz base.
export interface FilaMatrizConsistenciaExtendida extends FilaMatrizConsistencia {
  productos: {
    nombre_producto: string;
    indicador_producto: string;
    actividades: string[];
  }[];
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
// ============================================================

export function ensamblarMatrizExtendida(
  matrizBase: FilaMatrizConsistencia[],
  planPorObjetivo: PlanPorObjetivo[]
): FilaMatrizConsistenciaExtendida[] {
  return matrizBase.map((fila) => {
    const plan =
      planPorObjetivo.find((p) => p.objetivo_id && p.objetivo_id === fila.objetivo_id) ??
      planPorObjetivo.find((p) => p.objetivo_especifico === fila.objetivo_especifico);
    return {
      ...fila,
      productos: (plan?.productos ?? []).map((p) => ({
        nombre_producto: p.nombre_producto,
        indicador_producto: p.indicador_producto,
        actividades: (p.actividades ?? []).map((a) => a.actividad),
      })),
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
  duracionMesesProyecto?: number | null;
  feedbackIteracionAnterior?: string;
}): string {
  const { nu, tau, rutaOutput, novaOutput, objetivosOutput, duracionMesesProyecto, feedbackIteracionAnterior } = params;

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

- Investigación BÁSICA (TRL 1-2): diseño analítico puro / modelado conceptual matemático / revisión sistemática de literatura.
- Investigación APLICADA (TRL 3-4): diseño experimental puro, cuasi-experimental, o simulación experimental por computadora.
- DESARROLLO TECNOLÓGICO (TRL 5-7): Design Science Research (DSR) — Hevner et al. (2004) y Peffers et al. (2007). Fases: (1) identificación del problema, (2) definición de objetivos de la solución, (3) diseño y desarrollo, (4) demostración, (5) evaluación, (6) comunicación. Tres ciclos de Hevner (2007): Relevancia, Rigor, Diseño.
- INNOVACIÓN Y TRANSFERENCIA (TRL 8-9): no experimental correlacional (TAM/UTAUT), longitudinal de panel, o investigación-acción participativa.

Si el proyecto declaró subtipo DTI con TRL objetivo, prioriza la rama de TRL sobre la rama genérica del tipo de proyecto.`;

  return `Eres el agente Metodología de FARO. Tu tarea es diseñar cómo se ejecutarán los objetivos específicos ya definidos, siguiendo la CADENA DE VALOR real de la Metodología General Ajustada (MGA) del DNP, verificada contra el Manual Conceptual vigente (Documento_conceptual_2023.pdf).

REGLA ARQUITECTÓNICA NO NEGOCIABLE — jerarquía real MGA (Objetivo → Productos → Actividades, NO Objetivo → Actividades directamente):
Cada objetivo específico entrega uno o más PRODUCTOS (bienes o servicios tangibles, nunca confundir con actividades ni con la población beneficiaria). Cada producto se obtiene mediante DOS O MÁS ACTIVIDADES — nunca declares un producto con una sola actividad, y nunca declares una actividad que no pertenezca a ningún producto. Cada producto tiene su PROPIO indicador (indicador_producto, no confundir con el indicador de gestión de cada actividad, que mide avance de ejecución, no el resultado entregado).

plan_por_objetivo debe tener exactamente una entrada por cada objetivo específico ya definido. Cada entrada declara objetivo_especifico (texto) Y objetivo_id (el ID EXACTO de la lista de abajo, ej. "OE-1" — cópialo tal cual).

${arbolDecisionTRL}

CONTEXTO DEL PROYECTO:
- Nivel: ${nu} · Tipo: ${tau}
- Enfoque metodológico (ya resuelto en Objetivos, no lo vuelvas a decidir): ${enfoque}
${duracionMesesProyecto
    ? `- DURACIÓN CONFIRMADA DEL PROYECTO: ${duracionMesesProyecto} MESES (${duracionMesesProyecto * 4} semanas aprox.) — restricción dura (Triángulo de Hierro: Tiempo-Alcance-Presupuesto, Barnes 1969). Cada actividad debe declarar semana_inicio y semana_fin como NÚMEROS reales (1 = primera semana del proyecto), NO solo el texto de tiempo_estimado. Ninguna actividad puede tener semana_fin mayor a ${duracionMesesProyecto * 4 - 2} — deja las últimas 2 semanas del cronograma SIN actividades de campo/técnicas, reservadas para análisis final y escritura del informe (no las llenes con otra actividad). Actividades de objetivos distintos pueden correr en paralelo (semanas superpuestas) — no es obligatorio que todo sea secuencial. Si el número de objetivos/productos que ya vienen de Objetivos es demasiado ambicioso para este horizonte, decláralo explícitamente en preguntas_para_el_usuario en vez de comprimir artificialmente los tiempos hasta hacerlos irreales (ej. nunca declares semana_inicio=1, semana_fin=1 para una actividad que en la realidad toma 2 meses).`
    : `- DURACIÓN DEL PROYECTO: no confirmada todavía. Agrega una pregunta_para_el_usuario pidiendo que se confirme en RUTA — sin ese dato, el cronograma que generes es solo orientativo y puede no ser realista.`}

PROBLEMA CENTRAL (RUTA): "${rutaOutput.problema}"

OBJETIVOS ESPECÍFICOS (usa el ID exacto para objetivo_id):
${objetivosTexto}

${enfoque === "cualitativo" ? "CATEGORÍAS DE ANÁLISIS" : "VARIABLES"} (usa el ID exacto para variable_id):
${variablesOCategorias}

${bloqueEnfoque}

INDICADOR DE PRODUCTO — metodología CREMA (Claro, Relevante, Económico, Medible, Adecuado, guía oficial DNP): cada indicador_producto debe cumplir estos cinco criterios. Ejemplo bueno: "Número de modelos de estimación de nitrógeno foliar validados con precisión ≥85%". Ejemplo malo (evita): "Modelo funcionando bien".

INDICADOR DE GESTIÓN (a nivel de actividad, distinto del de producto): mide avance/cumplimiento de ESA actividad puntual, ej. "Número de parcelas piloto instrumentadas / total de parcelas planificadas".

PRESUPUESTO — SIEMPRE array vacío [] en cada actividad: no propongas valores de presupuesto bajo ninguna circunstancia. El formulador lo completa manualmente con datos reales — un valor inventado es precisión falsa, prohibida en este framework.

REGLA CRÍTICA — misma honestidad epistémica que los nodos anteriores: no inventes tamaños de muestra con precisión falsa sin datos reales (fórmula de población infinita/finita solo si tienes Z, p, N reales; si falta alguno, declara el criterio pendiente en preguntas_para_el_usuario). Para enfoque cualitativo, usa saturación teórica documentada, no un número fijo. Si sugieres un instrumento tipo Likert, menciona verificación de confiabilidad (Alfa de Cronbach u Omega de McDonald). No inventes pruebas estadísticas incoherentes con el nivel de medición real de cada variable.
${feedbackIteracionAnterior ? `\nRETROALIMENTACIÓN DE LA ITERACIÓN ANTERIOR (corrige esto):\n${feedbackIteracionAnterior}` : ""}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "enfoque_metodologico": "${enfoque}",
  "diseno_metodologico": "string",
  "tipo_investigacion": "string",
  "poblacion": "string",
  "muestra": "string",
  "tecnicas_instrumentos": [{"tecnica": "string", "instrumento": "string", "variable_o_categoria_asociada": "string", "variable_id": "string"|null}],
  "plan_por_objetivo": [{
    "objetivo_especifico": "string",
    "objetivo_id": "string",
    "productos": [{
      "nombre_producto": "string",
      "indicador_producto": "string",
      "unidad_medida": "string",
      "meta": "string",
      "actividades": [{"actividad": "string", "indicador_gestion": "string", "tiempo_estimado": "string", "semana_inicio": number, "semana_fin": number, "presupuesto": []}]
    }]
  }],
  "plan_analisis_datos": "string",
  "consideraciones_eticas": "string",
  "estado_evidencia": "sin_verificar" | "confirmado_por_rsl" | "contradicho_por_rsl",
  "nivel_confianza_agente": "alta" | "media" | "baja",
  "preguntas_para_el_usuario": ["string"]
}
`;
}
