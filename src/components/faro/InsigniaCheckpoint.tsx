"use client";

/**
 * InsigniaCheckpoint.tsx
 *
 * Insignia flotante persistente — distinta de GateOverlay. GateOverlay
 * SOLO aparece al intentar navegar y bloquea la pantalla; esto es un
 * ícono siempre visible (montado dentro de NavegacionNodos, presente en
 * todas las pantallas de formulación) que recuerda que hay bloqueos
 * críticos pendientes de CUALQUIER checkpoint activo, sin forzar la
 * interrupción — el formulador sigue trabajando y lo abre cuando quiera.
 *
 * Consulta /api/mci/gate/resumen al montar (barato: solo lee preguntas
 * P1 + el último resultado semántico CACHEADO, nunca dispara la llamada
 * LLM). El botón "Revisar coherencia semántica ahora" es el disparador
 * manual explícito para esa llamada — el mismo patrón de costo que el
 * resto de la plataforma.
 */

import { useEffect, useState } from "react";
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

interface ResultadoGate {
  checkpoint: string;
  bloqueado: boolean;
  activo: boolean;
  preguntas_bloqueantes: PreguntaBloqueante[];
  contradicciones_semanticas: ResultadoCoherenciaPar[] | null;
}

export default function InsigniaCheckpoint({ projectId }: { projectId: string }) {
  const [resultados, setResultados] = useState<ResultadoGate[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [revisando, setRevisando] = useState(false);

  async function cargar() {
    try {
      const res = await fetch("/api/mci/gate/resumen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      setResultados(data.resultados ?? []);
    } catch (err) {
      console.error("Error al cargar resumen de gate:", err);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function revisarCoherenciaAhora() {
    setRevisando(true);
    try {
      await fetch("/api/mci/gate/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          checkpoint: "C1",
          incluir_verificacion_semantica: true,
        }),
      });
      await cargar();
    } catch (err) {
      console.error("Error al revisar coherencia semántica:", err);
    } finally {
      setRevisando(false);
    }
  }

  if (!resultados) return null;

  // Checkpoints activos pueden solapar nodos (C0=[RUTA,NOVA] y
  // C1=[RUTA,NOVA,OBJETIVOS] comparten RUTA/NOVA) — una misma pregunta
  // P1 puede volver en más de un resultado. Deduplicar por id antes de
  // contar/renderizar.
  const preguntasPorId = new Map<string, PreguntaBloqueante>();
  for (const r of resultados) {
    for (const p of r.preguntas_bloqueantes) preguntasPorId.set(p.id, p);
  }
  const preguntas = Array.from(preguntasPorId.values());

  const contradiccionesCriticas = resultados
    .flatMap((r) => r.contradicciones_semanticas ?? [])
    .filter((c) => c.hallazgos.some((h) => h.severidad === "critica"));

  const bloqueado = preguntas.length > 0 || contradiccionesCriticas.length > 0;
  if (!bloqueado) return null;

  const total = preguntas.length + contradiccionesCriticas.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={`${total} bloqueo(s) crítico(s) pendiente(s) — abrir detalle`}
        title="Hay bloqueos críticos pendientes"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white text-lg shadow-lg hover:bg-red-700 transition-colors"
      >
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-red-600 border border-red-600">
          {total}
        </span>
        ⚠️
      </button>

      {abierto && (
        <div className="fixed bottom-20 right-5 z-40 w-[calc(100vw-2.5rem)] max-w-sm rounded-xl bg-white border shadow-2xl max-h-[70vh] overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-faro-navy">Pendientes críticos</h3>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="text-gray-400 hover:text-gray-700 text-xs"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Puede seguir trabajando normalmente — esto no interrumpe la pantalla actual, solo
            recuerda que hay algo crítico pendiente.
          </p>

          {preguntas.map((p) => (
            <div key={p.id} className="rounded-lg border border-red-200 bg-red-50/70 p-3">
              <div className="mb-1 text-[10px] font-bold text-red-700 uppercase tracking-wide">
                {p.nodo_tipo}
              </div>
              <p className="mb-2 text-xs font-medium text-gray-800">{p.texto_pregunta}</p>
              <TriagePregunta
                preguntaId={p.id}
                projectId={projectId}
                textoPregunta={p.texto_pregunta}
                onResuelta={cargar}
              />
            </div>
          ))}

          {contradiccionesCriticas.map((c, i) => (
            <div key={`sem-${i}`} className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <div className="mb-1 text-[10px] font-bold text-amber-700 uppercase tracking-wide">
                Contradicción {c.nodoOrigen} → {c.nodoDestino}
              </div>
              <p className="text-xs text-gray-700">{c.resumen}</p>
            </div>
          ))}

          <button
            type="button"
            onClick={revisarCoherenciaAhora}
            disabled={revisando}
            className="w-full text-xs font-medium rounded-md border border-faro-blue text-faro-blue py-2 hover:bg-faro-blue/5 disabled:opacity-50"
          >
            {revisando ? "Revisando…" : "Revisar coherencia semántica ahora"}
          </button>
        </div>
      )}
    </>
  );
}
