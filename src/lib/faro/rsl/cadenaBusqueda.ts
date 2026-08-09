// ============================================================
// FARO — Propuesta de cadena de búsqueda (v3 — constructores exportados)
// Combina palabras_clave (M0, ya capturadas del formulador) + conceptos
// extraídos de RUTA para proponer una cadena de búsqueda — el formulador
// la confirma o edita ANTES de que se ejecute cualquier búsqueda,
// automática o manual (decisión de sesión 2026-08-06, fundamentada en
// evidencia 2025-2026: las cadenas generadas por LLM aún no igualan
// el recall de las construidas por expertos — AutoBool EACL 2026,
// reproducibilidad SIGIR 2025).
//
// v2 (2026-08-08): clasificación de cada término en nivel "nucleo"
// (tecnologías/conceptos transferibles) vs. "contexto" (topónimos,
// variedades, códigos específicos). Motivación empírica confirmada:
// un AND obligatorio que mezcla ambos niveles colapsa la búsqueda al
// conjunto vacío en OpenAlex, incluso cuando existe literatura
// directamente relevante indexada (caso de prueba: Chaparro Mesa et al.
// 2024, DOI 10.1016/j.jafr.2024.101208).
//
// v3 (2026-08-08, misma sesión): construirCadenaNucleo y
// construirCadenaAmpliada quedan exportadas y reciben TerminoConPeso[]
// directamente — el frontend (FormulacionRuta.tsx) las reutiliza para
// recalcular la cadena en vivo cuando el formulador reclasifica un
// término (toggle núcleo↔contexto) o activa "búsqueda ampliada", sin
// duplicar la lógica de construcción de cadena en dos lugares.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import type { RutaOutput } from "@/lib/faro/ruta";

export type NivelTermino = "nucleo" | "contexto";

export interface TerminoConPeso {
  texto: string; // forma original, para mostrar en la UI y en el paquete manual
  nivel: NivelTermino; // propuesto por heurística — editable por el formulador
}

export interface PropuestaCadenaBusqueda {
  terminos_base: string[]; // de M0, tal cual los declaró el formulador (sin cambios)
  terminos_clasificados: TerminoConPeso[]; // M0 + extraídos de RUTA, deduplicados, con nivel propuesto
  cadena_nucleo: string; // AND de términos nivel="nucleo" — se ejecuta por defecto contra OpenAlex/Crossref/Semantic Scholar/Lens
  cadena_ampliada: string; // nucleo AND (contexto OR contexto...) — solo si el formulador pide "Ampliar búsqueda"
  paquete_manual: string; // texto listo para copiar en NotebookLM/Consensus/Google Scholar (usa todos los términos, sin restricción de nivel)
}

const STOPWORDS_ES = new Set([
  "para", "como", "esto", "esta", "estos", "estas", "sobre", "entre",
  "desde", "hasta", "cuando", "donde", "porque", "aunque", "mediante",
  "durante", "según", "también", "puede", "puedan", "tiene", "tienen",
  "hace", "hacen", "cada", "todo", "toda", "todos", "todas", "otro",
  "otra", "otros", "otras", "más", "menos", "muy", "sin", "con",
  "las", "los", "del", "que", "una", "uno", "unos", "unas", "por",
]);

// Vocabulario técnico de dominio que SIEMPRE se clasifica como núcleo,
// sin importar capitalización — resuelve el caso límite de términos
// técnicos en Title Case (p. ej. "Machine Learning") que de otro modo
// serían indistinguibles de un topónimo por patrón gramatical.
// EDITAR/AMPLIAR AQUÍ según el dominio de cada proyecto — es la única
// parte de este archivo que conviene revisar periódicamente.
const NUCLEO_HINTS = new Set([
  "machine learning", "aprendizaje automatico", "deep learning",
  "aprendizaje profundo", "iot", "internet de las cosas", "uav", "uavs",
  "dron", "drones", "vehiculo aereo no tripulado", "teledeteccion",
  "remote sensing", "sensor", "sensores", "nitrogeno", "nitrogeno foliar",
  "foliar nitrogen", "inteligencia artificial", "artificial intelligence",
  "satelital", "satellite", "multiespectral", "multispectral",
  "hiperespectral", "hyperspectral", "vision artificial", "computer vision",
  "red neuronal", "redes neuronales", "neural network", "xgboost",
  "random forest", "regresion", "clasificacion", "monitoreo agricola",
  "agricultura de precision", "precision agriculture",
]);

function limpiarToken(token: string): string {
  // Quita puntuación pero conserva letras, números y mayúsculas/minúsculas
  return token.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, "");
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function clasificarTermino(original: string): NivelTermino {
  const normalizado = normalizar(original);

  if (NUCLEO_HINTS.has(normalizado)) return "nucleo";
  if (/\d/.test(original)) return "contexto"; // variedades/códigos: MD2, Sentinel-2

  const palabras = original.trim().split(/\s+/);
  const todasTitleCase = palabras.every((p) => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(p));
  if (todasTitleCase && palabras.length <= 3) return "contexto"; // topónimos/nombres propios: Tauramena, Casanare, Piedemonte Llanero

  return "nucleo"; // por defecto: favorece recall sobre precisión en esta etapa
}

