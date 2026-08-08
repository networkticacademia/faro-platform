// ============================================================
// FARO — Tipo compartido de candidato bibliográfico
// Todos los clientes de búsqueda (OpenAlex, Crossref, Semantic Scholar,
// Scopus cuando exista) devuelven este mismo shape, para poder combinar
// y deduplicar resultados de múltiples fuentes antes del cribado.
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

export type FuenteBibliografica = "openalex" | "crossref" | "semantic_scholar" | "scopus";

export interface CandidatoFuente {
  fuente: FuenteBibliografica;
  id_fuente: string; // id nativo de esa fuente (openalex_id, DOI si no hay otro, etc.)
  titulo: string;
  doi: string | null;
  anio: number | null;
  revista: string | null;
  resumen: string | null;
  es_acceso_abierto: boolean;
  url_texto_completo: string | null;
  citado_por_count: number;
}
