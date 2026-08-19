import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FormulacionPropuesta from "./FormulacionPropuesta";

export default async function PropuestaPage({
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

  return (
    <FormulacionPropuesta
      project={project}
    />
  );
}
