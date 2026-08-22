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

async function checkDiferidas() {
  const { data: diferidas, error } = await supabase
    .from("preguntas_pendientes")
    .select("id, project_id, nodo_tipo, estado, pregunta_raiz_id, estado_procedencia, texto_pregunta")
    .eq("estado", "diferida");

  console.log("Total filas con estado='diferida':", diferidas?.length ?? 0);
  const conRaiz = (diferidas ?? []).filter((d) => d.pregunta_raiz_id !== null);
  const sinRaiz = (diferidas ?? []).filter((d) => d.pregunta_raiz_id === null);

  console.log(`Con pregunta_raiz_id != null: ${conRaiz.length}`);
  console.log(`Con pregunta_raiz_id == null: ${sinRaiz.length}`);

  console.log("\nDetalle de con pregunta_raiz_id:");
  conRaiz.forEach((r, idx) => {
    console.log(`[${idx + 1}] [${r.nodo_tipo}] raiz=${r.pregunta_raiz_id?.slice(0, 8)} | "${r.texto_pregunta.slice(0, 60)}..."`);
  });

  if (sinRaiz.length > 0) {
    console.log("\nDetalle de sin pregunta_raiz_id (diferimientos manuales/genuinos):");
    sinRaiz.forEach((r, idx) => {
      console.log(`[${idx + 1}] [${r.nodo_tipo}] "${r.texto_pregunta.slice(0, 60)}..."`);
    });
  }
}

checkDiferidas();
