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

async function checkProjects() {
  const { data: projects } = await supabase
    .from("projects")
    .select("id, titulo_provisional, created_at");
  console.log("Proyectos en BD:", projects);

  const { data: nodos } = await supabase
    .from("grafo_nodos")
    .select("id, project_id, tipo, iteracion, preguntas_pendientes")
    .limit(10);
  console.log("Muestra de nodos en BD:", nodos);
}

checkProjects();
