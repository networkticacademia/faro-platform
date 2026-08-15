import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { llamarOrquestador } from "@/lib/openrouter/client";

/**
 * Agrupamiento semántico de preguntas abiertas — ÚNICA pieza LLM de este
 * bloque, y solo bajo demanda (botón explícito en el Gate overlay), nunca
 * automática por pregunta individual.
 *
 * Reutiliza el mismo principio que verificadorSemantico.ts: el LLM debe
 * citar evidencia textual de por qué dos preguntas son la misma
 * incertidumbre, no solo devolver un grupo sin justificación.
 *
 * El resultado se PROPONE, no se persiste automáticamente — el formulador
 * confirma antes de que `pregunta_raiz_id` se escriba (mismo patrón
 * `confirmado_humano` de toda la plataforma).
 *
 * IMPORTANTE PARA ANTIGRAVITY: verificar firma real de llamarOrquestador()
 * y si soporta respuesta forzada a JSON (algunos wrappers de OpenRouter
 * exponen un parámetro de "response_format"); si no, parsear el texto con
 * el mismo patrón de saneo ya usado en otros parseos de FARO.
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
    const limpio = respuesta.replace(/```json|```/g, "").trim();
    gruposPropuestos = JSON.parse(limpio);
  } catch {
    return NextResponse.json(
      { error: "No se pudo interpretar la respuesta del agrupamiento. Intente de nuevo." },
      { status: 502 }
    );
  }

  // Se devuelve como PROPUESTA — no se escribe pregunta_raiz_id aquí.
  // La confirmación del formulador se hace vía un segundo llamado
  // (fuera de alcance de este archivo) que sí actualiza la tabla.
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
