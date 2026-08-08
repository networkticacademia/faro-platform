// ============================================================
// FARO — Cliente Semantic Scholar
// Fuente complementaria — motor del Allen Institute for AI, con
// buena cobertura en ciencias de la computación e IA (relevante para
// FARO mismo), y enlaces a PDF cuando existen.
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================
//
// Documentación: https://api.semanticscholar.org/api-docs/graph
// Sin llave: límite de tasa bajo pero funcional. Con llave (variable
// SEMANTIC_SCHOLAR_API_KEY en .env.local, opcional): mayor cuota.
// No es obligatorio configurarla — el cliente funciona sin ella.

import type { CandidatoFuente } from "./tipos";

export interface OpcionesBusquedaSemanticScholar {
  limite?: number; // default 10, máximo 25 por llamada
  anioDesde?: number;
}

const SEMANTIC_SCHOLAR_BASE_URL = "https://api.semanticscholar.org/graph/v1/paper/search";

export async function buscarCandidatosSemanticScholar(
  consulta: string,
  opciones: OpcionesBusquedaSemanticScholar = {}
): Promise<CandidatoFuente[]> {
  const { limite = 10, anioDesde } = opciones;

  if (!consulta || consulta.trim().length === 0) {
    throw new Error("[semantic_scholar] La consulta de búsqueda no puede estar vacía");
  }

  const params = new URLSearchParams({
    query: consulta,
    limit: String(Math.min(Math.max(limite, 1), 25)),
    fields: "title,year,venue,abstract,externalIds,openAccessPdf,citationCount",
  });
  if (anioDesde) params.set("year", `${anioDesde}-`);

  const url = `${SEMANTIC_SCHOLAR_BASE_URL}?${params.toString()}`;
  const headers: Record<string, string> = {};
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  if (apiKey) headers["x-api-key"] = apiKey;

  let respuesta: Response;
  try {
    respuesta = await fetch(url, { headers });
  } catch (err) {
    throw new Error(
      `[semantic_scholar] Fallo de red al consultar Semantic Scholar: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`[semantic_scholar] Semantic Scholar respondió ${respuesta.status}: ${detalle}`);
  }

  const datos = await respuesta.json();
  const items: unknown[] = Array.isArray(datos?.data) ? datos.data : [];

  return items.map((itemRaw): CandidatoFuente => {
    const item = itemRaw as Record<string, any>;
    return {
      fuente: "semantic_scholar",
      id_fuente: item.externalIds?.DOI ?? item.paperId ?? "",
      titulo: item.title ?? "(sin título)",
      doi: item.externalIds?.DOI ?? null,
      anio: item.year ?? null,
      revista: item.venue || null,
      resumen: item.abstract ?? null,
      es_acceso_abierto: !!item.openAccessPdf?.url,
      url_texto_completo: item.openAccessPdf?.url ?? null,
      citado_por_count: item.citationCount ?? 0,
    };
  });
}
