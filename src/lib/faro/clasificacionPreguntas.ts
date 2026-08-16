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
 * `preguntas_para_el_usuario` llega desde el LLM como `string[]` plano (ver
 * los prompts en ruta.ts, nova.ts, objetivos.ts, metodologia.ts,
 * marcoReferencial.ts, impactosDelimitacion.ts — todos declaran
 * `"preguntas_para_el_usuario": ["string"]`, nunca `{campo, pregunta}`).
 * Verificado también contra filas reales de `grafo_nodos`. Por lo tanto
 * `campo_origen` siempre es `null` y clasificar por ese campo caía siempre
 * en el default P2. En su lugar, clasificamos por palabras clave presentes
 * en el propio texto de la pregunta.
 *
 * Reglas por tipo de nodo, ordenadas de más a menos crítica (primera regla
 * cuyo patrón matchee gana). Ajustado a los campos reales de los esquemas de
 * salida de FARO: RutaOutput, NovaOutput, ObjetivosOutput, MetodologiaOutput,
 * MarcoReferencialOutput, ImpactosDelimitacionOutput.
 */
interface ReglaClasificacion {
  prioridad: Prioridad;
  patrones: RegExp[];
}

export const PALABRAS_CLAVE_POR_NODO: Record<NodoTipo, ReglaClasificacion[]> = {
  RUTA: [
    {
      prioridad: "P1",
      patrones: [
        /\bproblema\b/,
        /pregunta de investigaci[oó]n/,
        /objeto de estudio/,
        /poblaci[oó]n/,
        /alcance temporal/,
        /\btema\b/,
        /\bcontexto\b/,
      ],
    },
    {
      prioridad: "P2",
      patrones: [/alcance espacial/, /ubicaci[oó]n/, /\bregi[oó]n\b/, /\bzona\b/, /geogr[aá]fic/],
    },
  ],
  NOVA: [
    {
      prioridad: "P1",
      patrones: [
        /causa ra[ií]z/,
        /\bcausa\b/,
        /\bbrecha\b/,
        /vac[ií]o de conocimiento/,
        /\bnovedad\b/,
        /estado del arte/,
        /\baporte\b/,
      ],
    },
    { prioridad: "P2", patrones: [/consecuencia/, /\befecto/, /[aá]rbol de problema/] },
    { prioridad: "P3", patrones: [/\bcifra\b/, /estad[ií]stic/, /\bfuente\b/] },
  ],
  OBJETIVOS: [
    {
      prioridad: "P1",
      patrones: [
        /objetivo general/,
        /objetivos? espec[ií]fico/,
        /enfoque metodol[oó]gico/,
        /\benfoque\b/,
      ],
    },
    { prioridad: "P2", patrones: [/\bverbo\b/, /taxonom[ií]a de bloom/, /\bbloom\b/] },
  ],
  METODOLOGIA: [
    {
      prioridad: "P1",
      patrones: [
        /enfoque metodol[oó]gico/,
        /dise[nñ]o metodol[oó]gico/,
        /\bdise[nñ]o\b/,
        /plan por objetivo/,
        /poblaci[oó]n/,
        /\bmuestra\b/,
      ],
    },
    { prioridad: "P2", patrones: [/t[eé]cnica/, /instrumento/] },
  ],
  MARCO_REFERENCIAL: [
    { prioridad: "P1", patrones: [/marco te[oó]rico/, /\bteor[ií]a\b/, /te[oó]ric/] },
    {
      prioridad: "P2",
      patrones: [
        /marco conceptual/,
        /\bconcepto\b/,
        /marco legal/,
        /\blegal\b/,
        /normativ/,
        /marco contextual/,
        /\bcontextual\b/,
      ],
    },
  ],
  IMPACTOS: [
    { prioridad: "P1", patrones: [/limitaci[oó]n/, /\briesgo/] },
    { prioridad: "P2", patrones: [/\bimpacto/, /\brecurso/] },
  ],
};

/** Default seguro cuando ningún patrón matchea el texto de la pregunta. */
const PRIORIDAD_DEFAULT: Prioridad = "P2";

function normalizar(texto: string): string {
  return texto.toLowerCase();
}

export function clasificarPrioridad(nodoTipo: NodoTipo, textoPregunta?: string | null): Prioridad {
  if (!textoPregunta) return PRIORIDAD_DEFAULT;
  const normalizado = normalizar(textoPregunta);
  const reglas = PALABRAS_CLAVE_POR_NODO[nodoTipo] ?? [];
  for (const regla of reglas) {
    if (regla.patrones.some((patron) => patron.test(normalizado))) {
      return regla.prioridad;
    }
  }
  return PRIORIDAD_DEFAULT;
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
