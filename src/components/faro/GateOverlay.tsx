"use client";

/**
 * GateOverlay.tsx
 *
 * Se muestra cuando /api/mci/gate/verificar devuelve bloqueado=true al
 * intentar avanzar de pestaña. NO impide seguir editando el nodo actual —
 * solo bloquea el avance de navegación.
 */

import { useState } from "react";

interface PreguntaBloqueante {
  id: string;
  nodo_tipo: string;
  campo_origen: string | null;
  texto_pregunta: string;
  nodos_afectados: string[];
}

interface GateOverlayProps {
  checkpoint: string;
  preguntasBloqueantes: PreguntaBloqueante[];
  onCerrarSinResolver: () => void; // permite cancelar el intento de avanzar
  onPreguntaResuelta: (preguntaId: string) => void; // refresca el Gate tras responder
}

export default function GateOverlay({
  checkpoint,
  preguntasBloqueantes,
  onCerrarSinResolver,
  onPreguntaResuelta,
}: GateOverlayProps) {
  const [preguntaActiva, setPreguntaActiva] = useState<string | null>(null);
  const [respuestaTexto, setRespuestaTexto] = useState("");
  const [explicacion, setExplicacion] = useState<Record<string, string>>({});
  const [cargandoExplicacion, setCargandoExplicacion] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function pedirAyuda(preguntaId: string) {
    setCargandoExplicacion(preguntaId);
    try {
      const res = await fetch("/api/mci/preguntas/explicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta_id: preguntaId }),
      });
      const data = await res.json();
      setExplicacion((prev) => ({ ...prev, [preguntaId]: data.explicacion }));
    } finally {
      setCargandoExplicacion(null);
    }
  }

  async function enviarRespuesta(preguntaId: string) {
    if (!respuestaTexto.trim()) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/mci/preguntas/responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta_id: preguntaId, respuesta: respuestaTexto }),
      });
      if (res.ok) {
        setRespuestaTexto("");
        setPreguntaActiva(null);
        onPreguntaResuelta(preguntaId);
      }
    } finally {
      setEnviando(false);
    }
  }

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

              {explicacion[p.id] && (
                <div className="mb-3 whitespace-pre-wrap rounded-md border border-blue-100 bg-blue-50/50 p-3 text-xs text-gray-700 leading-relaxed">
                  {explicacion[p.id]}
                </div>
              )}

              {preguntaActiva === p.id ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full rounded-md border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-faro-navy focus:outline-none focus:ring-1 focus:ring-faro-navy"
                    rows={3}
                    value={respuestaTexto}
                    onChange={(e) => setRespuestaTexto(e.target.value)}
                    placeholder="Escriba su respuesta o aclaración aquí..."
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      className="rounded-md bg-faro-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-opacity-90 disabled:opacity-50 transition-colors"
                      disabled={enviando}
                      onClick={() => enviarRespuesta(p.id)}
                    >
                      {enviando ? "Guardando..." : "Guardar respuesta"}
                    </button>
                    <button
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      onClick={() => setPreguntaActiva(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-md bg-faro-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-opacity-90 transition-colors"
                    onClick={() => setPreguntaActiva(p.id)}
                  >
                    Responder
                  </button>
                  <button
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    disabled={cargandoExplicacion === p.id}
                    onClick={() => pedirAyuda(p.id)}
                  >
                    {cargandoExplicacion === p.id ? "Consultando..." : "💡 No entiendo esta pregunta"}
                  </button>
                </div>
              )}
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
