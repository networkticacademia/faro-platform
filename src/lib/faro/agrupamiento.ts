/**
 * lib/faro/agrupamiento.ts
 *
 * Agrupamiento semántico de preguntas abiertas (P0) — AUTO-PERSISTE el
 * resultado.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { llamarOrquestador } from "@/lib/openrouter/client";

interface GrupoPropuesto {
  pregunta_raiz_sugerida: string;
  ids_agrupados: string[];
  evidencia: string;
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
  try {
    const respuesta = await llamarOrquestador(prompt);
    const limpio = respuesta.replace(/```json|```/g, "").trim();
    grupos = JSON.parse(limpio);
  } catch (e) {
    console.error("[reagruparPreguntasAbiertas] error al interpretar respuesta:", e);
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

    const prioridadMaxima = (filasGrupo ?? [])
      .map((f) => f.prioridad as string)
      .sort()[0]; // "P1" < "P2" < "P3" alfabéticamente

    await supabase
      .from("preguntas_pendientes")
      .update({
        texto_pregunta: grupo.pregunta_raiz_sugerida,
        prioridad: prioridadMaxima ?? "P2",
      })
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
agentes de FARO para el mismo proyecto de investigación:

${lista}

Identifica cuáles expresan REALMENTE la misma incertidumbre de fondo, sin
importar en qué nodo aparezcan ni con qué palabras exactas estén
formuladas. No agrupes preguntas solo porque tocan el mismo tema general
si en realidad piden información distinta.

Además, si detectas que una pregunta es de alcance/viabilidad general del
proyecto (por ejemplo, si el número de actividades/productos es
razonable para el tiempo y equipo disponible), NO la agrupes con otras —
esas preguntas deben quedar solas y marcadas como estructurales.

Responde ÚNICAMENTE con JSON válido, sin texto adicional:

[
  {
    "pregunta_raiz_sugerida": "texto de la pregunta raíz, reformulada de forma clara y neutral al dominio",
    "ids_agrupados": ["id_raiz_elegido_primero", "id2", "id3"],
    "evidencia": "explicación breve de por qué estas preguntas son la misma incertidumbre"
  }
]

Si ninguna pregunta se agrupa con otra, responde: []`;
}
