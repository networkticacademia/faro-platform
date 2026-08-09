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
import FormulacionNova from "./FormulacionNova";

export default async function NovaPage({
  params,
}: {
  params: { projectId: string };
}) {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.projectId)
    .single();

  if (!project) notFound();

  const { data: nodos } = await supabase
    .from("grafo_nodos")
    .select("*")
    .eq("project_id", params.projectId)
    .eq("tipo", "NOVA")
    .order("iteracion", { ascending: false });

  return <FormulacionNova project={project} nodosIniciales={nodos ?? []} />;
}
