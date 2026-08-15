"use client";

/**
 * ContadorPreguntasPrioridad.tsx
 *
 * Widget pequeño para el Dashboard: cuenta preguntas abiertas por
 * prioridad. Lectura pura del mismo endpoint que ya usa
 * PreguntasPendientesAgrupadas — no duplica lógica de backend.
 *
 * IMPORTANTE PARA ANTIGRAVITY: integrar junto a TarjetaConvergencia,
 * respetando el mismo principio de "bajo demanda" — este widget SÍ
 * puede cargar automáticamente al entrar al Dashboard (es una simple
 * lectura de conteo, no dispara ningún cálculo LLM ni recalcula MCI),
 * a diferencia de TarjetaConvergencia que es explícitamente manual.
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
      href={`/proyectos/${projectId}/preguntas`}
      className="block rounded-lg border p-4 hover:bg-gray-50"
    >
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Preguntas pendientes</h3>
      {totalAbiertas === 0 ? (
        <p className="text-sm text-green-600">✅ Ninguna abierta</p>
      ) : (
        <div className="flex gap-3 text-sm">
          {conteo.P1 > 0 && <span className="text-red-600">🔴 {conteo.P1} críticas</span>}
          {conteo.P2 > 0 && <span className="text-yellow-600">🟡 {conteo.P2} importantes</span>}
          {conteo.P3 > 0 && <span className="text-green-600">🟢 {conteo.P3} posteriores</span>}
        </div>
      )}
    </Link>
  );
}
