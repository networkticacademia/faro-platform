/**
 * scripts/backfill_preguntas_pendientes.ts (v2 — corregido)
 *
 * Cambios respecto a la v1:
 * 1. Antes tomaba TODAS las versiones históricas de cada nodo
 *    (grafo_nodos conserva una fila por iteración de regeneración).
 *    Ahora usa `distinct on (project_id, tipo) ... order by iteracion desc`
 *    para tomar solo la versión vigente de cada nodo.
 * 2. mapearTipoNodo() ahora incluye 'impactos_delimitacion' → 'IMPACTOS'
 *    (el valor real en BD es 'IMPACTOS_DELIMITACION', no 'IMPACTOS').
 *
 * IMPORTANTE: correr `truncate table preguntas_pendientes;` en Supabase
 * ANTES de correr esta versión — los datos actuales están contaminados
 * por el bug v1 (55 filas de RUTA en vez de 6, etc.) y por el nodo
 * IMPACTOS que faltó por completo.
 */

import { createClient } from "@supabase/supabase-js";
import { sincronizarPreguntasPendientes } from "../lib/faro/preguntas";
import type { NodoTipo } from "../lib/faro/clasificacionPreguntas";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function mapearTipoNodo(tipoReal: string): NodoTipo | null {
  const mapa: Record<string, NodoTipo> = {
    ruta: "RUTA",
    nova: "NOVA",
    objetivos: "OBJETIVOS",
    metodologia: "METODOLOGIA",
    marco_referencial: "MARCO_REFERENCIAL",
    impactos: "IMPACTOS",
    impactos_delimitacion: "IMPACTOS", // valor real confirmado en BD
  };
  return mapa[tipoReal.toLowerCase()] ?? null;
}

async function main() {
  // distinct on: para cada (project_id, tipo), toma solo la fila con
  // mayor `iteracion` — es decir, la versión vigente del nodo.
  const { data: nodos, error } = await supabase
    .from("grafo_nodos")
    .select("id, project_id, tipo, iteracion, contenido")
    .order("project_id", { ascending: true })
    .order("tipo", { ascending: true })
    .order("iteracion", { ascending: false });

  if (error) {
    console.error("Error leyendo grafo_nodos:", error.message);
    process.exit(1);
  }

  // Postgres no permite distinct on vía el cliente JS directamente sobre
  // .select() con este builder, así que se deduplica en memoria: como ya
  // viene ordenado por iteracion desc dentro de cada (project_id, tipo),
  // basta con quedarse con la PRIMERA aparición de cada combinación.
  const vistos = new Set<string>();
  const nodosVigentes = (nodos ?? []).filter((n) => {
    const clave = `${n.project_id}::${n.tipo}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });

  console.log(`Filas totales en grafo_nodos (todas las versiones): ${nodos?.length ?? 0}`);
  console.log(`Nodos vigentes tras deduplicar por última iteración: ${nodosVigentes.length}`);

  let totalInsertadas = 0;
  for (const nodo of nodosVigentes) {
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
      `Nodo ${nodo.id} (${nodoTipo}, iteración vigente): ${resultado.insertadas} insertadas, ${resultado.omitidas_duplicadas} omitidas.`
    );
  }

  console.log(`\nTotal preguntas sincronizadas: ${totalInsertadas}`);
}

main();
