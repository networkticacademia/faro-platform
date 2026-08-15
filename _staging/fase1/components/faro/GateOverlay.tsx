"use client";

/**
 * GateOverlay.tsx
 *
 * Se muestra cuando /api/mci/gate/verificar devuelve bloqueado=true al
 * intentar avanzar de pestaña. NO impide seguir editando el nodo actual —
 * solo bloquea el avance de navegación (principio: controlar donde el
 * retrabajo es mayor, no vigilar todo el tiempo).
 *
 * IMPORTANTE PARA ANTIGRAVITY:
 * - Verificar el patrón real de navegación entre pestañas (App Router,
 *   probablemente en el layout del proyecto o en el componente de menú de
 *   7 pestañas) para decidir DÓNDE se invoca verificarGate() antes de
 *   permitir el push de ruta.
 * - Ajustar estilos/clases Tailwind al sistema de diseño ya usado en el
 *   resto de la plataforma (este componente usa clases genéricas de
 *   ejemplo, no está calibrado contra frontend-design del repo real).
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold">FARO — Punto de control</h2>
        <p className="mb-4 text-sm text-gray-600">
          Antes de continuar necesitamos resolver {preguntasBloqueantes.length}{" "}
          decisión{preguntasBloqueantes.length === 1 ? "" : "es"} estructural
          {preguntasBloqueantes.length === 1 ? "" : "es"} (checkpoint {checkpoint}).
        </p>

        <div className="space-y-4">
          {preguntasBloqueantes.map((p) => (
            <div key={p.id} className="rounded border border-red-200 bg-red-50 p-4">
              <div className="mb-1 text-xs font-semibold text-red-700">
                🔴 PRIORIDAD CRÍTICA — {p.nodo_tipo}
              </div>
              <p className="mb-2 text-sm">{p.texto_pregunta}</p>
              {p.nodos_afectados.length > 0 && (
                <p className="mb-2 text-xs text-gray-500">
                  Afecta: {p.nodos_afectados.join(" → ")}
                </p>
              )}

              {explicacion[p.id] && (
                <div className="mb-2 whitespace-pre-wrap rounded bg-white p-3 text-sm text-gray-700">
                  {explicacion[p.id]}
                </div>
              )}

              {preguntaActiva === p.id ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full rounded border p-2 text-sm"
                    rows={3}
                    value={respuestaTexto}
                    onChange={(e) => setRespuestaTexto(e.target.value)}
                    placeholder="Su respuesta..."
                  />
                  <div className="flex gap-2">
                    <button
                      className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                      disabled={enviando}
                      onClick={() => enviarRespuesta(p.id)}
                    >
                      Guardar respuesta
                    </button>
                    <button
                      className="rounded border px-3 py-1 text-sm"
                      onClick={() => setPreguntaActiva(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
                    onClick={() => setPreguntaActiva(p.id)}
                  >
                    Resolver
                  </button>
                  <button
                    className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                    disabled={cargandoExplicacion === p.id}
                    onClick={() => pedirAyuda(p.id)}
                  >
                    {cargandoExplicacion === p.id ? "Consultando..." : "No entiendo esta pregunta"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button className="text-sm text-gray-500 underline" onClick={onCerrarSinResolver}>
            Volver sin avanzar
          </button>
        </div>
      </div>
    </div>
  );
}
