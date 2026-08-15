import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Desvincula una pregunta de su raíz — vuelve a aparecer como pregunta suelta. */
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

  const { error } = await supabase
    .from("preguntas_pendientes")
    .update({ pregunta_raiz_id: null })
    .eq("id", pregunta_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
