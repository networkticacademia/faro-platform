// ============================================================
// FARO — POST /api/mci/rubrica/cargar
// Recibe el texto libre de una rúbrica de evaluación o términos de
// referencia, lo estructura vía LLM (construirPromptExtraccionRubrica)
// y lo guarda en projects.rubrica_evaluacion. No verifica cobertura
// todavía — eso es la siguiente pieza, pendiente.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import {
  construirPromptExtraccionRubrica,
  asignarIdsRubrica,
  type RubricaProyecto,
} from "@/lib/faro/rubrica";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id, texto_rubrica } = body;
  if (!project_id || !texto_rubrica) {
    return NextResponse.json({ error: "Falta project_id o texto_rubrica." }, { status: 400 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
  }

  const prompt = construirPromptExtraccionRubrica({
    textoRubrica: texto_rubrica,
    nu: project.nu,
  });

  let rubrica: RubricaProyecto;
  try {
    const respuestaCruda = await llamarOrquestador(prompt);
    rubrica = parsearJsonRespuesta<RubricaProyecto>(respuestaCruda);
  } catch (e) {
    return NextResponse.json({ error: `Error del orquestador: ${(e as Error).message}` }, { status: 502 });
  }

  rubrica = asignarIdsRubrica(rubrica);
  rubrica.fecha_carga = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("projects")
    .update({ rubrica_evaluacion: rubrica })
    .eq("id", project_id)
    .select()
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "No se pudo guardar la rúbrica." },
      { status: 500 }
    );
  }

  return NextResponse.json({ rubrica });
}
