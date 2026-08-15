import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reagruparPreguntasAbiertas } from "@/lib/faro/agrupamiento";

/**
 * Recalcula y aplica el agrupamiento semántico de preguntas abiertas para un proyecto.
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

  const resultado = await reagruparPreguntasAbiertas(supabase, project_id);
  return NextResponse.json({ ok: true, ...resultado });
}
