/**
 * lib/faro/exportarPresupuestoExcel.ts
 *
 * Exporta el presupuesto del proyecto a un archivo CSV estructurado con codificación UTF-8 (con BOM)
 * para apertura directa en Microsoft Excel con columnas y acentos perfectos.
 */

import { RUBRO_PRESUPUESTO_LABEL, FUENTE_PRESUPUESTO_LABEL, totalPresupuestoProyecto, resumenPorRubro, resumenPorFuente } from "./metodologia";

export function exportarPresupuestoACSV(planPorObjetivo: any[], tituloProyecto: string): void {
  const lineas: string[] = [];

  // BOM para que Excel detecte UTF-8 correctamente
  lineas.push("\uFEFFPRESUPUESTO CONSOLIDADO DEL PROYECTO DE INVESTIGACIÓN");
  lineas.push(`"Proyecto:","${tituloProyecto.replace(/"/g, '""')}"`);
  lineas.push(`"Fecha de Generación:","${new Date().toLocaleDateString("es-CO")}"`);
  lineas.push("");

  // 1. Resumen General por Rubros
  lineas.push("RESUMEN DE PRESUPUESTO POR RUBROS");
  lineas.push('"Código Rubro","Nombre Rubro","Total Presupuestado (COP)"');

  const rubros = resumenPorRubro(planPorObjetivo);
  Object.keys(RUBRO_PRESUPUESTO_LABEL).forEach((key) => {
    const label = RUBRO_PRESUPUESTO_LABEL[key as keyof typeof RUBRO_PRESUPUESTO_LABEL];
    const valor = rubros[key as keyof typeof rubros] ?? 0;
    if (valor > 0) {
      lineas.push(`"${key}","${label}",${valor}`);
    }
  });

  const totalGen = totalPresupuestoProyecto(planPorObjetivo);
  lineas.push(`"TOTAL","TOTAL PRESUPUESTO PROYECTO",${totalGen}`);
  lineas.push("");

  // 2. Fuentes de Cofinanciación
  lineas.push("FUENTES DE FINANCIACIÓN Y COFINANCIACIÓN");
  lineas.push('"Código Fuente","Fuente de Financiación","Total Aporte (COP)"');

  const fuentes = resumenPorFuente(planPorObjetivo);
  Object.keys(FUENTE_PRESUPUESTO_LABEL).forEach((key) => {
    const label = FUENTE_PRESUPUESTO_LABEL[key as keyof typeof FUENTE_PRESUPUESTO_LABEL];
    const valor = fuentes[key as keyof typeof fuentes] ?? 0;
    if (valor > 0) {
      lineas.push(`"${key}","${label}",${valor}`);
    }
  });
  lineas.push("");

  // 3. Desglose Detallado por Objetivos y Productos
  lineas.push("DESGLOSE DETALLADO DE INSUMOS POR ACTIVIDAD");
  lineas.push('"Objetivo Específico","Producto Esperado","Actividad","Descripción Insumo","Rubro","Fuente","Costo Unitario","Cantidad","Total Insumo (COP)"');

  (planPorObjetivo ?? []).forEach((po: any) => {
    const objNom = (po.objetivo_especifico ?? "").replace(/"/g, '""');
    (po.productos ?? []).forEach((prod: any) => {
      const prodNom = (prod.nombre_producto ?? "").replace(/"/g, '""');
      (prod.actividades ?? []).forEach((act: any) => {
        const actNom = (act.actividad ?? "").replace(/"/g, '""');
        (act.insumos ?? []).forEach((ins: any) => {
          const descIns = (ins.descripcion ?? "").replace(/"/g, '""');
          const rubroLbl = RUBRO_PRESUPUESTO_LABEL[ins.rubro as keyof typeof RUBRO_PRESUPUESTO_LABEL] ?? ins.rubro;
          const fuenteLbl = FUENTE_PRESUPUESTO_LABEL[ins.fuente as keyof typeof FUENTE_PRESUPUESTO_LABEL] ?? ins.fuente;
          const totalInsumo = (ins.costo_unitario ?? 0) * (ins.cantidad ?? 1);

          lineas.push(
            `"${objNom}","${prodNom}","${actNom}","${descIns}","${rubroLbl}","${fuenteLbl}",${ins.costo_unitario ?? 0},${ins.cantidad ?? 1},${totalInsumo}`
          );
        });
      });
    });
  });

  const csvContent = lineas.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const filenameClean = tituloProyecto.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
  link.setAttribute("href", url);
  link.setAttribute("download", `presupuesto_${filenameClean}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
