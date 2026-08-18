"use client";

import { useState } from "react";
import NavegacionNodos from "@/components/faro/NavegacionNodos";
import { IndicadorGenerando } from "@/components/faro/IndicadorGenerando";
import { PreguntasPendientes, ensamblarFeedbackDesdeRespuestas } from "@/components/faro/PreguntasPendientes";
import type {
  MetodologiaOutput,
  FilaMatrizConsistenciaExtendida,
  TecnicaInstrumento,
  PlanPorObjetivo,
  Producto,
  Actividad,
} from "@/lib/faro/metodologia";
import { totalPresupuestoActividad, totalPresupuestoProducto } from "@/lib/faro/metodologia";
import type { TipoProyecto } from "@/lib/faro/types";
import type { SubtipoDti } from "@/lib/faro/tipologiaProyecto";

function formatoCOP(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor);
}

interface NodoGrafo {
  id: string;
  project_id: string;
  tipo: string;
  iteracion: number;
  contenido: MetodologiaOutput & { matriz_consistencia_extendida?: FilaMatrizConsistenciaExtendida[] };
  confianza_agente: string | null;
  preguntas_pendientes: string[];
  confirmado_humano: boolean;
  editado_humano: boolean;
  delta_nodal: number | null;
  created_at: string;
}

interface Metrica {
  deltaI: number; omega: number; deltaModulada: number; lFaro: number;
  seTau: number; tauC: number; convergio: boolean;
  contradicciones: { codigo: string; nivel: string; mensaje: string; phi: number }[];
}

interface ProjectRow {
  id: string; titulo_provisional: string | null; nu: string;
  tau: TipoProyecto; subtipo_dti?: SubtipoDti | null; mu: string;
  alpha_area: string; u0_initial: number; estado: string;
}

