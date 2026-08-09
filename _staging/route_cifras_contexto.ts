// ============================================================
// FARO — PATCH /api/mci/proyecto/cifras-contexto
// Guarda el arreglo completo de cifras de contexto estructuradas
// (reemplaza el arreglo completo — el frontend maneja el estado local
// de agregar/quitar filas y manda la lista final).
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const NIVELES_VALIDOS = ["mundial", "continental", "nacional", "regional", "especifico"];

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { project_id, cifras_contexto } = body ?? {};

  if (!project_id || !Array.isArray(cifras_contexto)) {
    return NextResponse.json(
      { error: "project_id y cifras_contexto (arreglo) son obligatorios" },
      { status: 400 }
    );
  }

  for (const c of cifras_contexto) {
    if (!c.nivel || !NIVELES_VALIDOS.includes(c.nivel) || !c.cifra || !c.fuente) {
      return NextResponse.json(
        { error: `Cada cifra requiere nivel (${NIVELES_VALIDOS.join("/")}), cifra y fuente.` },
        { status: 400 }
      );
    }
  }

  // Todo lo que entra por este formulario es aportado manualmente por
  // el formulador — nunca marcamos verificado=true aquí. La única
  // fuente de verificado=true sería un futuro cliente de FAOSTAT/
  // World Bank/DANE (Componente Contexto automatizado, aún no
  // construido). Forzamos el valor para que la UI no pueda mentir
  // sobre el origen del dato.
  const cifrasNormalizadas = cifras_contexto.map((c) => ({
    nivel: c.nivel,
    cifra: c.cifra,
    fuente: c.fuente,
    verificado: false,
  }));

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ cifras_contexto: cifrasNormalizadas })
    .eq("id", project_id);

  if (error) {
    console.error("[proyecto/cifras-contexto] Error actualizando:", error);
    return NextResponse.json({ error: "Error al guardar las cifras" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cifras_contexto: cifrasNormalizadas });
}
