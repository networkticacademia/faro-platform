import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { humanizarTexto } from "@/lib/faro/humanizador";

function dividirMarkdownEnSecciones(markdown: string): { titulo: string; contenido: string }[] {
  const lineas = markdown.split("\n");
  const secciones: { titulo: string; contenido: string }[] = [];
  let currentTitulo = "Encabezado";
  let currentLines: string[] = [];

  for (const linea of lineas) {
    if (linea.startsWith("## ")) {
      if (currentLines.length > 0) {
        secciones.push({ titulo: currentTitulo, contenido: currentLines.join("\n").trim() });
        currentLines = [];
      }
      currentTitulo = linea.replace(/^##\s+/, "").trim();
      currentLines.push(linea);
    } else {
      currentLines.push(linea);
    }
  }

  if (currentLines.length > 0) {
    secciones.push({ titulo: currentTitulo, contenido: currentLines.join("\n").trim() });
  }

  return secciones.filter((s) => s.contenido.length > 0);
}

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
    const secciones = dividirMarkdownEnSecciones(markdown);

    if (secciones.length === 0) {
      const humanized = await humanizarTexto(markdown);
      return NextResponse.json({ humanized });
    }

    // Process sections in small batches or sequentially to avoid timeout
    const resultadosHumanizados: string[] = [];
    for (const sec of secciones) {
      // Small sections (like titles or keyword lists) don't need heavy humanizing if they are under 100 chars
      if (sec.contenido.trim().length < 100 && !sec.contenido.includes("\n")) {
        resultadosHumanizados.push(sec.contenido);
        continue;
      }

      try {
        const textoHumanizado = await humanizarTexto(sec.contenido);
        resultadosHumanizados.push(textoHumanizado.trim());
      } catch (errSec) {
        console.warn(`Error al humanizar la sección "${sec.titulo}", conservando versión original:`, errSec);
        resultadosHumanizados.push(sec.contenido);
      }
    }

    const humanized = resultadosHumanizados.join("\n\n");
    return NextResponse.json({ humanized });
  } catch (e) {
    return NextResponse.json({ error: `Error al humanizar la propuesta: ${(e as Error).message}` }, { status: 500 });
  }
}

