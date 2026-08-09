// ============================================================
// FARO — Medida de "Avance" (A de NOVA) según tipo de proyecto
//
// v2 (2026-08-09) — CORRECCIÓN sobre la versión anterior. La versión
// v1 proponía un árbol de 6 hojas (Ciencia/Tecnología/Innovación) que
// habría entrado en conflicto directo con `tau`, que YA es un campo
// formal con solo 3 valores válidos (basica/aplicada/dti), fijados
// por CHECK en la base de datos y atados a los pesos U0 calibrados
// del instrumento M0 validado (PESOS_U0_POR_TAU en instrumento.ts).
// NO se toca tau. Este archivo solo define la lógica adicional para
// cuando tau='dti', usando el campo NUEVO subtipo_dti (ver migración
// 0015) que no tiene ninguna relación con el cálculo de U0.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import type { TipoProyecto } from "./types";

export type MedidaAvance = "conocimiento" | "trl" | "trl_mercado";

export type SubtipoDti =
  | "desarrollo_tecnologico"
  | "innovacion_producto"
  | "innovacion_proceso"
  | "innovacion_organizacional";

export const OPCIONES_SUBTIPO_DTI: { valor: SubtipoDti; etiqueta: string; medida: MedidaAvance }[] = [
  { valor: "desarrollo_tecnologico", etiqueta: "Desarrollo Tecnológico (prototipo, sistema)", medida: "trl" },
  { valor: "innovacion_producto", etiqueta: "Innovación de Producto", medida: "trl_mercado" },
  { valor: "innovacion_proceso", etiqueta: "Innovación de Proceso", medida: "trl_mercado" },
  { valor: "innovacion_organizacional", etiqueta: "Innovación Organizacional", medida: "trl_mercado" },
];

/**
 * Determina cómo NOVA debe medir "Avance" (A):
 * - basica/aplicada → siempre "conocimiento" (no aplica TRL, ya
 *   calibrado así en el propio instrumento M0 — E4 pregunta por TRL
 *   solo de forma general, no cambia esta regla).
 * - dti → depende de subtipo_dti; si aún no se ha clasificado,
 *   devuelve null y NOVA debe preguntar ANTES de construir Avance.
 */
export function medidaAvanceParaProyecto(
  tau: TipoProyecto,
  subtipoDti: SubtipoDti | null
): MedidaAvance | null {
  if (tau === "basica" || tau === "aplicada") return "conocimiento";
  if (tau === "dti") {
    if (!subtipoDti) return null;
    return OPCIONES_SUBTIPO_DTI.find((o) => o.valor === subtipoDti)?.medida ?? null;
  }
  return null;
}
