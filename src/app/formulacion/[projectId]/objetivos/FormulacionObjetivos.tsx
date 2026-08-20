"use client";

import { useState } from "react";
import NavegacionNodos from "@/components/faro/NavegacionNodos";
import { IndicadorGenerando } from "@/components/faro/IndicadorGenerando";
import { PreguntasPendientes, ensamblarFeedbackDesdeRespuestas } from "@/components/faro/PreguntasPendientes";
import type {
  ObjetivosOutput,
  FilaMatrizConsistencia,
  ObjetivoEspecifico,
  HipotesisPar,
  Variable,
  CategoriaAnalisis,
  NivelBloom,
} from "@/lib/faro/objetivos";
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

const NIVELES_BLOOM: NivelBloom[] = ["recordar", "comprender", "aplicar", "analizar", "evaluar", "crear"];

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
  const [ed, setEd] = useState<ObjetivosOutput | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);
  const [respuestasPreguntas, setRespuestasPreguntas] = useState<Record<number, string>>({});

  async function reabrirParaEditar() {
    if (!nodoActual) return;
    setReabriendo(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/nodo/reabrir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodo_id: nodoActual.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al reabrir el nodo.");
      setNodos((prev) => [data.nodo, ...prev.slice(1)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setReabriendo(false);
    }
  }

  const nodosValidos = (nodos ?? []).filter((n): n is NodoGrafo => Boolean(n && n.id != null));
  const nodoActual = nodosValidos[0] ?? null;

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
      if (data.circuito_detenido) {
        setError(`El circuito de convergencia detuvo la regeneración: ${data.motivo_circuito ?? "sin mejora tras varias rondas"}. Puede usar "bypass" si ya revisó el resultado actual.`);
        return;
      }
      if (!res.ok || !data.nodo) throw new Error(data.error ?? "Error generando la propuesta.");
      setNodos((prev) => [data.nodo, ...prev.filter(Boolean)]);
      setMetrica(data.metrica);
      setFeedback("");
      setRespuestasPreguntas({});
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setGenerando(false);
    }
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
    setConfirmando(true);
    setError(null);
    try {
      // 1. Consultar preguntas abiertas de este nodo para el modal de sellado
      const qRes = await fetch(`/api/mci/preguntas/pendientes?project_id=${project.id}`);
      const qData = await qRes.json();
      const openQuestions = (qData.preguntas ?? []).filter(
        (q: any) => q.nodo_id === nodoActual.id
      );

      if (openQuestions.length > 0) {
        const listText = openQuestions.map((q: any, i: number) => `${i + 1}. ${q.texto_pregunta}`).join("\n");
        const userConfirmed = window.confirm(
          `Este nodo tiene ${openQuestions.length} preguntas abiertas:\n\n${listText}\n\nAl sellarlo, pasarán al mapa de riesgos y el nodo quedará protegido contra reapertura. ¿Confirmar?`
        );
        if (!userConfirmed) {
          setConfirmando(false);
          return;
        }
      }

      const contenidoEditado = editado && ed ? ed : undefined;
      const res = await fetch("/api/mci/ruta/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodo_id: nodoActual.id,
          contenido_editado: contenidoEditado,
          sellar: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al confirmar.");
      setNodos((prev) => [data.nodo, ...prev.slice(1)]);
      setEditando(false);
      setRespuestasPreguntas({});
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
    <div className="max-w-5xl mx-auto space-y-6">
      <NavegacionNodos projectId={project.id} />

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
          {generando && <IndicadorGenerando />}
        </div>
      )}

      {nodoActual && c && !editando && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-5 space-y-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Objetivo general</p>
              <p className="text-sm font-medium">{c.objetivo_general}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Verbo Bloom: {c.verbo_bloom_general}</p>
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
                        <th className="pr-2 py-1">Objetivo asociado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.variables.map((v, i) => (
                        <tr key={i} className="border-b last:border-0 align-top">
                          <td className="pr-2 py-1 font-medium">{v.nombre}</td>
                          <td className="pr-2 py-1">{v.tipo}</td>
                          <td className="pr-2 py-1">{v.nivel_medicion}</td>
                          <td className="pr-2 py-1">{v.indicadores?.join("; ")}</td>
                          <td className="pr-2 py-1 text-gray-500">{v.objetivo_especifico_asociado}</td>
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
                <PreguntasPendientes
                  preguntas={nodoActual.preguntas_pendientes}
                  respuestas={respuestasPreguntas}
                  onCambiarRespuesta={(i, v) => setRespuestasPreguntas((prev) => ({ ...prev, [i]: v }))}
                />
              </div>
            )}

            <p className="text-xs text-gray-400">Confianza del agente: {nodoActual.confianza_agente}</p>
          </div>

          {nodoActual.contenido.matriz_consistencia && nodoActual.contenido.matriz_consistencia.length > 0 && (
            <div className="bg-white rounded-lg border p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                Matriz de consistencia (ensamblada automáticamente, no editable — se recalcula
                al regenerar; si edita objetivos/hipótesis manualmente puede quedar desactualizada
                hasta la próxima generación)
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
                Editar antes de aceptar
              </button>
            </div>
          )}

          {nodoActual.confirmado_humano && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-amber-800">
                Este nodo ya está confirmado. Si necesita ajustar algo, reábralo para
                editar — el contenido actual no se pierde.
              </p>
              <button
                onClick={reabrirParaEditar}
                disabled={reabriendo}
                className="text-xs bg-amber-600 text-white rounded-md px-4 py-2 font-medium disabled:opacity-40 whitespace-nowrap"
              >
                {reabriendo ? "Reabriendo..." : "Reabrir para editar"}
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
              onClick={() => {
                const feedbackPreguntas = ensamblarFeedbackDesdeRespuestas(
                  nodoActual.preguntas_pendientes ?? [],
                  respuestasPreguntas
                );
                const feedbackLibre = feedback.trim();
                const partes = [feedbackPreguntas, feedbackLibre].filter(Boolean);
                const feedbackCompleto = partes.join("\n\n");
                generar(feedbackCompleto || undefined);
              }}
              disabled={generando}
              className="border border-faro-navy text-faro-navy rounded-md px-5 py-2.5 font-medium hover:bg-faro-navy hover:text-white transition-colors disabled:opacity-40"
            >
              {generando ? "Generando nueva iteración..." : "Regenerar propuesta →"}
            </button>
            {generando && <IndicadorGenerando mensaje="Regenerando propuesta con el agente de IA..." />}
          </div>
        </div>
      )}

      {editando && ed && (
        <div className="bg-white rounded-lg border p-5 space-y-5">
          <label className="block">
            <span className="text-sm font-medium">Objetivo general</span>
            <textarea
              className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
              rows={3}
              value={ed.objetivo_general}
              onChange={(e) => setEd({ ...ed, objetivo_general: e.target.value })}
            />
          </label>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Objetivos específicos</span>
              <button
                type="button"
                onClick={() =>
                  setEd({
                    ...ed,
                    objetivos_especificos: [
                      ...ed.objetivos_especificos,
                      { id: `OE-NUEVO-${ed.objetivos_especificos.length + 1}`, texto: "", verbo_bloom: "", nivel_bloom: "aplicar", causa_asociada: null, causa_id: null },
                    ],
                  })
                }
                className="text-xs text-faro-navy border border-faro-navy rounded px-2 py-1"
              >
                + Agregar objetivo específico
              </button>
            </div>
            <div className="space-y-2">
              {ed.objetivos_especificos.map((oe: ObjetivoEspecifico, i: number) => (
                <div key={i} className="bg-faro-navy/5 border border-faro-navy/20 rounded-md p-2 space-y-1.5">
                  <div className="flex gap-2 items-start">
                    <textarea
                      value={oe.texto}
                      onChange={(e) => {
                        const nuevos = [...ed.objetivos_especificos];
                        nuevos[i] = { ...nuevos[i], texto: e.target.value };
                        setEd({ ...ed, objetivos_especificos: nuevos });
                      }}
                      rows={2}
                      className="flex-1 text-sm border rounded-md p-2 text-gray-900 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEd({
                          ...ed,
                          objetivos_especificos: ed.objetivos_especificos.filter((_, idx) => idx !== i),
                        })
                      }
                      className="text-xs text-red-600 px-2"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex gap-2 items-center text-xs">
                    <span className="text-gray-500">Verbo:</span>
                    <input
                      value={oe.verbo_bloom}
                      onChange={(e) => {
                        const nuevos = [...ed.objetivos_especificos];
                        nuevos[i] = { ...nuevos[i], verbo_bloom: e.target.value };
                        setEd({ ...ed, objetivos_especificos: nuevos });
                      }}
                      className="border rounded px-1.5 py-0.5 bg-white text-gray-900 w-28"
                    />
                    <span className="text-gray-500">Bloom:</span>
                    <select
                      value={oe.nivel_bloom}
                      onChange={(e) => {
                        const nuevos = [...ed.objetivos_especificos];
                        nuevos[i] = { ...nuevos[i], nivel_bloom: e.target.value as NivelBloom };
                        setEd({ ...ed, objetivos_especificos: nuevos });
                      }}
                      className="border rounded px-1.5 py-0.5 bg-white text-gray-900"
                    >
                      {NIVELES_BLOOM.map((n) => (
                        <option key={n} value={n}>{NIVEL_BLOOM_LABEL[n]}</option>
                      ))}
                    </select>
                    <span className="text-gray-500">Causa asociada:</span>
                    <input
                      value={oe.causa_asociada ?? ""}
                      onChange={(e) => {
                        const nuevos = [...ed.objetivos_especificos];
                        nuevos[i] = { ...nuevos[i], causa_asociada: e.target.value || null };
                        setEd({ ...ed, objetivos_especificos: nuevos });
                      }}
                      placeholder="(vacío si es transversal)"
                      className="flex-1 border rounded px-1.5 py-0.5 bg-white text-gray-900"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(ed.enfoque_metodologico === "cuantitativo" || ed.enfoque_metodologico === "mixto") && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Hipótesis</span>
                <button
                  type="button"
                  onClick={() =>
                    setEd({
                      ...ed,
                      hipotesis: [...ed.hipotesis, { h1: "", h0: "", objetivo_especifico_asociado: "" }],
                    })
                  }
                  className="text-xs text-faro-navy border border-faro-navy rounded px-2 py-1"
                >
                  + Agregar hipótesis
                </button>
              </div>
              <div className="space-y-2">
                {ed.hipotesis.map((h: HipotesisPar, i: number) => (
                  <div key={i} className="bg-emerald-50/50 border border-emerald-200 rounded-md p-2 space-y-1.5">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <textarea
                          value={h.h1}
                          onChange={(e) => {
                            const nuevas = [...ed.hipotesis];
                            nuevas[i] = { ...nuevas[i], h1: e.target.value };
                            setEd({ ...ed, hipotesis: nuevas });
                          }}
                          rows={2}
                          placeholder="H1 (alterna)"
                          className="w-full text-sm border rounded-md p-2 text-gray-900 bg-white"
                        />
                        <textarea
                          value={h.h0}
                          onChange={(e) => {
                            const nuevas = [...ed.hipotesis];
                            nuevas[i] = { ...nuevas[i], h0: e.target.value };
                            setEd({ ...ed, hipotesis: nuevas });
                          }}
                          rows={2}
                          placeholder="H0 (nula)"
                          className="w-full text-sm border rounded-md p-2 text-gray-900 bg-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setEd({ ...ed, hipotesis: ed.hipotesis.filter((_, idx) => idx !== i) })}
                        className="text-xs text-red-600 px-2"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(ed.enfoque_metodologico === "cuantitativo" || ed.enfoque_metodologico === "mixto") && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Variables</span>
                <button
                  type="button"
                  onClick={() =>
                    setEd({
                      ...ed,
                      variables: [
                        ...ed.variables,
                        {
                          id: `VAR-NUEVO-${ed.variables.length + 1}`,
                          nombre: "", tipo: "independiente", definicion_conceptual: "",
                          definicion_operacional: "", nivel_medicion: "razon", indicadores: [],
                          objetivo_especifico_asociado: "",
                        },
                      ],
                    })
                  }
                  className="text-xs text-faro-navy border border-faro-navy rounded px-2 py-1"
                >
                  + Agregar variable
                </button>
              </div>
              <div className="space-y-2">
                {ed.variables.map((v: Variable, i: number) => (
                  <div key={i} className="bg-sky-50/50 border border-sky-200 rounded-md p-2 space-y-1.5">
                    <div className="flex gap-2 items-center text-xs">
                      <input
                        value={v.nombre}
                        onChange={(e) => {
                          const nuevas = [...ed.variables];
                          nuevas[i] = { ...nuevas[i], nombre: e.target.value };
                          setEd({ ...ed, variables: nuevas });
                        }}
                        placeholder="Nombre de la variable"
                        className="flex-1 border rounded px-1.5 py-1 bg-white text-gray-900 font-medium"
                      />
                      <select
                        value={v.tipo}
                        onChange={(e) => {
                          const nuevas = [...ed.variables];
                          nuevas[i] = { ...nuevas[i], tipo: e.target.value as Variable["tipo"] };
                          setEd({ ...ed, variables: nuevas });
                        }}
                        className="border rounded px-1.5 py-1 bg-white text-gray-900"
                      >
                        <option value="independiente">Independiente</option>
                        <option value="dependiente">Dependiente</option>
                        <option value="moderadora">Moderadora</option>
                      </select>
                      <select
                        value={v.nivel_medicion}
                        onChange={(e) => {
                          const nuevas = [...ed.variables];
                          nuevas[i] = { ...nuevas[i], nivel_medicion: e.target.value as Variable["nivel_medicion"] };
                          setEd({ ...ed, variables: nuevas });
                        }}
                        className="border rounded px-1.5 py-1 bg-white text-gray-900"
                      >
                        <option value="nominal">Nominal</option>
                        <option value="ordinal">Ordinal</option>
                        <option value="intervalo">Intervalo</option>
                        <option value="razon">Razón</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setEd({ ...ed, variables: ed.variables.filter((_, idx) => idx !== i) })}
                        className="text-xs text-red-600 px-2"
                      >
                        ✕
                      </button>
                    </div>
                    <textarea
                      value={v.definicion_conceptual}
                      onChange={(e) => {
                        const nuevas = [...ed.variables];
                        nuevas[i] = { ...nuevas[i], definicion_conceptual: e.target.value };
                        setEd({ ...ed, variables: nuevas });
                      }}
                      rows={2}
                      placeholder="Definición conceptual"
                      className="w-full text-xs border rounded-md p-2 text-gray-900 bg-white"
                    />
                    <textarea
                      value={v.definicion_operacional}
                      onChange={(e) => {
                        const nuevas = [...ed.variables];
                        nuevas[i] = { ...nuevas[i], definicion_operacional: e.target.value };
                        setEd({ ...ed, variables: nuevas });
                      }}
                      rows={2}
                      placeholder="Definición operacional"
                      className="w-full text-xs border rounded-md p-2 text-gray-900 bg-white"
                    />
                    <input
                      value={v.indicadores?.join(", ") ?? ""}
                      onChange={(e) => {
                        const nuevas = [...ed.variables];
                        nuevas[i] = {
                          ...nuevas[i],
                          indicadores: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                        };
                        setEd({ ...ed, variables: nuevas });
                      }}
                      placeholder="Indicadores, separados por coma"
                      className="w-full text-xs border rounded px-1.5 py-1 bg-white text-gray-900"
                    />
                    <input
                      value={v.objetivo_especifico_asociado}
                      onChange={(e) => {
                        const nuevas = [...ed.variables];
                        nuevas[i] = { ...nuevas[i], objetivo_especifico_asociado: e.target.value };
                        setEd({ ...ed, variables: nuevas });
                      }}
                      placeholder="Objetivo específico que mide (texto exacto)"
                      className="w-full text-xs border rounded px-1.5 py-1 bg-white text-gray-900"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {(ed.enfoque_metodologico === "cualitativo" || ed.enfoque_metodologico === "mixto") && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Categorías de análisis</span>
                <button
                  type="button"
                  onClick={() =>
                    setEd({
                      ...ed,
                      categorias_analisis: [
                        ...ed.categorias_analisis,
                        { id: `CAT-NUEVO-${ed.categorias_analisis.length + 1}`, nombre: "", definicion: "", pregunta_orientadora: "", objetivo_especifico_asociado: "" },
                      ],
                    })
                  }
                  className="text-xs text-faro-navy border border-faro-navy rounded px-2 py-1"
                >
                  + Agregar categoría
                </button>
              </div>
              <div className="space-y-2">
                {ed.categorias_analisis.map((cat: CategoriaAnalisis, i: number) => (
                  <div key={i} className="bg-purple-50/50 border border-purple-200 rounded-md p-2 space-y-1.5">
                    <div className="flex gap-2 items-start">
                      <input
                        value={cat.nombre}
                        onChange={(e) => {
                          const nuevas = [...ed.categorias_analisis];
                          nuevas[i] = { ...nuevas[i], nombre: e.target.value };
                          setEd({ ...ed, categorias_analisis: nuevas });
                        }}
                        placeholder="Nombre de la categoría"
                        className="flex-1 text-sm border rounded px-2 py-1 bg-white text-gray-900 font-medium"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setEd({ ...ed, categorias_analisis: ed.categorias_analisis.filter((_, idx) => idx !== i) })
                        }
                        className="text-xs text-red-600 px-2"
                      >
                        ✕
                      </button>
                    </div>
                    <textarea
                      value={cat.definicion}
                      onChange={(e) => {
                        const nuevas = [...ed.categorias_analisis];
                        nuevas[i] = { ...nuevas[i], definicion: e.target.value };
                        setEd({ ...ed, categorias_analisis: nuevas });
                      }}
                      rows={2}
                      placeholder="Definición"
                      className="w-full text-xs border rounded-md p-2 text-gray-900 bg-white"
                    />
                    <input
                      value={cat.pregunta_orientadora}
                      onChange={(e) => {
                        const nuevas = [...ed.categorias_analisis];
                        nuevas[i] = { ...nuevas[i], pregunta_orientadora: e.target.value };
                        setEd({ ...ed, categorias_analisis: nuevas });
                      }}
                      placeholder="Pregunta orientadora"
                      className="w-full text-xs border rounded px-2 py-1 bg-white text-gray-900"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

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

      {nodosValidos.length > 1 && (
        <details className="text-sm text-gray-500">
          <summary className="cursor-pointer">Historial de iteraciones ({nodosValidos.length})</summary>
          <ul className="mt-2 space-y-1">
            {nodosValidos.map((n) => (
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
