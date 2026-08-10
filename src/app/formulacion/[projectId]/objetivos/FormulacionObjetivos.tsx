"use client";

import { useState } from "react";
import Link from "next/link";
import type { ObjetivosOutput, FilaMatrizConsistencia } from "@/lib/faro/objetivos";
import type { TipoProyecto } from "@/lib/faro/types";
import type { SubtipoDti } from "@/lib/faro/tipologiaProyecto";

interface NodoGrafo {
  id: string;
  project_id: string;
  tipo: string;
  iteracion: number;
  contenido: ObjetivosOutput & { matriz_consistencia?: FilaMatrizConsistencia[] };
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

const NIVEL_BLOOM_LABEL: Record<string, string> = {
  recordar: "Recordar",
  comprender: "Comprender",
  aplicar: "Aplicar",
  analizar: "Analizar",
  evaluar: "Evaluar",
  crear: "Crear",
};

export default function FormulacionObjetivos({
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
  const [objetivoGeneralEditado, setObjetivoGeneralEditado] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const nodoActual = nodos[0] ?? null;

  async function generar(conFeedback?: string) {
    setGenerando(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/objetivos/generar", {
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

  // Reutiliza /api/mci/ruta/confirmar tal cual — ya es genérico por nodo_id.
  // NOTA: solo objetivo_general es editable inline por ahora — objetivos_especificos,
  // hipotesis, variables y categorias_analisis son estructuras (arrays de objetos),
  // no texto plano; editarlas inline queda pendiente como una pieza de UI aparte.
  async function confirmar(editado: boolean) {
    if (!nodoActual) return;
    setConfirmando(true);
    setError(null);
    try {
      const contenidoEditado = editado
        ? { ...nodoActual.contenido, objetivo_general: objetivoGeneralEditado }
        : undefined;
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
    setObjetivoGeneralEditado(nodoActual.contenido.objetivo_general);
    setEditando(true);
  }

  const c = nodoActual?.contenido;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-faro-navy">
            Formulación — OBJETIVOS {nodoActual ? `(iteración ${nodoActual.iteracion})` : ""}
          </h1>
          <p className="text-sm text-gray-600">
            {project.tau}{project.subtipo_dti ? ` · ${project.subtipo_dti}` : ""} · {project.nu} · {project.alpha_area}
            {c ? ` · enfoque ${c.enfoque_metodologico}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/formulacion/${project.id}/nova`}
            className="text-xs px-3 py-1.5 rounded-md border border-faro-navy text-faro-navy hover:bg-faro-navy hover:text-white transition-colors font-medium"
          >
            ← NOVA
          </Link>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

      {!nodoActual && (
        <div className="text-center py-12 space-y-4">
          <p className="text-gray-600">
            Todavía no hay una propuesta de Objetivos para este proyecto — se construye a
            partir del problema delimitado en RUTA y el árbol de causas ya confirmado en NOVA.
          </p>
          <button
            onClick={() => generar()}
            disabled={generando}
            className="bg-faro-navy text-white rounded-md px-6 py-3 font-medium disabled:opacity-40"
          >
            {generando ? "Generando..." : "Generar propuesta de Objetivos →"}
          </button>
        </div>
      )}

      {nodoActual && c && !editando && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-5 space-y-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Objetivo general</p>
              <p className="text-sm font-medium">{c.objetivo_general}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Verbo Bloom: {c.verbo_bloom_general}
              </p>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Objetivos específicos</p>
              <ol className="space-y-2">
                {c.objetivos_especificos.map((oe, i) => (
                  <li key={i} className="text-sm border-l-2 border-faro-navy/30 pl-3">
                    <p>{oe.texto}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Bloom: {NIVEL_BLOOM_LABEL[oe.nivel_bloom] ?? oe.nivel_bloom} ({oe.verbo_bloom})
                      {oe.causa_asociada ? ` · Invierte la causa: "${oe.causa_asociada}"` : " · Sin causa asociada (transversal/apropiación social)"}
                    </p>
                  </li>
                ))}
              </ol>
            </div>

            {c.hipotesis?.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Hipótesis (enfoque cuantitativo)</p>
                <ul className="space-y-2 text-sm">
                  {c.hipotesis.map((h, i) => (
                    <li key={i} className="border-l-2 border-emerald-300 pl-3">
                      <p><span className="text-emerald-700 font-medium">H1:</span> {h.h1}</p>
                      <p><span className="text-gray-500 font-medium">H0:</span> {h.h0}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {c.variables?.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Variables</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="pr-2 py-1">Nombre</th>
                        <th className="pr-2 py-1">Tipo</th>
                        <th className="pr-2 py-1">Nivel medición</th>
                        <th className="pr-2 py-1">Indicadores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.variables.map((v, i) => (
                        <tr key={i} className="border-b last:border-0 align-top">
                          <td className="pr-2 py-1 font-medium">{v.nombre}</td>
                          <td className="pr-2 py-1">{v.tipo}</td>
                          <td className="pr-2 py-1">{v.nivel_medicion}</td>
                          <td className="pr-2 py-1">{v.indicadores?.join("; ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {c.categorias_analisis?.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Categorías de análisis (enfoque cualitativo)</p>
                <ul className="space-y-2 text-sm">
                  {c.categorias_analisis.map((cat, i) => (
                    <li key={i} className="border-l-2 border-purple-300 pl-3">
                      <p className="font-medium">{cat.nombre}</p>
                      <p className="text-gray-600">{cat.definicion}</p>
                      <p className="text-[11px] text-gray-400">Pregunta orientadora: {cat.pregunta_orientadora}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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

          {nodoActual.contenido.matriz_consistencia && nodoActual.contenido.matriz_consistencia.length > 0 && (
            <div className="bg-white rounded-lg border p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                Matriz de consistencia (ensamblada automáticamente, no editable)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pr-2 py-1">Objetivo específico</th>
                      <th className="pr-2 py-1">Causa asociada</th>
                      <th className="pr-2 py-1">Hipótesis</th>
                      <th className="pr-2 py-1">Variable/Categoría</th>
                      <th className="pr-2 py-1">Indicador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodoActual.contenido.matriz_consistencia.map((fila, i) => (
                      <tr key={i} className="border-b last:border-0 align-top">
                        <td className="pr-2 py-1">{fila.objetivo_especifico}</td>
                        <td className="pr-2 py-1 text-gray-500">{fila.causa_asociada ?? "—"}</td>
                        <td className="pr-2 py-1 text-gray-500">{fila.hipotesis ?? "—"}</td>
                        <td className="pr-2 py-1 text-gray-500">{fila.variable_o_categoria ?? "—"}</td>
                        <td className="pr-2 py-1 text-gray-500">{fila.indicador ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {metrica && (
            <div className="bg-white rounded-lg border p-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-gray-500 text-xs">δ_OBJETIVOS</p><p className="font-semibold">{metrica.deltaI}</p></div>
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
                Editar objetivo general antes de aceptar
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
              placeholder="Ej. El objetivo específico 2 no invierte ninguna causa real del árbol..."
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

      {editando && (
        <div className="bg-white rounded-lg border p-5 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Objetivo general</span>
            <textarea
              className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
              rows={3}
              value={objetivoGeneralEditado}
              onChange={(e) => setObjetivoGeneralEditado(e.target.value)}
            />
          </label>
          <p className="text-xs text-gray-400">
            Los objetivos específicos, hipótesis/variables y categorías de análisis no son
            editables inline todavía — si necesitan ajuste, use &quot;Regenerar propuesta&quot;
            con feedback en vez de editar aquí.
          </p>
          <div className="flex gap-3">
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
