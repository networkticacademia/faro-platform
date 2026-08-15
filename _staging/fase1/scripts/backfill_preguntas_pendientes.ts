/**
 * scripts/backfill_preguntas_pendientes.ts
 *
 * Corrida ÚNICA, manual, por Antigravity, DESPUÉS de aplicar la migración
 * 0013 y ANTES de conectar sincronizarPreguntasPendientes() a los 6
 * endpoints /generar (para no duplicar con las preguntas que ya se
 * sincronizarán en vivo a partir de ese punto).
 *
 * Recorre TODOS los grafo_nodos existentes (no solo el proyecto piña,
 * por si hay otros proyectos de prueba) y sincroniza sus preguntas.
 *
 * VERIFICACIÓN OBLIGATORIA (evidencia cruda, no confirmación genérica):
 *   Antes:  select count(*) from grafo_nodos;
 *   Después: select nodo_tipo, count(*) from preguntas_pendientes group by nodo_tipo;
 *   Y contrastar el total contra las 37 preguntas conocidas del proyecto piña
 *   (6 en RUTA, 3 en NOVA, resto distribuido en los demás nodos).
 *
 * Ejecutar con: npx tsx scripts/backfill_preguntas_pendientes.ts
 * (o el runner de scripts que ya use el repo — confirmar con Antigravity).
 */

import { createClient } from "@supabase/supabase-js";
import { sincronizarPreguntasPendientes } from "../lib/faro/preguntas";
import type { NodoTipo } from "../lib/faro/clasificacionPreguntas";

// IMPORTANTE: usar service role key para este script (bypass RLS), NUNCA
// exponerlo fuera de este contexto de ejecución manual.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Mapear el valor real de la columna que distingue el tipo de nodo en
// grafo_nodos (ej. "tipo", "nodo_tipo", "kind") al NodoTipo esperado aquí.
// AJUSTAR según el esquema real — este script no debe correr sin confirmar
// primero el nombre real de esa columna.
function mapearTipoNodo(tipoReal: string): NodoTipo | null {
  const mapa: Record<string, NodoTipo> = {
    ruta: "RUTA",
    nova: "NOVA",
    objetivos: "OBJETIVOS",
    metodologia: "METODOLOGIA",
    marco_referencial: "MARCO_REFERENCIAL",
    impactos: "IMPACTOS",
  };
  return mapa[tipoReal.toLowerCase()] ?? null;
}

async function main() {
  const { data: nodos, error } = await supabase
    .from("grafo_nodos")
    .select("id, project_id, tipo, contenido"); // AJUSTAR "tipo" al nombre real de la columna

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
