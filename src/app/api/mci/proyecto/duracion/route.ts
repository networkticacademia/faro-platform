import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { project_id, duracion_meses_proyecto } = body ?? {};

  if (!project_id) {
    return NextResponse.json(
      { error: "project_id es obligatorio" },
      { status: 400 }
    );
  }

  // Permite null o un número entero positivo
  if (
    duracion_meses_proyecto !== null &&
    (typeof duracion_meses_proyecto !== "number" ||
      duracion_meses_proyecto <= 0 ||
      !Number.isInteger(duracion_meses_proyecto))
  ) {
    return NextResponse.json(
      { error: "La duración debe ser un número entero positivo o nula" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .update({ duracion_meses_proyecto })
    .eq("id", project_id);

  if (error) {
    console.error("[proyecto/duracion] Error actualizando:", error);
    return NextResponse.json({ error: "Error al guardar la duración del proyecto" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, duracion_meses_proyecto });
}
