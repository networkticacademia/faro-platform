// ============================================================
// FARO — Cliente Crossref
// Fuente complementaria a OpenAlex — índice masivo de DOIs y metadatos
// de miles de editoriales. Sin autenticación requerida.
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================
//
// Documentación: https://api.crossref.org/swagger-ui/index.html
// Mismo principio de "polite pool" que OpenAlex: incluir mailto da
// prioridad. Reutiliza OPENALEX_MAILTO — es el mismo correo de contacto,
// no hace falta una variable de entorno separada.
//
// v2 (2026-08-09): Crossref confirma en su propia documentación que su
// API NO soporta búsqueda booleana ni de frase exacta — el parámetro
// `query` (y `query.bibliographic`) hace ranking de relevancia difuso
// sobre texto libre, tratando comillas y "AND" como caracteres
// literales, no como operadores. Mandarle la cadena booleana completa
// (la misma que sí funciona en OpenAlex) producía coincidencias
// parciales de una sola palabra genérica contra CUALQUIER disciplina
// indexada por Crossref — de ahí resultados de fiscalidad, minería o
// seguros para una hipótesis de agricultura de precisión. Se agrega
// limpiarCadenaParaCrossref() para despojar la cadena de su sintaxis
// booleana antes de enviarla, y se cambia de `query` a
// `query.bibliographic` (más acotado a título/autor/año/ISSN). El
// filtrado real de precisión para estos candidatos recae en el
// cribado léxico local de rsl.ts (cribarCandidatos), no en esta API.

import type { CandidatoFuente } from "./tipos";

export interface OpcionesBusquedaCrossref {
  limite?: number; // default 10, máximo 20 por llamada
  anioDesde?: number;
}

const CROSSREF_BASE_URL = "https://api.crossref.org/works";

/**
 * Crossref a veces devuelve el abstract en JATS XML (con etiquetas
 * <jats:p>). Esta función limpia esas etiquetas a texto plano.
 */
function limpiarAbstractJats(abstract: string | undefined | null): string | null {
  if (!abstract) return null;
  return abstract.replace(/<[^>]+>/g, "").trim() || null;
}

/**
 * NUEVO en v2. Crossref no entiende booleanos — quita AND/OR/NOT y
 * comillas de la cadena, dejando solo las palabras/frases clave
 * separadas por espacios. La precisión que se pierde aquí (Crossref
 * no puede exigir que TODOS los términos aparezcan) se recupera
 * después en rsl.ts vía cribarCandidatos(), que sí reevalúa por
 * solapamiento léxico contra la consulta completa.
 */
function limpiarCadenaParaCrossref(consulta: string): string {
  return consulta
    .replace(/\bAND\b|\bOR\b|\bNOT\b/g, " ")
    .replace(/["()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function buscarCandidatosCrossref(
  consulta: string,
  opciones: OpcionesBusquedaCrossref = {}
): Promise<CandidatoFuente[]> {
  const { limite = 10, anioDesde } = opciones;

  if (!consulta || consulta.trim().length === 0) {
    throw new Error("[crossref] La consulta de búsqueda no puede estar vacía");
  }

  const mailtoContacto = process.env.OPENALEX_MAILTO; // mismo correo, reutilizado
  const consultaLimpia = limpiarCadenaParaCrossref(consulta);

  const params = new URLSearchParams({
    "query.bibliographic": consultaLimpia,
    rows: String(Math.min(Math.max(limite, 1), 20)),
    sort: "relevance",
  });
  if (mailtoContacto) params.set("mailto", mailtoContacto);
  if (anioDesde) params.set("filter", `from-pub-date:${anioDesde}-01-01`);

  const url = `${CROSSREF_BASE_URL}?${params.toString()}`;

  let respuesta: Response;
  try {
    respuesta = await fetch(url);
  } catch (err) {
    throw new Error(
      `[crossref] Fallo de red al consultar Crossref: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`[crossref] Crossref respondió ${respuesta.status}: ${detalle}`);
  }

  const datos = await respuesta.json();
  const items: unknown[] = Array.isArray(datos?.message?.items) ? datos.message.items : [];

  return items.map((itemRaw): CandidatoFuente => {
    const item = itemRaw as Record<string, any>;
    const anio =
      item["published-print"]?.["date-parts"]?.[0]?.[0] ??
      item["published-online"]?.["date-parts"]?.[0]?.[0] ??
      item.issued?.["date-parts"]?.[0]?.[0] ??
      null;
    return {
      fuente: "crossref",
      id_fuente: item.DOI ?? "",
      titulo: Array.isArray(item.title) ? item.title[0] ?? "(sin título)" : "(sin título)",
      doi: item.DOI ?? null,
      anio,
      revista: Array.isArray(item["container-title"]) ? item["container-title"][0] ?? null : null,
      resumen: limpiarAbstractJats(item.abstract),
      es_acceso_abierto: false, // Crossref no reporta esto de forma confiable
      url_texto_completo: item.URL ?? null,
      citado_por_count: item["is-referenced-by-count"] ?? 0,
    };
  });
}
