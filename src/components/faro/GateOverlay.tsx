"use client";

/**
 * GateOverlay.tsx
 *
 * Se muestra cuando /api/mci/gate/verificar devuelve bloqueado=true al
 * intentar avanzar de pestaña. NO impide seguir editando el nodo actual —
 * solo bloquea el avance de navegación.
 *
 * Puede bloquear por dos motivos independientes: preguntas P1 abiertas
 * (resolubles aquí mismo vía TriagePregunta) y/o contradicciones
 * semánticas críticas entre nodos ya completos (solo lectura — para
 * resolverlas hay que editar/regenerar el nodo señalado, no hay una
 * acción de "responder" como con las preguntas).
 */

import TriagePregunta from "./TriagePregunta";

interface PreguntaBloqueante {
  id: string;
  nodo_tipo: string;
  campo_origen: string | null;
  texto_pregunta: string;
  nodos_afectados: string[];
}

interface HallazgoIncoherencia {
  severidad: "critica" | "advertencia";
  elemento: string;
  evidencia_origen: string;
  evidencia_destino: string;
  explicacion: string;
}

interface ResultadoCoherenciaPar {
  nodoOrigen: string;
  nodoDestino: string;
  delta_ij: number;
  hallazgos: HallazgoIncoherencia[];
  resumen: string;
}

interface GateOverlayProps {
  projectId: string;
  checkpoint: string;
  preguntasBloqueantes: PreguntaBloqueante[];
  contradiccionesSemanticas?: ResultadoCoherenciaPar[];
  onCerrarSinResolver: () => void;
  onPreguntaResuelta: (preguntaId: string) => void;
}

export default function GateOverlay({
  projectId,
  checkpoint,
  preguntasBloqueantes,
  contradiccionesSemanticas = [],
  onCerrarSinResolver,
  onPreguntaResuelta,
}: GateOverlayProps) {
  const contradiccionesCriticas = contradiccionesSemanticas.filter((c) =>
    c.hallazgos.some((h) => h.severidad === "critica")
  );
  const totalBloqueos = preguntasBloqueantes.length + contradiccionesCriticas.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex h-3 w-3 rounded-full bg-red-500 animate-pulse" />
          <h2 className="text-lg font-bold text-faro-navy">FARO — Punto de control</h2>
        </div>
        <p className="mb-4 text-xs sm:text-sm text-gray-600">
          Antes de continuar necesitamos resolver {totalBloqueos}{" "}
          asunto{totalBloqueos === 1 ? "" : "s"} pendiente{totalBloqueos === 1 ? "" : "s"}{" "}
          (checkpoint {checkpoint}).
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

          {contradiccionesCriticas.map((c, i) => (
            <div key={`sem-${i}`} className="rounded-lg border border-amber-300 bg-amber-50/70 p-4">
              <div className="mb-1 text-xs font-bold text-amber-700 tracking-wide uppercase">
                ⚠️ Contradicción semántica — {c.nodoOrigen} → {c.nodoDestino}
              </div>
              <p className="mb-2 text-sm font-medium text-gray-800">{c.resumen}</p>
              <div className="space-y-2">
                {c.hallazgos
                  .filter((h) => h.severidad === "critica")
                  .map((h, j) => (
                    <div key={j} className="rounded-md bg-white/70 border border-amber-200 p-2.5 text-xs text-gray-700">
                      <p className="font-semibold text-gray-800 mb-1">{h.elemento}</p>
                      <p className="mb-1">{h.explicacion}</p>
                      <p className="text-gray-500">
                        <span className="font-medium">{c.nodoOrigen}:</span> &quot;{h.evidencia_origen}&quot;
                      </p>
                      <p className="text-gray-500">
                        <span className="font-medium">{c.nodoDestino}:</span> &quot;{h.evidencia_destino}&quot;
                      </p>
                    </div>
                  ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Esto se resuelve editando/regenerando {c.nodoOrigen} o {c.nodoDestino} — no hay una
                respuesta rápida como con las preguntas. Vuelva a intentar avanzar cuando lo corrija.
              </p>
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
