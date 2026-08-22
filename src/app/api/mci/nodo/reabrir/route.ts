import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { payloadReapertura } from "@/lib/faro/diodoNodal";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { nodo_id } = body;
  if (!nodo_id) {
    return NextResponse.json({ error: "Falta nodo_id." }, { status: 400 });
  }

  // Consultar estado previo para incrementar contador de reaperturas
  const { data: nodoPrevio } = await supabase
    .from("grafo_nodos")
    .select("id, reaperturas_count, sellado")
    .eq("id", nodo_id)
    .single();

  const updateData = payloadReapertura(nodoPrevio);

  const { data: nodo, error } = await supabase
    .from("grafo_nodos")
    .update(updateData)
    .eq("id", nodo_id)
    .select()
    .single();

  if (error || !nodo) {
    return NextResponse.json(
      { error: error?.message ?? "No se pudo reabrir el nodo." },
      { status: 500 }
    );
  }

  return NextResponse.json({ nodo });
}
