// ============================================================
// FARO — Generador de BibTeX desde corpus_fuentes
// Reemplaza la ruta original (RSL → Zotero → .bib) por RSL →
// corpus_fuentes → .bib directo. Solo exporta fuentes con
// estado_verificacion="verificado".
//
// v2 (2026-08-09): a pedido de Jorge, se enriquece la entrada con los
// campos que normalmente hay que completar a mano en Mendeley/Zotero
// (volume, number, pages, month, publisher, url, issn) — todos
// disponibles en la misma respuesta de Crossref que ya se consulta
// para los autores, solo faltaba extraerlos. "keywords" queda fuera
// a propósito: en Crossref no existe un campo equivalente confiable
// a la clasificación temática de Scopus que Mendeley suele agregar;
// preferible omitirlo a inventarlo.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

interface AutorCrossref {
  given?: string;
  family?: string;
}

interface RegistroCrossrefCompleto {
  autores: AutorCrossref[];
  tipo: string;
  volumen: string | null;
  numero: string | null;
  paginas: string | null;
  mes: number | null;
  editorial: string | null;
  url: string | null;
  issn: string | null;
}

async function obtenerRegistroCrossrefCompleto(doi: string): Promise<RegistroCrossrefCompleto | null> {
  try {
    const doiLimpio = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    const respuesta = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doiLimpio)}`,
      { headers: { "User-Agent": "FARO-platform/1.0 (mailto:networkticacademia@gmail.com)" } }
    );
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    const item = datos?.message;
    if (!item) return null;

    const fechaPartes =
      item["published-print"]?.["date-parts"]?.[0] ?? item["published-online"]?.["date-parts"]?.[0];

    return {
      autores: Array.isArray(item.author) ? item.author : [],
      tipo: item.type ?? "journal-article",
      volumen: item.volume ?? null,
      numero: item.issue ?? null,
      paginas: item.page ?? null,
      mes: fechaPartes?.[1] ?? null,
      editorial: item.publisher ?? null,
      url: item.URL ?? null,
      issn: Array.isArray(item.ISSN) ? item.ISSN[0] : null,
    };
  } catch {
    return null;
  }
}

/**
 * NUEVO. Respaldo para DOIs de DataCite (datasets: Mendeley Data,
 * Zenodo, Figshare) — mismo caso que ya resolvimos en la verificación
 * (verificarDOI), pero que faltaba aplicar aquí, en la exportación.
 * Bug real detectado: el dataset propio de Jorge en Mendeley Data
 * salía con "author = {no disponible}" en el .bib exportado, porque
 * Crossref no lo conoce y este archivo nunca intentaba DataCite.
 */
async function obtenerRegistroDataCiteCompleto(doi: string): Promise<RegistroCrossrefCompleto | null> {
  try {
    const doiLimpio = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    const respuesta = await fetch(`https://api.datacite.org/dois/${encodeURIComponent(doiLimpio)}`);
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    const attrs = datos?.data?.attributes;
    if (!attrs) return null;

    const autores: AutorCrossref[] = Array.isArray(attrs.creators)
      ? attrs.creators.map((c: any) => ({
          given: c.givenName ?? undefined,
          family: c.familyName ?? c.name ?? undefined,
        }))
      : [];

    return {
      autores,
      tipo: "dataset",
      volumen: attrs.version ?? null,
      numero: null,
      paginas: null,
      mes: null,
      editorial: attrs.publisher ?? null,
      url: attrs.url ?? null,
      issn: null,
    };
  } catch {
    return null;
  }
}

async function obtenerRegistroCompleto(doi: string): Promise<RegistroCrossrefCompleto | null> {
  const porCrossref = await obtenerRegistroCrossrefCompleto(doi);
  if (porCrossref && porCrossref.autores.length > 0) return porCrossref;
  return obtenerRegistroDataCiteCompleto(doi);
}

function formatearAutoresBibtex(autores: AutorCrossref[]): string {
  return autores
    .filter((a) => a.family)
    .map((a) => (a.given ? `${a.family}, ${a.given}` : a.family))
    .join(" and ");
}

