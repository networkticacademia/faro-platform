import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Registra la respuesta del formulador a UNA pregunta pendiente.
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
  const { pregunta_id, respuesta } = body as { pregunta_id?: string; respuesta?: string };

  if (!pregunta_id || !respuesta?.trim()) {
    return NextResponse.json({ error: "Faltan pregunta_id o respuesta." }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from("preguntas_pendientes")
    .update({ respuesta, estado: "resuelta", resolved_at: timestamp })
    .eq("id", pregunta_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Al responder la representante, las preguntas agrupadas bajo ella pasan automáticamente a 'resuelta'
  await supabase
    .from("preguntas_pendientes")
    .update({ respuesta, estado: "resuelta", resolved_at: timestamp })
    .or(`agrupada_en.eq.${pregunta_id},pregunta_raiz_id.eq.${pregunta_id}`)
    .eq("estado", "agrupada");

  return NextResponse.json({ pregunta: data });
}
