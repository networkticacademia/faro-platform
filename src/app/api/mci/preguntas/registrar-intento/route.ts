import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Registra que el formulador SÍ intentó la búsqueda externa (pegó un JSON
 * con dato="no encontrado") pero no obtuvo un dato concreto. NO resuelve
 * la pregunta ni dispara regeneración de nodos — no hay dato nuevo que
 * propagar. Deja constancia en `respuesta`, sin tocar `estado` (permanece
 * en el estado en que ya estaba, típicamente 'diferida' desde que se pidió
 * la derivación de búsqueda).
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

  const { error } = await supabase
    .from("preguntas_pendientes")
    .update({
      respuesta: `Búsqueda externa intentada por el formulador el ${new Date().toISOString().slice(0, 10)} — no se encontró un dato concreto.`,
    })
    .eq("id", pregunta_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
