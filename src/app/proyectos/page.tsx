import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const { data: proyectos } = await supabase
    .from("projects")
    .select("id, titulo_provisional, alpha_area, nu, tau, u0_initial, estado, created_at")
    .order("created_at", { ascending: false });

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
            {proyectos.map((p) => (
              <Link
                key={p.id}
                href={`/formulacion/${p.id}`}
                className="bg-white rounded-lg border p-5 flex items-center justify-between hover:border-faro-blue transition-colors"
              >
                <div>
                  <p className="font-medium text-faro-navy">
                    {p.titulo_provisional || p.alpha_area || "Proyecto sin título"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p.nu} · {p.tau} · U₀={p.u0_initial?.toFixed(3)}
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-faro-blue/10 text-faro-blue">
                  {ESTADO_ETIQUETA[p.estado] ?? p.estado}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
