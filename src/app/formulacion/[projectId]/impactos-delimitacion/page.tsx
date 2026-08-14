import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FormulacionImpactosDelimitacion from "./FormulacionImpactosDelimitacion";

export default async function ImpactosDelimitacionPage({
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
    .eq("tipo", "IMPACTOS_DELIMITACION")
    .order("iteracion", { ascending: false });

  return (
    <main className="min-h-screen bg-faro-cream py-10 px-6">
      <FormulacionImpactosDelimitacion
        project={project}
        nodosIniciales={nodos ?? []}
      />
    </main>
  );
}
