"use client";

/**
 * PreguntasPendientesAgrupadas.tsx
 *
 * Vista de preguntas pendientes de un proyecto, agrupadas por prioridad
 * (P1 crítica / P2 importante / P3 posterior), con "no entiendo esta
 * pregunta" (ayuda contextual) y respuesta inline.
 *
 * IMPORTANTE PARA ANTIGRAVITY:
 * Ya existe `PreguntasPendientes.tsx` en el repo (construido en la sesión
 * del 13-ago, con `ensamblarFeedbackDesdeRespuestas()`). Este componente
 * NO lo reemplaza a ciegas — antes de integrar:
 *
 * 1. Ver el archivo real `PreguntasPendientes.tsx`.
 * 2. Si ese componente lee las preguntas directamente del `contenido` del
 *    nodo (patrón original, sigue siendo válido para el flujo de
 *    regenerar-con-feedback dentro de un nodo específico), DÉJALO como
 *    está — sigue siendo necesario para ese flujo.
 * 3. Este componente nuevo es un caso de uso DISTINTO y complementario:
 *    una vista de conjunto a nivel de PROYECTO (todas las preguntas de
 *    todos los nodos, agrupadas por prioridad), pensada para el
 *    Dashboard o una pestaña propia — no para reemplazar la vista
 *    puntual dentro de cada nodo.
 * 4. Decide con Jorge si esta vista va en el Dashboard, en una pestaña
 *    nueva, o dentro del GateOverlay existente en una versión expandida
 *    (hoy GateOverlay solo muestra las P1 bloqueantes del checkpoint
 *    activo, no todas las preguntas del proyecto).
 *
 * Responde vía el mismo endpoint que ya usa GateOverlay
 * (`/api/mci/preguntas/responder`), así que NO duplica esa lógica de
 * backend — solo la reutiliza en un contenedor con más alcance.
 */

import { useEffect, useState, useCallback } from "react";

type Prioridad = "P1" | "P2" | "P3";

interface Pregunta {
  id: string;
  nodo_tipo: string;
  campo_origen: string | null;
  texto_pregunta: string;
  prioridad: Prioridad;
  nodos_afectados: string[];
}

interface Conteo {
  P1: number;
  P2: number;
  P3: number;
}

const CONFIG_PRIORIDAD: Record<Prioridad, { etiqueta: string; icono: string; clase: string }> = {
  P1: { etiqueta: "Crítica", icono: "🔴", clase: "border-red-200 bg-red-50" },
  P2: { etiqueta: "Importante", icono: "🟡", clase: "border-yellow-200 bg-yellow-50" },
  P3: { etiqueta: "Fase posterior", icono: "🟢", clase: "border-green-200 bg-green-50" },
};

export default function PreguntasPendientesAgrupadas({ projectId }: { projectId: string }) {
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [conteo, setConteo] = useState<Conteo>({ P1: 0, P2: 0, P3: 0 });
  const [cargando, setCargando] = useState(true);
  const [grupoAbierto, setGrupoAbierto] = useState<Prioridad | null>("P1");
  const [preguntaActiva, setPreguntaActiva] = useState<string | null>(null);
  const [respuestaTexto, setRespuestaTexto] = useState("");
  const [explicacion, setExplicacion] = useState<Record<string, string>>({});
  const [cargandoExplicacion, setCargandoExplicacion] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/mci/preguntas/pendientes?project_id=${projectId}`);
      const data = await res.json();
      setPreguntas(data.preguntas ?? []);
      setConteo(data.conteo ?? { P1: 0, P2: 0, P3: 0 });
    } finally {
      setCargando(false);
    }
  }, [projectId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

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
        await cargar(); // refresca lista y conteo
      }
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return <div className="p-4 text-sm text-gray-500">Cargando preguntas pendientes...</div>;
  }

  if (preguntas.length === 0) {
    return (
      <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-700">
        ✅ No hay preguntas pendientes abiertas en este proyecto.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Resumen por prioridad */}
      <div className="flex gap-3">
        {(["P1", "P2", "P3"] as Prioridad[]).map((p) => (
          <button
            key={p}
            onClick={() => setGrupoAbierto(grupoAbierto === p ? null : p)}
            className={`rounded border px-3 py-2 text-sm font-medium ${CONFIG_PRIORIDAD[p].clase} ${
              grupoAbierto === p ? "ring-2 ring-offset-1" : ""
            }`}
          >
            {CONFIG_PRIORIDAD[p].icono} {CONFIG_PRIORIDAD[p].etiqueta}: {conteo[p]}
          </button>
        ))}
      </div>

      {/* Lista del grupo seleccionado */}
      {grupoAbierto && (
        <div className="space-y-3">
          {preguntas
            .filter((p) => p.prioridad === grupoAbierto)
            .map((p) => (
              <div key={p.id} className={`rounded border p-4 ${CONFIG_PRIORIDAD[p.prioridad].clase}`}>
                <div className="mb-1 text-xs font-semibold text-gray-600">{p.nodo_tipo}</div>
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
      )}
    </div>
  );
}
