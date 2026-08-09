// ============================================================
// FARO — Sub-clasificador de subtipo DTI (solo cuando tau='dti')
//
// v2 (2026-08-09) — corregido. YA NO pregunta el carácter
// Ciencia/Tecnología/Innovación (eso ya lo capturó M0 en la pregunta
// OPCIONES_TIPO, guardado en tau). Solo aparece cuando tau ya es
// 'dti' y falta precisar subtipo_dti, con una sola pregunta de un
// clic, para que NOVA sepa si "Avance" es TRL puro o TRL+mercado.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

"use client";

import { useState } from "react";
import { OPCIONES_SUBTIPO_DTI, type SubtipoDti } from "@/lib/faro/tipologiaProyecto";
import type { TipoProyecto } from "@/lib/faro/types";

export function ClasificadorSubtipoDti({
  projectId,
  tau,
  subtipoDtiActual,
  onClasificado,
}: {
  projectId: string;
  tau: TipoProyecto;
  subtipoDtiActual: SubtipoDti | null;
  onClasificado?: (nuevoSubtipo: SubtipoDti) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si el proyecto no es DTI, este subtipo no aplica — Avance ya se
  // resuelve como "conocimiento" directamente, sin preguntar nada más.
  if (tau !== "dti") return null;

  async function elegir(valor: SubtipoDti) {
    setGuardando(true);
    setError(null);
    try {
      const respuesta = await fetch(`/api/mci/proyecto/subtipo-dti`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, subtipo_dti: valor }),
      });
      if (!respuesta.ok) throw new Error("No se pudo guardar la clasificación");
      onClasificado?.(valor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setGuardando(false);
    }
  }

  if (subtipoDtiActual) {
    const etiqueta = OPCIONES_SUBTIPO_DTI.find((o) => o.valor === subtipoDtiActual)?.etiqueta;
    return (
      <div className="text-sm text-gray-600">
        Subtipo DTI: <span className="font-medium text-gray-900">{etiqueta}</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 space-y-2">
      <p className="text-sm font-medium text-gray-800">
        Este proyecto es de Desarrollo Tecnológico e Innovación — ¿cuál subtipo lo describe mejor?
      </p>
      <div className="flex gap-2 flex-wrap">
        {OPCIONES_SUBTIPO_DTI.map((op) => (
          <button
            key={op.valor}
            onClick={() => elegir(op.valor)}
            disabled={guardando}
            className="rounded px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 hover:bg-blue-50 hover:border-blue-400 disabled:opacity-50"
          >
            {op.etiqueta}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
