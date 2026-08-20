import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id, titulo, palabras_clave } = body;

  if (!project_id || !titulo) {
    return NextResponse.json({ error: "Faltan parámetros project_id o titulo." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ 
      titulo_provisional: titulo,
      palabras_clave: palabras_clave || null
    })
    .eq("id", project_id)
    .select("id, titulo_provisional, palabras_clave")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, project: data });
}
