/**
 * lib/faro/resumenNodos.ts
 *
 * Extraído de app/api/mci/convergencia/calcular/route.ts para poder
 * reutilizarlo desde la verificación semántica del gate (checkpoint C1),
 * sin duplicar la lógica de resumen por tipo de nodo.
 *
 * Principio: mandar al verificador semántico solo los campos que necesita
 * para evaluar la relación entre dos nodos — no el JSON completo.
 */

import type { RutaOutput } from "./ruta";
import type { NovaOutput } from "./nova";
import type { ObjetivosOutput } from "./objetivos";
import type { MetodologiaOutput } from "./metodologia";
import type { MarcoReferencialOutput } from "./marcoReferencial";
import type { ImpactosDelimitacionOutput } from "./impactosDelimitacion";

export const NODOS_REQUERIDOS = [
  "RUTA",
  "NOVA",
  "OBJETIVOS",
  "METODOLOGIA",
  "MARCO_REFERENCIAL",
  "IMPACTOS_DELIMITACION",
] as const;

export type NodoRequerido = typeof NODOS_REQUERIDOS[number];

function resumirRuta(c: RutaOutput): string {
  return [
    `Problema central: ${c.problema}`,
    `Objeto de estudio: ${c.objeto_estudio}`,
    `Población/contexto: ${c.poblacion_contexto}`,
    `Alcance espacial: ${c.alcance_espacial}`,
    `Alcance temporal: ${c.alcance_temporal}`,
  ].join("\n");
}

function resumirNova(c: NovaOutput): string {
  const causas = (c.nucleo_causas_estructuradas ?? [])
    .map((ca) => `${ca.id} [${ca.tipo}]: ${ca.texto}`)
    .join("\n");
  return [
    `Problema formulado: ${c.problema_formulado ?? ""}`,
    `Causas estructuradas:\n${causas}`,
  ].join("\n\n");
}

function resumirObjetivos(c: ObjetivosOutput): string {
  const oes = (c.objetivos_especificos ?? [])
    .map((oe) => `${oe.id}: ${oe.texto} (causa_id: ${oe.causa_id ?? "null"}, causa_asociada: ${oe.causa_asociada ?? "null"})`)
    .join("\n");
  const vars = (c.variables ?? [])
    .map((v) => `${v.id} — ${v.nombre} (${v.tipo}, ${v.nivel_medicion}): ${v.definicion_conceptual}`)
    .join("\n");
  const cats = (c.categorias_analisis ?? [])
    .map((cat) => `${cat.id} — ${cat.nombre}: ${cat.definicion}`)
    .join("\n");
  return [
    `Objetivo general: ${c.objetivo_general}`,
    `Objetivos específicos:\n${oes}`,
    vars ? `Variables:\n${vars}` : "",
    cats ? `Categorías de análisis:\n${cats}` : "",
  ].filter(Boolean).join("\n\n");
}

function resumirMetodologia(c: MetodologiaOutput): string {
  const plan = (c.plan_por_objetivo ?? [])
    .map((p) => {
      const productos = (p.productos ?? [])
        .map((prod) => {
          const acts = (prod.actividades ?? []).map((a) => `    - ${a.actividad}`).join("\n");
          return `  Producto: ${prod.nombre_producto}\n${acts}`;
        })
        .join("\n");
      return `${p.objetivo_id} (${p.objetivo_especifico.slice(0, 80)}...):\n${productos}`;
    })
    .join("\n\n");
  const tecnicas = (c.tecnicas_instrumentos ?? [])
    .map((t) => `- ${t.tecnica}: ${t.instrumento}`)
    .join("\n");
  return [
    `Técnicas/instrumentos:\n${tecnicas}`,
    `Plan por objetivo:\n${plan}`,
  ].join("\n\n");
}

function resumirMarcoReferencial(c: MarcoReferencialOutput): string {
  const defs = (c.marco_conceptual?.definiciones ?? [])
    .map((d) => `  ${d.termino} (variable_o_categoria_id: ${d.variable_o_categoria_id ?? "null"}): ${d.definicion}`)
    .join("\n");
  return [
    `Marco teórico — postura: ${c.marco_teorico?.postura_teorica ?? ""}`,
    `Marco teórico — teorías sustantivas: ${(c.marco_teorico?.teorias_sustantivas ?? []).join(", ")}`,
    `Marco conceptual — definiciones:\n${defs || "(ninguna)"}`,
  ].join("\n\n");
}

function resumirImpactosDelimitacion(c: ImpactosDelimitacionOutput): string {
  const impactos = (c.impactos ?? [])
    .map((i) => `- [${i.tipo}] ${i.descripcion}`)
    .join("\n");
  const recursos = (c.recursos ?? [])
    .map((r) => `- [${r.categoria}] ${r.descripcion}`)
    .join("\n");
  const riesgos = (c.riesgos ?? [])
    .map((r) => `- ${r.descripcion} (prob: ${r.probabilidad}, impacto: ${r.impacto})`)
    .join("\n");
  return [
    `Impactos:\n${impactos || "(ninguno)"}`,
    `Recursos:\n${recursos || "(ninguno)"}`,
    `Riesgos:\n${riesgos || "(ninguno)"}`,
  ].join("\n\n");
}

/** Despacha el resumidor correcto según el tipo de nodo. */
export function resumirNodo(tipo: NodoRequerido, contenido: Record<string, unknown>): string {
  switch (tipo) {
    case "RUTA":           return resumirRuta(contenido as unknown as RutaOutput);
    case "NOVA":           return resumirNova(contenido as unknown as NovaOutput);
    case "OBJETIVOS":      return resumirObjetivos(contenido as unknown as ObjetivosOutput);
    case "METODOLOGIA":    return resumirMetodologia(contenido as unknown as MetodologiaOutput);
    case "MARCO_REFERENCIAL": return resumirMarcoReferencial(contenido as unknown as MarcoReferencialOutput);
    case "IMPACTOS_DELIMITACION": return resumirImpactosDelimitacion(contenido as unknown as ImpactosDelimitacionOutput);
  }
}
