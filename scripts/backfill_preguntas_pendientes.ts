/**
 * scripts/backfill_preguntas_pendientes.ts
 *
 * Corrida ÚNICA, manual, DESPUÉS de aplicar la migración 0018
 * y ANTES de conectar sincronizarPreguntasPendientes() a los 6
 * endpoints /generar.
 *
 * Recorre TODOS los grafo_nodos existentes y sincroniza sus preguntas.
 *
 * Ejecutar con: npx tsx scripts/backfill_preguntas_pendientes.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { sincronizarPreguntasPendientes } from "../src/lib/faro/preguntas";
import type { NodoTipo } from "../src/lib/faro/clasificacionPreguntas";

// Cargar .env.local de forma nativa si no están en process.env
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function mapearTipoNodo(tipoReal: string): NodoTipo | null {
  const mapa: Record<string, NodoTipo> = {
    ruta: "RUTA",
    nova: "NOVA",
    objetivos: "OBJETIVOS",
    metodologia: "METODOLOGIA",
    marco_referencial: "MARCO_REFERENCIAL",
    impactos: "IMPACTOS",
    impactos_delimitacion: "IMPACTOS",
  };
  return mapa[tipoReal.toLowerCase()] ?? null;
}

async function main() {
  const { data: nodos, error } = await supabase
    .from("grafo_nodos")
    .select("id, project_id, tipo, contenido");

  if (error) {
    console.error("Error leyendo grafo_nodos:", error.message);
    process.exit(1);
  }

  console.log(`Nodos encontrados: ${nodos?.length ?? 0}`);

  let totalInsertadas = 0;
  for (const nodo of nodos ?? []) {
    const nodoTipo = mapearTipoNodo(nodo.tipo);
    if (!nodoTipo) {
      console.warn(`Nodo ${nodo.id} con tipo desconocido "${nodo.tipo}" — omitido.`);
      continue;
    }

    const resultado = await sincronizarPreguntasPendientes(supabase, {
      project_id: nodo.project_id,
      nodo_id: nodo.id,
      nodo_tipo: nodoTipo,
      contenido: nodo.contenido,
    });

    totalInsertadas += resultado.insertadas;
    console.log(
      `Nodo ${nodo.id} (${nodoTipo}): ${resultado.insertadas} insertadas, ${resultado.omitidas_duplicadas} omitidas.`
    );
  }

  console.log(`\nTotal preguntas sincronizadas: ${totalInsertadas}`);
}

main();
