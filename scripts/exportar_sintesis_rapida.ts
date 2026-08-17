/**
 * scripts/exportar_sintesis_rapida.ts
 *
 * Exportación rápida: corre generarIntroduccion() + generarResumen()
 * (lib/faro/sintesisFinal.ts, ya probadas en la sesión) y ensambla un .md
 * con las dos secciones. Deja explícito qué iteración CONFIRMADA de cada
 * nodo fuente se usó — importante cuando hay iteraciones más recientes sin
 * confirmar que NO quedan reflejadas (fail-open deliberado del módulo:
 * usa la última confirmada, no la última a secas).
 *
 * Uso: npx tsx scripts/exportar_sintesis_rapida.ts <project_id>
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { generarIntroduccion, generarResumen } from "../src/lib/faro/sintesisFinal";

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

const NODOS_FUENTE = ["RUTA", "NOVA", "OBJETIVOS", "METODOLOGIA", "IMPACTOS_DELIMITACION"] as const;

async function reporteIteraciones(project_id: string) {
  const filas: string[] = [];
  for (const tipo of NODOS_FUENTE) {
    const { data: ultima } = await supabase
      .from("grafo_nodos")
      .select("iteracion")
      .eq("project_id", project_id)
      .eq("tipo", tipo)
      .order("iteracion", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: ultimaConfirmada } = await supabase
      .from("grafo_nodos")
      .select("iteracion")
      .eq("project_id", project_id)
      .eq("tipo", tipo)
      .eq("confirmado_humano", true)
      .order("iteracion", { ascending: false })
      .limit(1)
      .maybeSingle();
    const desfasado = ultima?.iteracion != null && ultimaConfirmada?.iteracion != null && ultima.iteracion !== ultimaConfirmada.iteracion;
    filas.push(
      `- **${tipo}**: usó iteración confirmada **${ultimaConfirmada?.iteracion ?? "NINGUNA"}**` +
        (desfasado ? ` ⚠️ hay una iteración ${ultima!.iteracion} más reciente SIN confirmar, no reflejada aquí` : "")
    );
  }
  return filas.join("\n");
}

async function main() {
  const project_id = process.argv[2];
  if (!project_id) {
    console.error("Uso: npx tsx scripts/exportar_sintesis_rapida.ts <project_id>");
    process.exit(1);
  }

  const { data: project } = await supabase
    .from("projects")
    .select("titulo_provisional")
    .eq("id", project_id)
    .maybeSingle();

  console.log(`Generando Introducción para proyecto ${project_id}...`);
  const introduccion = await generarIntroduccion(supabase, project_id);

  console.log("Generando Resumen...");
  const resumen = await generarResumen(supabase, project_id);

  const iteraciones = await reporteIteraciones(project_id);

  const fecha = new Date().toISOString().slice(0, 16).replace("T", " ");
  const md = `# Síntesis Final — ${project?.titulo_provisional ?? "(sin título provisional)"}

Generado: ${fecha} UTC · Fase 1 de exportación (Introducción + Resumen)

${introduccion.provisional ? `> ⚠️ **Provisional** — ${introduccion.motivo_provisional}` : "> ✅ Convergencia verificada, no provisional."}

## Nodos fuente usados (por iteración CONFIRMADA)

${iteraciones}

---

## Introducción

${introduccion.texto}

---

## Resumen

${resumen.texto}
`;

  const outDir = resolve(process.cwd(), "_exports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `sintesis_final_${project_id}.md`);
  writeFileSync(outPath, md, "utf-8");

  console.log(`\nListo: ${outPath}`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
