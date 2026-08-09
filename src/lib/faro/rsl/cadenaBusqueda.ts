// ============================================================
// FARO — Propuesta de cadena de búsqueda (v5 — dominio embebido +
// deduplicación por subsunción + tope de términos obligatorios)
//
// v2 (2026-08-08): clasificación nucleo/contexto — evita mezclar
// tecnologías con topónimos en el mismo AND obligatorio.
//
// v3 (2026-08-08): construirCadenaNucleo/Ampliada exportadas para
// recálculo en vivo desde FormulacionRuta.tsx.
//
// v4 (2026-08-08): fixes de compilación TS1501/TS2802.
//
// v5 (2026-08-09): prueba real end-to-end (caso piña Gold/Tauramena)
// reveló tres problemas que v2-v4 no cubrían, evidenciados por la
// cadena_nucleo real generada:
//   "inteligencia artificial" AND "sensores iot" AND "machine learning"
//   AND "drones" AND "estimacion de nitrogeno foliar" AND "nitrogeno"
//   AND "foliar" AND "sensores" AND "invasiva"
//   → 9 términos en AND, con "sensores"/"nitrogeno"/"foliar" ya
//   contenidos en frases más largas de la misma lista (redundantes),
//   y "piña" —el cultivo mismo— ausente por completo del núcleo
//   porque "Piña Gold" cayó entera en la regla de topónimo Title Case.
// Fixes: separación de términos compuestos que contienen vocabulario
// de dominio embebido, deduplicación por subsunción, tope de 4
// términos obligatorios con selección por especificidad. La
// traducción a inglés de la cadena final NO vive aquí — ver nota de
// integración al final de este archivo, aplica en rsl.ts antes de
// consultar las APIs.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import type { RutaOutput } from "@/lib/faro/ruta";

export type NivelTermino = "nucleo" | "contexto";

export interface TerminoConPeso {
  texto: string;
  nivel: NivelTermino;
}

export interface PropuestaCadenaBusqueda {
  terminos_base: string[];
  terminos_clasificados: TerminoConPeso[];
  cadena_nucleo: string;
  cadena_ampliada: string;
  paquete_manual: string;
}

const STOPWORDS_ES = new Set([
  "para", "como", "esto", "esta", "estos", "estas", "sobre", "entre",
  "desde", "hasta", "cuando", "donde", "porque", "aunque", "mediante",
  "durante", "según", "también", "puede", "puedan", "tiene", "tienen",
  "hace", "hacen", "cada", "todo", "toda", "todos", "todas", "otro",
  "otra", "otros", "otras", "más", "menos", "muy", "sin", "con",
  "las", "los", "del", "que", "una", "uno", "unos", "unas", "por",
]);

// Vocabulario técnico/de dominio que SIEMPRE se clasifica como núcleo.
// Cumple dos funciones: (a) clasificar un término suelto que coincide
// exactamente, (b) servir de ancla para RESCATAR un concepto de dominio
// embebido dentro de una frase Title Case más larga (ver
// separarTerminoCompuesto) — así "Piña Gold" no pierde "piña" solo
// porque la frase completa parece un topónimo.
// EDITAR/AMPLIAR AQUÍ según el dominio de cada proyecto.
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
  // Vocabulario de cultivo agregado en v5 — evita perder el objeto de
  // estudio cuando aparece junto a una variedad/marca (p. ej. "Gold").
  "pina", "pineapple", "ananas",
]);

