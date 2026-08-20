import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarDocumentoConsolidadoMarkdown } from "@/lib/faro/documentoConsolidado";

/**
 * GET /api/mci/proyecto/documento?project_id=...
 *
 * Devuelve el documento consolidado guardado para el proyecto.
 * Si no existe, lo genera en vivo por primera vez y lo devuelve (sin guardarlo de forma
 * definitiva para que el usuario sea el que decida guardarlo o editarlo).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const project_id = searchParams.get("project_id");
  const force_regenerate = searchParams.get("force_regenerate") === "true";

  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  // 1. Intentar leer el documento consolidado guardado
  const { data: project, error: errProject } = await supabase
    .from("projects")
    .select("documento_consolidado")
    .eq("id", project_id)
    .single();

  if (errProject) {
    return NextResponse.json({ error: errProject.message }, { status: 500 });
  }

  let docJson = project?.documento_consolidado as { markdown?: string; editado?: boolean; autor?: any } | null;

  // 2. Si no existe o se fuerza regeneración, compilar en vivo (en bruto)
  if (!docJson?.markdown || force_regenerate) {
    try {
      const mdRaw = await generarDocumentoConsolidadoMarkdown(supabase, project_id);
      // Mantener cualquier autor existente en el JSON original si lo había
      const autorExistente = (project?.documento_consolidado as any)?.autor ?? null;
      docJson = {
        markdown: mdRaw,
        editado: false,
        autor: autorExistente,
      };
    } catch (e) {
      return NextResponse.json({ error: `Error al generar la propuesta: ${(e as Error).message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ documento: docJson });
}

/**
 * POST /api/mci/proyecto/documento
 *
 * Guarda el documento consolidado editado por el usuario en la tabla de proyectos,
 * junto con los metadatos del autor del proyecto.
 * Cumple la regla de "Borde de una sola vía": las ediciones viven en el documento,
 * no alteran los nodos del grafo metodológico.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id, markdown, autor } = body;

  if (!project_id || markdown === undefined) {
    return NextResponse.json({ error: "Faltan parámetros project_id o markdown." }, { status: 400 });
  }

  const { data: project, error: errUpdate } = await supabase
    .from("projects")
    .update({
      documento_consolidado: {
        markdown: markdown,
        editado: true,
        autor: autor || null,
      },
    })
    .eq("id", project_id)
    .select("id, documento_consolidado")
    .single();

  if (errUpdate) {
    return NextResponse.json({ error: errUpdate.message }, { status: 500 });
  }

  return NextResponse.json({ project });
}
