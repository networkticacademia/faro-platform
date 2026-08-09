// ============================================================
// FARO — POST /api/mci/corpus/exportar-bib
// Genera y descarga el .bib de las fuentes SELECCIONADAS por el
// formulador (no siempre "todo lo verificado" — puede elegir un
// subconjunto). v2: cambia de GET a POST porque la selección de IDs
// no cabe cómodamente en query string para corpus grandes.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarBibtex } from "@/lib/faro/corpus/exportarBib";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { project_id, ids } = body ?? {};

  if (!project_id || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: "project_id y una lista de ids (no vacía) son obligatorios" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("corpus_fuentes")
    .select("titulo, autores, doi, anio, revista")
    .eq("project_id", project_id)
    .in("id", ids)
    .order("anio", { ascending: false });

  if (error) {
    console.error("[corpus] Error consultando fuentes seleccionadas:", error);
    return NextResponse.json({ error: "Error al consultar el corpus" }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Ninguna de las fuentes seleccionadas existe" }, { status: 404 });
  }

  const bibtex = await generarBibtex(data);

  return new NextResponse(bibtex, {
    headers: {
      "Content-Type": "application/x-bibtex; charset=utf-8",
      "Content-Disposition": `attachment; filename="faro_corpus_${project_id}.bib"`,
    },
  });
}
