import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardProyecto from "./DashboardProyecto";

interface ActividadOpenRouter {
  date: string;
  model: string;
  provider_name: string;
  requests: number;
  usage: number;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
}

// Corre en el servidor — OPENROUTER_MANAGEMENT_KEY nunca se envía al cliente,
// ni siquiera como variable pública. Si no está configurada, el dashboard
// simplemente no muestra esta sección (no rompe nada).
async function obtenerActividadOpenRouter(): Promise<ActividadOpenRouter[] | null> {
  const key = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/activity", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data ?? []) as ActividadOpenRouter[];
  } catch {
    return null;
  }
}

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

  const { data: sesiones } = await supabase
    .from("sesiones_mci_log")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  // Nodos confirmados completos — necesarios para el verificador estructural,
  // no solo para las tarjetas de resumen.
  const { data: nodosConfirmadosCompletos } = await supabase
    .from("grafo_nodos")
    .select("tipo, contenido, confirmado_humano, delta_nodal, created_at, iteracion")
    .eq("project_id", projectId)
    .eq("confirmado_humano", true)
    .order("iteracion", { ascending: false });

  const nodosConfirmados = nodosConfirmadosCompletos ?? [];

  const actividadOpenRouter = await obtenerActividadOpenRouter();

  return (
    <DashboardProyecto
      project={project}
      sesiones={sesiones ?? []}
      nodosConfirmados={nodosConfirmados ?? []}
      actividadOpenRouter={actividadOpenRouter}
    />
  );
}
