import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PresupuestoProyecto from "./PresupuestoProyecto";
import type { MetodologiaOutput } from "@/lib/faro/metodologia";

export default async function PresupuestoPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    redirect("/proyectos");
  }

  // Toma el nodo Metodología más reciente, SIN filtrar por confirmado —
  // si acaba de reabrirlo para editar presupuesto, debe seguir viéndolo aquí.
  const { data: nodoMetodologia } = await supabase
    .from("grafo_nodos")
    .select("*")
    .eq("project_id", projectId)
    .eq("tipo", "METODOLOGIA")
    .order("iteracion", { ascending: false })
    .limit(1)
    .maybeSingle();

  const metodologia = ((nodoMetodologia?.contenido_presentacion ?? nodoMetodologia?.contenido_origen ?? nodoMetodologia?.contenido) ?? null) as MetodologiaOutput | null;

  return (
    <PresupuestoProyecto
      project={project}
      metodologia={metodologia}
      nodoId={nodoMetodologia?.id ?? null}
      confirmado={nodoMetodologia?.confirmado_humano ?? false}
    />
  );
}
