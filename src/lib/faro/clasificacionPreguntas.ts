/**
 * lib/faro/clasificacionPreguntas.ts
 *
 * Clasificación DETERMINÍSTICA (sin LLM) de prioridad de preguntas pendientes,
 * y grafo de dependencias entre tipos de nodo — reutilizado para calcular
 * `nodos_afectados` al sincronizar una pregunta.
 */

export type Prioridad = "P0" | "P1" | "P2" | "P3";
export type NodoTipo =
  | "RUTA"
  | "NOVA"
  | "OBJETIVOS"
  | "METODOLOGIA"
  | "MARCO_REFERENCIAL"
  | "IMPACTOS";

/**
 * Campos cuya incertidumbre es estructural (P1: puede cambiar la forma del
 * proyecto) vs. operativa (P2: se resuelve en la etapa correspondiente) vs.
 * diferible a fase posterior (P3).
 *
 * Ajustado a los nombres reales de los tipos de salida de FARO:
 * RutaOutput, NovaOutput, ObjetivosOutput, MetodologiaOutput, MarcoReferencialOutput, ImpactosDelimitacionOutput.
 */
export const CAMPOS_CRITICOS_POR_NODO: Record<string, Partial<Record<string, Prioridad>>> = {
  RUTA: {
    problema: "P1",
    pregunta_investigacion: "P1",
    objeto_estudio: "P1",
    poblacion_contexto: "P1",
    alcance_espacial: "P2",
    alcance_temporal: "P1",
    tema: "P1",
  },
  NOVA: {
    nucleo_causa_raiz: "P1",
    nucleo_brecha_conocimiento: "P1",
    onda_consecuencias: "P2",
    onda_efectos_arbol_problema: "P2",
    avance_novedad_estado_arte: "P1",
    cifra_contexto_pendiente_fuente: "P3",
  },
  OBJETIVOS: {
    objetivo_general: "P1",
    objetivos_especificos: "P1",
    enfoque_metodologico: "P1",
    verbo_bloom_general: "P2",
  },
  METODOLOGIA: {
    enfoque_metodologico: "P1",
    diseno_metodologico: "P1",
    tecnicas_instrumentos: "P2",
    plan_por_objetivo: "P1",
    poblacion: "P1",
    muestra: "P1",
  },
  MARCO_REFERENCIAL: {
    marco_teorico: "P1",
    marco_conceptual: "P2",
    marco_legal: "P2",
    marco_contextual: "P2",
  },
  IMPACTOS: {
    impactos: "P2",
    limitaciones: "P1",
    riesgos: "P1",
    recursos: "P2",
  },
};

/** Default seguro cuando el campo no está mapeado explícitamente. */
const PRIORIDAD_DEFAULT: Prioridad = "P2";

export function clasificarPrioridad(nodoTipo: NodoTipo, campoOrigen?: string | null): Prioridad {
  if (!campoOrigen) return PRIORIDAD_DEFAULT;
  return CAMPOS_CRITICOS_POR_NODO[nodoTipo]?.[campoOrigen] ?? PRIORIDAD_DEFAULT;
}

/**
 * Grafo de dependencias entre nodos.
 */
export const GRAFO_DEPENDENCIAS_NODOS: Record<NodoTipo, NodoTipo[]> = {
  RUTA: ["NOVA", "OBJETIVOS", "METODOLOGIA"],
  NOVA: ["OBJETIVOS", "METODOLOGIA"],
  OBJETIVOS: ["METODOLOGIA"],
  METODOLOGIA: ["MARCO_REFERENCIAL", "IMPACTOS"],
  MARCO_REFERENCIAL: [],
  IMPACTOS: [],
};

export function obtenerNodosAfectados(nodoTipo: NodoTipo): NodoTipo[] {
  return GRAFO_DEPENDENCIAS_NODOS[nodoTipo] ?? [];
}
