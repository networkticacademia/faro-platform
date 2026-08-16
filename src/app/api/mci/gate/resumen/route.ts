import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verificarGate, obtenerCheckpointsActivos } from "@/lib/faro/gate";

/**
 * Resumen de TODOS los checkpoints activos hoy (C0, C1) para la insignia
 * flotante. SIEMPRE con incluirVerificacionSemantica=false — es el punto
 * que se consulta en cada pantalla, así que nunca dispara la llamada LLM
 * (esa solo ocurre al intentar avanzar a Metodología o con "Revisar ahora").
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id } = body as { project_id?: string };
  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  const checkpoints = obtenerCheckpointsActivos();
  const resultados = await Promise.all(
    checkpoints.map((cp) => verificarGate(supabase, project_id, cp, { incluirVerificacionSemantica: false }))
  );

  return NextResponse.json({
    bloqueado: resultados.some((r) => r.bloqueado),
    resultados,
  });
}
