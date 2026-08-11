"use client";

import NavegacionNodos from "@/components/faro/NavegacionNodos";
import type { MetodologiaOutput, RubroPresupuesto, FuentePresupuesto } from "@/lib/faro/metodologia";
import {
  RUBRO_PRESUPUESTO_LABEL,
  FUENTE_PRESUPUESTO_LABEL,
  valorTotalItem,
  totalPresupuestoActividad,
  totalPresupuestoProyecto,
  resumenPorRubro,
  resumenPorFuente,
} from "@/lib/faro/metodologia";

interface ProjectRow {
  id: string;
  titulo_provisional: string | null;
  tau: string;
  nu: string;
  alpha_area: string;
}

function formatoCOP(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor);
}

export default function PresupuestoProyecto({
  project,
  metodologia,
  nodoId,
}: {
  project: ProjectRow;
  metodologia: (MetodologiaOutput & { matriz_consistencia_extendida?: unknown }) | null;
  nodoId: string | null;
}) {
  if (!metodologia) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <NavegacionNodos projectId={project.id} />
        <div className="rounded-2xl border bg-white p-10 text-center">
          <p className="text-gray-600">
            Todavía no hay un nodo Metodología <strong>confirmado</strong> para este proyecto —
            el presupuesto se construye ahí, actividad por actividad. Vaya a Metodología,
            genere y confirme la propuesta, y este resumen se llenará solo.
          </p>
        </div>
      </div>
    );
  }

  const planPorObjetivo = metodologia.plan_por_objetivo ?? [];
  const totalProyecto = totalPresupuestoProyecto(planPorObjetivo);
  const rubros = resumenPorRubro(planPorObjetivo);
  const fuentes = resumenPorFuente(planPorObjetivo);

  const totalContrapartida = fuentes.contrapartida_especie + fuentes.contrapartida_efectivo;
  const totalFinanciado = fuentes.financiador_efectivo;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <NavegacionNodos projectId={project.id} />

      <div>
        <h1 className="text-2xl font-semibold text-faro-navy">Presupuesto del proyecto</h1>
        <p className="text-sm text-gray-600">
          {project.titulo_provisional ?? "Sin título provisional"} — {project.tau} · {project.nu} · {project.alpha_area}
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          Formato de presentación tipo Colombia Científica / MGA — construido a partir de las
          actividades ya definidas en Metodología, no editable aquí. Para ajustar montos, vaya
          a Metodología → Editar antes de aceptar.
        </p>
      </div>

      {/* Resumen general */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-faro-navy text-white p-6">
          <p className="text-3xl font-black">{formatoCOP(totalProyecto)}</p>
          <p className="text-[11px] uppercase tracking-widest opacity-70 mt-1">Presupuesto total</p>
        </div>
        <div className="rounded-2xl border bg-white p-6">
          <p className="text-2xl font-bold text-faro-navy">{formatoCOP(totalFinanciado)}</p>
          <p className="text-[11px] text-gray-400 mt-1">
            Financiado ({totalProyecto > 0 ? ((totalFinanciado / totalProyecto) * 100).toFixed(1) : 0}%)
          </p>
        </div>
        <div className="rounded-2xl border bg-white p-6">
          <p className="text-2xl font-bold text-faro-navy">{formatoCOP(totalContrapartida)}</p>
          <p className="text-[11px] text-gray-400 mt-1">
            Contrapartida ({totalProyecto > 0 ? ((totalContrapartida / totalProyecto) * 100).toFixed(1) : 0}%)
          </p>
        </div>
      </div>

      {/* Resumen por rubro */}
      <div className="rounded-2xl border bg-white p-6">
        <h3 className="text-sm font-semibold text-faro-navy mb-3">Resumen por rubro (15 categorías oficiales)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pr-4 py-1.5">Rubro</th>
                <th className="pr-4 py-1.5 text-right">Valor</th>
                <th className="pr-4 py-1.5 text-right">% del total</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(RUBRO_PRESUPUESTO_LABEL) as RubroPresupuesto[])
                .filter((r) => rubros[r] > 0)
                .sort((a, b) => rubros[b] - rubros[a])
                .map((rubro) => (
                  <tr key={rubro} className="border-b last:border-0">
                    <td className="pr-4 py-1.5">{RUBRO_PRESUPUESTO_LABEL[rubro]}</td>
                    <td className="pr-4 py-1.5 text-right">{formatoCOP(rubros[rubro])}</td>
                    <td className="pr-4 py-1.5 text-right text-gray-400">
                      {totalProyecto > 0 ? ((rubros[rubro] / totalProyecto) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              {totalProyecto === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-amber-600">
                    Todavía no se ha ingresado ningún ítem de presupuesto.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen por fuente de cofinanciación */}
      <div className="rounded-2xl border bg-white p-6">
        <h3 className="text-sm font-semibold text-faro-navy mb-3">Cofinanciación</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pr-4 py-1.5">Fuente</th>
                <th className="pr-4 py-1.5 text-right">Valor</th>
                <th className="pr-4 py-1.5 text-right">% del total</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(FUENTE_PRESUPUESTO_LABEL) as FuentePresupuesto[]).map((fuente) => (
                <tr key={fuente} className="border-b last:border-0">
                  <td className="pr-4 py-1.5">{FUENTE_PRESUPUESTO_LABEL[fuente]}</td>
                  <td className="pr-4 py-1.5 text-right">{formatoCOP(fuentes[fuente])}</td>
                  <td className="pr-4 py-1.5 text-right text-gray-400">
                    {totalProyecto > 0 ? ((fuentes[fuente] / totalProyecto) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle por objetivo → actividad (equivalente a la hoja "PRODUCTOS ACTIVIDADES") */}
      <div className="rounded-2xl border bg-white p-6">
        <h3 className="text-sm font-semibold text-faro-navy mb-3">
          Detalle por objetivo y actividad
        </h3>
        <div className="space-y-4">
          {planPorObjetivo.map((plan, i) => (
            <div key={i} className="border-l-2 border-faro-navy/30 pl-3">
              <p className="text-sm font-medium mb-1.5">{plan.objetivo_especifico}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pr-2 py-1">Actividad</th>
                      <th className="pr-2 py-1">Rubros incluidos</th>
                      <th className="pr-2 py-1 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.actividades.map((a, j) => (
                      <tr key={j} className="border-b last:border-0 align-top">
                        <td className="pr-2 py-1">{a.actividad}</td>
                        <td className="pr-2 py-1 text-gray-500">
                          {(a.presupuesto ?? []).length > 0
                            ? Array.from(new Set((a.presupuesto ?? []).map((it) => RUBRO_PRESUPUESTO_LABEL[it.rubro]))).join("; ")
                            : "—"}
                        </td>
                        <td className="pr-2 py-1 text-right">
                          {(a.presupuesto ?? []).length > 0
                            ? formatoCOP(totalPresupuestoActividad(a))
                            : <span className="text-amber-600">sin definir</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {planPorObjetivo.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              No hay actividades registradas todavía en Metodología.
            </p>
          )}
        </div>
      </div>

      {/* Detalle línea por línea de todos los ítems, formato tabla exportable */}
      <div className="rounded-2xl border bg-white p-6">
        <h3 className="text-sm font-semibold text-faro-navy mb-3">Detalle línea por línea (todos los ítems)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pr-2 py-1">Rubro</th>
                <th className="pr-2 py-1">Descripción</th>
                <th className="pr-2 py-1 text-right">Cantidad</th>
                <th className="pr-2 py-1 text-right">Vr. unitario</th>
                <th className="pr-2 py-1 text-right">Vr. total</th>
                <th className="pr-2 py-1">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {planPorObjetivo.flatMap((plan) =>
                plan.actividades.flatMap((a) =>
                  (a.presupuesto ?? []).map((item, k) => (
                    <tr key={`${plan.objetivo_especifico}-${a.actividad}-${k}`} className="border-b last:border-0">
                      <td className="pr-2 py-1">{RUBRO_PRESUPUESTO_LABEL[item.rubro]}</td>
                      <td className="pr-2 py-1">{item.descripcion}</td>
                      <td className="pr-2 py-1 text-right">{item.cantidad}</td>
                      <td className="pr-2 py-1 text-right">{formatoCOP(item.valor_unitario)}</td>
                      <td className="pr-2 py-1 text-right font-medium">{formatoCOP(valorTotalItem(item))}</td>
                      <td className="pr-2 py-1 text-gray-500">{FUENTE_PRESUPUESTO_LABEL[item.fuente]}</td>
                    </tr>
                  ))
                )
              )}
              {totalProyecto === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-amber-600">
                    Sin ítems de presupuesto ingresados todavía.
                  </td>
                </tr>
              )}
            </tbody>
            {totalProyecto > 0 && (
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td colSpan={4} className="pr-2 py-2 text-right">TOTAL</td>
                  <td className="pr-2 py-2 text-right">{formatoCOP(totalProyecto)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
