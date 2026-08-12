import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FormulacionMarcoReferencial from "./FormulacionMarcoReferencial";

export default async function MarcoReferencialPage({
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
    .eq("tipo", "MARCO_REFERENCIAL")
    .order("iteracion", { ascending: false });

  // Trae el problema real de RUTA para armar los prompts de fundamentación
  // teórica ya rellenados — no genéricos.
  const { data: nodoRuta } = await supabase
    .from("grafo_nodos")
    .select("contenido")
    .eq("project_id", projectId)
    .eq("tipo", "RUTA")
    .eq("confirmado_humano", true)
    .order("iteracion", { ascending: false })
    .limit(1)
    .maybeSingle();

  const problemaProyecto = (nodoRuta?.contenido as { problema?: string } | null)?.problema ?? "";

  return (
    <FormulacionMarcoReferencial
      project={project}
      nodosIniciales={nodos ?? []}
      problemaProyecto={problemaProyecto}
    />
  );
}
