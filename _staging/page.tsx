import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardProyecto from "./DashboardProyecto";

export default async function DashboardPage({
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

  // Historial completo de sesiones MCI del proyecto — una fila por cada
  // vez que se generó/regeneró cualquier nodo (RUTA, NOVA, OBJETIVOS,
  // METODOLOGIA), en orden cronológico.
  const { data: sesiones } = await supabase
    .from("sesiones_mci_log")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  // Último nodo confirmado por tipo — para las tarjetas de resumen.
  const { data: nodosConfirmados } = await supabase
    .from("grafo_nodos")
    .select("tipo, confirmado_humano, delta_nodal, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return (
    <DashboardProyecto
      project={project}
      sesiones={sesiones ?? []}
      nodosConfirmados={nodosConfirmados ?? []}
    />
  );
}
