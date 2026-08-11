import type { NovaOutput } from "./nova";
import type { ObjetivosOutput } from "./objetivos";
import type { MetodologiaOutput } from "./metodologia";

export type SeveridadBrecha = "critica" | "advertencia";

export interface BrechaTrazabilidad {
  severidad: SeveridadBrecha;
  origen: "OBJETIVOS" | "METODOLOGIA";
  campo: string; // ej. "objetivos_especificos[2].causa_id"
  id_referenciado: string;
  mensaje: string;
}

/**
 * Verificador estructural del hilo conductor — determinístico, sin LLM.
 * Recorre las referencias por ID que declaran Objetivos (hacia NOVA) y
 * Metodología (hacia Objetivos), y confirma que cada ID referenciado
 * exista realmente en el nodo de origen. No juzga si la referencia tiene
 * sentido semántico (eso es trabajo de SIGMA Guard, pendiente) — solo
 * confirma que la referencia resuelve o no. Mismo principio que una FK
 * de base de datos: integridad referencial, nada más.
 */
export function verificarHiloConductor(params: {
  nova: NovaOutput | null;
  objetivos: ObjetivosOutput | null;
  metodologia: MetodologiaOutput | null;
}): BrechaTrazabilidad[] {
  const { nova, objetivos, metodologia } = params;
  const brechas: BrechaTrazabilidad[] = [];

  // 1. Objetivos → NOVA: cada causa_id debe existir en nucleo_causas_estructuradas
  if (objetivos && nova) {
    const idsCausasValidos = new Set(nova.nucleo_causas_estructuradas.map((c) => c.id));
    objetivos.objetivos_especificos.forEach((oe, i) => {
      if (oe.causa_id === null) return; // null es válido (objetivo transversal)
      if (!oe.causa_id) {
        brechas.push({
          severidad: "advertencia",
          origen: "OBJETIVOS",
          campo: `objetivos_especificos[${i}].causa_id`,
          id_referenciado: "(vacío)",
          mensaje: `El objetivo específico "${oe.texto.slice(0, 60)}..." no declaró causa_id ni lo marcó explícitamente como null — revisar si de verdad es transversal.`,
        });
      } else if (!idsCausasValidos.has(oe.causa_id)) {
        brechas.push({
          severidad: "critica",
          origen: "OBJETIVOS",
          campo: `objetivos_especificos[${i}].causa_id`,
          id_referenciado: oe.causa_id,
          mensaje: `El objetivo específico "${oe.texto.slice(0, 60)}..." referencia la causa "${oe.causa_id}", que no existe en el árbol de NOVA. El respaldo por texto (causa_asociada) puede estar ocultando esta ruptura.`,
        });
      }
    });
  }

  // 2. Metodología → Objetivos: cada objetivo_id debe existir en objetivos_especificos
  if (metodologia && objetivos) {
    const idsObjetivosValidos = new Set(objetivos.objetivos_especificos.map((oe) => oe.id));
    metodologia.plan_por_objetivo.forEach((plan, i) => {
      if (!plan.objetivo_id) {
        brechas.push({
          severidad: "advertencia",
          origen: "METODOLOGIA",
          campo: `plan_por_objetivo[${i}].objetivo_id`,
          id_referenciado: "(vacío)",
          mensaje: `El plan de actividades para "${plan.objetivo_especifico.slice(0, 60)}..." no trae objetivo_id — probablemente un nodo generado antes de la arquitectura de IDs (2026-08-10). El respaldo por texto sigue activo, pero conviene regenerar.`,
        });
      } else if (!idsObjetivosValidos.has(plan.objetivo_id)) {
        brechas.push({
          severidad: "critica",
          origen: "METODOLOGIA",
          campo: `plan_por_objetivo[${i}].objetivo_id`,
          id_referenciado: plan.objetivo_id,
          mensaje: `El plan de actividades para "${plan.objetivo_especifico.slice(0, 60)}..." referencia el objetivo "${plan.objetivo_id}", que no existe en Objetivos.`,
        });
      }
    });

    // 3. Metodología → Objetivos: cada variable_id debe existir en variables o categorias_analisis
    const idsVariablesValidos = new Set([
      ...objetivos.variables.map((v) => v.id),
      ...objetivos.categorias_analisis.map((c) => c.id),
    ]);
    metodologia.tecnicas_instrumentos.forEach((t, i) => {
      if (t.variable_id === null) return;
      if (!t.variable_id) {
        brechas.push({
          severidad: "advertencia",
          origen: "METODOLOGIA",
          campo: `tecnicas_instrumentos[${i}].variable_id`,
          id_referenciado: "(vacío)",
          mensaje: `La técnica "${t.tecnica}" no declaró variable_id — probablemente un nodo generado antes de la arquitectura de IDs.`,
        });
      } else if (!idsVariablesValidos.has(t.variable_id)) {
        brechas.push({
          severidad: "critica",
          origen: "METODOLOGIA",
          campo: `tecnicas_instrumentos[${i}].variable_id`,
          id_referenciado: t.variable_id,
          mensaje: `La técnica "${t.tecnica}" referencia la variable/categoría "${t.variable_id}", que no existe en Objetivos.`,
        });
      }
    });
  }

  return brechas;
}

export function resumenBrechas(brechas: BrechaTrazabilidad[]): {
  total: number;
  criticas: number;
  advertencias: number;
} {
  return {
    total: brechas.length,
    criticas: brechas.filter((b) => b.severidad === "critica").length,
    advertencias: brechas.filter((b) => b.severidad === "advertencia").length,
  };
}
