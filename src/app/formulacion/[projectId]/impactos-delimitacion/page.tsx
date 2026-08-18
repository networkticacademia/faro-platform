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

  const nodoVigente = (nodos ?? [])[0] ?? null;

  // Filas REALES de preguntas_pendientes del nodo vigente. El array embebido
  // grafo_nodos.preguntas_pendientes es solo un snapshot de texto — no tiene
  // ids, así que no permite responder por pregunta_id. TriagePregunta opera
  // sobre la fila real (procedencia, resolución, propagación), por lo que la
  // pantalla necesita los ids desde la primera carga, no solo después de
  // regenerar (ahí llegan en preguntas_sincronizadas de la respuesta POST).
  let preguntasNodo: { id: string; texto_pregunta: string; prioridad: string }[] = [];
  if (nodoVigente) {
    const { data } = await supabase
      .from("preguntas_pendientes")
      .select("id, texto_pregunta, prioridad")
      .eq("nodo_id", nodoVigente.id)
      .eq("estado", "abierta")
      .order("created_at", { ascending: true });
    preguntasNodo = data ?? [];
  }

  return (
    <main className="min-h-screen bg-faro-cream py-10 px-6">
      <FormulacionImpactosDelimitacion
        project={project}
        nodosIniciales={nodos ?? []}
        preguntasIniciales={preguntasNodo}
      />
    </main>
  );
}
