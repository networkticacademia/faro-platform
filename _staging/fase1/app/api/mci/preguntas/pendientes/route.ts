import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const project_id = searchParams.get("project_id");
  const nodo_tipo = searchParams.get("nodo_tipo"); // opcional

  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  let query = supabase
    .from("preguntas_pendientes")
    .select("*")
    .eq("project_id", project_id)
    .eq("estado", "abierta")
    .order("prioridad", { ascending: true }) // P0 < P1 < P2 < P3 alfabéticamente, coincide con el orden deseado
    .order("created_at", { ascending: true });

  if (nodo_tipo) {
    query = query.eq("nodo_tipo", nodo_tipo);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const conteo = {
    P1: data?.filter((p) => p.prioridad === "P1").length ?? 0,
    P2: data?.filter((p) => p.prioridad === "P2").length ?? 0,
    P3: data?.filter((p) => p.prioridad === "P3").length ?? 0,
  };

  return NextResponse.json({ preguntas: data ?? [], conteo });
}
