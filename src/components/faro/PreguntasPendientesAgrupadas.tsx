"use client";

/**
 * PreguntasPendientesAgrupadas.tsx
 *
 * Vista de preguntas pendientes de un proyecto, agrupadas por prioridad
 * (P1 crítica / P2 importante / P3 posterior), integrando TriagePregunta.
 */

import { useEffect, useState, useCallback } from "react";
import TriagePregunta from "./TriagePregunta";

type Prioridad = "P1" | "P2" | "P3";

interface PreguntaRaiz {
  id: string;
  nodo_tipo: string;
  campo_origen: string | null;
  texto_pregunta: string;
  prioridad: Prioridad;
  nodos_afectados: string[];
  agrupa_count?: number;
  nodos_involucrados?: string[];
}

interface Conteo {
  P1: number;
  P2: number;
  P3: number;
}

const CONFIG_PRIORIDAD: Record<Prioridad, { etiqueta: string; icono: string; clase: string }> = {
  P1: { etiqueta: "Crítica", icono: "🔴", clase: "border-red-200 bg-red-50/70" },
  P2: { etiqueta: "Importante", icono: "🟡", clase: "border-yellow-200 bg-yellow-50/70" },
  P3: { etiqueta: "Fase posterior", icono: "🟢", clase: "border-green-200 bg-green-50/70" },
};

export default function PreguntasPendientesAgrupadas({ projectId }: { projectId: string }) {
  const [preguntas, setPreguntas] = useState<PreguntaRaiz[]>([]);
  const [conteo, setConteo] = useState<Conteo>({ P1: 0, P2: 0, P3: 0 });
  const [cargando, setCargando] = useState(true);
  const [grupoAbierto, setGrupoAbierto] = useState<Prioridad | null>("P1");

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

  if (cargando) {
    return <div className="p-4 text-xs sm:text-sm text-gray-500">Cargando preguntas pendientes...</div>;
  }

  if (preguntas.length === 0) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-sm text-green-800 shadow-sm">
        ✅ No hay preguntas pendientes abiertas en este proyecto.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumen por prioridad */}
      <div className="flex flex-wrap gap-3">
        {(["P1", "P2", "P3"] as Prioridad[]).map((p) => (
          <button
            key={p}
            onClick={() => setGrupoAbierto(grupoAbierto === p ? null : p)}
            className={`rounded-lg border px-4 py-2.5 text-xs sm:text-sm font-medium transition-all ${CONFIG_PRIORIDAD[p].clase} ${
              grupoAbierto === p ? "ring-2 ring-faro-navy ring-offset-1 shadow-sm" : "hover:bg-opacity-100 opacity-80"
            }`}
          >
            {CONFIG_PRIORIDAD[p].icono} {CONFIG_PRIORIDAD[p].etiqueta}: {conteo[p]}
          </button>
        ))}
      </div>

      {/* Lista del grupo seleccionado */}
      {grupoAbierto && (
        <div className="space-y-4">
          {preguntas
            .filter((p) => p.prioridad === grupoAbierto)
            .map((p) => (
              <div key={p.id} className={`rounded-xl border p-5 shadow-sm transition-all ${CONFIG_PRIORIDAD[p.prioridad].clase}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                    {p.nodo_tipo}
                  </span>
                  {p.agrupa_count && p.agrupa_count > 0 ? (
                    <span className="text-[11px] bg-faro-navy/10 text-faro-navy font-semibold px-2 py-0.5 rounded-full">
                      Agrupa {p.agrupa_count + 1} preguntas
                    </span>
                  ) : null}
                </div>
                <p className="mb-2 text-sm font-medium text-gray-900 leading-relaxed">{p.texto_pregunta}</p>

                {p.agrupa_count && p.agrupa_count > 0 && (p.nodos_involucrados?.length ?? 0) > 0 ? (
                  <p className="mb-3 text-xs text-gray-500 font-medium">
                    agrupa {p.agrupa_count + 1} preguntas de: {p.nodos_involucrados?.join(", ")}
                  </p>
                ) : (p.nodos_involucrados?.length ?? 0) > 0 ? (
                  <p className="mb-3 text-xs text-gray-500 font-mono">
                    Nodos involucrados: {(p.nodos_involucrados ?? p.nodos_afectados).join(" → ")}
                  </p>
                ) : p.nodos_afectados.length > 0 ? (
                  <p className="mb-3 text-xs text-gray-500 font-mono">
                    Afecta: {p.nodos_afectados.join(" → ")}
                  </p>
                ) : null}

                <TriagePregunta
                  preguntaId={p.id}
                  projectId={projectId}
                  textoPregunta={p.texto_pregunta}
                  onResuelta={cargar}
                />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
