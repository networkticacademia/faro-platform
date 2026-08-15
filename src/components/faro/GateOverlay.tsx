"use client";

/**
 * GateOverlay.tsx
 *
 * Se muestra cuando /api/mci/gate/verificar devuelve bloqueado=true al
 * intentar avanzar de pestaña. NO impide seguir editando el nodo actual —
 * solo bloquea el avance de navegación.
 */

import TriagePregunta from "./TriagePregunta";

interface PreguntaBloqueante {
  id: string;
  nodo_tipo: string;
  campo_origen: string | null;
  texto_pregunta: string;
  nodos_afectados: string[];
}

interface GateOverlayProps {
  projectId: string;
  checkpoint: string;
  preguntasBloqueantes: PreguntaBloqueante[];
  onCerrarSinResolver: () => void;
  onPreguntaResuelta: (preguntaId: string) => void;
}

export default function GateOverlay({
  projectId,
  checkpoint,
  preguntasBloqueantes,
  onCerrarSinResolver,
  onPreguntaResuelta,
}: GateOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex h-3 w-3 rounded-full bg-red-500 animate-pulse" />
          <h2 className="text-lg font-bold text-faro-navy">FARO — Punto de control</h2>
        </div>
        <p className="mb-4 text-xs sm:text-sm text-gray-600">
          Antes de continuar a la pestaña de Objetivos necesitamos resolver {preguntasBloqueantes.length}{" "}
          decisión{preguntasBloqueantes.length === 1 ? "" : "es"} estructural
          {preguntasBloqueantes.length === 1 ? "" : "es"} (checkpoint {checkpoint}).
        </p>

        <div className="space-y-4">
          {preguntasBloqueantes.map((p) => (
            <div key={p.id} className="rounded-lg border border-red-200 bg-red-50/70 p-4 transition-all">
              <div className="mb-1 text-xs font-bold text-red-700 tracking-wide uppercase">
                🔴 Prioridad Crítica — {p.nodo_tipo}
              </div>
              <p className="mb-2 text-sm font-medium text-gray-800">{p.texto_pregunta}</p>
              {p.nodos_afectados.length > 0 && (
                <p className="mb-3 text-xs text-gray-500 font-mono">
                  Afecta: {p.nodos_afectados.join(" → ")}
                </p>
              )}

              <TriagePregunta
                preguntaId={p.id}
                projectId={projectId}
                textoPregunta={p.texto_pregunta}
                onResuelta={() => onPreguntaResuelta(p.id)}
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            className="text-xs font-medium text-gray-500 hover:text-gray-800 underline transition-colors"
            onClick={onCerrarSinResolver}
          >
            Volver sin avanzar
          </button>
        </div>
      </div>
    </div>
  );
}