function limpiarToken(token: string): string {
  return token.replace(/[^a-zA-Z0-9À-ÿ]/g, "");
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function esTitleCase(palabra: string): boolean {
  return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(palabra);
}

function clasificarTermino(original: string): NivelTermino {
  const normalizado = normalizar(original);

  if (NUCLEO_HINTS.has(normalizado)) return "nucleo";
  if (/\d/.test(original)) return "contexto";

  const palabras = original.trim().split(/\s+/);
  const todasTitleCase = palabras.every(esTitleCase);
  if (todasTitleCase && palabras.length <= 3) return "contexto";

  return "nucleo";
}

/**
 * NUEVO en v5. Si una frase de 2-3 palabras contiene una palabra que
 * coincide con NUCLEO_HINTS, la separa como término núcleo
 * independiente y deja el resto como contexto, en vez de perder el
 * concepto de dominio dentro de una frase que como un todo parece un
 * topónimo. "Piña Gold" → [{"Piña", nucleo}, {"Gold", contexto}]
 */
function separarTerminoCompuesto(original: string): TerminoConPeso[] {
  const palabras = original.trim().split(/\s+/);
  if (palabras.length < 2) {
    return [{ texto: original, nivel: clasificarTermino(original) }];
  }

  const indiceNucleo = palabras.findIndex((p) => NUCLEO_HINTS.has(normalizar(p)));
  if (indiceNucleo === -1) {
    return [{ texto: original, nivel: clasificarTermino(original) }];
  }

  const palabraNucleo = palabras[indiceNucleo];
  const resto = palabras.filter((_, i) => i !== indiceNucleo).join(" ");

  const resultado: TerminoConPeso[] = [{ texto: palabraNucleo, nivel: "nucleo" }];
  if (resto) resultado.push({ texto: resto, nivel: "contexto" });
  return resultado;
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
    .flatMap(([, { original }]) => separarTerminoCompuesto(original));
}

/**
 * NUEVO en v5. Puntaje de especificidad para decidir qué términos
 * núcleo conservar cuando hay más de MAX_NUCLEO_AND. Mayor puntaje =
 * más informativo = se conserva primero.
 */
function puntajeEspecificidad(textoNormalizado: string): number {
  if (NUCLEO_HINTS.has(textoNormalizado)) return 2;
  if (textoNormalizado.includes(" ")) return 1;
  return 0;
}

/**
 * NUEVO en v5. Quita términos cuyo texto normalizado está totalmente
 * contenido en otro término de la misma lista — evita ANDs redundantes
 * como "nitrogeno" + "estimacion de nitrogeno foliar".
 */
function quitarSubsumidos(terminos: string[]): string[] {
  return terminos.filter((t, i) => {
    return !terminos.some((otro, j) => i !== j && otro.length > t.length && otro.includes(t));
  });
}

const MAX_NUCLEO_AND = 4;

/**
 * Separa los términos núcleo en los que entran al AND obligatorio
 * (hasta MAX_NUCLEO_AND, por especificidad) y el excedente — que NO
 * se descarta, pasa al grupo OR de construirCadenaAmpliada.
 */
function seleccionarNucleoParaAND(terminos: TerminoConPeso[]): {
  enAND: string[];
  excedente: string[];
} {
  const nucleoNormalizado = quitarSubsumidos(
    terminos.filter((t) => t.nivel === "nucleo").map((t) => normalizar(t.texto))
  );

  const ordenado = [...nucleoNormalizado].sort(
    (a, b) => puntajeEspecificidad(b) - puntajeEspecificidad(a)
  );

  return {
    enAND: ordenado.slice(0, MAX_NUCLEO_AND),
    excedente: ordenado.slice(MAX_NUCLEO_AND),
  };
}

export function construirCadenaNucleo(terminos: TerminoConPeso[]): string {
  const { enAND } = seleccionarNucleoParaAND(terminos);
  const aUsar = enAND.length > 0 ? enAND : terminos.map((t) => normalizar(t.texto));
  return aUsar.map((t) => `"${t}"`).join(" AND ");
}

export function construirCadenaAmpliada(terminos: TerminoConPeso[]): string {
  const { enAND, excedente } = seleccionarNucleoParaAND(terminos);
  const contexto = terminos.filter((t) => t.nivel === "contexto").map((t) => normalizar(t.texto));

  const grupoOR = [...excedente, ...contexto];
  if (grupoOR.length === 0) return construirCadenaNucleo(terminos);

  const parteNucleo = enAND.map((t) => `"${t}"`).join(" AND ");
  const parteOR = grupoOR.map((t) => `"${t}"`).join(" OR ");
  if (!parteNucleo) return `(${parteOR})`;
  return `(${parteNucleo}) AND (${parteOR})`;
}

function construirPaqueteManual(rutaOutput: RutaOutput, terminos: string[]): string {
  return `Estoy investigando: ${rutaOutput.pregunta_investigacion}

Contexto del proyecto: ${rutaOutput.tema}

Términos clave para la búsqueda: ${terminos.join(", ")}

Instrucciones para el asistente (NotebookLM, Consensus, Elicit, Google Scholar, MDPI):
1. Busca artículos científicos revisados por pares (preferentemente 2021-2026) sobre la combinación de estos términos, no sobre cada uno por separado.
2. Para cada artículo relevante, entrega: título completo, autores, año, revista/venue, DOI si existe, y un resumen de 2-3 líneas de su hallazgo principal en relación con mi pregunta de investigación.
3. Señala explícitamente si NO encuentras literatura que combine estos conceptos directamente — esa ausencia también es información valiosa (posible vacío de conocimiento real).

Nota metodológica obligatoria: esta es una exploración automatizada preliminar, no una revisión systematic. Toda fuente que traigas debe ser verificada manualmente antes de incorporarla al proyecto de investigación.`;
}

export function proponerCadenaBusqueda(params: {
  palabrasClaveM0: string[];
  rutaOutput: RutaOutput;
}): PropuestaCadenaBusqueda {
  const { palabrasClaveM0, rutaOutput } = params;

  const clasificadosM0: TerminoConPeso[] = palabrasClaveM0.flatMap((t) =>
    separarTerminoCompuesto(t)
  );

  const clasificadosRuta = extraerTerminosDeTexto(
    `${rutaOutput.tema} ${rutaOutput.objeto_estudio}`
  );

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

// ============================================================
// NOTA DE INTEGRACIÓN — traducción a inglés (NO implementada en este
// archivo a propósito)
//
// El JSON de la prueba real confirmó que cadena_nucleo/cadena_ampliada
// se construyen en español y se envían tal cual a OpenAlex/Crossref/
// Semantic Scholar/Lens, que indexan mayoritariamente en inglés. Los
// fixes de este archivo reducen el sobre-ajuste, pero NO resuelven el
// problema de idioma por sí solos.
//
// La traducción debe vivir en rsl.ts, NO aquí, porque cadenaBusqueda.ts
// también se ejecuta de forma síncrona en el navegador
// (FormulacionRuta.tsx, para recalcular la cadena en vivo cuando el
// formulador reclasifica un chip) — una llamada LLM ahí sería una
// llamada en cada clic. La traducción debe ocurrir UNA sola vez, del
// lado del servidor, justo antes de consultar las APIs, sobre la
// cadena_confirmada que el formulador ya validó.
//
// Función a agregar en rsl.ts:
//
//   async function traducirCadenaParaBusqueda(cadenaEs: string): Promise<string> {
//     try {
//       const prompt = `Traduce al inglés los términos entre comillas de
//         esta cadena de búsqueda booleana, conservando exactamente la
//         estructura AND/OR/paréntesis y las comillas. Responde SOLO
//         con la cadena traducida, sin explicación:\n\n${cadenaEs}`;
//       const respuesta = await llamarOrquestador(prompt);
//       return respuesta.trim();
//     } catch (error) {
//       console.warn("Fallo traducción de cadena, se usa original ES:", error);
//       return cadenaEs;
//     }
//   }
//
// Se llama una vez, antes del loop/Promise.all que consulta cada
// fuente, y el resultado traducido es lo que se pasa como query param
// a OpenAlex/Crossref/Semantic Scholar — no la cadena en español.
// ============================================================
