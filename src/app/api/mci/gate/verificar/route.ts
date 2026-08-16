import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verificarGate, type Checkpoint } from "@/lib/faro/gate";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id, checkpoint, incluir_verificacion_semantica } = body as {
    project_id?: string;
    checkpoint?: Checkpoint;
    incluir_verificacion_semantica?: boolean;
  };

  if (!project_id || !checkpoint) {
    return NextResponse.json({ error: "Faltan project_id o checkpoint." }, { status: 400 });
  }

  const resultado = await verificarGate(supabase, project_id, checkpoint, {
    incluirVerificacionSemantica: incluir_verificacion_semantica === true,
  });

  // Solo persistimos cuando esta llamada REALMENTE recalculó (LLM), no
  // cuando devolvió el valor cacheado — evita escrituras redundantes.
  if (incluir_verificacion_semantica === true && resultado.contradicciones_semanticas !== null) {
    await supabase
      .from("projects")
      .update({
        gate_semantico_ultimo: {
          checkpoint,
          pares: resultado.contradicciones_semanticas,
          evaluado_en: resultado.semantico_evaluado_en,
        },
      })
      .eq("id", project_id);
  }

  return NextResponse.json(resultado);
}
