import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { descomponerPregunta } from "../src/lib/faro/arbolPreguntas";

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

async function ejecutarPaso6() {
  const projectId = "63e3aa2f-0eec-4628-a1c3-0380d3922025";
  console.log(`\n=== PASO 6: Descomposición en árbol de las 9 preguntas reales de piña ===\n`);

  // Consultar las 9 preguntas representantes abiertas
  const { data: todas } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, texto_pregunta, prioridad, estado, pregunta_raiz_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const representantes = (todas ?? []).filter((p) => p.estado === "abierta" && !p.pregunta_raiz_id);
  console.log(`Total representantes abiertas encontradas: ${representantes.length}\n`);

  for (let i = 0; i < representantes.length; i++) {
    const p = representantes[i];
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`[Pregunta ${i + 1}] [${p.nodo_tipo}] (${p.prioridad})`);
    console.log(`Texto Original: "${p.texto_pregunta}"\n`);

    const resultado = await descomponerPregunta(p.texto_pregunta, p.prioridad as any);

    if (resultado.es_compuesta) {
      console.log(`🏷️ Clasificación: REGLA 3 — ÁRBOL CONDICIONAL (Primaria + Dependientes)`);
      console.log(`  ⭐ Primaria (${resultado.primaria.prioridad}): "${resultado.primaria.texto}"`);
      resultado.dependientes.forEach((dep, dIdx) => {
        console.log(`     ↳ Dependiente ${dIdx + 1} (${dep.prioridad}): "${dep.texto}"`);
        console.log(`        [Condición de activación]: "${dep.condicion_activacion}"`);
      });
    } else if (resultado.primarias_independientes && resultado.primarias_independientes.length > 1) {
      console.log(`🏷️ Clasificación: REGLA 2 — DATOS INDEPENDIENTES (Separar en ${resultado.primarias_independientes.length} primarias distintas)`);
      resultado.primarias_independientes.forEach((prim, pIdx) => {
        console.log(`  ⭐ Primaria Separada ${pIdx + 1} (${prim.prioridad}): "${prim.texto}"`);
      });
    } else {
      console.log(`🏷️ Clasificación: ATÓMICA (Un solo dato/hecho, sin cambio)`);
      console.log(`  ⭐ Primaria (${resultado.primaria.prioridad}): "${resultado.primaria.texto}"`);
    }
    console.log("");
  }
}

ejecutarPaso6().catch(console.error);
