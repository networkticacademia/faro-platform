// ============================================================
// FARO — Cliente OpenAlex
// Nivel 1 de la arquitectura de 2 niveles de RSL: S(hi) → D
// (búsqueda de documentos candidatos, antes del cribado barato
// y de la síntesis final con Claude — esos son pasos siguientes)
// Sin autenticación requerida — API pública de OpenAlex.
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================
//
// Documentación de referencia: https://docs.openalex.org/api-entities/works
//
// NOTA IMPORTANTE sobre "polite pool": OpenAlex da prioridad y mayor
// estabilidad a las peticiones que incluyen un parámetro `mailto` con
// un correo de contacto real. Sin él, el cliente sigue funcionando,
// pero puede ser más lento o limitado en horas de alta demanda.
// Configure OPENALEX_MAILTO en .env.local con un correo institucional.

import type { CandidatoFuente } from "./tipos";

export interface OpcionesBusquedaOpenAlex {
  limite?: number; // default 10, máximo 25 por llamada
  anioDesde?: number; // filtra publicaciones desde este año
  soloAccesoAbierto?: boolean;
}

const OPENALEX_BASE_URL = "https://api.openalex.org/works";

/**
 * OpenAlex no devuelve el resumen como texto plano por restricciones
 * de derechos de autor de los editores — lo devuelve como un índice
 * invertido: { "palabra": [posiciones donde aparece], ... }.
 * Esta función lo reconstruye a texto legible.
 */
function reconstruirResumen(
  invertedIndex: Record<string, number[]> | undefined | null
): string | null {
  if (!invertedIndex) return null;

  const posiciones: { palabra: string; pos: number }[] = [];
  for (const [palabra, listaPos] of Object.entries(invertedIndex)) {
    for (const pos of listaPos) {
      posiciones.push({ palabra, pos });
    }
  }
  if (posiciones.length === 0) return null;

  posiciones.sort((a, b) => a.pos - b.pos);
  return posiciones.map((p) => p.palabra).join(" ");
}

/**
 * Busca documentos candidatos en OpenAlex a partir de una consulta
 * en texto libre (típicamente la afirmación de una hipótesis, o
 * términos clave derivados de ella).
 *
 * Esta función es el paso S(hi) → D del operador reactivo de RSL.
 * NO hace cribado ni síntesis — solo recupera candidatos crudos.
 */
export async function buscarCandidatosOpenAlex(
  consulta: string,
  opciones: OpcionesBusquedaOpenAlex = {}
): Promise<CandidatoFuente[]> {
  const { limite = 10, anioDesde, soloAccesoAbierto } = opciones;

  if (!consulta || consulta.trim().length === 0) {
    throw new Error("[openalex] La consulta de búsqueda no puede estar vacía");
  }

  const mailtoContacto = process.env.OPENALEX_MAILTO;
  if (!mailtoContacto) {
    console.warn(
      "[openalex] OPENALEX_MAILTO no configurado en .env.local — " +
        "las peticiones funcionan igual, pero sin prioridad del 'polite pool' de OpenAlex."
    );
  }

  const params = new URLSearchParams({
    search: consulta,
    per_page: String(Math.min(Math.max(limite, 1), 25)),
    sort: "relevance_score:desc",
  });
  if (mailtoContacto) params.set("mailto", mailtoContacto);

  const filtros: string[] = [];
  if (anioDesde) filtros.push(`from_publication_date:${anioDesde}-01-01`);
  if (soloAccesoAbierto) filtros.push("is_oa:true");
  if (filtros.length > 0) params.set("filter", filtros.join(","));

  const url = `${OPENALEX_BASE_URL}?${params.toString()}`;

  let respuesta: Response;
  try {
    respuesta = await fetch(url);
  } catch (err) {
    throw new Error(
      `[openalex] Fallo de red al consultar OpenAlex: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`[openalex] OpenAlex respondió ${respuesta.status}: ${detalle}`);
  }

  const datos = await respuesta.json();
  const resultados: unknown[] = Array.isArray(datos?.results) ? datos.results : [];

  return resultados.map((obraRaw): CandidatoFuente => {
    const obra = obraRaw as Record<string, any>;
    return {
      fuente: "openalex",
      id_fuente: obra.id ?? "",
      titulo: obra.title ?? obra.display_name ?? "(sin título)",
      doi: typeof obra.doi === "string" ? obra.doi.replace("https://doi.org/", "") : null,
      anio: obra.publication_year ?? null,
      revista: obra.primary_location?.source?.display_name ?? null,
      resumen: reconstruirResumen(obra.abstract_inverted_index),
      es_acceso_abierto: obra.open_access?.is_oa ?? false,
      url_texto_completo:
        obra.open_access?.oa_url ?? obra.best_oa_location?.pdf_url ?? null,
      citado_por_count: obra.cited_by_count ?? 0,
    };
  });
}
