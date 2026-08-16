import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatearActividadReciente } from "@/lib/faro/formatearActividad";
import EliminarProyectoBoton from "./EliminarProyectoBoton";

const ESTADO_ETIQUETA: Record<string, string> = {
  diagnostico: "Diagnóstico",
  en_formulacion: "En formulación",
  convergido: "Convergido",
  abandonado: "Abandonado",
};

export default async function ProyectosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/proyectos");
  }

  let { data: proyectos, error } = await supabase
    .from("v_proyectos_ultima_actividad")
    .select("id, titulo_provisional, alpha_area, nu, tau, u0_initial, estado, created_at, ultima_actividad")
    .order("ultima_actividad", { ascending: false });

  if (error) {
    const res = await supabase
      .from("projects")
      .select("id, titulo_provisional, alpha_area, nu, tau, u0_initial, estado, created_at")
      .order("created_at", { ascending: false });

    proyectos = (res.data ?? []).map((p) => ({
      ...p,
      ultima_actividad: p.created_at,
    }));
  }

  return (
    <main className="min-h-screen bg-faro-cream py-10 px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-faro-navy">Mis proyectos</h1>
          <Link
            href="/diagnostico"
            className="bg-faro-navy text-white rounded-md px-4 py-2 text-sm font-medium"
          >
            + Nuevo diagnóstico
          </Link>
        </div>

        {!proyectos || proyectos.length === 0 ? (
          <div className="bg-white rounded-lg border p-10 text-center space-y-3">
            <p className="text-gray-600">Todavía no tiene proyectos diagnosticados.</p>
            <Link href="/diagnostico" className="text-faro-blue underline text-sm">
              Empezar el primer diagnóstico M0 →
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {proyectos.map((p) => {
              const titulo = p.titulo_provisional || p.alpha_area || "Proyecto sin título";
              return (
                <div
                  key={p.id}
                  className="group bg-white rounded-lg border p-5 flex items-center justify-between hover:border-faro-blue transition-colors"
                >
                  <Link href={`/formulacion/${p.id}`} className="flex-1 min-w-0">
                    <p className="font-medium text-faro-navy">{titulo}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {p.nu} · {p.tau} · U₀={p.u0_initial?.toFixed(3)}
                    </p>
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      Última actividad: {formatearActividadReciente(p.ultima_actividad)}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-faro-blue/10 text-faro-blue">
                      {ESTADO_ETIQUETA[p.estado] ?? p.estado}
                    </span>
                    <EliminarProyectoBoton projectId={p.id} tituloProyecto={titulo} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
