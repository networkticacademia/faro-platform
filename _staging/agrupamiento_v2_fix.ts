/**
 * PARCHE para lib/faro/agrupamiento.ts
 *
 * Reemplaza el bloque de parseo dentro de reagruparPreguntasAbiertas()
 * (el try/catch que hace JSON.parse) por esto. La causa del error real:
 * el LLM devolvió el array JSON correcto pero agregó texto explicativo
 * después, pese a la instrucción de "solo JSON, sin texto adicional".
 * JSON.parse no tolera nada extra al final — hay que extraer solo el
 * array balanceado de corchetes, ignorando lo que venga después.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { llamarOrquestador } from "@/lib/openrouter/client";

interface GrupoPropuesto {
  pregunta_raiz_sugerida: string;
  ids_agrupados: string[];
  evidencia: string;
}

/** Extrae el array JSON balanceado, ignorando cualquier texto antes o después. */
function extraerArrayJSON(texto: string): string {
  const limpio = texto.replace(/```json|```/g, "").trim();
  const inicio = limpio.indexOf("[");
  if (inicio === -1) return limpio;

  let profundidad = 0;
  for (let i = inicio; i < limpio.length; i++) {
    if (limpio[i] === "[") profundidad++;
    if (limpio[i] === "]") {
      profundidad--;
      if (profundidad === 0) return limpio.slice(inicio, i + 1);
    }
  }
  // Si nunca cerró (respuesta truncada), devuelve lo que haya para que
  // JSON.parse falle de forma clara en vez de silenciosa.
  return limpio.slice(inicio);
}

export async function reagruparPreguntasAbiertas(
  supabase: SupabaseClient,
  project_id: string
): Promise<{ gruposCreados: number }> {
  const { data: preguntas, error } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, texto_pregunta")
    .eq("project_id", project_id)
    .eq("estado", "abierta")
    .is("pregunta_raiz_id", null);

  if (error || !preguntas || preguntas.length < 2) {
    return { gruposCreados: 0 };
  }

  const prompt = construirPromptAgrupamiento(preguntas);
  let grupos: GrupoPropuesto[];
  let respuestaCruda = "";
  try {
    respuestaCruda = await llamarOrquestador(prompt);
    grupos = JSON.parse(extraerArrayJSON(respuestaCruda));
  } catch (e) {
    console.error("[reagruparPreguntasAbiertas] error al interpretar respuesta:", e);
    console.error("[reagruparPreguntasAbiertas] respuesta cruda del LLM:", respuestaCruda);
    return { gruposCreados: 0 };
  }

  let gruposCreados = 0;
  for (const grupo of grupos) {
    if (!Array.isArray(grupo.ids_agrupados) || grupo.ids_agrupados.length < 2) continue;

    const [raizId, ...hijosIds] = grupo.ids_agrupados;

    const { data: filasGrupo } = await supabase
      .from("preguntas_pendientes")
      .select("id, prioridad")
      .in("id", grupo.ids_agrupados);

    const prioridadMaxima = (filasGrupo ?? []).map((f) => f.prioridad as string).sort()[0];

    await supabase
      .from("preguntas_pendientes")
      .update({ texto_pregunta: grupo.pregunta_raiz_sugerida, prioridad: prioridadMaxima ?? "P2" })
      .eq("id", raizId);

    await supabase
      .from("preguntas_pendientes")
      .update({ pregunta_raiz_id: raizId })
      .in("id", hijosIds);

    gruposCreados++;
  }

  return { gruposCreados };
}

function construirPromptAgrupamiento(
  preguntas: { id: string; nodo_tipo: string; texto_pregunta: string }[]
): string {
  const lista = preguntas
    .map((p) => `- id: ${p.id} | nodo: ${p.nodo_tipo} | texto: "${p.texto_pregunta}"`)
    .join("\n");

  return `Tienes esta lista de preguntas abiertas generadas por distintos
agentes de FARO para el mismo proyecto de investigación (el dominio del
proyecto es irrelevante para esta tarea):

${lista}

Identifica cuáles expresan REALMENTE la misma incertidumbre de fondo, sin
importar en qué nodo aparezcan ni con qué palabras exactas estén
formuladas. No agrupes preguntas solo porque tocan el mismo tema general
si en realidad piden información distinta.

Si detectas una pregunta de alcance/viabilidad general del proyecto, NO
la agrupes con otras — debe quedar sola y marcada como estructural.

Responde ÚNICAMENTE con el array JSON, sin ningún texto antes ni después,
sin explicaciones adicionales, sin markdown:

[
  {
    "pregunta_raiz_sugerida": "texto reformulado, claro y neutral al dominio",
    "ids_agrupados": ["id_raiz_elegido_primero", "id2", "id3"],
    "evidencia": "explicación breve de por qué son la misma incertidumbre"
  }
]

Si ninguna pregunta se agrupa con otra, responde exactamente: []`;
}
