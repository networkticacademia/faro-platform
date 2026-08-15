import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavegacionNodos from "@/components/faro/NavegacionNodos";
import PreguntasPendientesAgrupadas from "@/components/faro/PreguntasPendientesAgrupadas";

export default async function PreguntasPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/formulacion/${projectId}/preguntas`);
  }

  const { data: project } = await supabase
    .from("projects")
    .select("titulo_provisional, tau, nu, alpha_area")
    .eq("id", projectId)
    .single();

  return (
    <main className="min-h-screen bg-faro-cream py-10 px-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <NavegacionNodos projectId={projectId} />
        <div>
          <h1 className="text-2xl font-bold text-faro-navy">Preguntas pendientes del proyecto</h1>
          <p className="text-xs sm:text-sm text-gray-600">
            {project?.titulo_provisional ?? "Sin título provisional"} — Incertidumbres abiertas organizadas por prioridad
          </p>
        </div>
        <PreguntasPendientesAgrupadas projectId={projectId} />
      </div>
    </main>
  );
}
