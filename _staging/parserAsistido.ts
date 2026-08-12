// ============================================================
// FARO — Componente B del roadmap de RSL: parser de captura asistida
// (NotebookLM, Perplexity, Elicit, SciSpace, Consensus, etc.)
//
// Recibe texto pegado por el formulador, en CUALQUIER formato en que
// la herramienta externa lo haya entregado (tabla, lista, prosa) y lo
// normaliza a JSON vía LLM. Cada candidato con DOI se verifica de
// forma determinística contra la API de Crossref (lookup directo, no
// búsqueda) ANTES de insertarse en corpus_fuentes — el mismo principio
// que ya rige la verificación cruzada de RSL: ninguna cita se acepta
// solo porque un LLM (el nuestro o el de la herramienta externa que
// generó el texto original) la reporta.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";

export interface CandidatoAsistido {
  titulo: string;
  autores: string;
  anio: number | null;
  revista: string | null;
  doi: string | null;
  hallazgo: string;
}

interface RespuestaParserLLM {
  candidatos: CandidatoAsistido[];
}

const PROMPT_PARSER = (textoPegado: string) => `
Recibiste un texto pegado por un investigador, proveniente de una
herramienta de búsqueda asistida (NotebookLM, Perplexity, Elicit,
SciSpace u otra). El texto puede venir en formato de tabla, lista, o
prosa narrativa con referencias mezcladas.

Tu tarea es EXTRAER cada artículo/fuente académica mencionada y
devolverla en un JSON con esta forma EXACTA, sin texto adicional antes
ni después:

{
  "candidatos": [
    {
      "titulo": "string, título completo del artículo",
      "autores": "string, autores tal como aparecen",
      "anio": numero o null si no se indica,
      "revista": "string o null",
      "doi": "string (solo el DOI, sin URL ni prefijo doi.org) o null si no se reporta",
      "hallazgo": "string, resumen de 1-3 líneas del hallazgo principal, tal como lo describe el texto original"
    }
  ]
}

Reglas estrictas:
- NO inventes ningún dato que no esté en el texto. Si un campo no
  aparece, usa null (o "no reportado" para autores/hallazgo).
- NO incluyas como candidato ninguna fuente que el texto describa
  explícitamente como "no relevante", "descartada", o que sea un
  registro genérico sin datos bibliográficos identificables.
- Si el mismo artículo aparece mencionado más de una vez en el texto,
  inclúyelo una sola vez.
- No agregues comentarios, explicación ni markdown alrededor del JSON.

Texto a procesar:
"""
${textoPegado}
"""
`;

export async function parsearCandidatosDesdeTexto(
  textoPegado: string
): Promise<CandidatoAsistido[]> {
  const respuesta = await llamarOrquestador(PROMPT_PARSER(textoPegado));
  const parsed = parsearJsonRespuesta<RespuestaParserLLM>(respuesta);
  return parsed.candidatos ?? [];
}

export interface ResultadoVerificacionDOI {
  valido: boolean;
  tituloReal?: string;
  revistaReal?: string;
  anioReal?: number;
}

/**
 * Verifica un DOI contra la API pública de Crossref (lookup directo
 * por identificador, no búsqueda por palabra clave — mucho más
 * confiable). Si el DOI no resuelve, el candidato se descarta antes
 * de tocar la base de datos. Nunca lanza: un fallo de red se trata
 * como "no verificado", no bloquea el resto del lote.
 */
export async function verificarDOIContraCrossref(
  doi: string
): Promise<ResultadoVerificacionDOI> {
  try {
    const doiLimpio = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    const respuesta = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doiLimpio)}`,
      {
        headers: {
          "User-Agent": "FARO-platform/1.0 (mailto:networkticacademia@gmail.com)",
        },
      }
    );
    if (!respuesta.ok) return { valido: false };

    const datos = await respuesta.json();
    const item = datos?.message;
    if (!item) return { valido: false };

    return {
      valido: true,
      tituloReal: item.title?.[0],
      revistaReal: item["container-title"]?.[0],
      anioReal:
        item["published-print"]?.["date-parts"]?.[0]?.[0] ??
        item["published-online"]?.["date-parts"]?.[0]?.[0] ??
        undefined,
    };
  } catch (error) {
    console.warn("Fallo verificación DOI contra Crossref:", doi, error);
    return { valido: false };
  }
}
