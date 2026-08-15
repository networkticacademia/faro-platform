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

  const { data, error } = await supabase
    .from("preguntas_pendientes")
    .update({ respuesta, estado: "resuelta", resolved_at: new Date().toISOString() })
    .eq("id", pregunta_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pregunta: data });
}
