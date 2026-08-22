"use client";

import { useState } from "react";
import Link from "next/link";
import type { ResultadoConvergenciaProyecto, CondicionConvergencia } from "@/lib/faro/convergenciaProyecto";
import type { ResultadoCoherenciaPar } from "@/lib/faro/verificadorSemantico";
import HiloConductorDiagrama from "./HiloConductorDiagrama";

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
            Integridad referencial
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

          {/* Indicador grande y Capa de Decisión Transducida */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-4">
              <span className="text-4xl">
                {resultado.decision?.estado === "CONVERGE"
                  ? "✅"
                  : resultado.decision?.estado === "REVISION"
                  ? "⚠️"
                  : "⏳"}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold text-faro-navy">
                    {resultado.decision?.estado === "CONVERGE"
                      ? "Estado: CONVERGE (Listo para exportar)"
                      : resultado.decision?.estado === "REVISION"
                      ? "Estado: REVISIÓN (Banda de rechazo)"
                      : "Estado: NO CONVERGE (Continuar iterando)"}
                  </p>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      resultado.decision?.estado === "CONVERGE"
                        ? "bg-emerald-100 text-emerald-800"
                        : resultado.decision?.estado === "REVISION"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {resultado.decision?.estado ?? (resultado.convergio ? "CONVERGE" : "NO CONVERGE")}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  L_FARO<sub>proyecto</sub> ={" "}
                  <span className="font-mono font-semibold">{resultado.l_faro_proyecto.toFixed(3)}</span>
                  {" · "}τc ={" "}
                  <span className="font-mono">{resultado.tau_c_proyecto.toFixed(3)}</span>
                  {resultado.decision && (
                    <>
                      {" · "}η = <span className="font-mono font-semibold">{resultado.decision.eta.toFixed(3)}</span>
                      {" · "}T = <span className="font-mono">{resultado.decision.temperatura.toFixed(2)}</span>
                    </>
                  )}
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

            {/* Probabilidades Calibradas */}
            {resultado.decision && (
              <div className="w-full sm:w-auto flex flex-col sm:items-end border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-4">
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">
                  Probabilidades (Modelo Ordinal)
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <div className="text-center">
                    <div className="font-bold text-rose-700 font-mono">
                      {resultado.decision.probabilidades_porcentaje.no_converge}%
                    </div>
                    <div className="text-[10px] text-gray-500">No converge</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-amber-700 font-mono">
                      {resultado.decision.probabilidades_porcentaje.revision}%
                    </div>
                    <div className="text-[10px] text-gray-500">Revisión</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-emerald-700 font-mono">
                      {resultado.decision.probabilidades_porcentaje.converge}%
                    </div>
                    <div className="text-[10px] text-gray-500">Converge</div>
                  </div>
                </div>
                <p className="text-[10px] text-amber-700 font-medium mt-1.5 flex items-center gap-1">
                  <span>ℹ️</span> Probabilidad preliminar — parámetros sin calibrar
                </p>
              </div>
            )}
          </div>

          {/* Compuertas duras fallidas si existen */}
          {resultado.decision && !resultado.decision.compuertas_aprobadas && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5 text-rose-900">
                <span>🛑</span> Bloqueo por compuertas duras binarias ({resultado.decision.compuertas_fallidas.length})
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-700">
                {resultado.decision.compuertas_fallidas.map((f, idx) => (
                  <li key={idx}>{f}</li>
                ))}
              </ul>
            </div>
          )}

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
                        const label = NODO_LABEL_MAP[d.nodo] ?? d.nodo;
                        // La sugerencia "Tiene N pregunta(s) sin resolver..." queda cubierta
                        // por el enlace único de abajo — mostrarla aquí por nodo es redundante.
                        // Las demás variantes (confianza baja/media, L_FARO alto sin causa) sí
                        // aportan información distinta y se conservan.
                        return (
                          <div
                            key={d.nodo}
                            className="bg-white/80 rounded p-2 border border-red-200/50"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-faro-navy">{label}</span>
                              <span className="font-mono text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                                L_FARO: {d.l_faro.toFixed(3)}
                              </span>
                            </div>
                            {d.num_preguntas_pendientes === 0 && (
                              <p className="text-[11px] text-gray-700 mt-0.5">{d.sugerencia}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {resultado.detalle_l_faro_por_nodo.some((d) => d.num_preguntas_pendientes > 0) && (
                      <Link
                        href={`/formulacion/${projectId}/preguntas`}
                        className="mt-2 inline-block text-[11px] font-semibold text-faro-navy hover:underline"
                      >
                        Responda las preguntas críticas →
                      </Link>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Hilo conductor — reemplaza la tabla de texto de δᵢⱼ por un
              diagrama; mismo dato (resultado.deltas_ij / detalle_l_faro_por_nodo),
              sin llamada nueva. */}
          {resultado.detalle_l_faro_por_nodo.length > 0 && (
            <HiloConductorDiagrama
              projectId={projectId}
              detalleLFaroPorNodo={resultado.detalle_l_faro_por_nodo}
              deltasIj={resultado.deltas_ij}
              tauCProyecto={resultado.tau_c_proyecto}
            />
          )}
        </div>
      )}
    </div>
  );
}
