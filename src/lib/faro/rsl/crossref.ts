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

export async function buscarCandidatosCrossref(
  consulta: string,
  opciones: OpcionesBusquedaCrossref = {}
): Promise<CandidatoFuente[]> {
  const { limite = 10, anioDesde } = opciones;

  if (!consulta || consulta.trim().length === 0) {
    throw new Error("[crossref] La consulta de búsqueda no puede estar vacía");
  }

  const mailtoContacto = process.env.OPENALEX_MAILTO; // mismo correo, reutilizado

  const params = new URLSearchParams({
    query: consulta,
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
