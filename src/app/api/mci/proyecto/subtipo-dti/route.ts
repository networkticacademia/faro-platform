// ============================================================
// FARO — PATCH /api/mci/proyecto/subtipo-dti
// Guarda subtipo_dti — NUNCA toca tau. Valida que el proyecto
// realmente tenga tau='dti' antes de aceptar el subtipo (si no,
// el subtipo no tiene sentido y se rechaza).
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OPCIONES_SUBTIPO_DTI } from "@/lib/faro/tipologiaProyecto";

const VALORES_VALIDOS = OPCIONES_SUBTIPO_DTI.map((o) => o.valor);

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { project_id, subtipo_dti } = body ?? {};

  if (!project_id || !subtipo_dti) {
    return NextResponse.json(
      { error: "project_id y subtipo_dti son obligatorios" },
      { status: 400 }
    );
  }

  if (!VALORES_VALIDOS.includes(subtipo_dti)) {
    return NextResponse.json(
      { error: `Valor no reconocido: "${subtipo_dti}"` },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: proyecto, error: errorLectura } = await supabase
    .from("projects")
    .select("tau")
    .eq("id", project_id)
    .single();

  if (errorLectura || !proyecto) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  if (proyecto.tau !== "dti") {
    return NextResponse.json(
      { error: `subtipo_dti solo aplica a proyectos con tau='dti' (este proyecto tiene tau='${proyecto.tau}')` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("projects")
    .update({ subtipo_dti })
    .eq("id", project_id);

  if (error) {
    console.error("[proyecto/subtipo-dti] Error actualizando:", error);
    return NextResponse.json({ error: "Error al guardar la clasificación" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, subtipo_dti });
}
