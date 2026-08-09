// ============================================================
// FARO — POST /api/mci/corpus/exportar-bib
// Recibe { project_id, ids } y genera el archivo .bib únicamente
// para las fuentes seleccionadas (o todas si ids está vacío).
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarBibtex } from "@/lib/faro/corpus/exportarBib";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { project_id, ids } = body ?? {};

  if (!project_id) {
    return NextResponse.json({ error: "project_id es obligatorio" }, { status: 400 });
  }

  const supabase = await createClient();

  let query = supabase
    .from("corpus_fuentes")
    .select("titulo, autores, doi, anio, revista")
    .eq("project_id", project_id)
    .eq("estado_verificacion", "verificado");

  if (Array.isArray(ids) && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[exportar-bib] Error consultando fuentes para BibTeX:", error);
    return NextResponse.json({ error: "Error al consultar las fuentes" }, { status: 500 });
  }

  const contenidoBib = await generarBibtex(data ?? []);

  return new NextResponse(contenidoBib, {
    status: 200,
    headers: {
      "Content-Type": "application/x-bibtex; charset=utf-8",
      "Content-Disposition": `attachment; filename="faro_corpus_${project_id.slice(0, 8)}.bib"`,
    },
  });
}
