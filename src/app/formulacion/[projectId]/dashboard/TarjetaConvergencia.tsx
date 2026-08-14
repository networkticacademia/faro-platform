"use client";

import { useState } from "react";
import Link from "next/link";
import type { ResultadoConvergenciaProyecto, CondicionConvergencia } from "@/lib/faro/convergenciaProyecto";
import type { ResultadoCoherenciaPar } from "@/lib/faro/verificadorSemantico";

interface ResultadoCompleto extends ResultadoConvergenciaProyecto {
  deltas_ij: ResultadoCoherenciaPar[] | null;
  phi_detalle: { itemsConsiderados: number; itemsSinPeso: number } | null;
}

const CONDICION_ICONO: Record<CondicionConvergencia["id"], string> = {
  completitud:     "📋",
  l_faro:         "📐",
  estructural:     "🔗",
  contradicciones: "⚡",
  cronograma:      "📅",
};

const NODO_SLUG_MAP: Record<string, string> = {
  RUTA: "",
  NOVA: "/nova",
  OBJETIVOS: "/objetivos",
  MARCO_REFERENCIAL: "/marco-referencial",
  METODOLOGIA: "/metodologia",
  IMPACTOS_DELIMITACION: "/impactos-delimitacion",
  PRESUPUESTO: "/presupuesto",
};

const NODO_LABEL_MAP: Record<string, string> = {
  RUTA: "RUTA",
  NOVA: "NOVA",
  OBJETIVOS: "Objetivos",
  MARCO_REFERENCIAL: "Marco Referencial",
  METODOLOGIA: "Metodología",
  IMPACTOS_DELIMITACION: "Impactos y Delimitación",
  PRESUPUESTO: "Presupuesto",
};

