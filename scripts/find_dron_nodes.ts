import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

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

async function find4734() {
  const projectId = "63e3aa2f-0eec-4628-a1c3-0380d3922025";
  const { data: nodos } = await supabase
    .from("grafo_nodos")
    .select("id, tipo, iteracion, preguntas_pendientes")
    .eq("project_id", projectId);

  console.log(`Nodos en grafo_nodos para piña: ${nodos?.length}`);
  for (const n of nodos ?? []) {
    const preguntas = n.preguntas_pendientes ?? [];
    const dron = preguntas.filter((p: string) => typeof p === "string" && p.toLowerCase().includes("dron"));
    if (dron.length > 0) {
      console.log(`Nodo [${n.tipo}] (iteracion ${n.iteracion}, id ${n.id}): ${dron.length} preguntas de dron:`);
      dron.forEach((p: string) => console.log(`   - "${p}"`));
    }
  }
}

find4734();
