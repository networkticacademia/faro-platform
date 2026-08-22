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

async function testUpdateAgrupada() {
  const projectId = "63e3aa2f-0eec-4628-a1c3-0380d3922025";
  const { data: q } = await supabase.from("preguntas_pendientes").select("id").limit(1).single();
  console.log("Fila para test update:", q);
  if (q) {
    const res = await supabase.from("preguntas_pendientes").update({ estado: "agrupada" }).eq("id", q.id).select();
    console.log("Resultado update estado='agrupada':", res);
  }
}

testUpdateAgrupada();
