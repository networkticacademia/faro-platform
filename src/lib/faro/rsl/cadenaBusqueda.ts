// ============================================================
// FARO — Propuesta de cadena de búsqueda
// Combina palabras_clave (M0, ya capturadas del formulador) + conceptos
// extraídos de RUTA para proponer una cadena de búsqueda — el formulador
// la confirma o edita ANTES de que se ejecute cualquier búsqueda,
// automática o manual (decisión de sesión 2026-08-06, fundamentada en
// evidencia 2025-2026: las cadenas generadas por LLM aún no igualan
// el recall de las construidas por expertos — AutoBool EACL 2026,
// reproducibilidad SIGIR 2025).
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================
//
// Decisión de diseño: la extracción de términos es heurística/léxica,
// NO otra llamada a LLM — mismo principio que el cribado de rsl.ts.
// Es rápida, sin costo, y su salida es siempre editable por el usuario
// antes de ejecutarse, así que no necesita ser "inteligente", solo
// un buen punto de partida.

import type { RutaOutput } from "@/lib/faro/ruta";

export interface PropuestaCadenaBusqueda {
  terminos_base: string[]; // de M0, tal cual los declaró el formulador
  terminos_sugeridos: string[]; // base + extraídos de RUTA, para revisión
  cadena_booleana: string; // para APIs: OpenAlex, Crossref, Semantic Scholar, Scopus
  paquete_manual: string; // texto listo para copiar en NotebookLM/Consensus/Google Scholar
}

const STOPWORDS_ES = new Set([
  "para", "como", "esto", "esta", "estos", "estas", "sobre", "entre",
  "desde", "hasta", "cuando", "donde", "porque", "aunque", "mediante",
  "durante", "según", "también", "puede", "puedan", "tiene", "tienen",
  "hace", "hacen", "cada", "todo", "toda", "todos", "todas", "otro",
  "otra", "otros", "otras", "más", "menos", "muy", "sin", "con",
  "las", "los", "del", "que", "una", "uno", "unos", "unas", "por",
]);

function extraerTerminosDeTexto(texto: string, maxTerminos = 6): string[] {
  const palabras = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 4 && !STOPWORDS_ES.has(p));

  const frecuencia = new Map<string, number>();
  for (const p of palabras) frecuencia.set(p, (frecuencia.get(p) ?? 0) + 1);

  return [...frecuencia.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerminos)
    .map(([palabra]) => palabra);
}

function construirCadenaBooleana(terminos: string[]): string {
  // AND de términos individuales entre comillas — deliberadamente simple,
  // no se agrupan en bloques OR de sinónimos automáticamente: la evidencia
  // 2025-2026 muestra que la agrupación semántica automática vía LLM es
  // donde más falla el recall. El formulador puede reagrupar manualmente
  // en la pantalla de confirmación si lo considera necesario.
  return terminos.map((t) => `"${t}"`).join(" AND ");
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
 * después, cuando el formulador confirma o edita esta propuesta.
 */
export function proponerCadenaBusqueda(params: {
  palabrasClaveM0: string[];
  rutaOutput: RutaOutput;
}): PropuestaCadenaBusqueda {
  const { palabrasClaveM0, rutaOutput } = params;

  const terminosDeRuta = extraerTerminosDeTexto(
    `${rutaOutput.tema} ${rutaOutput.objeto_estudio}`
  );

  const terminos_sugeridos = [
    ...new Set([...palabrasClaveM0.map((t) => t.toLowerCase()), ...terminosDeRuta]),
  ];

  return {
    terminos_base: palabrasClaveM0,
    terminos_sugeridos,
    cadena_booleana: construirCadenaBooleana(terminos_sugeridos),
    paquete_manual: construirPaqueteManual(rutaOutput, terminos_sugeridos),
  };
}
