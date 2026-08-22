import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { sincronizarPreguntasPendientes } from "../src/lib/faro/preguntas";
import { reagruparPreguntasAbiertas } from "../src/lib/faro/agrupamiento";
import type { NodoTipo } from "../src/lib/faro/clasificacionPreguntas";

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

async function run() {
  const projectId = "63e3aa2f-0eec-4628-a1c3-0380d3922025";
  console.log(`\n=== Evaluando proyecto piña: ${projectId} ===\n`);

  // Limpiar prueba anterior
  await supabase.from("preguntas_pendientes").delete().eq("project_id", projectId);

  // 1. Obtener todos los nodos del proyecto ordenados
  const { data: nodos } = await supabase
    .from("grafo_nodos")
    .select("id, project_id, tipo, iteracion, contenido, contenido_origen, contenido_presentacion, preguntas_pendientes")
    .eq("project_id", projectId)
    .order("iteracion", { ascending: false });

  const vistos = new Set<string>();
  const vigentes = (nodos ?? []).filter((n) => {
    if (vistos.has(n.tipo)) return false;
    vistos.add(n.tipo);
    return true;
  });

  console.log(`Nodos vigentes encontrados: ${vigentes.length}`);

  for (const n of vigentes) {
    const nodoTipo = mapearTipo(n.tipo);
    const contenido = n.contenido_origen ?? n.contenido_presentacion ?? n.contenido ?? n.preguntas_pendientes;
    const res = await sincronizarPreguntasPendientes(
      supabase,
      {
        project_id: projectId,
        nodo_id: n.id,
        nodo_tipo: nodoTipo,
        contenido,
        iteracion: 0, // modo génesis para poblar las preguntas declaradas por el modelo en los nodos
      },
      { reagrupar: false }
    );
    console.log(`Nodo [${n.tipo}] (iteración ${n.iteracion}): ${res.insertadas} insertadas, ${res.omitidas_duplicadas} omitidas.`);
  }

  // Si quedaron pocas o ninguna por ser iteraciones altas de regeneración (tope=1), sincronizamos las preguntas_pendientes de nodos clave para tener la muestra real de preguntas del formulador
  const { data: abiertasAntes } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, texto_pregunta, prioridad")
    .eq("project_id", projectId);

  console.log(`\nPreguntas abiertas en BD antes de reagrupar: ${abiertasAntes?.length ?? 0}`);
  (abiertasAntes ?? []).forEach((p, idx) => {
    console.log(`  [${idx + 1}] [${p.nodo_tipo}] (${p.prioridad}) "${p.texto_pregunta}"`);
  });

  // 2. Correr agrupamiento semántico cross-nodo
  console.log("\n>>> Ejecutando reagruparPreguntasAbiertas() con DeepSeek...");
  const resAgrup = await reagruparPreguntasAbiertas(supabase, projectId);
  console.log(`Grupos/clústeres detectados y creados: ${resAgrup.gruposCreados}`);

  // 3. Consultar resultado
  const { data: todas } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, texto_pregunta, prioridad, estado, pregunta_raiz_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const representantes = (todas ?? []).filter((p) => p.estado === "abierta" && !p.pregunta_raiz_id);
  const agrupadas = (todas ?? []).filter((p) => p.estado === "agrupada" || p.estado === "diferida" || Boolean(p.pregunta_raiz_id));

  console.log(`\n================ RESULTADOS FINALES EN PROYECTO PIÑA ================`);
  console.log(`Total preguntas en BD: ${todas?.length ?? 0}`);
  console.log(`Preguntas representantes visibles (Dashboard): ${representantes.length}`);
  console.log(`Preguntas agrupadas/colapsadas (secundarias): ${agrupadas.length}\n`);

  representantes.forEach((p, idx) => {
    const hijas = (todas ?? []).filter((h) => h.pregunta_raiz_id === p.id && h.id !== p.id);
    const nodos = Array.from(new Set([p.nodo_tipo, ...hijas.map((h) => h.nodo_tipo)]));
    console.log(`⭐ [${idx + 1}] [${p.nodo_tipo}] (${p.prioridad}) "${p.texto_pregunta}"`);
    if (hijas.length > 0) {
      console.log(`   ↳ agrupa ${hijas.length + 1} preguntas de: ${nodos.join(", ")}`);
      hijas.forEach((h) => {
        console.log(`      - [${h.nodo_tipo}] "${h.texto_pregunta}"`);
      });
    }
  });
}

run().catch(console.error);
