"use client";

import { useState } from "react";
import NavegacionNodos from "@/components/faro/NavegacionNodos";
import type {
  MetodologiaOutput,
  RubroPresupuesto,
  FuentePresupuesto,
  ItemPresupuesto,
} from "@/lib/faro/metodologia";
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

const RUBROS_ORDENADOS = Object.keys(RUBRO_PRESUPUESTO_LABEL) as RubroPresupuesto[];
const FUENTES_ORDENADAS = Object.keys(FUENTE_PRESUPUESTO_LABEL) as FuentePresupuesto[];

function formatoCOP(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor);
}

export default function PresupuestoProyecto({
  project,
  metodologia,
  nodoId,
  confirmado,
}: {
  project: ProjectRow;
  metodologia: (MetodologiaOutput & { matriz_consistencia_extendida?: unknown }) | null;
  nodoId: string | null;
  confirmado: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [ed, setEd] = useState<MetodologiaOutput | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!metodologia) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <NavegacionNodos projectId={project.id} />
        <div className="rounded-2xl border bg-white p-10 text-center">
          <p className="text-gray-600">
            Todavía no hay un nodo Metodología <strong>confirmado</strong> para este proyecto —
            el presupuesto se construye ahí primero (actividades por objetivo). Vaya a
            Metodología, genere y confirme la propuesta, y después regrese aquí para asignar
            los valores.
          </p>
        </div>
      </div>
    );
  }

  const activo = ed ?? metodologia;
  const planPorObjetivo = activo.plan_por_objetivo ?? [];
  const totalProyecto = totalPresupuestoProyecto(planPorObjetivo);
  const rubros = resumenPorRubro(planPorObjetivo);
  const fuentes = resumenPorFuente(planPorObjetivo);
  const totalContrapartida = fuentes.contrapartida_especie + fuentes.contrapartida_efectivo;
  const totalFinanciado = fuentes.financiador_efectivo;

  function iniciarEdicion() {
    setEd(JSON.parse(JSON.stringify(metodologia)));
    setEditando(true);
    setError(null);
  }

  async function reabrirParaEditar() {
    if (!nodoId) return;
    setReabriendo(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/nodo/reabrir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodo_id: nodoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al reabrir el nodo.");
      iniciarEdicion();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setReabriendo(false);
    }
  }

  async function guardar() {
    if (!nodoId || !ed) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/ruta/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodo_id: nodoId, contenido_editado: ed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar.");
      setEditando(false);
      // Refresca la página del servidor para traer el nodo actualizado —
      // más simple y seguro que reconciliar estado local aquí.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setGuardando(false);
    }
  }

  function actualizarItem(i: number, j: number, k: number, cambio: Partial<ItemPresupuesto>) {
    if (!ed) return;
    const nuevos = [...ed.plan_por_objetivo];
    const nuevasAct = [...nuevos[i].actividades];
    const nuevosItems = [...(nuevasAct[j].presupuesto ?? [])];
    nuevosItems[k] = { ...nuevosItems[k], ...cambio };
    nuevasAct[j] = { ...nuevasAct[j], presupuesto: nuevosItems };
    nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
    setEd({ ...ed, plan_por_objetivo: nuevos });
  }

  function agregarItem(i: number, j: number) {
    if (!ed) return;
    const nuevos = [...ed.plan_por_objetivo];
    const nuevasAct = [...nuevos[i].actividades];
    const nuevoItem: ItemPresupuesto = {
      rubro: "materiales_insumos",
      descripcion: "",
      cantidad: 1,
      valor_unitario: 0,
      fuente: "financiador_efectivo",
    };
    nuevasAct[j] = { ...nuevasAct[j], presupuesto: [...(nuevasAct[j].presupuesto ?? []), nuevoItem] };
    nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
    setEd({ ...ed, plan_por_objetivo: nuevos });
  }

  function eliminarItem(i: number, j: number, k: number) {
    if (!ed) return;
    const nuevos = [...ed.plan_por_objetivo];
    const nuevasAct = [...nuevos[i].actividades];
    nuevasAct[j] = {
      ...nuevasAct[j],
      presupuesto: (nuevasAct[j].presupuesto ?? []).filter((_, idx) => idx !== k),
    };
    nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
    setEd({ ...ed, plan_por_objetivo: nuevos });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <NavegacionNodos projectId={project.id} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-faro-navy">Presupuesto del proyecto</h1>
          <p className="text-sm text-gray-600">
            {project.titulo_provisional ?? "Sin título provisional"} — {project.tau} · {project.nu} · {project.alpha_area}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Formato de presentación tipo Colombia Científica / MGA — las actividades vienen de
            Metodología (no se editan aquí), pero los valores de presupuesto sí se editan
            directamente en esta pantalla.
          </p>
        </div>
        {!editando && (
          confirmado ? (
            <button
              onClick={reabrirParaEditar}
              disabled={reabriendo}
              className="text-xs bg-amber-600 text-white rounded-md px-4 py-2 font-medium disabled:opacity-40 whitespace-nowrap"
            >
              {reabriendo ? "Reabriendo..." : "Reabrir para editar presupuesto"}
            </button>
          ) : (
            <button
              onClick={iniciarEdicion}
              className="text-xs bg-faro-navy text-white rounded-md px-4 py-2 font-medium whitespace-nowrap"
            >
              Editar presupuesto
            </button>
          )
        )}
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

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

      {!editando && (
        <>
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
                  {RUBROS_ORDENADOS.filter((r) => rubros[r] > 0)
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

          {/* Cofinanciación */}
          <div className="rounded-2xl border bg-white p-6">
            <h3 className="text-sm font-semibold text-faro-navy mb-3">Cofinanciación</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pr-4 py-1.5">Fuente</th>
                  <th className="pr-4 py-1.5 text-right">Valor</th>
                  <th className="pr-4 py-1.5 text-right">% del total</th>
                </tr>
              </thead>
              <tbody>
                {FUENTES_ORDENADAS.map((fuente) => (
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

          {/* Detalle línea por línea */}
          <div className="rounded-2xl border bg-white p-6">
            <h3 className="text-sm font-semibold text-faro-navy mb-3">Detalle línea por línea</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pr-2 py-1">Objetivo</th>
                    <th className="pr-2 py-1">Actividad</th>
                    <th className="pr-2 py-1">Rubro</th>
                    <th className="pr-2 py-1">Descripción</th>
                    <th className="pr-2 py-1 text-right">Cant.</th>
                    <th className="pr-2 py-1 text-right">Vr. unitario</th>
                    <th className="pr-2 py-1 text-right">Vr. total</th>
                    <th className="pr-2 py-1">Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {planPorObjetivo.flatMap((plan) =>
                    plan.actividades.flatMap((a) =>
                      (a.presupuesto ?? []).map((item, k) => (
                        <tr key={`${plan.objetivo_especifico}-${a.actividad}-${k}`} className="border-b last:border-0 align-top">
                          <td className="pr-2 py-1 text-gray-400">{plan.objetivo_especifico.slice(0, 30)}...</td>
                          <td className="pr-2 py-1 text-gray-400">{a.actividad.slice(0, 30)}...</td>
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
                      <td colSpan={8} className="py-4 text-center text-amber-600">
                        Sin ítems de presupuesto ingresados todavía. Use &quot;Editar presupuesto&quot; arriba.
                      </td>
                    </tr>
                  )}
                </tbody>
                {totalProyecto > 0 && (
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td colSpan={6} className="pr-2 py-2 text-right">TOTAL</td>
                      <td className="pr-2 py-2 text-right">{formatoCOP(totalProyecto)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* ============ MODO EDICIÓN ============ */}
      {editando && ed && (
        <div className="space-y-4">
          {ed.plan_por_objetivo.map((plan, i) => (
            <div key={i} className="rounded-2xl border bg-white p-5">
              <p className="text-sm font-medium mb-3">{plan.objetivo_especifico}</p>
              <div className="space-y-3">
                {plan.actividades.map((a, j) => (
                  <div key={j} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-600 mb-2">{a.actividad}</p>
                    <div className="space-y-1.5">
                      {(a.presupuesto ?? []).map((item, k) => (
                        <div key={k} className="flex flex-wrap gap-1.5 items-center bg-white rounded p-1.5 border">
                          <select
                            value={item.rubro}
                            onChange={(e) => actualizarItem(i, j, k, { rubro: e.target.value as RubroPresupuesto })}
                            className="text-xs border rounded px-1.5 py-1 bg-white text-gray-900 max-w-[180px]"
                          >
                            {RUBROS_ORDENADOS.map((r) => (
                              <option key={r} value={r}>{RUBRO_PRESUPUESTO_LABEL[r]}</option>
                            ))}
                          </select>
                          <input
                            value={item.descripcion}
                            onChange={(e) => actualizarItem(i, j, k, { descripcion: e.target.value })}
                            placeholder="Descripción / insumo"
                            className="flex-1 min-w-[140px] text-xs border rounded px-1.5 py-1 bg-white text-gray-900"
                          />
                          <label className="flex items-center gap-1 text-[10px] text-gray-500">
                            Cant.
                            <input
                              type="number"
                              value={item.cantidad}
                              onChange={(e) => actualizarItem(i, j, k, { cantidad: Number(e.target.value) })}
                              className="w-16 text-xs border rounded px-1.5 py-1 bg-white text-gray-900"
                            />
                          </label>
                          <label className="flex items-center gap-1 text-[10px] text-gray-500">
                            Vr. unitario
                            <input
                              type="number"
                              value={item.valor_unitario}
                              onChange={(e) => actualizarItem(i, j, k, { valor_unitario: Number(e.target.value) })}
                              className="w-28 text-xs border rounded px-1.5 py-1 bg-white text-gray-900"
                            />
                          </label>
                          <select
                            value={item.fuente}
                            onChange={(e) => actualizarItem(i, j, k, { fuente: e.target.value as FuentePresupuesto })}
                            className="text-xs border rounded px-1.5 py-1 bg-white text-gray-900 max-w-[160px]"
                          >
                            {FUENTES_ORDENADAS.map((f) => (
                              <option key={f} value={f}>{FUENTE_PRESUPUESTO_LABEL[f]}</option>
                            ))}
                          </select>
                          <span className="text-xs font-medium text-faro-navy w-24 text-right">
                            {formatoCOP(valorTotalItem(item))}
                          </span>
                          <button onClick={() => eliminarItem(i, j, k)} className="text-xs text-red-600 px-1">✕</button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => agregarItem(i, j)}
                      className="mt-1.5 text-[11px] text-faro-navy border border-faro-navy rounded px-2 py-0.5"
                    >
                      + Ítem de presupuesto
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex gap-3 sticky bottom-4 bg-white border rounded-xl p-3 shadow-lg">
            <button
              onClick={guardar}
              disabled={guardando}
              className="bg-faro-navy text-white rounded-md px-5 py-2.5 font-medium disabled:opacity-40"
            >
              {guardando ? "Guardando..." : "Guardar presupuesto"}
            </button>
            <button onClick={() => { setEditando(false); setEd(null); }} className="text-sm text-gray-500 px-3">
              Cancelar
            </button>
            <span className="ml-auto text-sm font-semibold text-faro-navy self-center">
              Total: {formatoCOP(totalPresupuestoProyecto(ed.plan_por_objetivo))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
