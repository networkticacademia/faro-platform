import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { payloadSellado } from "@/lib/faro/diodoNodal";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { nodo_id, project_id } = body;

  if (!nodo_id) {
    return NextResponse.json({ error: "nodo_id requerido" }, { status: 400 });
  }

  // 1. Obtener nodo y verificar permisos
  const { data: nodo, error: fetchError } = await supabase
    .from("grafo_nodos")
    .select("id, project_id, tipo, sellado, preguntas_pendientes")
    .eq("id", nodo_id)
    .single();

  if (fetchError || !nodo) {
    return NextResponse.json({ error: "Nodo no encontrado" }, { status: 404 });
  }

  if (nodo.sellado) {
    return NextResponse.json({ error: "El nodo ya está sellado" }, { status: 409 });
  }

  const pid = project_id ?? nodo.project_id;

  // 2. Derivar preguntas pendientes del nodo al mapa de riesgos (origen = 'proceso')
  const preguntasNodal = (nodo.preguntas_pendientes as string[]) ?? [];
  if (preguntasNodal.length > 0) {
    try {
      const riesgos = preguntasNodal.map((texto) => ({
        project_id: pid,
        nodo_origen: nodo.tipo,
        tipo: "pregunta_no_resuelta",
        origen: "proceso",
        severidad: "media",
        descripcion: `[Sellado con preguntas pendientes] ${nodo.tipo}: ${texto}`,
        estado: "abierto",
      }));

      await supabase.from("riesgos_proyecto").insert(riesgos);
    } catch (errRiesgos) {
      console.warn("[nodo/sellar] Error al derivar preguntas al mapa de riesgos:", errRiesgos);
    }
  }

  // 3. Ejecutar el sellado inmutable en base de datos
  const { data: updatedNodo, error: updateError } = await supabase
    .from("grafo_nodos")
    .update(payloadSellado())
    .eq("id", nodo_id)
    .select()
    .single();

  if (updateError || !updatedNodo) {
    return NextResponse.json(
      { error: updateError?.message ?? "Error al sellar el nodo" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    sellado: true,
    nodo: updatedNodo,
    preguntas_derivadas: preguntasNodal.length,
  });
}
