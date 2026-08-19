import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { generarIntroduccion, generarResumen } from "@/lib/faro/sintesisFinal";
import { construirBibliografiaConClaves, type FuenteConId } from "@/lib/faro/corpus/exportarBib";
import { escaparProsaLatexPreservandoCitas } from "@/lib/faro/latex/escaparProsa";
import { humanizarDocumento } from "@/lib/faro/humanizadorDocumento";
import { generarDocumentoConsolidadoMarkdown } from "@/lib/faro/documentoConsolidado";

/**
 * GET /api/mci/proyecto/exportar?project_id=...&formato=md|tex
 *
 * Exporta la propuesta completa del proyecto en el formato solicitado.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const project_id = searchParams.get("project_id");
  const formato = searchParams.get("formato") ?? "md";

  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  if (formato === "md") {
    // 1. Exportar en Markdown
    // Buscar si ya existe el guardado en BD
    const { data: project } = await supabase
      .from("projects")
      .select("documento_consolidado, titulo_provisional")
      .eq("id", project_id)
      .single();

    const savedDoc = project?.documento_consolidado as { markdown?: string } | null;
    let markdownText = savedDoc?.markdown;

    if (!markdownText) {
      markdownText = await generarDocumentoConsolidadoMarkdown(supabase, project_id);
    }

    const cleanTitle = (project?.titulo_provisional ?? "propuesta")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .slice(0, 50);

    return NextResponse.json({
      formato: "md",
      content: markdownText,
      filename: `${cleanTitle}.md`,
    });
  } else if (formato === "tex") {
    // 2. Exportar en LaTeX + BibTeX
    const { data: project } = await supabase
      .from("projects")
      .select("titulo_provisional, usuarios_plataforma(nombre_completo)")
      .eq("id", project_id)
      .maybeSingle();

    const titulo = project?.titulo_provisional ?? "(sin título provisional)";
    const autor =
      (project?.usuarios_plataforma as any)?.nombre_completo ??
      "(autor sin registrar)";

    const { data: fuentesData, error: errFuentes } = await supabase
      .from("corpus_fuentes")
      .select("id, titulo, autores, doi, anio, revista, resumen_hallazgo")
      .eq("project_id", project_id)
      .eq("estado_verificacion", "verificado")
      .order("anio", { ascending: false });

    if (errFuentes) {
      return NextResponse.json({ error: errFuentes.message }, { status: 500 });
    }

    const fuentes = (fuentesData ?? []) as FuenteConId[];
    const { bibtex, entradas } = await construirBibliografiaConClaves(fuentes);

    // Generar secciones en formato LaTeX
    const introduccion = await generarIntroduccion(supabase, project_id, {
      formato: "latex",
      bibliografiaConClaves: entradas,
    });

    const resumen = await generarResumen(supabase, project_id, {
      formato: "latex",
      bibliografiaConClaves: entradas,
    });

    let textoResumenFinal = resumen.texto;
    let textoIntroduccionFinal = introduccion.texto;

    try {
      // Aplicar humanizador
      const resultadoHumanizado = await humanizarDocumento(
        [
          { id: "resumen", texto: resumen.texto },
          { id: "introduccion", texto: introduccion.texto },
        ],
        { formato: "latex" }
      );
      const seccionResumen = resultadoHumanizado.secciones.find((s) => s.id === "resumen");
      const seccionIntroduccion = resultadoHumanizado.secciones.find((s) => s.id === "introduccion");
      if (seccionResumen && seccionIntroduccion) {
        textoResumenFinal = seccionResumen.texto;
        textoIntroduccionFinal = seccionIntroduccion.texto;
      }
    } catch (e) {
      console.warn("Humanizador falló o no disponible en este entorno, usando texto original.");
    }

    const plantillaPath = resolve(process.cwd(), "plantillas", "proyecto_main.tex");
    if (!existsSync(plantillaPath)) {
      return NextResponse.json({ error: "No se encontró la plantilla LaTeX base." }, { status: 500 });
    }
    const plantilla = readFileSync(plantillaPath, "utf-8");

    const bibFileName = `proyecto_${project_id}.bib`;

    const tex = plantilla
      .replace("{{BIB_FILE}}", bibFileName)
      .replace("{{TITULO}}", escaparProsaLatexPreservandoCitas(titulo))
      .replace("{{AUTOR}}", escaparProsaLatexPreservandoCitas(autor))
      .replace("{{RESUMEN}}", escaparProsaLatexPreservandoCitas(textoResumenFinal))
      .replace("{{INTRODUCCION}}", escaparProsaLatexPreservandoCitas(textoIntroduccionFinal));

    const cleanTitle = (project?.titulo_provisional ?? "propuesta")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .slice(0, 50);

    return NextResponse.json({
      formato: "tex",
      tex: tex,
      bibtex: bibtex,
      texFilename: `proyecto_main_${project_id}.tex`,
      bibFilename: bibFileName,
      zipName: `${cleanTitle}_latex.zip`,
    });
  } else {
    return NextResponse.json({ error: "Formato no soportado." }, { status: 400 });
  }
}
