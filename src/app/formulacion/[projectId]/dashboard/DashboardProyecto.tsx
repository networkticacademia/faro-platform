"use client";

import { useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import NavegacionNodos from "@/components/faro/NavegacionNodos";
import TarjetaConvergencia from "./TarjetaConvergencia";
import ContadorPreguntasPrioridad from "@/components/faro/ContadorPreguntasPrioridad";

interface SesionMci {
  id: string;
  project_id: string;
  modulo: string;
  iteracion: number;
  l_faro: number;
  omega: number;
  convergio: boolean;
  tiempo_ms: number | null;
  modelo_usado: string | null;
  created_at: string;
}

import { verificarHiloConductor, resumenBrechas } from "@/lib/faro/verificadorEstructural";
import { NODOS_REQUERIDOS } from "@/lib/faro/resumenNodos";
import type { NovaOutput } from "@/lib/faro/nova";
import type { ObjetivosOutput } from "@/lib/faro/objetivos";
import type { MetodologiaOutput } from "@/lib/faro/metodologia";

interface NodoConfirmado {
  tipo: string;
  contenido: NovaOutput | ObjetivosOutput | MetodologiaOutput | Record<string, unknown>;
  confirmado_humano: boolean;
  delta_nodal: number | null;
  created_at: string;
  iteracion: number;
}

interface ProjectRow {
  id: string;
  titulo_provisional: string | null;
  nu: string;
  tau: string;
  alpha_area: string;
}

const NODOS_ORDEN = ["RUTA", "NOVA", "OBJETIVOS", "METODOLOGIA"] as const;
const NODO_LABEL: Record<string, string> = {
  RUTA: "RUTA",
  NOVA: "NOVA",
  OBJETIVOS: "Objetivos",
  METODOLOGIA: "Metodología",
};
const NODO_COLOR: Record<string, string> = {
  RUTA: "#9B4A2E",
  NOVA: "#2B6CB0",
  OBJETIVOS: "#5B6D7A",
  METODOLOGIA: "#0F6E56",
};

interface ActividadOpenRouter {
  date: string;
  model: string;
  provider_name: string;
  requests: number;
  usage: number;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
}

interface UltimaConvergencia {
  convergio: boolean;
  es_provisional: boolean;
  l_faro_proyecto: number | null;
  tau_c_proyecto: number | null;
  calculado_en: string;
}

export default function DashboardProyecto({
  project,
  sesiones,
  nodosConfirmados,
  actividadOpenRouter,
  ultimaConvergencia,
}: {
  project: ProjectRow;
  sesiones: SesionMci[];
  nodosConfirmados: NodoConfirmado[];
  actividadOpenRouter: ActividadOpenRouter[] | null;
  ultimaConvergencia: UltimaConvergencia | null;
}) {
  const router = useRouter();
  const ultimaPorModulo: Record<string, SesionMci | undefined> = {};
  for (const s of sesiones) {
    ultimaPorModulo[s.modulo] = s;
  }

  const confirmadoPorTipo: Record<string, boolean> = {};
  const contenidoConfirmadoPorTipo: Record<string, NodoConfirmado["contenido"]> = {};
  for (const n of nodosConfirmados) {
    if (n.confirmado_humano && !(n.tipo in confirmadoPorTipo)) {
      confirmadoPorTipo[n.tipo] = true;
      contenidoConfirmadoPorTipo[n.tipo] = n.contenido;
    }
  }

  const brechas = verificarHiloConductor({
    nova: (contenidoConfirmadoPorTipo["NOVA"] as NovaOutput) ?? null,
    objetivos: (contenidoConfirmadoPorTipo["OBJETIVOS"] as ObjetivosOutput) ?? null,
    metodologia: (contenidoConfirmadoPorTipo["METODOLOGIA"] as MetodologiaOutput) ?? null,
  });
  const resumen = resumenBrechas(brechas);

  const datosGrafica = sesiones.map((s, i) => ({
    orden: i + 1,
    modulo: NODO_LABEL[s.modulo] ?? s.modulo,
    l_faro: s.l_faro,
    fecha: new Date(s.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }),
  }));

  // Para la tarjeta de "Progreso": los 6 nodos requeridos (misma fuente
  // que usa TarjetaConvergencia/el endpoint de convergencia), NO los 4 de
  // NODOS_ORDEN (que solo maneja las tarjetas de sesión de abajo).
  const nodosRequeridosConfirmados = NODOS_REQUERIDOS.filter((n) => confirmadoPorTipo[n]).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <NavegacionNodos projectId={project.id} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-faro-navy">Dashboard del proyecto</h1>
          <p className="text-sm text-gray-600">
            {project.titulo_provisional ?? "Sin título provisional"} — {project.tau} · {project.nu} · {project.alpha_area}
          </p>
        </div>
        <button
          onClick={() => router.refresh()}
          className="text-xs px-3 py-1.5 rounded-lg border border-faro-navy/20 bg-white text-faro-navy font-medium hover:bg-faro-navy/5 transition-colors flex items-center gap-1.5 shadow-sm"
        >
          🔄 Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="sm:col-span-1 rounded-2xl bg-faro-navy text-white p-6 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-black">
            {nodosRequeridosConfirmados}/{NODOS_REQUERIDOS.length}
          </span>
          <span className="text-[11px] uppercase tracking-widest opacity-70 mt-1">Nodos confirmados</span>
          {/* Deliberadamente NO se muestra como "% de progreso" — completitud
              de nodos y convergencia (L_FARO ≤ τc) son cosas distintas; un
              proyecto puede tener los 6 nodos confirmados y seguir sin
              converger. El estado de abajo viene de la última verificación
              real (tabla convergencia_proyecto), no se recalcula aquí. */}
          {ultimaConvergencia ? (
            <span
              className={`mt-2 text-[10px] px-2 py-0.5 rounded-full ${
                ultimaConvergencia.es_provisional
                  ? "bg-amber-400/20 text-amber-200"
                  : ultimaConvergencia.convergio
                  ? "bg-green-400/20 text-green-200"
                  : "bg-red-400/20 text-red-200"
              }`}
            >
              {ultimaConvergencia.es_provisional
                ? "Convergencia provisional"
                : ultimaConvergencia.convergio
                ? "Convergió"
                : "Aún no converge"}
            </span>
          ) : (
            <span className="mt-2 text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">
              Convergencia: sin verificar
            </span>
          )}
        </div>

        {NODOS_ORDEN.map((tipo) => {
          const sesion = ultimaPorModulo[tipo];
          const confirmado = confirmadoPorTipo[tipo] ?? false;
          return (
            <div key={tipo} className="rounded-2xl border bg-white p-4 flex flex-col">
              <span className="text-xs font-semibold" style={{ color: NODO_COLOR[tipo] }}>
                {NODO_LABEL[tipo]}
              </span>
              {sesion ? (
                <>
                  <span className="text-2xl font-bold text-faro-navy mt-1">
                    {sesion.l_faro.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-gray-400">L_FARO (iteración {sesion.iteracion})</span>
                  <span
                    className={`mt-2 text-[10px] px-2 py-0.5 rounded-full self-start ${
                      confirmado
                        ? "bg-green-100 text-green-700"
                        : sesion.convergio
                        ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {confirmado ? "Confirmado" : sesion.convergio ? "Converge, sin confirmar" : "En proceso"}
                  </span>
                </>
              ) : (
                <span className="text-xs text-gray-400 mt-2">Sin generar todavía</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border bg-white p-6">
        <h3 className="text-sm font-semibold text-faro-navy mb-1">
          Trayectoria de L_FARO — todas las iteraciones del proyecto
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Cada punto es una generación real de un nodo, en el orden en que ocurrió. Más bajo es mejor —
          el objetivo es que baje hasta τc conforme se corrige y confirma cada nodo.
        </p>
        {datosGrafica.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={datosGrafica} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="orden" tick={{ fontSize: 11 }} label={{ value: "Iteración global", position: "bottom", offset: 10, fontSize: 11 }} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => typeof value === "number" ? value.toFixed(3) : String(value ?? "")}
                labelFormatter={(label, payload) =>
                  payload?.[0]?.payload ? `${payload[0].payload.modulo} — ${payload[0].payload.fecha}` : label
                }
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} verticalAlign="top" height={24} />
              <ReferenceLine y={0.3} stroke="#0F6E56" strokeDasharray="4 3" label={{ value: "τc referencia", position: "insideBottomLeft", fontSize: 10, fill: "#0F6E56", dy: -6 }} />
              <Line type="monotone" dataKey="l_faro" name="L_FARO" stroke="#2B6CB0" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400 py-12 text-center">
            Todavía no hay sesiones registradas — genere al menos un nodo para ver la trayectoria.
          </p>
        )}
        <p className="text-[10px] text-gray-400 mt-2">
          Nota: τc no es un umbral fijo — se calcula por proyecto (nivel, tipo, U₀). La línea de
          referencia es orientativa, no el valor exacto de este proyecto.
        </p>
      </div>

      {sesiones.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border bg-white p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Tiempo total de generación</p>
            <p className="text-2xl font-bold text-faro-navy mt-1">
              {(
                sesiones.reduce((acc, s) => acc + (s.tiempo_ms ?? 0), 0) / 1000
              ).toFixed(1)}{" "}
              s
            </p>
            <p className="text-[11px] text-gray-400">
              Promedio por generación:{" "}
              {(
                sesiones.reduce((acc, s) => acc + (s.tiempo_ms ?? 0), 0) /
                sesiones.length /
                1000
              ).toFixed(1)}{" "}
              s
            </p>
          </div>
          <div className="rounded-2xl border bg-white p-5 sm:col-span-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Modelo(s) usado(s)</p>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set(sesiones.map((s) => s.modelo_usado).filter(Boolean))).map((m) => (
                <span key={m} className="text-xs bg-faro-navy/5 text-faro-navy px-2.5 py-1 rounded-full">
                  {m}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              {sesiones.length} generaciones registradas en total.
            </p>
          </div>
        </div>
      )}

      <div id="integridad-hilo-conductor" className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-faro-navy">Integridad referencial</h3>
          {resumen.total === 0 ? (
            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              sin brechas detectadas
            </span>
          ) : (
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${resumen.criticas > 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
              {resumen.criticas} crítica{resumen.criticas !== 1 ? "s" : ""} · {resumen.advertencias} advertencia{resumen.advertencias !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Verificación determinística (sin LLM): confirma que cada referencia por ID entre
          NOVA→Objetivos→Metodología resuelva a algo real. No juzga si la referencia tiene
          sentido semántico — eso es trabajo futuro de SIGMA Guard.
        </p>
        {brechas.length > 0 ? (
          <ul className="space-y-2">
            {brechas.map((b, i) => (
              <li
                key={i}
                className={`text-xs rounded-md p-2 border ${
                  b.severidad === "critica" ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"
                }`}
              >
                <span className="font-mono text-[10px] opacity-70">{b.origen} · {b.campo}</span>
                <p>{b.mensaje}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-400">
            {confirmadoPorTipo["NOVA"] || confirmadoPorTipo["OBJETIVOS"] || confirmadoPorTipo["METODOLOGIA"]
              ? "Todas las referencias por ID entre nodos confirmados resuelven correctamente."
              : "Confirme al menos NOVA y Objetivos para activar esta verificación."}
          </p>
        )}
      </div>

      <ContadorPreguntasPrioridad projectId={project.id} />

      <TarjetaConvergencia projectId={project.id} brechasCriticas={resumen.criticas} />

      {actividadOpenRouter && actividadOpenRouter.length > 0 && (
        <div className="rounded-2xl border bg-white p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-faro-navy">Actividad de OpenRouter — últimos 30 días</h3>
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              cuenta completa, no solo este proyecto
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Todos los proyectos de FARO comparten la misma clave de OpenRouter — estos números
            no se pueden separar por proyecto todavía.
          </p>

          {(() => {
            const totalUsage = actividadOpenRouter.reduce((acc, a) => acc + a.usage, 0);
            const totalRequests = actividadOpenRouter.reduce((acc, a) => acc + a.requests, 0);
            const porModelo = new Map<string, { usage: number; requests: number; tokens: number }>();
            for (const a of actividadOpenRouter) {
              const prev = porModelo.get(a.model) ?? { usage: 0, requests: 0, tokens: 0 };
              porModelo.set(a.model, {
                usage: prev.usage + a.usage,
                requests: prev.requests + a.requests,
                tokens: prev.tokens + a.prompt_tokens + a.completion_tokens + a.reasoning_tokens,
              });
            }

            return (
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-2xl font-bold text-faro-navy">${totalUsage.toFixed(2)}</p>
                    <p className="text-[11px] text-gray-400">Gasto total (USD)</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-faro-navy">{totalRequests}</p>
                    <p className="text-[11px] text-gray-400">Solicitudes totales</p>
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pr-2 py-1">Modelo</th>
                      <th className="pr-2 py-1 text-right">Solicitudes</th>
                      <th className="pr-2 py-1 text-right">Tokens</th>
                      <th className="pr-2 py-1 text-right">Gasto (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(porModelo.entries())
                      .sort((a, b) => b[1].usage - a[1].usage)
                      .map(([modelo, datos]) => (
                        <tr key={modelo} className="border-b last:border-0">
                          <td className="pr-2 py-1">{modelo}</td>
                          <td className="pr-2 py-1 text-right">{datos.requests}</td>
                          <td className="pr-2 py-1 text-right">{datos.tokens.toLocaleString("es-CO")}</td>
                          <td className="pr-2 py-1 text-right">${datos.usage.toFixed(2)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