function extraerTerminosDeTexto(texto: string, maxTerminos = 6): TerminoConPeso[] {
  const tokensOriginales = texto.split(/\s+/).map(limpiarToken).filter(Boolean);

  const frecuencia = new Map<string, { original: string; count: number }>();
  for (const tokenOriginal of tokensOriginales) {
    const norm = normalizar(tokenOriginal);
    if (norm.length <= 4 || STOPWORDS_ES.has(norm)) continue;
    const entrada = frecuencia.get(norm);
    if (entrada) entrada.count += 1;
    else frecuencia.set(norm, { original: tokenOriginal, count: 1 });
  }

  return Array.from(frecuencia.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, maxTerminos)
    .map(([, { original }]) => ({ texto: original, nivel: clasificarTermino(original) }));
}

/**
 * AND de términos nivel="nucleo", entre comillas — deliberadamente
 * simple, no se agrupan en bloques OR de sinónimos automáticamente
 * (evidencia 2025-2026: la agrupación semántica automática vía LLM es
 * donde más falla el recall). Si no hay ningún término núcleo (caso
 * degenerado), usa todos los términos disponibles para no generar una
 * cadena vacía.
 *
 * Exportada para que el frontend recalcule la cadena en vivo cuando
 * el formulador reclasifica un término (toggle núcleo↔contexto).
 */
export function construirCadenaNucleo(terminos: TerminoConPeso[]): string {
  const nucleo = terminos.filter((t) => t.nivel === "nucleo").map((t) => normalizar(t.texto));
  const aUsar = nucleo.length > 0 ? nucleo : terminos.map((t) => normalizar(t.texto));
  return aUsar.map((t) => `"${t}"`).join(" AND ");
}

/**
 * nucleo AND (contexto OR contexto OR ...) — solo se activa cuando el
 * formulador pide explícitamente "Ampliar búsqueda". Si no hay términos
 * de contexto, es idéntica a construirCadenaNucleo.
 *
 * Exportada por el mismo motivo que construirCadenaNucleo.
 */
export function construirCadenaAmpliada(terminos: TerminoConPeso[]): string {
  const nucleo = terminos.filter((t) => t.nivel === "nucleo").map((t) => normalizar(t.texto));
  const contexto = terminos.filter((t) => t.nivel === "contexto").map((t) => normalizar(t.texto));

  if (contexto.length === 0) return construirCadenaNucleo(terminos);

  const parteNucleo = nucleo.map((t) => `"${t}"`).join(" AND ");
  const parteContexto = contexto.map((t) => `"${t}"`).join(" OR ");
  if (!parteNucleo) return `(${parteContexto})`;
  return `(${parteNucleo}) AND (${parteContexto})`;
}

function construirPaqueteManual(rutaOutput: RutaOutput, terminos: string[]): string {
  return `Estoy investigando: ${rutaOutput.pregunta_investigacion}

Contexto del proyecto: ${rutaOutput.tema}

Términos clave para la búsqueda: ${terminos.join(", ")}

Instrucciones para el asistente (NotebookLM, Consensus, Elicit, Google Scholar, MDPI):
1. Busca artículos científicos revisados por pares (preferentemente 2021-2026) sobre la combinación de estos términos, no sobre cada uno por separado.
2. Para cada artículo relevante, entrega: título completo, autores, año, revista/venue, DOI si existe, y un resumen de 2-3 líneas de su hallazgo principal en relación con mi pregunta de investigación.
3. Señala explícitamente si NO encuentras literatura que combine estos conceptos directamente — esa ausencia también es información valiosa (posible vacío de conocimiento real).

Nota metodológica obligatoria: esta es una exploración automatizada preliminar, no una revisión sistemática. Toda fuente que traigas debe ser verificada manualmente antes de incorporarla al proyecto de investigación.`;
}

/**
 * Genera una propuesta de cadena de búsqueda a partir de las palabras
 * clave ya declaradas en M0 y los conceptos que RUTA ya generó. NO
 * ejecuta ninguna búsqueda — solo propone. La ejecución real ocurre
 * después, cuando el formulador confirma o edita esta propuesta
 * (incluida la reclasificación manual de nivel núcleo/contexto).
 */
export function proponerCadenaBusqueda(params: {
  palabrasClaveM0: string[];
  rutaOutput: RutaOutput;
}): PropuestaCadenaBusqueda {
  const { palabrasClaveM0, rutaOutput } = params;

  const clasificadosM0: TerminoConPeso[] = palabrasClaveM0.map((t) => ({
    texto: t,
    nivel: clasificarTermino(t),
  }));

  const clasificadosRuta = extraerTerminosDeTexto(
    `${rutaOutput.tema} ${rutaOutput.objeto_estudio}`
  );

  // Deduplicación por forma normalizada — M0 tiene prioridad sobre RUTA
  // en caso de que el mismo término aparezca en ambas fuentes.
  const vistos = new Set<string>();
  const terminos_clasificados: TerminoConPeso[] = [];
  for (const termino of [...clasificadosM0, ...clasificadosRuta]) {
    const clave = normalizar(termino.texto);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    terminos_clasificados.push(termino);
  }

  return {
    terminos_base: palabrasClaveM0,
    terminos_clasificados,
    cadena_nucleo: construirCadenaNucleo(terminos_clasificados),
    cadena_ampliada: construirCadenaAmpliada(terminos_clasificados),
    paquete_manual: construirPaqueteManual(
      rutaOutput,
      terminos_clasificados.map((t) => t.texto)
    ),
  };
}
