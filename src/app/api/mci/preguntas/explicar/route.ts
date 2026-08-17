import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { llamarModeloLigero } from "@/lib/openrouter/client";

/**
 * "Llamada a un amigo" — el formulador no entiende una pregunta del agente.
 * FARO explica, contextualiza al proyecto real, y reformula.
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
  const { pregunta_id } = body as { pregunta_id?: string };
  if (!pregunta_id) {
    return NextResponse.json({ error: "Falta pregunta_id." }, { status: 400 });
  }

  const { data: pregunta, error: preguntaError } = await supabase
    .from("preguntas_pendientes")
    .select("*, grafo_nodos(contenido)")
    .eq("id", pregunta_id)
    .single();

  if (preguntaError || !pregunta) {
    return NextResponse.json({ error: "Pregunta no encontrada." }, { status: 404 });
  }

  const prompt = construirPromptAyudaContextual(pregunta);
  const explicacion = await llamarModeloLigero(prompt);

  return NextResponse.json({ explicacion });
}

function construirPromptAyudaContextual(pregunta: {
  nodo_tipo: string;
  campo_origen: string | null;
  texto_pregunta: string;
  grafo_nodos: { contenido: unknown } | null;
}): string {
  return `Eres un asesor metodológico de FARO acompañando a un formulador que
NO domina la metodología de investigación (no asumas experticia previa).

El agente le hizo esta pregunta dentro del nodo ${pregunta.nodo_tipo}
(campo: ${pregunta.campo_origen ?? "no especificado"}):

"${pregunta.texto_pregunta}"

El formulador indicó que no la entiende. Contexto ya generado del proyecto:
${JSON.stringify(pregunta.grafo_nodos?.contenido ?? {}, null, 2).slice(0, 4000)}

Responde en este orden, en español, con lenguaje sencillo y sin jerga
innecesaria:
1. Explica el concepto detrás de la pregunta (2-3 frases, sin tecnicismos
   evitables).
2. Da un ejemplo CONTEXTUALIZADO al proyecto real de arriba (no un ejemplo
   genérico de manual).
3. Indica qué tipo de información se necesita y dónde podría encontrarla
   (fuente oficial, conocimiento propio, estimación a verificar, etc.).
4. Vuelve a formular la pregunta original de forma más clara, en una sola
   frase.

No decidas por el formulador. No inventes datos del proyecto que no estén
en el contexto de arriba. Si el contexto es insuficiente para dar un
ejemplo específico, dilo explícitamente y da el ejemplo con el tipo de
proyecto más genérico posible.

FORMATO DE SALIDA — esto es obligatorio, no una preferencia de estilo:
tu respuesta se muestra tal cual, como texto plano, en una pantalla que NO
interpreta Markdown. Por lo tanto NO uses absolutamente ningún símbolo de
sintaxis Markdown: nada de #, ##, ### para encabezados, nada de ** ni * para
negrita o cursiva, nada de guiones ni asteriscos como viñetas, nada de
backticks. Escribe como si estuvieras hablando con la persona en una
conversación real: párrafos cortos en prosa corriente. Para los 4 puntos de
arriba, si quieres numerarlos, usa únicamente el número seguido de un punto
en texto plano ("1.", "2.", "3.", "4.") al inicio de cada párrafo — nunca un
encabezado Markdown ni texto en negrita para el número o el título del
punto.`;
}
