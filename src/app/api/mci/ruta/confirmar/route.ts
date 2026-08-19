import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { migrarPreguntaARiesgo } from "@/lib/faro/riesgos";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { nodo_id, contenido_editado, sellar } = body;
  if (!nodo_id) {
    return NextResponse.json({ error: "Falta nodo_id." }, { status: 400 });
  }

  const editado = !!contenido_editado;

  const { data, error } = await supabase
    .from("grafo_nodos")
    .update({
      confirmado_humano: true,
      editado_humano: editado,
      ...(editado ? { contenido: contenido_editado } : {}),
      ...(sellar ? { sellado: true } : {}),
    })
    .eq("id", nodo_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data && sellar) {
    // Buscar y migrar preguntas abiertas de esta iteración de nodo a riesgos
    const { data: openQs } = await supabase
      .from("preguntas_pendientes")
      .select("id")
      .eq("nodo_id", data.id)
      .eq("estado", "abierta");

    if (openQs && openQs.length > 0) {
      for (const q of openQs) {
        await migrarPreguntaARiesgo(supabase, q.id);
      }
    }
  }

  // Marcar el proyecto como en_formulacion si seguía en estado diagnostico
  if (data?.project_id) {
    await supabase
      .from("projects")
      .update({ estado: "en_formulacion" })
      .eq("id", data.project_id)
      .eq("estado", "diagnostico");
  }

  return NextResponse.json({ nodo: data });
}