export default function FormulacionMetodologia({
  project, nodosIniciales,
}: { project: ProjectRow; nodosIniciales: NodoGrafo[] }) {
  const [nodos, setNodos] = useState<NodoGrafo[]>(nodosIniciales);
  const [metrica, setMetrica] = useState<Metrica | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [editando, setEditando] = useState(false);
  const [ed, setEd] = useState<MetodologiaOutput | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);
  const [respuestasPreguntas, setRespuestasPreguntas] = useState<Record<number, string>>({});

  const nodoActual = nodos[0] ?? null;
  const c = nodoActual?.contenido;

  async function generar(conFeedback?: string) {
    setGenerando(true); setError(null);
    try {
      const res = await fetch("/api/mci/metodologia/generar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id, feedback: conFeedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error generando la propuesta.");
      setNodos((prev) => [data.nodo, ...prev]);
      setMetrica(data.metrica); setFeedback(""); setRespuestasPreguntas({}); setEditando(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Error desconocido."); }
    finally { setGenerando(false); }
  }

  async function confirmar(editado: boolean) {
    if (!nodoActual) return;
    const hayRespuestasSinGuardar = Object.values(respuestasPreguntas).some((v) => v.trim().length > 0);
    if (hayRespuestasSinGuardar) {
      const continuar = window.confirm(
        "Tiene respuestas sin guardar en las preguntas de arriba — se perderán si continúa. ¿Confirma?"
      );
      if (!continuar) return;
    }
    setConfirmando(true); setError(null);
    try {
      const contenidoEditado = editado && ed ? ed : undefined;
      const res = await fetch("/api/mci/ruta/confirmar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodo_id: nodoActual.id, contenido_editado: contenidoEditado }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al confirmar.");
      setNodos((prev) => [data.nodo, ...prev.slice(1)]);
      setEditando(false);
      setRespuestasPreguntas({});
    } catch (e) { setError(e instanceof Error ? e.message : "Error desconocido."); }
    finally { setConfirmando(false); }
  }

  async function reabrirParaEditar() {
    if (!nodoActual) return;
    setReabriendo(true); setError(null);
    try {
      const res = await fetch("/api/mci/nodo/reabrir", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodo_id: nodoActual.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al reabrir el nodo.");
      setNodos((prev) => [data.nodo, ...prev.slice(1)]);
    } catch (e) { setError(e instanceof Error ? e.message : "Error desconocido."); }
    finally { setReabriendo(false); }
  }

  function iniciarEdicion() {
    if (!nodoActual) return;
    setEd(JSON.parse(JSON.stringify(nodoActual.contenido)));
    setEditando(true);
  }

  // Helpers de edición del plan Objetivo→Producto→Actividad
  function setPlan(i: number, plan: PlanPorObjetivo) {
    if (!ed) return;
    const nuevos = [...ed.plan_por_objetivo];
    nuevos[i] = plan;
    setEd({ ...ed, plan_por_objetivo: nuevos });
  }
  function setProducto(i: number, j: number, prod: Producto) {
    if (!ed) return;
    const plan = ed.plan_por_objetivo[i];
    const nuevosProductos = [...(plan.productos ?? [])];
    nuevosProductos[j] = prod;
    setPlan(i, { ...plan, productos: nuevosProductos });
  }
  function setActividad(i: number, j: number, k: number, act: Actividad) {
    if (!ed) return;
    const prod = ed.plan_por_objetivo[i].productos[j];
    const nuevasAct = [...(prod.actividades ?? [])];
    nuevasAct[k] = act;
    setProducto(i, j, { ...prod, actividades: nuevasAct });
  }
  function agregarProducto(i: number) {
    if (!ed) return;
    const plan = ed.plan_por_objetivo[i];
    const nuevoProducto: Producto = {
      nombre_producto: "", indicador_producto: "", unidad_medida: "", meta: "",
      actividades: [{ actividad: "", indicador_gestion: "", tiempo_estimado: "", semana_inicio: 1, semana_fin: 1, presupuesto: [] }],
    };
    setPlan(i, { ...plan, productos: [...(plan.productos ?? []), nuevoProducto] });
  }
  function eliminarProducto(i: number, j: number) {
    if (!ed) return;
    const plan = ed.plan_por_objetivo[i];
    setPlan(i, { ...plan, productos: (plan.productos ?? []).filter((_, idx) => idx !== j) });
  }
  function agregarActividad(i: number, j: number) {
    if (!ed) return;
    const prod = ed.plan_por_objetivo[i].productos[j];
    const nueva: Actividad = { actividad: "", indicador_gestion: "", tiempo_estimado: "", semana_inicio: 1, semana_fin: 1, presupuesto: [] };
    setProducto(i, j, { ...prod, actividades: [...(prod.actividades ?? []), nueva] });
  }
  function eliminarActividad(i: number, j: number, k: number) {
    if (!ed) return;
    const prod = ed.plan_por_objetivo[i].productos[j];
    setProducto(i, j, { ...prod, actividades: (prod.actividades ?? []).filter((_, idx) => idx !== k) });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <NavegacionNodos projectId={project.id} />

      <div>
        <h1 className="text-2xl font-semibold text-faro-navy">
          Formulación — METODOLOGÍA {nodoActual ? `(iteración ${nodoActual.iteracion})` : ""}
        </h1>
        <p className="text-sm text-gray-600">
          {project.tau}{project.subtipo_dti ? ` · ${project.subtipo_dti}` : ""} · {project.nu} · {project.alpha_area}
          {c ? ` · enfoque ${c.enfoque_metodologico}` : ""}
        </p>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

      {!nodoActual && (
        <div className="text-center py-12 space-y-4">
          <p className="text-gray-600">
            Todavía no hay una propuesta de Metodología — se construye a partir de RUTA, NOVA y
            los objetivos específicos ya confirmados.
          </p>
          <button onClick={() => generar()} disabled={generando}
            className="bg-faro-navy text-white rounded-md px-6 py-3 font-medium disabled:opacity-40">
            {generando ? "Generando..." : "Generar propuesta de Metodología →"}
          </button>
          {generando && <IndicadorGenerando />}
        </div>
      )}

      {nodoActual && c && !editando && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-5 space-y-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Diseño metodológico</p>
              <p className="text-sm font-medium">{c.diseno_metodologico}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Tipo de investigación: {c.tipo_investigacion}</p>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Población</p>
              <p className="text-sm">{c.poblacion}</p>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Muestra</p>
              <p className="text-sm">{c.muestra}</p>
            </div>
            {c.tecnicas_instrumentos?.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Técnicas e instrumentos</p>
                <ul className="space-y-1.5 text-sm">
                  {c.tecnicas_instrumentos.map((t, i) => (
                    <li key={i} className="border-l-2 border-sky-300 pl-3">
                      <span className="font-medium">{t.tecnica}</span> — {t.instrumento}
                      <span className="text-[11px] text-gray-400"> · mide: {t.variable_o_categoria_asociada}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Plan de análisis de datos</p>
              <p className="text-sm">{c.plan_analisis_datos}</p>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Consideraciones éticas</p>
              <p className="text-sm">{c.consideraciones_eticas}</p>
            </div>
            {nodoActual.preguntas_pendientes?.length > 0 && (
              <div className="border-t pt-3">
                <PreguntasPendientes
                  preguntas={nodoActual.preguntas_pendientes}
                  respuestas={respuestasPreguntas}
                  onCambiarRespuesta={(i, v) => setRespuestasPreguntas((prev) => ({ ...prev, [i]: v }))}
                />
              </div>
            )}
            <p className="text-xs text-gray-400">Confianza del agente: {nodoActual.confianza_agente}</p>
          </div>

          {/* Cadena de valor: Objetivo → Productos → Actividades */}
          {c.plan_por_objetivo?.length > 0 && (
            <div className="bg-white rounded-lg border p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">
                Cadena de valor (MGA): Objetivo → Productos → Actividades
              </p>
              <div className="space-y-4">
                {c.plan_por_objetivo.map((plan, i) => (
                  <div key={i} className="border-l-2 border-faro-navy/30 pl-3">
                    <p className="text-sm font-medium mb-2">{plan.objetivo_especifico}</p>
                    <div className="space-y-2 ml-2">
                      {(plan.productos ?? []).map((prod, j) => (
                        <div key={j} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-faro-navy">📦 {prod.nombre_producto}</p>
                            <span className="text-[10px] text-gray-400">
                              {(prod.actividades ?? []).length > 0 ? formatoCOP(totalPresupuestoProducto(prod)) : ""}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            Indicador: {prod.indicador_producto} — Meta: {prod.meta} ({prod.unidad_medida})
                          </p>
                          <ul className="mt-2 space-y-1">
                            {(prod.actividades ?? []).map((a, k) => (
                              <li key={k} className="text-xs border-l-2 border-emerald-300 pl-2">
                                <span className="text-gray-800">{a.actividad}</span>
                                <span className="text-[10px] text-gray-400 block">
                                  {a.tiempo_estimado}{a.semana_inicio != null && a.semana_fin != null ? ` (Sem. ${a.semana_inicio}-${a.semana_fin})` : ""} · Indicador gestión: {a.indicador_gestion} ·{" "}
                                  {(a.presupuesto ?? []).length > 0
                                    ? formatoCOP(totalPresupuestoActividad(a))
                                    : <span className="text-amber-600">presupuesto sin definir</span>}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {metrica && (
            <div className="bg-white rounded-lg border p-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-gray-500 text-xs">δ_METODOLOGIA</p><p className="font-semibold">{metrica.deltaI}</p></div>
              <div><p className="text-gray-500 text-xs">Ω</p><p className="font-semibold">{metrica.omega}</p></div>
              <div><p className="text-gray-500 text-xs">L_FARO</p><p className="font-semibold">{metrica.lFaro}</p></div>
              <div><p className="text-gray-500 text-xs">τc</p><p className="font-semibold">{metrica.tauC}</p></div>
              <div className="col-span-2 md:col-span-4 pt-2 border-t">
                <span className={`text-xs px-2 py-1 rounded-full ${metrica.convergio ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                  {metrica.convergio ? "Convergió" : "Aún no converge"}
                </span>
              </div>
            </div>
          )}

          {!nodoActual.confirmado_humano && (
            <div className="flex flex-wrap gap-3">
              <button onClick={() => confirmar(false)} disabled={confirmando}
                className="bg-faro-navy text-white rounded-md px-5 py-2.5 font-medium disabled:opacity-40">
                {confirmando ? "Guardando..." : "Aceptar esta versión"}
              </button>
              <button onClick={iniciarEdicion}
                className="border border-faro-navy text-faro-navy rounded-md px-5 py-2.5 font-medium">
                Editar antes de aceptar
              </button>
            </div>
          )}

          {nodoActual.confirmado_humano && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-amber-800">Este nodo ya está confirmado. Reábralo para editar sin perder el contenido.</p>
              <button onClick={reabrirParaEditar} disabled={reabriendo}
                className="text-xs bg-amber-600 text-white rounded-md px-4 py-2 font-medium disabled:opacity-40 whitespace-nowrap">
                {reabriendo ? "Reabriendo..." : "Reabrir para editar"}
              </button>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <label className="text-sm font-medium">¿Qué debería corregir el agente? (opcional, para regenerar)</label>
            <textarea className="w-full border rounded-md p-2 text-gray-900 bg-white text-sm" rows={2}
              value={feedback} onChange={(e) => setFeedback(e.target.value)}
              placeholder="Ej. El producto X debería tener al menos dos actividades, no una..." />
            <button onClick={() => {
              const feedbackPreguntas = ensamblarFeedbackDesdeRespuestas(
                nodoActual.preguntas_pendientes ?? [],
                respuestasPreguntas
              );
              const feedbackLibre = feedback.trim();
              const partes = [feedbackPreguntas, feedbackLibre].filter(Boolean);
              const feedbackCompleto = partes.join("\n\n");
              generar(feedbackCompleto || undefined);
            }} disabled={generando}
              className="border border-faro-navy text-faro-navy rounded-md px-5 py-2.5 font-medium hover:bg-faro-navy hover:text-white transition-colors disabled:opacity-40">
              {generando ? "Generando nueva iteración..." : "Regenerar propuesta →"}
            </button>
            {generando && <IndicadorGenerando mensaje="Regenerando propuesta con el agente de IA..." />}
          </div>
        </div>
      )}

      {editando && ed && (
        <div className="bg-white rounded-lg border p-5 space-y-5">
          <label className="block">
            <span className="text-sm font-medium">Diseño metodológico</span>
            <textarea className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm" rows={2}
              value={ed.diseno_metodologico} onChange={(e) => setEd({ ...ed, diseno_metodologico: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Población</span>
            <textarea className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm" rows={2}
              value={ed.poblacion} onChange={(e) => setEd({ ...ed, poblacion: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Muestra</span>
            <textarea className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm" rows={2}
              value={ed.muestra} onChange={(e) => setEd({ ...ed, muestra: e.target.value })} />
          </label>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Cadena de valor: Objetivo → Productos → Actividades</p>
            <div className="space-y-4">
              {ed.plan_por_objetivo.map((plan, i) => (
                <div key={i} className="bg-faro-navy/5 border border-faro-navy/20 rounded-md p-3">
                  <p className="text-sm font-medium mb-2">{plan.objetivo_especifico}</p>
                  <div className="space-y-3">
                    {(plan.productos ?? []).map((prod, j) => (
                      <div key={j} className="bg-white border rounded-lg p-2.5 space-y-1.5">
                        <div className="flex gap-1.5 items-start">
                          <input value={prod.nombre_producto}
                            onChange={(e) => setProducto(i, j, { ...prod, nombre_producto: e.target.value })}
                            placeholder="Nombre del producto (bien o servicio)"
                            className="flex-1 text-sm border rounded px-2 py-1 bg-white text-gray-900 font-medium" />
                          <button onClick={() => eliminarProducto(i, j)} className="text-xs text-red-600 px-1">✕</button>
                        </div>
                        <div className="flex gap-1.5">
                          <input value={prod.indicador_producto}
                            onChange={(e) => setProducto(i, j, { ...prod, indicador_producto: e.target.value })}
                            placeholder="Indicador de producto (CREMA)"
                            className="flex-1 text-xs border rounded px-1.5 py-1 bg-white text-gray-900" />
                          <input value={prod.unidad_medida}
                            onChange={(e) => setProducto(i, j, { ...prod, unidad_medida: e.target.value })}
                            placeholder="Unidad" className="w-24 text-xs border rounded px-1.5 py-1 bg-white text-gray-900" />
                          <input value={prod.meta}
                            onChange={(e) => setProducto(i, j, { ...prod, meta: e.target.value })}
                            placeholder="Meta" className="w-20 text-xs border rounded px-1.5 py-1 bg-white text-gray-900" />
                        </div>
                        <div className="pl-2 border-l-2 border-emerald-200 space-y-1">
                          {(prod.actividades ?? []).map((act, k) => (
                            <div key={k} className="flex gap-1 items-center bg-emerald-50/50 rounded p-1">
                              <input value={act.actividad}
                                onChange={(e) => setActividad(i, j, k, { ...act, actividad: e.target.value })}
                                placeholder="Actividad" className="flex-1 text-[11px] border rounded px-1 py-0.5 bg-white text-gray-900" />
                              <input value={act.indicador_gestion}
                                onChange={(e) => setActividad(i, j, k, { ...act, indicador_gestion: e.target.value })}
                                placeholder="Indicador gestión" className="w-28 text-[11px] border rounded px-1 py-0.5 bg-white text-gray-900" />
                              <input value={act.tiempo_estimado}
                                onChange={(e) => setActividad(i, j, k, { ...act, tiempo_estimado: e.target.value })}
                                placeholder="Tiempo" className="w-16 text-[11px] border rounded px-1 py-0.5 bg-white text-gray-900" />
                              <input type="number" min={1} value={act.semana_inicio ?? 1}
                                onChange={(e) => setActividad(i, j, k, { ...act, semana_inicio: Number(e.target.value) })}
                                title="Semana inicio" className="w-12 text-[11px] border rounded px-1 py-0.5 bg-white text-gray-900" />
                              <input type="number" min={1} value={act.semana_fin ?? 1}
                                onChange={(e) => setActividad(i, j, k, { ...act, semana_fin: Number(e.target.value) })}
                                title="Semana fin" className="w-12 text-[11px] border rounded px-1 py-0.5 bg-white text-gray-900" />
                              <button onClick={() => eliminarActividad(i, j, k)} className="text-[11px] text-red-600 px-1">✕</button>
                            </div>
                          ))}
                          <button onClick={() => agregarActividad(i, j)} className="text-[10px] text-emerald-700">+ Actividad</button>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => agregarProducto(i)} className="text-[11px] text-faro-navy border border-faro-navy rounded px-2 py-0.5">
                      + Agregar producto
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              El presupuesto se edita en la pestaña Presupuesto, no aquí.
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-medium">Plan de análisis de datos</span>
            <textarea className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm" rows={3}
              value={ed.plan_analisis_datos} onChange={(e) => setEd({ ...ed, plan_analisis_datos: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Consideraciones éticas</span>
            <textarea className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm" rows={2}
              value={ed.consideraciones_eticas} onChange={(e) => setEd({ ...ed, consideraciones_eticas: e.target.value })} />
          </label>

          <div className="flex gap-3 pt-2">
            <button onClick={() => confirmar(true)} disabled={confirmando}
              className="bg-faro-navy text-white rounded-md px-5 py-2.5 font-medium disabled:opacity-40">
              {confirmando ? "Guardando..." : "Guardar edición y aceptar"}
            </button>
            <button onClick={() => setEditando(false)} className="text-sm text-gray-500">Cancelar</button>
          </div>
        </div>
      )}

      {nodos.length > 1 && (
        <details className="text-sm text-gray-500">
          <summary className="cursor-pointer">Historial de iteraciones ({nodos.length})</summary>
          <ul className="mt-2 space-y-1">
            {nodos.map((n) => (
              <li key={n.id}>
                Iteración {n.iteracion} — δ={n.delta_nodal} — {n.confirmado_humano ? "confirmada" : "pendiente"}
                {n.editado_humano ? " (editada)" : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
