import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FormulacionRuta from "./FormulacionRuta";

export default async function FormulacionPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/formulacion/${projectId}`);
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    return (
      <main className="min-h-screen bg-faro-cream flex items-center justify-center p-6">
        <p className="text-red-600">Proyecto no encontrado o no tiene acceso a él.</p>
      </main>
    );
  }

  const { data: nodos } = await supabase
    .from("grafo_nodos")
    .select("*")
    .eq("project_id", projectId)
    .eq("tipo", "RUTA")
    .order("iteracion", { ascending: false });

  return (
    <main className="min-h-screen bg-faro-cream py-10 px-6">
      <FormulacionRuta project={project} nodosIniciales={nodos ?? []} />
    </main>
  );
}
