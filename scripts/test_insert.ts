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

async function testDirectInsert() {
  const projectId = "63e3aa2f-0eec-4628-a1c3-0380d3922025";
  const { data: nodo } = await supabase
    .from("grafo_nodos")
    .select("id, tipo")
    .eq("project_id", projectId)
    .limit(1)
    .single();

  console.log("Nodo obtenido para prueba:", nodo);

  const { data, error } = await supabase
    .from("preguntas_pendientes")
    .insert({
      project_id: projectId,
      nodo_id: nodo!.id,
      nodo_tipo: "RUTA",
      texto_pregunta: "¿Disponibilidad de dron multiespectral para muestreo?",
      texto_hash: "test_hash_1",
      prioridad: "P1",
      estado: "abierta",
    })
    .select();

  console.log("Resultado insert:", { data, error });
}

testDirectInsert();
