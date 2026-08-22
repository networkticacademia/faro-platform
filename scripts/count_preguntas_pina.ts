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

async function inspectPreguntasDB() {
  const projectId = "63e3aa2f-0eec-4628-a1c3-0380d3922025";
  const { data: rows, error } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, estado, texto_pregunta, pregunta_raiz_id, prioridad, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error:", error);
    return;
  }

  // Agrupación tipo SQL: SELECT nodo_tipo, estado, count(*)
  const conteo: Record<string, number> = {};
  for (const r of rows ?? []) {
    const k = `${r.nodo_tipo} | ${r.estado}`;
    conteo[k] = (conteo[k] ?? 0) + 1;
  }

  console.log("=== CONTEO POR NODO_TIPO Y ESTADO ===");
  console.table(
    Object.entries(conteo).map(([k, count]) => {
      const [nodo_tipo, estado] = k.split(" | ");
      return { nodo_tipo, estado, count };
    })
  );

  console.log(`\nTotal filas en preguntas_pendientes: ${rows?.length ?? 0}`);
  
  // Buscar las preguntas relacionadas con dron
  const dronQuestions = (rows ?? []).filter((r) => r.texto_pregunta.toLowerCase().includes("dron"));
  console.log(`\n=== PREGUNTAS SOBRE EL DRON (${dronQuestions.length} encontradas) ===`);
  dronQuestions.forEach((q) => {
    console.log(`- [${q.id}] [${q.nodo_tipo}] (${q.prioridad}) estado='${q.estado}' raiz=${q.pregunta_raiz_id ?? "null"}: "${q.texto_pregunta}"`);
  });
}

inspectPreguntasDB();
