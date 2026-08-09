// ============================================================
// FARO — Página de formulación NOVA
// Ruta: /formulacion/[projectId]/nova
// Mismo patrón de carga que la página de RUTA — server component que
// trae project + nodos existentes, y delega el render a
// FormulacionNova (client component).
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { RutaOutput } from "@/lib/faro/ruta";
import FormulacionNova from "./FormulacionNova";

export default async function NovaPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  const { data: nodos } = await supabase
    .from("grafo_nodos")
    .select("*")
    .eq("project_id", projectId)
    .eq("tipo", "NOVA")
    .order("iteracion", { ascending: false });

  const { data: nodoRuta } = await supabase
    .from("grafo_nodos")
    .select("contenido")
    .eq("project_id", projectId)
    .eq("tipo", "RUTA")
    .eq("confirmado_humano", true)
    .order("iteracion", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rutaOutputConfirmado = (nodoRuta?.contenido as RutaOutput) ?? null;

  return (
    <FormulacionNova
      project={project}
      nodosIniciales={nodos ?? []}
      rutaOutputConfirmado={rutaOutputConfirmado}
    />
  );
}
