/**
 * lib/faro/gateSemantico.ts
 *
 * Compone la verificación semántica ya existente (verificadorSemantico.ts,
 * la misma que usa "Verificar convergencia" en TarjetaConvergencia) dentro
 * de la evaluación de un checkpoint del gate — restringida a los pares de
 * MATRIZ_DEPENDENCIA cuyos dos nodos pertenecen al checkpoint. NO es un
 * verificador nuevo: reutiliza construirPromptVerificacionSemantica() y
 * llamarOrquestador() tal cual.
 *
 * Costo: se invoca EXCLUSIVAMENTE bajo demanda — intento de avance de
 * pestaña o botón manual "Revisar ahora" — nunca en segundo plano ni en
 * cada guardado. Ver gate.ts (opts.incluirVerificacionSemantica).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NodoTipo } from "./clasificacionPreguntas";
import {
  MATRIZ_DEPENDENCIA,
  construirPromptVerificacionSemantica,
  type ResultadoCoherenciaPar,
  type HallazgoIncoherencia,
  type ParDependencia,
} from "./verificadorSemantico";
import { resumirNodo, type NodoRequerido } from "./resumenNodos";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";

/**
 * Filtra MATRIZ_DEPENDENCIA a los pares donde AMBOS nodos (origen y
 * destino) pertenecen al conjunto de nodos evaluados por un checkpoint.
 * Para C1 (RUTA, NOVA, OBJETIVOS) esto da exactamente 2 de los 5 pares
 * declarados — RUTA→NOVA y NOVA→OBJETIVOS — confirmado leyendo la matriz
 * completa, no asumido: los otros 3 pares (OBJETIVOS→METODOLOGIA,
 * OBJETIVOS→MARCO_REFERENCIAL, METODOLOGIA→IMPACTOS_DELIMITACION)
 * involucran nodos fuera del alcance de C1.
 */
export function paresRelevantesParaCheckpoint(nodosEvaluados: NodoTipo[]): ParDependencia[] {
  const set = new Set<string>(nodosEvaluados);
  return MATRIZ_DEPENDENCIA.filter((p) => set.has(p.nodoOrigen) && set.has(p.nodoDestino));
}

/**
 * Ejecuta la verificación semántica solo para los pares relevantes de un
 * checkpoint, omitiendo los pares donde algún nodo aún no está confirmado
 * (nada que comparar todavía). Un par que falla al parsear se omite —
 * resultado parcial, no bloquea por error técnico.
 */
export async function evaluarCoherenciaSemanticaCheckpoint(
  supabase: SupabaseClient,
  project_id: string,
  nodosEvaluados: NodoTipo[]
): Promise<ResultadoCoherenciaPar[]> {
  const pares = paresRelevantesParaCheckpoint(nodosEvaluados);
  const resultados: ResultadoCoherenciaPar[] = [];

  for (const par of pares) {
    const [{ data: origenRow }, { data: destinoRow }] = await Promise.all([
      supabase
        .from("grafo_nodos")
        .select("contenido")
        .eq("project_id", project_id)
        .eq("tipo", par.nodoOrigen)
        .eq("confirmado_humano", true)
        .order("iteracion", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("grafo_nodos")
        .select("contenido")
        .eq("project_id", project_id)
        .eq("tipo", par.nodoDestino)
        .eq("confirmado_humano", true)
        .order("iteracion", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!origenRow || !destinoRow) continue; // algún nodo del par aún no confirmado

    const contenidoOrigenResumido = resumirNodo(
      par.nodoOrigen as NodoRequerido,
      origenRow.contenido as Record<string, unknown>
    );
    const contenidoDestinoResumido = resumirNodo(
      par.nodoDestino as NodoRequerido,
      destinoRow.contenido as Record<string, unknown>
    );

    const prompt = construirPromptVerificacionSemantica({
      par,
      contenidoOrigenResumido,
      contenidoDestinoResumido,
    });

    try {
      const respuestaCruda = await llamarOrquestador(prompt);
      const parsed = parsearJsonRespuesta<{
        delta_ij: number;
        hallazgos: HallazgoIncoherencia[];
        resumen: string;
      }>(respuestaCruda);

      resultados.push({
        nodoOrigen: par.nodoOrigen,
        nodoDestino: par.nodoDestino,
        delta_ij: parsed.delta_ij,
        hallazgos: parsed.hallazgos ?? [],
        resumen: parsed.resumen ?? "",
      });
    } catch (e) {
      console.error(`[evaluarCoherenciaSemanticaCheckpoint] error en par ${par.nodoOrigen}->${par.nodoDestino}:`, e);
      continue;
    }
  }

  return resultados;
}

/**
 * Última iteración CONFIRMADA de cada nodo relevante. Se usa dos veces:
 * (1) al calcular fresco, para dejar constancia de qué contenido exacto
 * se comparó; (2) al leer el caché, para detectar si algún nodo se
 * reabrió/regeneró/reconfirmó después de ese cálculo — sin esto, la
 * insignia podría mostrar "todo bien" con contenido que ya cambió.
 */
export async function obtenerIteracionesConfirmadas(
  supabase: SupabaseClient,
  project_id: string,
  nodosEvaluados: NodoTipo[]
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("grafo_nodos")
    .select("tipo, iteracion")
    .eq("project_id", project_id)
    .eq("confirmado_humano", true)
    .in("tipo", nodosEvaluados)
    .order("iteracion", { ascending: false });

  const iteraciones: Record<string, number> = {};
  for (const row of data ?? []) {
    if (!(row.tipo in iteraciones)) iteraciones[row.tipo] = row.iteracion;
  }
  return iteraciones;
}

/** true si ambos snapshots de iteración por nodo son idénticos (mismas claves, mismos valores). */
export function iteracionesCoinciden(a: Record<string, number>, b: Record<string, number>): boolean {
  const clavesA = Object.keys(a);
  const clavesB = Object.keys(b);
  if (clavesA.length !== clavesB.length) return false;
  return clavesA.every((k) => a[k] === b[k]);
}

/**
 * NOTA DE DISEÑO — mapeo a "bloqueante":
 *
 * verificadorSemantico.ts usa una escala de 2 niveles por hallazgo
 * (severidad "critica" | "advertencia"), no un protocolo L1/L2/L3
 * literal. Ese protocolo (ContradiccionDetectada.nivel: "L1"|"L2"|"L3")
 * pertenece a un mecanismo distinto y no-semántico — detectar_contradicciones,
 * función SQL, en mci.ts — sin relación con δᵢⱼ. Aquí se trata severidad
 * "critica" como bloqueante (equivalente a L2/L3) y "advertencia" como no
 * bloqueante (equivalente a L1): es la interpretación más fiel disponible
 * dado el esquema real de este verificador. Ajustar aquí si se define un
 * mapeo distinto.
 */
export function hayContradiccionCritica(pares: ResultadoCoherenciaPar[]): boolean {
  return pares.some((p) => p.hallazgos.some((h) => h.severidad === "critica"));
}
