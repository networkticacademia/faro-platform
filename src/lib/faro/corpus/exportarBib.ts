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
    return null; // DOI de DataCite u otro caso no cubierto por Crossref
  }
}

function formatearAutoresBibtex(autores: AutorCrossref[]): string {
  return autores
    .filter((a) => a.family)
    .map((a) => (a.given ? `${a.family}, ${a.given}` : a.family))
    .join(" and ");
}

function escaparLatex(texto: string): string {
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

export async function generarBibtex(fuentes: FuenteParaExportar[]): Promise<string> {
  const clavesUsadas = new Set<string>();
  const entradas: string[] = [];

  for (const fuente of fuentes) {
    let autoresBibtex = fuente.autores ?? "no disponible";
    let tipo = "article";
    let registro: RegistroCrossrefCompleto | null = null;

    if (fuente.doi) {
      registro = await obtenerRegistroCrossrefCompleto(fuente.doi);
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

    entradas.push(`@${tipo}{${clave},\n    ${campos.join(",\n    ")}\n}`);
  }

  return entradas.join("\n\n");
}
