import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { humanizarTexto } from "@/lib/faro/humanizador";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id, markdown } = body;
  if (!project_id || markdown === undefined) {
    return NextResponse.json({ error: "Faltan parámetros project_id o markdown." }, { status: 400 });
  }

  try {
    const humanized = await humanizarTexto(markdown);
    return NextResponse.json({ humanized });
  } catch (e) {
    return NextResponse.json({ error: `Error al humanizar la propuesta: ${(e as Error).message}` }, { status: 500 });
  }
}
