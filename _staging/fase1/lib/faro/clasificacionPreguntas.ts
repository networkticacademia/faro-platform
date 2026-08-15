/**
 * lib/faro/clasificacionPreguntas.ts
 *
 * Clasificación DETERMINÍSTICA (sin LLM) de prioridad de preguntas pendientes,
 * y grafo de dependencias entre tipos de nodo — reutilizado para calcular
 * `nodos_afectados` al sincronizar una pregunta.
 *
 * IMPORTANTE PARA ANTIGRAVITY:
 * - Los nombres de campo en CAMPOS_CRITICOS_POR_NODO son un punto de partida
 *   razonado, NO están verificados contra los campos reales que hoy
 *   devuelve cada `construirPrompt{Nodo}()`. Antes de integrarlos, contrastar
 *   contra los tipos reales (RutaOutput, NovaOutput, ObjetivosOutput,
 *   MetodologiaOutput, MarcoReferencialOutput, ImpactosOutput) y ajustar las
 *   claves de este diccionario a los nombres de campo reales.
 * - Si un `campo_origen` no aparece en el diccionario, se aplica el default
 *   seguro P2 (ni bloquea de más, ni se pierde de vista) — ver clasificarPrioridad().
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
 * Ajustar contra los campos reales — ver nota arriba.
 */
export const CAMPOS_CRITICOS_POR_NODO: Record<string, Partial<Record<string, Prioridad>>> = {
  RUTA: {
    problema_central: "P1",
    poblacion_objetivo: "P1",
    unidad_analisis: "P1",
    delimitacion_geografica: "P2",
    duracion_meses_proyecto: "P1", // ya es restricción dura del Triángulo de Hierro
  },
  NOVA: {
    nucleo_causa_raiz: "P1",
    unidad_analisis: "P1",
    cifra_contexto_pendiente_fuente: "P3",
    onda_efectos: "P2",
  },
  OBJETIVOS: {
    objetivo_general: "P1",
    numero_objetivos_especificos: "P1",
    verbo_bloom_objetivo: "P2",
  },
  METODOLOGIA: {
    enfoque: "P1",
    diseño: "P1",
    tecnica_especifica: "P2",
    instrumento: "P2",
    indicador_crema: "P2",
    procedimiento_estadistico: "P2",
  },
  MARCO_REFERENCIAL: {
    marco_teorico_base: "P1",
    marco_conceptual_base: "P2",
  },
  IMPACTOS: {
    impacto_esperado: "P2",
    delimitacion_alcance: "P1",
  },
};

/** Default seguro cuando el campo no está mapeado explícitamente. */
const PRIORIDAD_DEFAULT: Prioridad = "P2";

export function clasificarPrioridad(nodoTipo: NodoTipo, campoOrigen?: string | null): Prioridad {
  if (!campoOrigen) return PRIORIDAD_DEFAULT;
  return CAMPOS_CRITICOS_POR_NODO[nodoTipo]?.[campoOrigen] ?? PRIORIDAD_DEFAULT;
}

/**
 * Grafo de dependencias entre nodos — reutiliza la misma noción de
 * dependencia ya declarada implícitamente por los 5 pares de
 * verificadorSemantico.ts. Antigravity: confirmar que estos 5 pares
 * coinciden exactamente con los declarados ahí; si no, usar los reales.
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
