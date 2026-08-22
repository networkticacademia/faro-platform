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

async function ejecutarPaso0() {
  console.log("=== PASO 0a: Estructura de preguntas_pendientes ===");
  // Consultamos una fila para inspeccionar columnas en JS
  const { data: cols, error: errCols } = await supabase
    .from("preguntas_pendientes")
    .select("*")
    .limit(1);

  if (cols && cols.length > 0) {
    console.log("Columnas existentes en fila:", Object.keys(cols[0]));
  } else {
    console.log("Resultado select *:", { cols, errCols });
  }

  console.log("\n=== PASO 0b: Verificación de constraints y prueba de update ===");
  // Probamos actualizar una fila con estado='agrupada' para ver si el check constraint la admite
  const { data: testRow } = await supabase
    .from("preguntas_pendientes")
    .select("id, estado")
    .limit(1)
    .single();

  if (testRow) {
    const { error: errAgrupada } = await supabase
      .from("preguntas_pendientes")
      .update({ estado: "agrupada" })
      .eq("id", testRow.id);
    console.log("Prueba update estado='agrupada':", errAgrupada ? `FALLÓ (CHECK no incluye 'agrupada'): ${errAgrupada.message}` : "ÉXITO (CHECK incluye 'agrupada')");
    
    // Restaurar estado original
    await supabase.from("preguntas_pendientes").update({ estado: testRow.estado }).eq("id", testRow.id);
  }
}

ejecutarPaso0();
