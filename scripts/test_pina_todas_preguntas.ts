import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { reagruparPreguntasAbiertas } from "../src/lib/faro/agrupamiento";
import type { NodoTipo } from "../src/lib/faro/clasificacionPreguntas";
import { hashTexto } from "../src/lib/faro/preguntas";

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function mapearTipo(tipo: string): NodoTipo {
  if (tipo === "IMPACTOS_DELIMITACION") return "IMPACTOS";
  return tipo as NodoTipo;
}

async function cargarPreguntasRealesPina() {
  const projectId = "63e3aa2f-0eec-4628-a1c3-0380d3922025";
  console.log(`\n=== Poblando todas las preguntas históricas del proyecto piña (${projectId}) ===\n`);

  await supabase.from("preguntas_pendientes").delete().eq("project_id", projectId);

  const { data: nodos } = await supabase
    .from("grafo_nodos")
    .select("id, tipo, iteracion, preguntas_pendientes")
    .eq("project_id", projectId)
    .order("iteracion", { ascending: true });

  const filasAInsertar: any[] = [];
  const hashesVistos = new Set<string>();

  for (const n of nodos ?? []) {
    const preguntas = n.preguntas_pendientes ?? [];
    const nodoTipo = mapearTipo(n.tipo);
    for (const p of preguntas) {
      if (typeof p !== "string" || !p.trim()) continue;
      const h = hashTexto(p);
      if (hashesVistos.has(h)) continue;
      hashesVistos.add(h);

      filasAInsertar.push({
        project_id: projectId,
        nodo_id: n.id,
        nodo_tipo: nodoTipo,
        texto_pregunta: p.trim(),
        texto_hash: h,
        prioridad: p.includes("CRÍTICA") || p.includes("dron") || p.includes("DRON") ? "P1" : "P2",
        estado: "abierta",
      });
    }
  }

  console.log(`Insertando ${filasAInsertar.length} preguntas únicas en preguntas_pendientes...`);
  const { error } = await supabase.from("preguntas_pendientes").insert(filasAInsertar);
  if (error) console.error("Error insertando:", error);

  // Conteo previo
  const { data: antes } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, texto_pregunta, prioridad")
    .eq("project_id", projectId);

  console.log(`\nTotal preguntas abiertas antes de agrupar: ${antes?.length}`);

  const dronAntes = (antes ?? []).filter((q) => q.texto_pregunta.toLowerCase().includes("dron"));
  console.log(`\nPreguntas específicas de DRON encontradas (${dronAntes.length}):`);
  dronAntes.forEach((d) => console.log(` - [${d.id.slice(0, 8)}] [${d.nodo_tipo}] "${d.texto_pregunta}"`));

  console.log("\n>>> Ejecutando reagruparPreguntasAbiertas() con DeepSeek...");
  const res = await reagruparPreguntasAbiertas(supabase, projectId);
  console.log(`Clústeres creados: ${res.gruposCreados}`);

  // Consulta posterior
  const { data: todas } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, texto_pregunta, prioridad, estado, pregunta_raiz_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const representantes = (todas ?? []).filter((p) => p.estado === "abierta" && !p.pregunta_raiz_id);
  const agrupadas = (todas ?? []).filter((p) => p.estado === "agrupada" || p.estado === "diferida" || Boolean(p.pregunta_raiz_id));

  console.log(`\n================ RESULTADOS FINALES ================`);
  console.log(`Total preguntas en BD: ${todas?.length}`);
  console.log(`Preguntas representantes visibles (Dashboard): ${representantes.length}`);
  console.log(`Preguntas secundarias colapsadas: ${agrupadas.length}\n`);

  console.log("=== REPRESENTANTES VISIBLES Y SUS AGRUPACIONES ===");
  representantes.forEach((p, idx) => {
    const hijas = (todas ?? []).filter((h) => h.pregunta_raiz_id === p.id && h.id !== p.id);
    const nodos = Array.from(new Set([p.nodo_tipo, ...hijas.map((h) => h.nodo_tipo)]));
    console.log(`\n⭐ [${idx + 1}] [${p.nodo_tipo}] (${p.prioridad}) "${p.texto_pregunta}"`);
    if (hijas.length > 0) {
      console.log(`   ↳ agrupa ${hijas.length + 1} preguntas de: ${nodos.join(", ")}`);
      hijas.forEach((h) => {
        console.log(`      - [${h.nodo_tipo}] "${h.texto_pregunta}" (id: ${h.id.slice(0, 8)})`);
      });
    }
  });
}

cargarPreguntasRealesPina().catch(console.error);
