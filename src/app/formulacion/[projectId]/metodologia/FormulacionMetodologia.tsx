"use client";

import { useState } from "react";
import NavegacionNodos from "@/components/faro/NavegacionNodos";
import type {
  MetodologiaOutput,
  FilaMatrizConsistenciaExtendida,
  TecnicaInstrumento,
  PlanPorObjetivo,
  ActividadProducto,
  ItemPresupuesto,
  RubroPresupuesto,
  FuentePresupuesto,
} from "@/lib/faro/metodologia";
import {
  RUBRO_PRESUPUESTO_LABEL,
  FUENTE_PRESUPUESTO_LABEL,
  valorTotalItem,
  totalPresupuestoActividad,
  totalPresupuestoProyecto,
  resumenPorRubro,
} from "@/lib/faro/metodologia";
import type { TipoProyecto } from "@/lib/faro/types";
import type { SubtipoDti } from "@/lib/faro/tipologiaProyecto";

const RUBROS_ORDENADOS = Object.keys(RUBRO_PRESUPUESTO_LABEL) as RubroPresupuesto[];
const FUENTES_ORDENADAS = Object.keys(FUENTE_PRESUPUESTO_LABEL) as FuentePresupuesto[];

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
  deltaI: number;
  omega: number;
  deltaModulada: number;
  lFaro: number;
  seTau: number;
  tauC: number;
  convergio: boolean;
  contradicciones: { codigo: string; nivel: string; mensaje: string; phi: number }[];
}

interface ProjectRow {
  id: string;
  titulo_provisional: string | null;
  nu: string;
  tau: TipoProyecto;
  subtipo_dti?: SubtipoDti | null;
  mu: string;
  alpha_area: string;
  u0_initial: number;
  estado: string;
}

