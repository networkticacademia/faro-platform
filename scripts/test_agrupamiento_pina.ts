import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { reagruparPreguntasAbiertas } from "../src/lib/faro/agrupamiento";

// Cargar .env.local de forma nativa
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
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

async function correrAgrupamientoPina() {
  const projectId = "63e3aa2f-0eec-4628-a1c3-0380d3922025";
  console.log(`\n=== Evaluando proyecto piña: ${projectId} ===\n`);

  // 1. Estado inicial
  const { data: iniciales } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, texto_pregunta, estado, prioridad, agrupada_en, pregunta_raiz_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  console.log(`Total preguntas registradas en BD: ${iniciales?.length ?? 0}`);
  const abiertasIniciales = (iniciales ?? []).filter((p) => p.estado === "abierta");
  console.log(`Preguntas con estado='abierta' antes de agrupar: ${abiertasIniciales.length}`);
  abiertasIniciales.forEach((p, idx) => {
    console.log(`  [${idx + 1}] [${p.nodo_tipo}] (${p.prioridad}) (ID: ${p.id.slice(0, 8)}...): "${p.texto_pregunta}"`);
  });

  console.log("\n>>> Ejecutando reagruparPreguntasAbiertas() con modelo ligero...");
  const resultado = await reagruparPreguntasAbiertas(supabase, projectId);
  console.log(`Grupos/clústeres detectados y creados: ${resultado.gruposCreados}`);

  // 2. Estado tras agrupamiento
  const { data: posteriores } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, texto_pregunta, estado, prioridad, agrupada_en, pregunta_raiz_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const visibles = (posteriores ?? []).filter((p) => p.estado === "abierta");
  const agrupadas = (posteriores ?? []).filter((p) => p.estado === "agrupada");

  console.log(`\n=== RESULTADO FINAL TRAS AGRUPAMIENTO SEMÁNTICO ===`);
  console.log(`Preguntas visibles (representantes abiertas): ${visibles.length}`);
  console.log(`Preguntas secundarias colapsadas (estado='agrupada'): ${agrupadas.length}`);

  console.log("\nLista de preguntas visibles en el Dashboard / Preguntas Pendientes:");
  visibles.forEach((p, idx) => {
    const hijos = (posteriores ?? []).filter((h) => h.agrupada_en === p.id || h.pregunta_raiz_id === p.id);
    const nodos = Array.from(new Set([p.nodo_tipo, ...hijos.map((h) => h.nodo_tipo)]));
    console.log(`\n  ⭐ [${idx + 1}] [${p.nodo_tipo}] (${p.prioridad}) "${p.texto_pregunta}"`);
    if (hijos.length > 0) {
      console.log(`     ↳ agrupa ${hijos.length + 1} preguntas de: ${nodos.join(", ")}`);
      hijos.forEach((h) => {
        console.log(`        - [${h.nodo_tipo}] "${h.texto_pregunta}" (ID: ${h.id.slice(0, 8)}...)`);
      });
    }
  });
}

correrAgrupamientoPina().catch(console.error);
