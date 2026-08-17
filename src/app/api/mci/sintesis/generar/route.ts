import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarIntroduccion, generarResumen } from "@/lib/faro/sintesisFinal";

/**
 * POST /api/mci/sintesis/generar
 * body: { project_id, nodo: "introduccion" | "resumen" }
 *
 * Endpoint mínimo para probar el módulo de Síntesis Final (Fase 1 de
 * exportación). NO es la Vista de Documento Consolidado — eso es aparte.
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
  const { project_id, nodo } = body as { project_id?: string; nodo?: "introduccion" | "resumen" };

  if (!project_id || !nodo) {
    return NextResponse.json({ error: "Faltan project_id o nodo." }, { status: 400 });
  }
  if (nodo !== "introduccion" && nodo !== "resumen") {
    return NextResponse.json({ error: "nodo debe ser 'introduccion' o 'resumen'." }, { status: 400 });
  }

  try {
    const resultado =
      nodo === "introduccion"
        ? await generarIntroduccion(supabase, project_id)
        : await generarResumen(supabase, project_id);
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
