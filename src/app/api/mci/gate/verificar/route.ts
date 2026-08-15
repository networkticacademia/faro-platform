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
  const { project_id, checkpoint } = body as { project_id?: string; checkpoint?: Checkpoint };

  if (!project_id || !checkpoint) {
    return NextResponse.json({ error: "Faltan project_id o checkpoint." }, { status: 400 });
  }

  const resultado = await verificarGate(supabase, project_id, checkpoint);
  return NextResponse.json(resultado);
}
