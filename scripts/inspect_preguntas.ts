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

async function inspectAllPreguntas() {
  const projectId = "63e3aa2f-0eec-4628-a1c3-0380d3922025";
  const { data: todas } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, texto_pregunta, prioridad, estado, agrupada_en, pregunta_raiz_id, created_at")
    .eq("project_id", projectId);

  console.log(`Total registros en preguntas_pendientes para piña: ${todas?.length ?? 0}`);
  (todas ?? []).forEach((p, idx) => {
    console.log(`[${idx + 1}] estado=${p.estado} | ${p.nodo_tipo} | (${p.prioridad}) | agrupada_en=${p.agrupada_en ?? "null"} | id=${p.id} | "${p.texto_pregunta}"`);
  });
}

inspectAllPreguntas();
