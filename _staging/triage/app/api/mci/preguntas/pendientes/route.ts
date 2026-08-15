import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/mci/preguntas/pendientes?project_id=...
 *
 * CAMBIO respecto a la versión anterior: ya NO devuelve las 27 preguntas
 * crudas. Devuelve solo las que son raíz (pregunta_raiz_id is null),
 * cada una anotada con cuántas preguntas agrupa y en qué nodos.
 * Use ?incluir_detalle=true para traer también las preguntas agrupadas
 * bajo cada raíz (para una vista expandible).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const project_id = searchParams.get("project_id");
  const incluirDetalle = searchParams.get("incluir_detalle") === "true";

  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  const { data: raices, error } = await supabase
    .from("preguntas_pendientes")
    .select("*")
    .eq("project_id", project_id)
    .eq("estado", "abierta")
    .is("pregunta_raiz_id", null)
    .order("prioridad", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: agrupadas } = await supabase
    .from("preguntas_pendientes")
    .select("id, pregunta_raiz_id, nodo_tipo, texto_pregunta")
    .eq("project_id", project_id)
    .eq("estado", "abierta")
    .not("pregunta_raiz_id", "is", null);

  const hijasPorRaiz = new Map<string, { id: string; nodo_tipo: string; texto_pregunta: string }[]>();
  for (const h of agrupadas ?? []) {
    const lista = hijasPorRaiz.get(h.pregunta_raiz_id) ?? [];
    lista.push({ id: h.id, nodo_tipo: h.nodo_tipo, texto_pregunta: h.texto_pregunta });
    hijasPorRaiz.set(h.pregunta_raiz_id, lista);
  }

  const preguntas = (raices ?? []).map((r) => {
    const hijas = hijasPorRaiz.get(r.id) ?? [];
    const nodosInvolucrados = Array.from(new Set([r.nodo_tipo, ...hijas.map((h) => h.nodo_tipo)]));
    return {
      ...r,
      agrupa_count: hijas.length,
      nodos_involucrados: nodosInvolucrados,
      ...(incluirDetalle ? { agrupadas: hijas } : {}),
    };
  });

  const conteo = {
    P1: preguntas.filter((p) => p.prioridad === "P1").length,
    P2: preguntas.filter((p) => p.prioridad === "P2").length,
    P3: preguntas.filter((p) => p.prioridad === "P3").length,
  };

  return NextResponse.json({ preguntas, conteo });
}