export function escaparLatex(texto: string): string {
  return texto
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function tipoBibtex(tipoCrossref: string): string {
  switch (tipoCrossref) {
    case "journal-article":
      return "article";
    case "proceedings-article":
      return "inproceedings";
    case "dataset":
      return "misc";
    case "book-chapter":
      return "incollection";
    default:
      return "misc";
  }
}

function generarClaveBibtex(
  apellidoPrimerAutor: string,
  anio: number | null,
  clavesUsadas: Set<string>
): string {
  const apellidoLimpio = apellidoPrimerAutor.replace(/[^a-zA-Z]/g, "");
  const base = `${apellidoLimpio}${anio ?? "sf"}`;
  let clave = base;
  let sufijo = "a";
  while (clavesUsadas.has(clave)) {
    clave = `${base}${sufijo}`;
    sufijo = String.fromCharCode(sufijo.charCodeAt(0) + 1);
  }
  clavesUsadas.add(clave);
  return clave;
}

export interface FuenteParaExportar {
  titulo: string;
  autores: string | null;
  doi: string | null;
  anio: number | null;
  revista: string | null;
}

/**
 * Versión con id, para poder devolver un mapa {id -> clave} junto con el
 * .bib. Necesaria porque generarClaveBibtex desambigua (sufijo a/b/c...)
 * según el orden de procesamiento dentro de UNA sola pasada — si se
 * generaran las claves para el .bib y para las citas del texto en dos
 * llamadas separadas, el orden/resultado de Crossref podría no coincidir
 * y las claves divergirían. construirBibliografiaConClaves() es la única
 * fuente de verdad: se llama UNA vez y su resultado se reutiliza en ambos
 * lugares (ver sintesisFinal.ts, formato='latex').
 */
export interface FuenteConId extends FuenteParaExportar {
  id: string;
  resumen_hallazgo?: string | null;
}

export interface EntradaBibliografica {
  id: string;
  clave: string;
  autoresBibtex: string;
  anio: number | null;
  titulo: string;
  revista: string | null;
  resumen_hallazgo?: string | null;
}

interface EntradaConstruida {
  entrada: EntradaBibliografica;
  bibtex: string;
}

async function construirEntrada(fuente: FuenteConId, clavesUsadas: Set<string>): Promise<EntradaConstruida> {
  let autoresBibtex = fuente.autores ?? "no disponible";
  let tipo = "article";
  let registro: RegistroCrossrefCompleto | null = null;

  if (fuente.doi) {
    registro = await obtenerRegistroCompleto(fuente.doi);
    if (registro && registro.autores.length > 0) {
      autoresBibtex = formatearAutoresBibtex(registro.autores);
      tipo = tipoBibtex(registro.tipo);
    }
  }

  const primerApellido =
    registro && autoresBibtex !== "no disponible"
      ? autoresBibtex.split(",")[0].trim()
      : (fuente.autores ?? "SinAutor").split(/[,;]/)[0].trim().split(" ").pop() ?? "SinAutor";

  const clave = generarClaveBibtex(primerApellido, fuente.anio, clavesUsadas);

  const campos: string[] = [
    `title = {{${escaparLatex(fuente.titulo)}}}`,
    `year = {${fuente.anio ?? "s.f."}}`,
    `author = {${autoresBibtex}}`,
  ];
  if (fuente.revista || registro) campos.push(`journal = {${escaparLatex(fuente.revista ?? "")}}`);
  if (registro?.numero) campos.push(`number = {${registro.numero}}`);
  if (registro?.mes) campos.push(`month = {${registro.mes}}`);
  if (registro?.paginas) campos.push(`pages = {${registro.paginas}}`);
  if (registro?.volumen) campos.push(`volume = {${registro.volumen}}`);
  if (registro?.editorial) campos.push(`publisher = {${escaparLatex(registro.editorial)}}`);
  if (registro?.url) campos.push(`url = {${registro.url}}`);
  if (fuente.doi) campos.push(`doi = {${fuente.doi}}`);
  if (registro?.issn) campos.push(`issn = {${registro.issn}}`);

  return {
    bibtex: `@${tipo}{${clave},\n    ${campos.join(",\n    ")}\n}`,
    entrada: {
      id: fuente.id,
      clave,
      autoresBibtex,
      anio: fuente.anio,
      titulo: fuente.titulo,
      revista: fuente.revista,
      resumen_hallazgo: fuente.resumen_hallazgo ?? null,
    },
  };
}

export async function generarBibtex(fuentes: FuenteParaExportar[]): Promise<string> {
  const clavesUsadas = new Set<string>();
  const entradas: string[] = [];
  for (const fuente of fuentes) {
    const { bibtex } = await construirEntrada({ ...fuente, id: "" }, clavesUsadas);
    entradas.push(bibtex);
  }
  return entradas.join("\n\n");
}

/**
 * Fuente única para el .bib final Y para las claves que se le pasan al
 * LLM al generar prosa en formato 'latex' (sintesisFinal.ts) — llamar UNA
 * vez por exportación, no una vez por sección, para que las claves usadas
 * en \citep{}/\citet{} coincidan exactamente con las del .bib generado.
 */
export async function construirBibliografiaConClaves(
  fuentes: FuenteConId[]
): Promise<{ bibtex: string; entradas: EntradaBibliografica[] }> {
  const clavesUsadas = new Set<string>();
  const bibtexPorEntrada: string[] = [];
  const entradas: EntradaBibliografica[] = [];
  for (const fuente of fuentes) {
    const { bibtex, entrada } = await construirEntrada(fuente, clavesUsadas);
    bibtexPorEntrada.push(bibtex);
    entradas.push(entrada);
  }
  return { bibtex: bibtexPorEntrada.join("\n\n"), entradas };
}
