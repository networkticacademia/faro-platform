import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarImpactosCore } from "@/lib/faro/generarCore";
import { CircuitoDetenidoError } from "@/lib/faro/circuitoConvergencia";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id, feedback, bypass_circuito } = body;
  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  try {
    const resultado = await generarImpactosCore(supabase, {
      project_id,
      feedback,
      bypassCircuito: bypass_circuito ? { confirmadoPor: user.email ?? user.id } : undefined,
    });
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof CircuitoDetenidoError) {
      return NextResponse.json({
        circuito_detenido: true,
        motivo_circuito: e.circuito.motivo,
        detalle_l_faro_por_nodo: e.circuito.ultimo_detalle_l_faro_por_nodo,
      });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
