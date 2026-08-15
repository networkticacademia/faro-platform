import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { llamarOrquestador } from "@/lib/openrouter/client";

/**
 * "No sé dónde conseguirla" — genera orientación + prompts estandarizados.
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

  const { data: pregunta, error } = await supabase
    .from("preguntas_pendientes")
    .select("*, grafo_nodos(contenido)")
    .eq("id", pregunta_id)
    .single();

  if (error || !pregunta) {
    return NextResponse.json({ error: "Pregunta no encontrada." }, { status: 404 });
  }

  const prompt = construirPromptDerivacion(pregunta);
  const respuesta = await llamarOrquestador(prompt);

  let parsed: { orientacion: string; prompt_busqueda: string; prompt_retorno: string };
  try {
    const limpio = respuesta.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(limpio);
  } catch {
    return NextResponse.json({ error: "No se pudo generar la orientación." }, { status: 502 });
  }

  await supabase.from("preguntas_pendientes").update({ estado: "diferida" }).eq("id", pregunta_id);

  return NextResponse.json(parsed);
}

function construirPromptDerivacion(pregunta: {
  nodo_tipo: string;
  texto_pregunta: string;
  grafo_nodos: { contenido: unknown } | null;
}): string {
  return `Eres un asesor metodológico de FARO. El formulador indicó que NO
tiene la información para responder esta pregunta y necesita orientación
de dónde buscarla. No asumas el dominio del proyecto — usa el contexto
real de abajo.

Pregunta (nodo ${pregunta.nodo_tipo}):
"${pregunta.texto_pregunta}"

Contexto del proyecto:
${JSON.stringify(pregunta.grafo_nodos?.contenido ?? {}, null, 2).slice(0, 4000)}

Responde ÚNICAMENTE con JSON válido:

{
  "orientacion": "1-2 frases indicando qué tipo de fuente probablemente tiene este dato (entidad oficial, base de datos, literatura, documento propio, etc.), en lenguaje sencillo",
  "prompt_busqueda": "prompt listo para copiar en Perplexity/NotebookLM/buscador que ayude a encontrar este dato específico, incluyendo el contexto necesario",
  "prompt_retorno": "prompt para pedirle a esa misma herramienta que devuelva el resultado en formato estructurado (fuente, dato, fecha, nivel de confianza) que el formulador pueda pegar de vuelta en FARO"
}`;
}