export default function TarjetaConvergencia({
  projectId,
  brechasCriticas = 0,
}: {
  projectId: string;
  brechasCriticas?: number;
}) {
  const [resultado, setResultado] = useState<ResultadoCompleto | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verificar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/convergencia/calcular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");
      setResultado(data.resultado as ResultadoCompleto);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-faro-navy">Convergencia del proyecto</h3>
        {resultado && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              resultado.es_provisional
                ? "bg-amber-100 text-amber-700"
                : resultado.convergio
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {resultado.es_provisional ? "Provisional" : resultado.convergio ? "Convergió" : "No convergió"}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-400 mb-4">
        Verificación semántica entre nodos (δᵢⱼ) + cobertura de rúbrica (Φ) — requiere varias llamadas al
        orquestador. No corre automáticamente.
      </p>

      {/* Botón principal o bloqueo por brechas críticas */}
      {brechasCriticas > 0 ? (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
          Corrija las {brechasCriticas} brecha{brechasCriticas !== 1 ? "s" : ""} crítica{brechasCriticas !== 1 ? "s" : ""} de{" "}
          <a href="#integridad-hilo-conductor" className="underline font-semibold hover:text-red-900">
            Integridad del hilo conductor
          </a>{" "}
          antes de verificar convergencia (evita gastar tokens en una verificación que ya sabemos que va a fallar).
        </div>
      ) : (
        !cargando && (
          <button
            id="btn-verificar-convergencia"
            onClick={verificar}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-faro-navy text-white text-xs font-medium hover:bg-faro-navy/90 transition-colors"
          >
            {resultado ? "↺ Recalcular convergencia" : "Verificar convergencia"}
          </button>
        )
      )}

      {cargando && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <svg className="animate-spin h-4 w-4 text-faro-navy" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Verificando — esto puede tardar un minuto (varias llamadas LLM)…
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-md p-2">{error}</p>
      )}

      {/* Resultado */}
      {resultado && !cargando && (
        <div className="mt-5 space-y-5">
          {/* Aviso provisional */}
          {resultado.es_provisional && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <span>⚠️</span>
              <span>
                <strong>Convergencia provisional</strong> — faltan piezas por calcular
                {resultado.promedio_delta_ij === null && " (δᵢⱼ no calculado)"}
                {resultado.phi === null && " (Φ no calculado — no hay rúbrica cargada o ningún nodo esperado está confirmado aún)"}
                . El resultado es orientativo, no definitivo.
              </span>
            </div>
          )}

          {/* Indicador grande */}
          <div className="flex items-center gap-4">
            <span className="text-5xl">{resultado.convergio ? "✅" : "⏳"}</span>
            <div>
              <p className="text-lg font-bold text-faro-navy">
                {resultado.convergio ? "El proyecto convergió" : "Aún no converge"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                L_FARO<sub>proyecto</sub> ={" "}
                <span className="font-mono font-semibold">{resultado.l_faro_proyecto.toFixed(3)}</span>
                {" · "}τc ={" "}
                <span className="font-mono">{resultado.tau_c_proyecto.toFixed(3)}</span>
              </p>
              {resultado.phi !== null && (
                <p className="text-xs text-gray-500">
                  Φ (cobertura rúbrica) ={" "}
                  <span className="font-mono font-semibold">{resultado.phi.toFixed(3)}</span>
                  {resultado.phi_detalle && (
                    <span className="text-gray-400">
                      {" "}({resultado.phi_detalle.itemsConsiderados} ítem(s) considerado(s)
                      {resultado.phi_detalle.itemsSinPeso > 0
                        ? `, ${resultado.phi_detalle.itemsSinPeso} sin peso`
                        : ""})
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* 5 condiciones */}
          <ul className="space-y-2">
            {resultado.condiciones.map((c) => (
              <li
                key={c.id}
                className={`flex flex-col gap-1 rounded-lg px-3 py-2 text-xs border ${
                  c.cumple
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-base leading-none">{CONDICION_ICONO[c.id]}</span>
                  <div>
                    <span className="font-semibold">{c.nombre}: </span>
                    {c.explicacion}
                  </div>
                </div>

                {/* Si L_FARO no cumple, mostrar desglose por nodo ordenado */}
                {c.id === "l_faro" && !c.cumple && resultado.detalle_l_faro_por_nodo && (
                  <div className="mt-2 pt-2 border-t border-red-200/60">
                    <p className="font-semibold text-[11px] mb-1.5 text-red-900">
                      Desglose de L_FARO por nodo (ordenado de mayor a menor incertidumbre):
                    </p>
                    <div className="space-y-1.5">
                      {resultado.detalle_l_faro_por_nodo.map((d) => {
                        const slug = NODO_SLUG_MAP[d.nodo] ?? "";
                        const label = NODO_LABEL_MAP[d.nodo] ?? d.nodo;
                        return (
                          <div
                            key={d.nodo}
                            className="flex items-start justify-between gap-2 bg-white/80 rounded p-2 border border-red-200/50"
                          >
                            <div className="space-y-0.5 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-faro-navy">{label}</span>
                                <span className="font-mono text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                                  L_FARO: {d.l_faro.toFixed(3)}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-700">{d.sugerencia}</p>
                            </div>
                            <Link
                              href={`/formulacion/${projectId}${slug}`}
                              className="text-[11px] font-medium text-faro-navy hover:underline whitespace-nowrap bg-faro-navy/5 px-2 py-1 rounded"
                            >
                              Ir a {label} →
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Tabla de δᵢⱼ */}
          {resultado.deltas_ij && resultado.deltas_ij.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-faro-navy mb-2">
                Coherencia semántica entre nodos (δᵢⱼ)
                {resultado.promedio_delta_ij !== null && (
                  <span className="ml-2 font-normal text-gray-500">
                    promedio: <span className="font-mono">{resultado.promedio_delta_ij.toFixed(3)}</span>
                  </span>
                )}
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pr-2 py-1">Par</th>
                    <th className="pr-2 py-1 text-right">δᵢⱼ</th>
                    <th className="py-1">Resumen</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.deltas_ij.map((d, i) => (
                    <tr key={i} className="border-b last:border-0 align-top">
                      <td className="pr-2 py-1 font-mono text-[10px] whitespace-nowrap">
                        {d.nodoOrigen} → {d.nodoDestino}
                      </td>
                      <td
                        className={`pr-2 py-1 text-right font-mono font-semibold ${
                          d.delta_ij <= 0.2
                            ? "text-green-600"
                            : d.delta_ij <= 0.5
                            ? "text-amber-600"
                            : "text-red-600"
                        }`}
                      >
                        {d.delta_ij.toFixed(3)}
                      </td>
                      <td className="py-1 text-gray-600">{d.resumen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
