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
  totalPresupuestoProducto,
  totalPresupuestoProyecto,
  resumenPorRubro,
  resumenPorFuente,
} from "@/lib/faro/metodologia";

interface ProjectRow {
  id: string; titulo_provisional: string | null; tau: string; nu: string; alpha_area: string;
}

const RUBROS_ORDENADOS = Object.keys(RUBRO_PRESUPUESTO_LABEL) as RubroPresupuesto[];
const FUENTES_ORDENADAS = Object.keys(FUENTE_PRESUPUESTO_LABEL) as FuentePresupuesto[];

function formatoCOP(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor);
}

export default function PresupuestoProyecto({
  project, metodologia, nodoId, confirmado,
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
            Todavía no hay un nodo Metodología para este proyecto — vaya a Metodología, genere
            y confirme la propuesta primero.
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
    setEditando(true); setError(null);
  }

  async function reabrirParaEditar() {
    if (!nodoId) return;
    setReabriendo(true); setError(null);
    try {
      const res = await fetch("/api/mci/nodo/reabrir", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodo_id: nodoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al reabrir el nodo.");
      iniciarEdicion();
    } catch (e) { setError(e instanceof Error ? e.message : "Error desconocido."); }
    finally { setReabriendo(false); }
  }

  async function guardar() {
    if (!nodoId || !ed) return;
    setGuardando(true); setError(null);
    try {
      const res = await fetch("/api/mci/ruta/confirmar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodo_id: nodoId, contenido_editado: ed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar.");
      setEditando(false);
      window.location.reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Error desconocido."); }
    finally { setGuardando(false); }
  }

  function actualizarItem(i: number, j: number, k: number, m: number, cambio: Partial<ItemPresupuesto>) {
    if (!ed) return;
    const nuevos = [...ed.plan_por_objetivo];
    const prods = [...(nuevos[i].productos ?? [])];
    const acts = [...(prods[j].actividades ?? [])];
    const items = [...(acts[k].presupuesto ?? [])];
    items[m] = { ...items[m], ...cambio };
    acts[k] = { ...acts[k], presupuesto: items };
    prods[j] = { ...prods[j], actividades: acts };
    nuevos[i] = { ...nuevos[i], productos: prods };
    setEd({ ...ed, plan_por_objetivo: nuevos });
  }

  function agregarItem(i: number, j: number, k: number) {
    if (!ed) return;
    const nuevos = [...ed.plan_por_objetivo];
    const prods = [...(nuevos[i].productos ?? [])];
    const acts = [...(prods[j].actividades ?? [])];
    const nuevoItem: ItemPresupuesto = {
      rubro: "materiales_insumos", descripcion: "", cantidad: 1, valor_unitario: 0, fuente: "financiador_efectivo",
    };
    acts[k] = { ...acts[k], presupuesto: [...(acts[k].presupuesto ?? []), nuevoItem] };
    prods[j] = { ...prods[j], actividades: acts };
    nuevos[i] = { ...nuevos[i], productos: prods };
    setEd({ ...ed, plan_por_objetivo: nuevos });
  }

  function eliminarItem(i: number, j: number, k: number, m: number) {
    if (!ed) return;
    const nuevos = [...ed.plan_por_objetivo];
    const prods = [...(nuevos[i].productos ?? [])];
    const acts = [...(prods[j].actividades ?? [])];
    acts[k] = { ...acts[k], presupuesto: (acts[k].presupuesto ?? []).filter((_, idx) => idx !== m) };
    prods[j] = { ...prods[j], actividades: acts };
    nuevos[i] = { ...nuevos[i], productos: prods };
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
        </div>
        {!editando && (
          confirmado ? (
            <button onClick={reabrirParaEditar} disabled={reabriendo}
              className="text-xs bg-amber-600 text-white rounded-md px-4 py-2 font-medium disabled:opacity-40 whitespace-nowrap">
              {reabriendo ? "Reabriendo..." : "Reabrir para editar presupuesto"}
            </button>
          ) : (
            <button onClick={iniciarEdicion}
              className="text-xs bg-faro-navy text-white rounded-md px-4 py-2 font-medium whitespace-nowrap">
              Editar presupuesto
            </button>
          )
        )}
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-faro-navy text-white p-6">
          <p className="text-3xl font-black">{formatoCOP(totalProyecto)}</p>
          <p className="text-[11px] uppercase tracking-widest opacity-70 mt-1">Presupuesto total</p>
        </div>
        <div className="rounded-2xl border bg-white p-6">
          <p className="text-2xl font-bold text-faro-navy">{formatoCOP(totalFinanciado)}</p>
          <p className="text-[11px] text-gray-400 mt-1">Financiado ({totalProyecto > 0 ? ((totalFinanciado / totalProyecto) * 100).toFixed(1) : 0}%)</p>
        </div>
        <div className="rounded-2xl border bg-white p-6">
          <p className="text-2xl font-bold text-faro-navy">{formatoCOP(totalContrapartida)}</p>
          <p className="text-[11px] text-gray-400 mt-1">Contrapartida ({totalProyecto > 0 ? ((totalContrapartida / totalProyecto) * 100).toFixed(1) : 0}%)</p>
        </div>
      </div>

      {!editando && (
        <>
          <div className="rounded-2xl border bg-white p-6">
            <h3 className="text-sm font-semibold text-faro-navy mb-3">Resumen por rubro</h3>
            <table className="w-full text-sm">
              <tbody>
                {RUBROS_ORDENADOS.filter((r) => rubros[r] > 0).sort((a, b) => rubros[b] - rubros[a]).map((rubro) => (
                  <tr key={rubro} className="border-b last:border-0">
                    <td className="py-1.5">{RUBRO_PRESUPUESTO_LABEL[rubro]}</td>
                    <td className="py-1.5 text-right">{formatoCOP(rubros[rubro])}</td>
                  </tr>
                ))}
                {totalProyecto === 0 && <tr><td colSpan={2} className="py-4 text-center text-amber-600">Sin ítems de presupuesto todavía.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <h3 className="text-sm font-semibold text-faro-navy mb-3">Cofinanciación</h3>
            <table className="w-full text-sm">
              <tbody>
                {FUENTES_ORDENADAS.map((f) => (
                  <tr key={f} className="border-b last:border-0">
                    <td className="py-1.5">{FUENTE_PRESUPUESTO_LABEL[f]}</td>
                    <td className="py-1.5 text-right">{formatoCOP(fuentes[f])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <h3 className="text-sm font-semibold text-faro-navy mb-3">Detalle por producto y actividad</h3>
            <div className="space-y-3">
              {planPorObjetivo.map((plan, i) => (
                <div key={i} className="border-l-2 border-faro-navy/30 pl-3">
                  <p className="text-xs text-gray-500 mb-1">{plan.objetivo_especifico}</p>
                  {(plan.productos ?? []).map((prod, j) => (
                    <div key={j} className="mb-2">
                      <p className="text-sm font-medium">📦 {prod.nombre_producto} — {formatoCOP(totalPresupuestoProducto(prod))}</p>
                      <table className="w-full text-xs mt-1">
                        <tbody>
                          {(prod.actividades ?? []).map((a, k) => (
                            <tr key={k} className="border-b last:border-0">
                              <td className="py-1 text-gray-600">{a.actividad}</td>
                              <td className="py-1 text-right">{formatoCOP(totalPresupuestoActividad(a))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {editando && ed && (
        <div className="space-y-4">
          {ed.plan_por_objetivo.map((plan, i) => (
            <div key={i} className="rounded-2xl border bg-white p-5">
              <p className="text-sm font-medium mb-3">{plan.objetivo_especifico}</p>
              {(plan.productos ?? []).map((prod, j) => (
                <div key={j} className="mb-3">
                  <p className="text-xs font-semibold text-faro-navy mb-1.5">📦 {prod.nombre_producto}</p>
                  {(prod.actividades ?? []).map((a, k) => (
                    <div key={k} className="bg-gray-50 rounded-lg p-3 mb-2">
                      <p className="text-xs text-gray-600 mb-2">{a.actividad}</p>
                      <div className="space-y-1.5">
                        {(a.presupuesto ?? []).map((item, m) => (
                          <div key={m} className="flex flex-wrap gap-1.5 items-center bg-white rounded p-1.5 border">
                            <select value={item.rubro}
                              onChange={(e) => actualizarItem(i, j, k, m, { rubro: e.target.value as RubroPresupuesto })}
                              className="text-xs border rounded px-1.5 py-1 bg-white text-gray-900 max-w-[180px]">
                              {RUBROS_ORDENADOS.map((r) => <option key={r} value={r}>{RUBRO_PRESUPUESTO_LABEL[r]}</option>)}
                            </select>
                            <input value={item.descripcion}
                              onChange={(e) => actualizarItem(i, j, k, m, { descripcion: e.target.value })}
                              placeholder="Descripción / insumo"
                              className="flex-1 min-w-[140px] text-xs border rounded px-1.5 py-1 bg-white text-gray-900" />
                            <label className="flex items-center gap-1 text-[10px] text-gray-500">
                              Cant.
                              <input type="number" value={item.cantidad}
                                onChange={(e) => actualizarItem(i, j, k, m, { cantidad: Number(e.target.value) })}
                                className="w-16 text-xs border rounded px-1.5 py-1 bg-white text-gray-900" />
                            </label>
                            <label className="flex items-center gap-1 text-[10px] text-gray-500">
                              Vr. unitario
                              <input type="number" value={item.valor_unitario}
                                onChange={(e) => actualizarItem(i, j, k, m, { valor_unitario: Number(e.target.value) })}
                                className="w-28 text-xs border rounded px-1.5 py-1 bg-white text-gray-900" />
                            </label>
                            <select value={item.fuente}
                              onChange={(e) => actualizarItem(i, j, k, m, { fuente: e.target.value as FuentePresupuesto })}
                              className="text-xs border rounded px-1.5 py-1 bg-white text-gray-900 max-w-[160px]">
                              {FUENTES_ORDENADAS.map((f) => <option key={f} value={f}>{FUENTE_PRESUPUESTO_LABEL[f]}</option>)}
                            </select>
                            <span className="text-xs font-medium text-faro-navy w-24 text-right">{formatoCOP(valorTotalItem(item))}</span>
                            <button onClick={() => eliminarItem(i, j, k, m)} className="text-xs text-red-600 px-1">✕</button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => agregarItem(i, j, k)} className="mt-1.5 text-[11px] text-faro-navy border border-faro-navy rounded px-2 py-0.5">
                        + Ítem de presupuesto
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
          <div className="flex gap-3 sticky bottom-4 bg-white border rounded-xl p-3 shadow-lg">
            <button onClick={guardar} disabled={guardando}
              className="bg-faro-navy text-white rounded-md px-5 py-2.5 font-medium disabled:opacity-40">
              {guardando ? "Guardando..." : "Guardar presupuesto"}
            </button>
            <button onClick={() => { setEditando(false); setEd(null); }} className="text-sm text-gray-500 px-3">Cancelar</button>
            <span className="ml-auto text-sm font-semibold text-faro-navy self-center">
              Total: {formatoCOP(totalPresupuestoProyecto(ed.plan_por_objetivo))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
