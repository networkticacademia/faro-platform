// ============================================================
// FARO — POST /api/mci/nodo/reabrir
// Endpoint genérico por nodo_id (mismo patrón que
// /api/mci/ruta/confirmar) — desmarca confirmado_humano para
// permitir que el formulador vuelva a editar un nodo que ya
// había confirmado, sin perder el contenido actual ni crear una
// iteración nueva. El contenido queda intacto; solo cambia el
// estado de confirmación.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data: nodo, error } = await supabase
    .from("grafo_nodos")
    .update({ confirmado_humano: false })
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
