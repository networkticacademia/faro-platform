"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import GateOverlay from "./GateOverlay";
import InsigniaCheckpoint from "./InsigniaCheckpoint";

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

// Checkpoint evaluado al intentar navegar a cada pestaña. Solo estas dos
// pestañas disparan verificación de gate hoy — el resto navega libre.
const CHECKPOINT_POR_SLUG: Record<string, "C0" | "C1"> = {
  "/objetivos": "C0",
  "/metodologia": "C1",
};

export default function NavegacionNodos({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const [gateState, setGateState] = useState<{
    bloqueado: boolean;
    checkpoint: string;
    preguntas: any[];
    contradiccionesSemanticas: any[];
    targetHref: string;
  } | null>(null);
  const [verificando, setVerificando] = useState(false);

  async function handleNavegacion(e: React.MouseEvent, slug: string) {
    const href = `/formulacion/${projectId}${slug}`;
    if (pathname === href) return;

    const checkpoint = CHECKPOINT_POR_SLUG[slug];
    if (checkpoint) {
      e.preventDefault();
      setVerificando(true);
      try {
        const res = await fetch("/api/mci/gate/verificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            checkpoint,
            // C1 compone verificación semántica (LLM) — este es exactamente
            // el momento "intenta avanzar a Metodología" del control de costo.
            incluir_verificacion_semantica: checkpoint === "C1",
          }),
        });
        const data = await res.json();
        if (data.bloqueado) {
          setGateState({
            bloqueado: true,
            checkpoint,
            preguntas: data.preguntas_bloqueantes ?? [],
            contradiccionesSemanticas: data.contradicciones_semanticas ?? [],
            targetHref: href,
          });
          return;
        }
      } catch (err) {
        console.error(`Error al verificar gate ${checkpoint}:`, err);
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
        body: JSON.stringify({
          project_id: projectId,
          checkpoint: gateState.checkpoint,
          incluir_verificacion_semantica: gateState.checkpoint === "C1",
        }),
      });
      const data = await res.json();
      if (!data.bloqueado) {
        const target = gateState.targetHref;
        setGateState(null);
        router.push(target);
      } else {
        setGateState((prev) =>
          prev
            ? {
                ...prev,
                preguntas: data.preguntas_bloqueantes ?? [],
                contradiccionesSemanticas: data.contradicciones_semanticas ?? [],
              }
            : null
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
                  {n.label} {verificando && CHECKPOINT_POR_SLUG[n.slug] ? "⌛" : ""}
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
          projectId={projectId}
          checkpoint={gateState.checkpoint}
          preguntasBloqueantes={gateState.preguntas}
          contradiccionesSemanticas={gateState.contradiccionesSemanticas}
          onCerrarSinResolver={() => setGateState(null)}
          onPreguntaResuelta={() => reVerificarGate()}
        />
      )}

      <InsigniaCheckpoint projectId={projectId} />
    </>
  );
}
