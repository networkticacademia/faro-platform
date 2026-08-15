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
import { sincronizarPreguntasPendientes } from "../src/lib/faro/preguntas";
import type { NodoTipo } from "../src/lib/faro/clasificacionPreguntas";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Error: Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
