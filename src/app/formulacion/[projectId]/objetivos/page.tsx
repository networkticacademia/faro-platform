import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FormulacionObjetivos from "./FormulacionObjetivos";

export default async function ObjetivosPage({
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

  const { data: nodos } = await supabase
    .from("grafo_nodos")
    .select("*")
    .eq("project_id", projectId)
    .eq("tipo", "OBJETIVOS")
    .order("iteracion", { ascending: false });

  return (
    <FormulacionObjetivos
      project={project}
      nodosIniciales={nodos ?? []}
    />
  );
}