export default function FormulacionMetodologia({
  project,
  nodosIniciales,
}: {
  project: ProjectRow;
  nodosIniciales: NodoGrafo[];
}) {
  const [nodos, setNodos] = useState<NodoGrafo[]>(nodosIniciales);
  const [metrica, setMetrica] = useState<Metrica | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [editando, setEditando] = useState(false);
  const [ed, setEd] = useState<MetodologiaOutput | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const nodoActual = nodos[0] ?? null;

  async function generar(conFeedback?: string) {
    setGenerando(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/metodologia/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id, feedback: conFeedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error generando la propuesta.");
      setNodos((prev) => [data.nodo, ...prev]);
      setMetrica(data.metrica);
      setFeedback("");
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setGenerando(false);
    }
  }

  async function confirmar(editado: boolean) {
    if (!nodoActual) return;
    setConfirmando(true);
    setError(null);
    try {
      const contenidoEditado = editado && ed ? ed : undefined;
      const res = await fetch("/api/mci/ruta/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodo_id: nodoActual.id, contenido_editado: contenidoEditado }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al confirmar.");
      setNodos((prev) => [data.nodo, ...prev.slice(1)]);
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setConfirmando(false);
    }
  }

  function iniciarEdicion() {
    if (!nodoActual) return;
    setEd(JSON.parse(JSON.stringify(nodoActual.contenido)));
    setEditando(true);
  }

  const c = nodoActual?.contenido;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <NavegacionNodos projectId={project.id} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-faro-navy">
            Formulación — METODOLOGÍA {nodoActual ? `(iteración ${nodoActual.iteracion})` : ""}
          </h1>
          <p className="text-sm text-gray-600">
            {project.tau}{project.subtipo_dti ? ` · ${project.subtipo_dti}` : ""} · {project.nu} · {project.alpha_area}
            {c ? ` · enfoque ${c.enfoque_metodologico}` : ""}
          </p>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

      {!nodoActual && (
        <div className="text-center py-12 space-y-4">
          <p className="text-gray-600">
            Todavía no hay una propuesta de Metodología para este proyecto — se construye a
            partir de RUTA, NOVA y los objetivos específicos ya confirmados.
          </p>
          <button
            onClick={() => generar()}
            disabled={generando}
            className="bg-faro-navy text-white rounded-md px-6 py-3 font-medium disabled:opacity-40"
          >
            {generando ? "Generando..." : "Generar propuesta de Metodología →"}
          </button>
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

            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Estado de evidencia</p>
              <p className={`text-xs mt-1 ${
                c.estado_evidencia === "confirmado_por_rsl" ? "text-green-700" :
                c.estado_evidencia === "contradicho_por_rsl" ? "text-red-700" :
                "text-amber-600"
              }`}>
                {c.estado_evidencia === "confirmado_por_rsl" ? "confirmado por RSL" :
                 c.estado_evidencia === "contradicho_por_rsl" ? "contradicho por RSL" :
                 "sin verificar contra literatura"}
              </p>
            </div>

            {nodoActual.preguntas_pendientes?.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">El agente necesita que usted aclare</p>
                <ul className="list-disc list-inside text-sm text-amber-700">
                  {nodoActual.preguntas_pendientes.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}

            <p className="text-xs text-gray-400">Confianza del agente: {nodoActual.confianza_agente}</p>
          </div>

          {c.plan_por_objetivo?.length > 0 && (
            <div className="bg-white rounded-lg border p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">
                Plan de actividades por objetivo específico
              </p>
              <div className="space-y-3">
                {c.plan_por_objetivo.map((plan, i) => (
                  <div key={i} className="border-l-2 border-faro-navy/30 pl-3">
                    <p className="text-sm font-medium">{plan.objetivo_especifico}</p>
                    <div className="overflow-x-auto mt-1.5">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-gray-500 border-b">
                            <th className="pr-2 py-1">Actividad</th>
                            <th className="pr-2 py-1">Producto</th>
                            <th className="pr-2 py-1">Indicador de gestión</th>
                            <th className="pr-2 py-1">Tiempo</th>
                            <th className="pr-2 py-1">Presupuesto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.actividades.map((a, j) => (
                            <tr key={j} className="border-b last:border-0 align-top">
                              <td className="pr-2 py-1">{a.actividad}</td>
                              <td className="pr-2 py-1 text-gray-600">{a.producto}</td>
                              <td className="pr-2 py-1 text-gray-600">{a.indicador_gestion}</td>
                              <td className="pr-2 py-1 text-gray-500">{a.tiempo_estimado}</td>
                              <td className="pr-2 py-1 text-gray-500">
                                {a.presupuesto?.length > 0
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
              </div>
            </div>
          )}

          {c.plan_por_objetivo?.length > 0 && (
            <div className="bg-white rounded-lg border p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Resumen de presupuesto (formato Colombia Científica — 15 rubros)
                </p>
                <p className="text-sm font-semibold text-faro-navy">
                  Total: {formatoCOP(totalPresupuestoProyecto(c.plan_por_objetivo))}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pr-2 py-1">Rubro</th>
                      <th className="pr-2 py-1 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(resumenPorRubro(c.plan_por_objetivo))
                      .filter(([, valor]) => valor > 0)
                      .map(([rubro, valor]) => (
                        <tr key={rubro} className="border-b last:border-0">
                          <td className="pr-2 py-1">{RUBRO_PRESUPUESTO_LABEL[rubro as RubroPresupuesto]}</td>
                          <td className="pr-2 py-1 text-right">{formatoCOP(valor)}</td>
                        </tr>
                      ))}
                    {totalPresupuestoProyecto(c.plan_por_objetivo) === 0 && (
                      <tr>
                        <td colSpan={2} className="py-2 text-amber-600">
                          Todavía no se ha ingresado ningún ítem de presupuesto — use &quot;Editar antes de aceptar&quot; para agregarlos por actividad.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {nodoActual.contenido.matriz_consistencia_extendida && nodoActual.contenido.matriz_consistencia_extendida.length > 0 && (
            <div className="bg-white rounded-lg border p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                Matriz de consistencia extendida (ensamblada automáticamente)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pr-2 py-1">Objetivo específico</th>
                      <th className="pr-2 py-1">Variable/Categoría</th>
                      <th className="pr-2 py-1">Indicador científico</th>
                      <th className="pr-2 py-1">Productos</th>
                      <th className="pr-2 py-1">Indicadores de gestión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodoActual.contenido.matriz_consistencia_extendida.map((fila, i) => (
                      <tr key={i} className="border-b last:border-0 align-top">
                        <td className="pr-2 py-1">{fila.objetivo_especifico}</td>
                        <td className="pr-2 py-1 text-gray-500">{fila.variable_o_categoria ?? "—"}</td>
                        <td className="pr-2 py-1 text-gray-500">{fila.indicador ?? "—"}</td>
                        <td className="pr-2 py-1 text-gray-500">{fila.productos?.join("; ") || "—"}</td>
                        <td className="pr-2 py-1 text-gray-500">{fila.indicadores_gestion?.join("; ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  {metrica.convergio ? "Convergió (L_FARO ≤ τc, sin contradicciones abiertas)" : "Aún no converge"}
                </span>
              </div>
              {metrica.contradicciones.length > 0 && (
                <div className="col-span-2 md:col-span-4 text-xs text-red-600">
                  {metrica.contradicciones.map((cc, i) => (
                    <p key={i}>[{cc.nivel}] {cc.mensaje}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {!nodoActual.confirmado_humano && (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => confirmar(false)}
                disabled={confirmando}
                className="bg-faro-navy text-white rounded-md px-5 py-2.5 font-medium disabled:opacity-40"
              >
                {confirmando ? "Guardando..." : "Aceptar esta versión"}
              </button>
              <button
                onClick={iniciarEdicion}
                className="border border-faro-navy text-faro-navy rounded-md px-5 py-2.5 font-medium"
              >
                Editar antes de aceptar
              </button>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <label className="text-sm font-medium">¿Qué debería corregir el agente? (opcional, para regenerar)</label>
            <textarea
              className="w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
              rows={2}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Ej. El diseño debería ser DSR, no cuasi-experimental, porque el proyecto es TRL 5..."
            />
            <button
              onClick={() => generar(feedback || undefined)}
              disabled={generando}
              className="border border-faro-navy text-faro-navy rounded-md px-5 py-2.5 font-medium hover:bg-faro-navy hover:text-white transition-colors disabled:opacity-40"
            >
              {generando ? "Generando nueva iteración..." : "Regenerar propuesta →"}
            </button>
          </div>
        </div>
      )}

      {editando && ed && (
        <div className="bg-white rounded-lg border p-5 space-y-5">
          <label className="block">
            <span className="text-sm font-medium">Diseño metodológico</span>
            <textarea
              className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
              rows={2}
              value={ed.diseno_metodologico}
              onChange={(e) => setEd({ ...ed, diseno_metodologico: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Tipo de investigación</span>
            <input
              className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
              value={ed.tipo_investigacion}
              onChange={(e) => setEd({ ...ed, tipo_investigacion: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Población</span>
            <textarea
              className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
              rows={2}
              value={ed.poblacion}
              onChange={(e) => setEd({ ...ed, poblacion: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Muestra</span>
            <textarea
              className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
              rows={2}
              value={ed.muestra}
              onChange={(e) => setEd({ ...ed, muestra: e.target.value })}
            />
          </label>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Técnicas e instrumentos</span>
              <button
                type="button"
                onClick={() =>
                  setEd({
                    ...ed,
                    tecnicas_instrumentos: [
                      ...ed.tecnicas_instrumentos,
                      { tecnica: "", instrumento: "", variable_o_categoria_asociada: "", variable_id: null },
                    ],
                  })
                }
                className="text-xs text-faro-navy border border-faro-navy rounded px-2 py-1"
              >
                + Agregar
              </button>
            </div>
            <div className="space-y-2">
              {ed.tecnicas_instrumentos.map((t: TecnicaInstrumento, i: number) => (
                <div key={i} className="bg-sky-50/50 border border-sky-200 rounded-md p-2 space-y-1">
                  <div className="flex gap-2 items-center text-xs">
                    <input
                      value={t.tecnica}
                      onChange={(e) => {
                        const nuevas = [...ed.tecnicas_instrumentos];
                        nuevas[i] = { ...nuevas[i], tecnica: e.target.value };
                        setEd({ ...ed, tecnicas_instrumentos: nuevas });
                      }}
                      placeholder="Técnica"
                      className="flex-1 border rounded px-1.5 py-1 bg-white text-gray-900"
                    />
                    <input
                      value={t.instrumento}
                      onChange={(e) => {
                        const nuevas = [...ed.tecnicas_instrumentos];
                        nuevas[i] = { ...nuevas[i], instrumento: e.target.value };
                        setEd({ ...ed, tecnicas_instrumentos: nuevas });
                      }}
                      placeholder="Instrumento"
                      className="flex-1 border rounded px-1.5 py-1 bg-white text-gray-900"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEd({
                          ...ed,
                          tecnicas_instrumentos: ed.tecnicas_instrumentos.filter((_, idx) => idx !== i),
                        })
                      }
                      className="text-xs text-red-600 px-2"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    value={t.variable_o_categoria_asociada}
                    onChange={(e) => {
                      const nuevas = [...ed.tecnicas_instrumentos];
                      nuevas[i] = { ...nuevas[i], variable_o_categoria_asociada: e.target.value };
                      setEd({ ...ed, tecnicas_instrumentos: nuevas });
                    }}
                    placeholder="Variable o categoría asociada"
                    className="w-full text-xs border rounded px-1.5 py-1 bg-white text-gray-900"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Plan de actividades por objetivo</span>
              <button
                type="button"
                onClick={() =>
                  setEd({
                    ...ed,
                    plan_por_objetivo: [
                      ...ed.plan_por_objetivo,
                      { objetivo_especifico: "", objetivo_id: "", actividades: [] },
                    ],
                  })
                }
                className="text-xs text-faro-navy border border-faro-navy rounded px-2 py-1"
              >
                + Agregar objetivo
              </button>
            </div>
            <div className="space-y-3">
              {ed.plan_por_objetivo.map((plan: PlanPorObjetivo, i: number) => (
                <div key={i} className="bg-faro-navy/5 border border-faro-navy/20 rounded-md p-2 space-y-2">
                  <div className="flex gap-2 items-start">
                    <textarea
                      value={plan.objetivo_especifico}
                      onChange={(e) => {
                        const nuevos = [...ed.plan_por_objetivo];
                        nuevos[i] = { ...nuevos[i], objetivo_especifico: e.target.value };
                        setEd({ ...ed, plan_por_objetivo: nuevos });
                      }}
                      rows={2}
                      placeholder="Texto del objetivo específico (debe coincidir con Objetivos)"
                      className="flex-1 text-sm border rounded-md p-2 text-gray-900 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEd({
                          ...ed,
                          plan_por_objetivo: ed.plan_por_objetivo.filter((_, idx) => idx !== i),
                        })
                      }
                      className="text-xs text-red-600 px-2"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="pl-3 border-l-2 border-faro-navy/20 space-y-1.5">
                    {plan.actividades.map((act: ActividadProducto, j: number) => (
                      <div key={j} className="bg-white border rounded p-1.5 space-y-1">
                        <div className="flex gap-1 items-center">
                          <input
                            value={act.actividad}
                            onChange={(e) => {
                              const nuevos = [...ed.plan_por_objetivo];
                              const nuevasAct = [...nuevos[i].actividades];
                              nuevasAct[j] = { ...nuevasAct[j], actividad: e.target.value };
                              nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
                              setEd({ ...ed, plan_por_objetivo: nuevos });
                            }}
                            placeholder="Actividad"
                            className="flex-1 text-xs border rounded px-1.5 py-1 bg-white text-gray-900"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const nuevos = [...ed.plan_por_objetivo];
                              nuevos[i] = {
                                ...nuevos[i],
                                actividades: nuevos[i].actividades.filter((_, idx) => idx !== j),
                              };
                              setEd({ ...ed, plan_por_objetivo: nuevos });
                            }}
                            className="text-xs text-red-600 px-1"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="flex gap-1">
                          <input
                            value={act.producto}
                            onChange={(e) => {
                              const nuevos = [...ed.plan_por_objetivo];
                              const nuevasAct = [...nuevos[i].actividades];
                              nuevasAct[j] = { ...nuevasAct[j], producto: e.target.value };
                              nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
                              setEd({ ...ed, plan_por_objetivo: nuevos });
                            }}
                            placeholder="Producto"
                            className="flex-1 text-xs border rounded px-1.5 py-1 bg-white text-gray-900"
                          />
                          <input
                            value={act.indicador_gestion}
                            onChange={(e) => {
                              const nuevos = [...ed.plan_por_objetivo];
                              const nuevasAct = [...nuevos[i].actividades];
                              nuevasAct[j] = { ...nuevasAct[j], indicador_gestion: e.target.value };
                              nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
                              setEd({ ...ed, plan_por_objetivo: nuevos });
                            }}
                            placeholder="Indicador de gestión"
                            className="flex-1 text-xs border rounded px-1.5 py-1 bg-white text-gray-900"
                          />
                          <input
                            value={act.tiempo_estimado}
                            onChange={(e) => {
                              const nuevos = [...ed.plan_por_objetivo];
                              const nuevasAct = [...nuevos[i].actividades];
                              nuevasAct[j] = { ...nuevasAct[j], tiempo_estimado: e.target.value };
                              nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
                              setEd({ ...ed, plan_por_objetivo: nuevos });
                            }}
                            placeholder="Tiempo"
                            className="w-20 text-xs border rounded px-1.5 py-1 bg-white text-gray-900"
                          />
                        </div>

                        {/* Presupuesto de la actividad */}
                        <div className="pl-2 border-l-2 border-emerald-200 space-y-1 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-500 uppercase">
                              Presupuesto — {formatoCOP(totalPresupuestoActividad(act))}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const nuevos = [...ed.plan_por_objetivo];
                                const nuevasAct = [...nuevos[i].actividades];
                                const nuevoItem: ItemPresupuesto = {
                                  rubro: "materiales_insumos",
                                  descripcion: "",
                                  cantidad: 1,
                                  valor_unitario: 0,
                                  fuente: "financiador_efectivo",
                                };
                                nuevasAct[j] = { ...nuevasAct[j], presupuesto: [...nuevasAct[j].presupuesto, nuevoItem] };
                                nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
                                setEd({ ...ed, plan_por_objetivo: nuevos });
                              }}
                              className="text-[10px] text-emerald-700 border border-emerald-300 rounded px-1.5 py-0.5"
                            >
                              + Ítem
                            </button>
                          </div>
                          {act.presupuesto.map((item: ItemPresupuesto, k: number) => (
                            <div key={k} className="flex flex-wrap gap-1 items-center bg-emerald-50/50 rounded p-1">
                              <select
                                value={item.rubro}
                                onChange={(e) => {
                                  const nuevos = [...ed.plan_por_objetivo];
                                  const nuevasAct = [...nuevos[i].actividades];
                                  const nuevosItems = [...nuevasAct[j].presupuesto];
                                  nuevosItems[k] = { ...nuevosItems[k], rubro: e.target.value as RubroPresupuesto };
                                  nuevasAct[j] = { ...nuevasAct[j], presupuesto: nuevosItems };
                                  nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
                                  setEd({ ...ed, plan_por_objetivo: nuevos });
                                }}
                                className="text-[10px] border rounded px-1 py-0.5 bg-white text-gray-900"
                              >
                                {RUBROS_ORDENADOS.map((r) => (
                                  <option key={r} value={r}>{RUBRO_PRESUPUESTO_LABEL[r]}</option>
                                ))}
                              </select>
                              <input
                                value={item.descripcion}
                                onChange={(e) => {
                                  const nuevos = [...ed.plan_por_objetivo];
                                  const nuevasAct = [...nuevos[i].actividades];
                                  const nuevosItems = [...nuevasAct[j].presupuesto];
                                  nuevosItems[k] = { ...nuevosItems[k], descripcion: e.target.value };
                                  nuevasAct[j] = { ...nuevasAct[j], presupuesto: nuevosItems };
                                  nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
                                  setEd({ ...ed, plan_por_objetivo: nuevos });
                                }}
                                placeholder="Descripción / insumo"
                                className="flex-1 min-w-[100px] text-[10px] border rounded px-1 py-0.5 bg-white text-gray-900"
                              />
                              <input
                                type="number"
                                value={item.cantidad}
                                onChange={(e) => {
                                  const nuevos = [...ed.plan_por_objetivo];
                                  const nuevasAct = [...nuevos[i].actividades];
                                  const nuevosItems = [...nuevasAct[j].presupuesto];
                                  nuevosItems[k] = { ...nuevosItems[k], cantidad: Number(e.target.value) };
                                  nuevasAct[j] = { ...nuevasAct[j], presupuesto: nuevosItems };
                                  nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
                                  setEd({ ...ed, plan_por_objetivo: nuevos });
                                }}
                                placeholder="Cant."
                                className="w-12 text-[10px] border rounded px-1 py-0.5 bg-white text-gray-900"
                              />
                              <input
                                type="number"
                                value={item.valor_unitario}
                                onChange={(e) => {
                                  const nuevos = [...ed.plan_por_objetivo];
                                  const nuevasAct = [...nuevos[i].actividades];
                                  const nuevosItems = [...nuevasAct[j].presupuesto];
                                  nuevosItems[k] = { ...nuevosItems[k], valor_unitario: Number(e.target.value) };
                                  nuevasAct[j] = { ...nuevasAct[j], presupuesto: nuevosItems };
                                  nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
                                  setEd({ ...ed, plan_por_objetivo: nuevos });
                                }}
                                placeholder="Vr. unitario"
                                className="w-24 text-[10px] border rounded px-1 py-0.5 bg-white text-gray-900"
                              />
                              <select
                                value={item.fuente}
                                onChange={(e) => {
                                  const nuevos = [...ed.plan_por_objetivo];
                                  const nuevasAct = [...nuevos[i].actividades];
                                  const nuevosItems = [...nuevasAct[j].presupuesto];
                                  nuevosItems[k] = { ...nuevosItems[k], fuente: e.target.value as FuentePresupuesto };
                                  nuevasAct[j] = { ...nuevasAct[j], presupuesto: nuevosItems };
                                  nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
                                  setEd({ ...ed, plan_por_objetivo: nuevos });
                                }}
                                className="text-[10px] border rounded px-1 py-0.5 bg-white text-gray-900"
                              >
                                {FUENTES_ORDENADAS.map((f) => (
                                  <option key={f} value={f}>{FUENTE_PRESUPUESTO_LABEL[f]}</option>
                                ))}
                              </select>
                              <span className="text-[10px] text-gray-500 w-20 text-right">
                                {formatoCOP(valorTotalItem(item))}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const nuevos = [...ed.plan_por_objetivo];
                                  const nuevasAct = [...nuevos[i].actividades];
                                  nuevasAct[j] = {
                                    ...nuevasAct[j],
                                    presupuesto: nuevasAct[j].presupuesto.filter((_, idx) => idx !== k),
                                  };
                                  nuevos[i] = { ...nuevos[i], actividades: nuevasAct };
                                  setEd({ ...ed, plan_por_objetivo: nuevos });
                                }}
                                className="text-[10px] text-red-600 px-1"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const nuevos = [...ed.plan_por_objetivo];
                        nuevos[i] = {
                          ...nuevos[i],
                          actividades: [
                            ...nuevos[i].actividades,
                            { actividad: "", producto: "", indicador_gestion: "", tiempo_estimado: "", presupuesto: [] },
                          ],
                        };
                        setEd({ ...ed, plan_por_objetivo: nuevos });
                      }}
                      className="text-[11px] text-faro-navy"
                    >
                      + Agregar actividad
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium">Plan de análisis de datos</span>
            <textarea
              className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
              rows={3}
              value={ed.plan_analisis_datos}
              onChange={(e) => setEd({ ...ed, plan_analisis_datos: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Consideraciones éticas</span>
            <textarea
              className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
              rows={2}
              value={ed.consideraciones_eticas}
              onChange={(e) => setEd({ ...ed, consideraciones_eticas: e.target.value })}
            />
          </label>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => confirmar(true)}
              disabled={confirmando}
              className="bg-faro-navy text-white rounded-md px-5 py-2.5 font-medium disabled:opacity-40"
            >
              {confirmando ? "Guardando..." : "Guardar edición y aceptar"}
            </button>
            <button onClick={() => setEditando(false)} className="text-sm text-gray-500">
              Cancelar
            </button>
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
