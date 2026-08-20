import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { obtenerNodoConfirmado } from "@/lib/faro/sintesisFinal";
import type { MetodologiaOutput } from "@/lib/faro/metodologia";
import { RUBRO_PRESUPUESTO_LABEL, FUENTE_PRESUPUESTO_LABEL, totalPresupuestoProyecto, resumenPorRubro, resumenPorFuente } from "@/lib/faro/metodologia";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const project_id = searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("titulo_provisional")
    .eq("id", project_id)
    .single();

  const titulo = project?.titulo_provisional ?? "Proyecto_Investigacion";
  const metodologia = await obtenerNodoConfirmado<MetodologiaOutput>(supabase, project_id, "METODOLOGIA");

  if (!metodologia || !metodologia.plan_por_objetivo) {
    return NextResponse.json({ error: "No hay un presupuesto configurado en el nodo de Metodología para este proyecto." }, { status: 404 });
  }

  const planPorObjetivo = metodologia.plan_por_objetivo;
  const lineas: string[] = [];

  // BOM para UTF-8 en Excel
  lineas.push("\uFEFFPRESUPUESTO CONSOLIDADO DEL PROYECTO DE INVESTIGACIÓN");
  lineas.push(`"Proyecto:","${titulo.replace(/"/g, '""')}"`);
  lineas.push(`"Fecha de Generación:","${new Date().toLocaleDateString("es-CO")}"`);
  lineas.push("");

  // 1. Resumen por Rubros
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

  // 2. Fuentes de Financiación
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

  // 3. Desglose Insumos por Actividades
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
  const filenameClean = titulo.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);

  return new Response(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="presupuesto_${filenameClean}.csv"`,
    },
  });
}
