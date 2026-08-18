/**
 * scripts/exportar_documento_latex.ts
 *
 * Pieza 1 — Exportación LaTeX + BibTeX (extiende Fase 1/Fase 3,
 * Documento Consolidado). Genera Introducción + Resumen en formato
 * 'latex' (\citep{}/\citet{} con claves reales de corpus_fuentes) y las
 * ensambla sobre plantillas/proyecto_main.tex, junto con el .bib real del
 * proyecto — usando exactamente el mismo algoritmo de claves que ya
 * existe en /api/mci/corpus/exportar-bib (Apellido+Año, auto-desambiguado).
 *
 * Clave de diseño: construirBibliografiaConClaves() se llama UNA sola vez
 * aquí y su resultado (mismo array `entradas`) se pasa a
 * generarIntroduccion() Y generarResumen() — así las claves \citep{} del
 * texto coinciden exactamente con las del .bib, sin depender de que dos
 * llamadas separadas a Crossref produzcan el mismo resultado.
 *
 * Uso: npx tsx scripts/exportar_documento_latex.ts <project_id>
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { generarIntroduccion, generarResumen } from "../src/lib/faro/sintesisFinal";
import { construirBibliografiaConClaves, type FuenteConId } from "../src/lib/faro/corpus/exportarBib";
import { escaparProsaLatexPreservandoCitas } from "../src/lib/faro/latex/escaparProsa";
import { humanizarDocumento } from "../src/lib/faro/humanizadorDocumento";
import { extraerComandosCita } from "../src/lib/faro/latex/citas";

const SIN_HUMANIZADOR = process.argv.includes("--sin-humanizador");

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const project_id = process.argv[2];
  if (!project_id) {
    console.error("Uso: npx tsx scripts/exportar_documento_latex.ts <project_id>");
    process.exit(1);
  }

  const { data: project } = await supabase
    .from("projects")
    .select("titulo_provisional, usuario_id, usuarios_plataforma(nombre_completo)")
    .eq("id", project_id)
    .maybeSingle();

  const titulo = project?.titulo_provisional ?? "(sin título provisional)";
  const autor =
    (project?.usuarios_plataforma as unknown as { nombre_completo: string | null } | null)?.nombre_completo ??
    "(autor sin registrar)";

  console.log("Consultando corpus_fuentes verificado y construyendo claves BibTeX...");
  const { data: fuentesData, error: errFuentes } = await supabase
    .from("corpus_fuentes")
    .select("id, titulo, autores, doi, anio, revista, resumen_hallazgo")
    .eq("project_id", project_id)
    .eq("estado_verificacion", "verificado")
    .order("anio", { ascending: false });

  if (errFuentes) {
    console.error("Error consultando corpus_fuentes:", errFuentes.message);
    process.exit(1);
  }

  const fuentes = (fuentesData ?? []) as FuenteConId[];
  console.log(`  ${fuentes.length} fuente(s) verificada(s) encontradas.`);
  const { bibtex, entradas } = await construirBibliografiaConClaves(fuentes);

  console.log("Generando Introducción (formato latex)...");
  const introduccion = await generarIntroduccion(supabase, project_id, {
    formato: "latex",
    bibliografiaConClaves: entradas,
  });

  console.log("Generando Resumen (formato latex)...");
  const resumen = await generarResumen(supabase, project_id, {
    formato: "latex",
    bibliografiaConClaves: entradas,
  });

  let textoResumenFinal = resumen.texto;
  let textoIntroduccionFinal = introduccion.texto;

  if (!SIN_HUMANIZADOR) {
    console.log("Aplicando Humanizador UNA vez sobre el documento ensamblado (resumen + introducción)...");
    const citasAntesTotal = [
      ...extraerComandosCita(resumen.texto),
      ...extraerComandosCita(introduccion.texto),
    ];
    console.log(`  Comandos \\cite antes de humanizar: ${citasAntesTotal.length} → ${JSON.stringify(citasAntesTotal)}`);

    const resultadoHumanizado = await humanizarDocumento(
      [
        { id: "resumen", texto: resumen.texto },
        { id: "introduccion", texto: introduccion.texto },
      ],
      { formato: "latex" }
    );

    const seccionResumen = resultadoHumanizado.secciones.find((s) => s.id === "resumen");
    const seccionIntroduccion = resultadoHumanizado.secciones.find((s) => s.id === "introduccion");
    if (!seccionResumen || !seccionIntroduccion) {
      throw new Error("El Humanizador no devolvió todas las secciones esperadas.");
    }
    textoResumenFinal = seccionResumen.texto;
    textoIntroduccionFinal = seccionIntroduccion.texto;

    console.log(`  Comandos \\cite después de humanizar: ${resultadoHumanizado.citasDespues.length} → ${JSON.stringify(resultadoHumanizado.citasDespues)}`);
    console.log(`  citasPreservadas=${resultadoHumanizado.citasPreservadas}`);
  } else {
    console.log("(--sin-humanizador: se omite la Fase 4, se exporta el texto tal como lo devolvió sintesisFinal.ts)");
  }

  const plantillaPath = resolve(process.cwd(), "plantillas", "proyecto_main.tex");
  if (!existsSync(plantillaPath)) {
    console.error(`Error: no se encontró la plantilla en ${plantillaPath}`);
    process.exit(1);
  }
  const plantilla = readFileSync(plantillaPath, "utf-8");

  const bibFileName = `proyecto_${project_id}.bib`;

  const tex = plantilla
    .replace("{{BIB_FILE}}", bibFileName)
    .replace("{{TITULO}}", escaparProsaLatexPreservandoCitas(titulo))
    .replace("{{AUTOR}}", escaparProsaLatexPreservandoCitas(autor))
    .replace("{{RESUMEN}}", escaparProsaLatexPreservandoCitas(textoResumenFinal))
    .replace("{{INTRODUCCION}}", escaparProsaLatexPreservandoCitas(textoIntroduccionFinal));

  const outDir = resolve(process.cwd(), "_exports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const texPath = resolve(outDir, `proyecto_main_${project_id}.tex`);
  const bibPath = resolve(outDir, bibFileName);
  writeFileSync(texPath, tex, "utf-8");
  writeFileSync(bibPath, bibtex, "utf-8");

  console.log(`\nListo:\n  ${texPath}\n  ${bibPath}`);
  console.log(
    `\n${introduccion.provisional ? "⚠️  Provisional: " + introduccion.motivo_provisional : "✅ Convergencia verificada, no provisional."}`
  );
  console.log(`Claves BibTeX generadas: ${entradas.map((e) => e.clave).join(", ") || "(ninguna — sin bibliografía verificada)"}`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
