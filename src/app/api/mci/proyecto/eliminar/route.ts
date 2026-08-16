import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Elimina un proyecto de forma permanente. Las tablas dependientes
 * (grafo_nodos, preguntas_pendientes, corpus_fuentes, verificaciones_rsl,
 * convergencia_proyecto, sesiones_mci_log) se borran vía ON DELETE CASCADE
 * a nivel de base de datos. La policy RLS "projects_delete_own" restringe
 * el borrado al dueño del proyecto — el filtro por usuario_id de abajo es
 * defensa en profundidad, no la única barrera.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { project_id } = (body ?? {}) as { project_id?: string };
  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", project_id)
    .eq("usuario_id", user.id)
    .select("id");

  if (error) {
    console.error("[proyecto/eliminar] Error borrando:", error);
    return NextResponse.json({ error: "Error al eliminar el proyecto." }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Proyecto no encontrado o no tiene permiso para eliminarlo." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
