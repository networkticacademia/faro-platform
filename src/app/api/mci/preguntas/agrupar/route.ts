import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";

/**
 * Agrupamiento semántico de preguntas abiertas — ÚNICA pieza LLM de este
 * bloque, y solo bajo demanda (botón explícito en el Gate overlay).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id } = body as { project_id?: string };
  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  const { data: preguntas, error } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, texto_pregunta")
    .eq("project_id", project_id)
    .eq("estado", "abierta")
    .is("pregunta_raiz_id", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!preguntas || preguntas.length < 2) {
    return NextResponse.json({ grupos_propuestos: [] });
  }

  const prompt = construirPromptAgrupamiento(preguntas);
  const respuesta = await llamarOrquestador(prompt);

  let gruposPropuestos: unknown;
  try {
    gruposPropuestos = parsearJsonRespuesta(respuesta);
  } catch {
    return NextResponse.json(
      { error: "No se pudo interpretar la respuesta del agrupamiento. Intente de nuevo." },
      { status: 502 }
    );
  }

  return NextResponse.json({ grupos_propuestos: gruposPropuestos });
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

Identifica cuáles expresan REALMENTE la misma incertidumbre de fondo
(ejemplo: "¿cuál es la población?", "¿cuántos productores hay?" y
"¿quiénes serán los participantes?" son la misma incertidumbre:
"definir población objetivo y unidad de análisis").

No agrupes preguntas solo porque tocan el mismo tema general si en
realidad piden información distinta.

Responde ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma:

[
  {
    "pregunta_raiz_sugerida": "texto de la pregunta raíz, reformulada de forma clara",
    "ids_agrupados": ["id1", "id2"],
    "evidencia": "explicación breve de por qué estas preguntas son la misma incertidumbre"
  }
]

Si ninguna pregunta se agrupa con otra, responde: []`;
}
