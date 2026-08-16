"use client";

/**
 * ContadorPreguntasPrioridad.tsx
 *
 * Widget pequeño para el Dashboard: cuenta preguntas abiertas por prioridad.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

interface Conteo {
  P1: number;
  P2: number;
  P3: number;
}

export default function ContadorPreguntasPrioridad({ projectId }: { projectId: string }) {
  const [conteo, setConteo] = useState<Conteo | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/mci/preguntas/pendientes?project_id=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelado) setConteo(data.conteo ?? { P1: 0, P2: 0, P3: 0 });
      });
    return () => {
      cancelado = true;
    };
  }, [projectId]);

  if (!conteo) return null;

  const totalAbiertas = conteo.P1 + conteo.P2 + conteo.P3;

  return (
    <Link
      href={`/formulacion/${projectId}/preguntas`}
      className="block rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition-all border-gray-100"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-faro-navy">Preguntas pendientes</h3>
        <span className="text-xs font-semibold text-white bg-faro-navy px-3 py-1.5 rounded-lg hover:bg-faro-navy/90 transition-colors whitespace-nowrap">
          Responder preguntas críticas →
        </span>
      </div>
      {totalAbiertas === 0 ? (
        <p className="text-xs text-green-600 font-medium">✅ Sin preguntas abiertas pendientes en el proyecto</p>
      ) : (
        <div className="flex flex-wrap gap-3 text-xs font-medium mt-1">
          {conteo.P1 > 0 && <span className="text-red-600 bg-red-50 px-2 py-1 rounded-md border border-red-100">🔴 {conteo.P1} críticas</span>}
          {conteo.P2 > 0 && <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">🟡 {conteo.P2} importantes</span>}
          {conteo.P3 > 0 && <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">🟢 {conteo.P3} posteriores</span>}
        </div>
      )}
    </Link>
  );
}
