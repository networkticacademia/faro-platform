import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión para guardar el diagnóstico." }, { status: 401 });
  }

  const body = await request.json();
  const {
    nu, tau, mu, alpha_area, lambda_trl, sigma, rho, psi, alpha_pesos,
    u1_claridad_conceptual, u2_competencia_metodologica,
    u3_viabilidad_contextual, u4_encaje_estructural,
  } = body;

  if (!nu || !tau || !mu || !alpha_area) {
    return NextResponse.json({ error: "Faltan campos obligatorios del contexto del proyecto." }, { status: 400 });
  }

  // u0_initial/u0_current se calculan automáticamente vía trigger en Supabase
  // (public.trg_set_u0), no se envían aquí — evita duplicar la lógica y
  // garantiza que la fuente de verdad del cálculo sea la base de datos.
  const { data, error } = await supabase
    .from("projects")
    .insert({
      usuario_id: user.id,
      nu, tau, mu, alpha_area,
      lambda_trl: lambda_trl ?? null,
      sigma: sigma ?? null,
      rho: rho ?? {},
      psi: psi ?? {},
      alpha_pesos: alpha_pesos ?? undefined,
      u1_claridad_conceptual,
      u2_competencia_metodologica,
      u3_viabilidad_contextual,
      u4_encaje_estructural,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: data }, { status: 201 });
}
