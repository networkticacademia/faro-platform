"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import GateOverlay from "./GateOverlay";

const NODOS = [
  { slug: "/dashboard", label: "📊 Dashboard" },
  { slug: "", label: "RUTA" },
  { slug: "/nova", label: "NOVA" },
  { slug: "/fuentes", label: "Fuentes" },
  { slug: "/objetivos", label: "Objetivos" },
  { slug: "/marco-referencial", label: "Marco Referencial" },
  { slug: "/metodologia", label: "Metodología" },
  { slug: "/impactos-delimitacion", label: "Impactos y Delimitación" },
  { slug: "/presupuesto", label: "💰 Presupuesto" },
] as const;

export default function NavegacionNodos({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const [gateState, setGateState] = useState<{
    bloqueado: boolean;
    checkpoint: string;
    preguntas: any[];
    targetHref: string;
  } | null>(null);
  const [verificando, setVerificando] = useState(false);

  async function handleNavegacion(e: React.MouseEvent, slug: string) {
    const href = `/formulacion/${projectId}${slug}`;
    if (pathname === href) return;

    // Solo se evalúa C0 en la navegación hacia /objetivos por ahora
    if (slug === "/objetivos") {
      e.preventDefault();
      setVerificando(true);
      try {
        const res = await fetch("/api/mci/gate/verificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, checkpoint: "C0" }),
        });
        const data = await res.json();
        if (data.bloqueado) {
          setGateState({
            bloqueado: true,
            checkpoint: "C0",
            preguntas: data.preguntas_bloqueantes ?? [],
            targetHref: href,
          });
          return;
        }
      } catch (err) {
        console.error("Error al verificar gate C0:", err);
      } finally {
        setVerificando(false);
      }
    }
    router.push(href);
  }

  async function reVerificarGate() {
    if (!gateState) return;
    try {
      const res = await fetch("/api/mci/gate/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, checkpoint: gateState.checkpoint }),
      });
      const data = await res.json();
      if (!data.bloqueado) {
        const target = gateState.targetHref;
        setGateState(null);
        router.push(target);
      } else {
        setGateState((prev) =>
          prev ? { ...prev, preguntas: data.preguntas_bloqueantes ?? [] } : null
        );
      }
    } catch (err) {
      console.error("Error al re-verificar gate:", err);
    }
  }

  return (
    <>
      <nav className="sticky top-0 z-10 bg-white border-b mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 sm:rounded-lg sm:border sm:mb-4">
        <div className="flex items-center justify-between gap-1 overflow-x-auto py-2 px-1">
          <div className="flex items-center gap-1">
            {NODOS.map((n) => {
              const href = `/formulacion/${projectId}${n.slug}`;
              const activo = pathname === href;
              return (
                <Link
                  key={n.slug}
                  href={href}
                  onClick={(e) => handleNavegacion(e, n.slug)}
                  className={`text-xs px-3 py-1.5 rounded-md whitespace-nowrap font-medium transition-colors ${
                    activo
                      ? "bg-faro-navy text-white"
                      : "text-faro-navy border border-transparent hover:border-faro-navy"
                  }`}
                >
                  {n.label} {verificando && n.slug === "/objetivos" ? "⌛" : ""}
                </Link>
              );
            })}
          </div>
          <Link
            href="/acerca-de-faro"
            className="text-xs px-3 py-1.5 rounded-md whitespace-nowrap font-medium text-gray-400 hover:text-faro-navy"
          >
            ℹ️ Acerca de FARO
          </Link>
        </div>
      </nav>

      {gateState?.bloqueado && (
        <GateOverlay
          checkpoint={gateState.checkpoint}
          preguntasBloqueantes={gateState.preguntas}
          onCerrarSinResolver={() => setGateState(null)}
          onPreguntaResuelta={() => reVerificarGate()}
        />
      )}
    </>
  );
}
