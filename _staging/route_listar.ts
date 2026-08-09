// ============================================================
// FARO — GET /api/mci/corpus?project_id=...
// Lista todas las fuentes del corpus de un proyecto. Alimenta la
// vista dedicada de RSL (tabla + grafo), Componente D del roadmap.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");

  if (!projectId) {
    return NextResponse.json({ error: "project_id es obligatorio" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("corpus_fuentes")
    .select("*")
    .eq("project_id", projectId)
    .order("creado_en", { ascending: false });

  if (error) {
    console.error("[corpus] Error listando corpus_fuentes:", error);
    return NextResponse.json({ error: "Error al consultar el corpus" }, { status: 500 });
  }

  return NextResponse.json({ fuentes: data ?? [] });
}
