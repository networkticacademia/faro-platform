import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { generarIntroduccion, generarResumen, obtenerNodoConfirmado } from "@/lib/faro/sintesisFinal";
import { construirBibliografiaConClaves, type FuenteConId } from "@/lib/faro/corpus/exportarBib";
import { escaparProsaLatexPreservandoCitas } from "@/lib/faro/latex/escaparProsa";
import { humanizarDocumento } from "@/lib/faro/humanizadorDocumento";
import { generarDocumentoConsolidadoMarkdown } from "@/lib/faro/documentoConsolidado";
import { todasLasReferencias, type MarcoReferencialOutput } from "@/lib/faro/marcoReferencial";

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
      .select("titulo_provisional, palabras_clave, documento_consolidado, usuarios_plataforma(nombre_completo)")
      .eq("id", project_id)
      .maybeSingle();

    const savedDoc = project?.documento_consolidado as { markdown?: string; autor?: any; estiloCita?: string } | null;
    const autorMeta = savedDoc?.autor;

    const titulo = project?.titulo_provisional ?? "(sin título provisional)";
    const autorNombre = autorMeta?.nombre ?? (project?.usuarios_plataforma as any)?.nombre_completo ?? "(autor sin registrar)";
    const institucion = autorMeta?.institucion ?? "Universidad de Nariño";
    const facultad = autorMeta?.facultad ?? "Facultad de Ingeniería";
    const programa = autorMeta?.programa ?? "Ingeniería de Sistemas";
    const rol = autorMeta?.rol ?? "Investigador Principal";
    const fecha = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

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
    const titulosODoisExistentes = new Set(fuentes.map((f) => (f.doi ?? f.titulo).toLowerCase().trim()));

    try {
      const marco = await obtenerNodoConfirmado<MarcoReferencialOutput>(supabase, project_id, "MARCO_REFERENCIAL");
      if (marco) {
        const refsMarco = todasLasReferencias(marco);
        refsMarco.forEach((r, idx) => {
          const keyCheck = (r.doi_o_isbn ?? r.titulo).toLowerCase().trim();
          if (keyCheck && !titulosODoisExistentes.has(keyCheck)) {
            titulosODoisExistentes.add(keyCheck);
            const anioNum = parseInt(r.año, 10);
            fuentes.push({
              id: `marco_ref_${idx}`,
              titulo: r.titulo,
              autores: r.autor,
              doi: r.doi_o_isbn,
              anio: isNaN(anioNum) ? null : anioNum,
              revista: r.fuente,
            });
          }
        });
      }
    } catch (e) {
      console.warn("No se pudieron cargar fuentes del nodo MARCO_REFERENCIAL:", e);
    }

    const { bibtex, entradas } = await construirBibliografiaConClaves(fuentes);

    // Generar o recuperar documento consolidado completo
    let markdownText = savedDoc?.markdown;
    if (!markdownText) {
      markdownText = await generarDocumentoConsolidadoMarkdown(supabase, project_id);
    }

    // Generar secciones clave en formato LaTeX
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

    // Convertir el resto del cuerpo de Markdown a bloques \section / \subsection de LaTeX
    const lineas = markdownText.split("\n");
    const cuerpoLatexLines: string[] = [];
    for (const linea of lineas) {
      const trimmed = linea.trim();
      if (!trimmed) {
        cuerpoLatexLines.push("");
        continue;
      }
      if (trimmed.startsWith("## RESUMEN EJECUTIVO") || trimmed.startsWith("## INTRODUCCIÓN") || trimmed.startsWith("## TABLA DE CONTENIDO") || trimmed.startsWith("# PROPUESTA DE INVESTIGACIÓN")) {
        continue; // ya incluidos en plantillas estáticas
      }
      if (trimmed.startsWith("## ")) {
        const secTitle = trimmed.replace(/^##\s+/, "");
        cuerpoLatexLines.push(`\n\\section{${escaparProsaLatexPreservandoCitas(secTitle)}}\n`);
      } else if (trimmed.startsWith("### ")) {
        const subTitle = trimmed.replace(/^###\s+/, "");
        cuerpoLatexLines.push(`\\subsection{${escaparProsaLatexPreservandoCitas(subTitle)}}\n`);
      } else if (trimmed.startsWith("#### ")) {
        const subsubTitle = trimmed.replace(/^####\s+/, "");
        cuerpoLatexLines.push(`\\subsubsection{${escaparProsaLatexPreservandoCitas(subsubTitle)}}\n`);
      } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const itemText = trimmed.slice(2);
        cuerpoLatexLines.push(`  \\item ${escaparProsaLatexPreservandoCitas(itemText)}`);
      } else {
        cuerpoLatexLines.push(escaparProsaLatexPreservandoCitas(trimmed));
      }
    }
    const cuerpoDocumentoFinal = cuerpoLatexLines.join("\n");

    const plantillaPath = resolve(process.cwd(), "plantillas", "proyecto_main.tex");
    if (!existsSync(plantillaPath)) {
      return NextResponse.json({ error: "No se encontró la plantilla LaTeX base." }, { status: 500 });
    }
    const plantilla = readFileSync(plantillaPath, "utf-8");

    const bibFileName = `proyecto_${project_id}.bib`;
    const keywordsRaw = (project?.palabras_clave as string[]) ?? [];
    const keywordsStr = keywordsRaw.join(", ");

    const estiloCitaSel = savedDoc?.estiloCita ?? searchParams.get("estilo_cita") ?? "apa";
    const estiloCitaTex = estiloCitaSel === "ieee" ? "ieee" : estiloCitaSel === "vancouver" ? "vancouver" : "apa";

    const tex = plantilla
      .replace("{{BIB_FILE}}", bibFileName)
      .replace("{{ESTILO_CITA_TEX}}", estiloCitaTex)
      .replace("{{TITULO}}", escaparProsaLatexPreservandoCitas(titulo))
      .replace("{{AUTOR}}", escaparProsaLatexPreservandoCitas(autorNombre))
      .replace("{{INSTITUCION}}", escaparProsaLatexPreservandoCitas(institucion))
      .replace("{{FACULTAD}}", escaparProsaLatexPreservandoCitas(facultad))
      .replace("{{PROGRAMA}}", escaparProsaLatexPreservandoCitas(programa))
      .replace("{{ROL}}", escaparProsaLatexPreservandoCitas(rol))
      .replace("{{FECHA}}", fecha)
      .replace("{{RESUMEN}}", escaparProsaLatexPreservandoCitas(textoResumenFinal))
      .replace("{{INTRODUCCION}}", escaparProsaLatexPreservandoCitas(textoIntroduccionFinal))
      .replace("{{PALABRAS_CLAVE}}", escaparProsaLatexPreservandoCitas(keywordsStr))
      .replace("{{CUERPO_DOCUMENTO}}", cuerpoDocumentoFinal);

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
