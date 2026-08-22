"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavegacionNodos from "@/components/faro/NavegacionNodos";
import { IndicadorGenerando } from "@/components/faro/IndicadorGenerando";
import TriagePregunta from "@/components/faro/TriagePregunta";
import type {
  ImpactosDelimitacionOutput,
  TipoImpacto,
  CategoriaRecurso,
  NivelProbabilidadImpacto,
  ImpactoDeclarado,
  RecursoDetalle,
  Limitacion,
  Riesgo,
} from "@/lib/faro/impactosDelimitacion";
import { TIPO_IMPACTO_LABEL } from "@/lib/faro/impactosDelimitacion";
import type { TipoProyecto } from "@/lib/faro/types";
import type { SubtipoDti } from "@/lib/faro/tipologiaProyecto";

interface NodoGrafo {
  id: string;
  project_id: string;
  tipo: string;
  iteracion: number;
  contenido?: ImpactosDelimitacionOutput;
  contenido_origen?: ImpactosDelimitacionOutput;
  contenido_presentacion?: ImpactosDelimitacionOutput;
  confianza_agente: string | null;
  preguntas_pendientes: string[];
  confirmado_humano: boolean;
  editado_humano: boolean;
  sellado?: boolean;
  sellado_en?: string | null;
  reaperturas_count?: number;
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

/**
 * Fila REAL de preguntas_pendientes (no el snapshot de texto embebido en
 * grafo_nodos.preguntas_pendientes). Es lo que TriagePregunta necesita para
 * poder capturar procedencia, marcar la fila resuelta y propagar a los nodos
 * afectados — el mismo mecanismo que usa la página de Preguntas Pendientes,
 * en vez del textarea suelto que esta pantalla tenía antes (que ensamblaba
 * texto en el feedback y nunca resolvía la fila ni registraba procedencia).
 */
interface PreguntaReal {
  id: string;
  texto_pregunta: string;
  prioridad: string;
}

const CATEGORIA_RECURSO_LABEL: Record<CategoriaRecurso, string> = {
  humano: "Talento Humano",
  material_infraestructura: "Material e Infraestructura",
  tecnologico: "Tecnológico",
  financiero: "Financiero",
};

export default function FormulacionImpactosDelimitacion({
  project, nodosIniciales, preguntasIniciales,
}: { project: ProjectRow; nodosIniciales: NodoGrafo[]; preguntasIniciales: PreguntaReal[] }) {
  const router = useRouter();
  const [nodos, setNodos] = useState<NodoGrafo[]>(nodosIniciales);
  const [preguntas, setPreguntas] = useState<PreguntaReal[]>(preguntasIniciales);
  const [metrica, setMetrica] = useState<Metrica | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [editando, setEditando] = useState(false);
  const [ed, setEd] = useState<ImpactosDelimitacionOutput | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);

  // Resolver una pregunta vía TriagePregunta regenera el nodo en el servidor
  // (ejecutarPropagacion), así que la copia en este estado queda vieja. Tras
  // router.refresh() el componente servidor vuelve a correr y manda props
  // nuevas — useState las ignora por sí solo, de ahí esta sincronización.
  useEffect(() => { setNodos(nodosIniciales); }, [nodosIniciales]);
  useEffect(() => { setPreguntas(preguntasIniciales); }, [preguntasIniciales]);

  const nodosValidos = (nodos ?? []).filter((n): n is NodoGrafo => Boolean(n && n.id != null));
  const nodoActual = nodosValidos[0] ?? null;
  const c = (nodoActual?.contenido_presentacion ?? nodoActual?.contenido_origen ?? nodoActual?.contenido);

  async function generar(conFeedback?: string) {
    setGenerando(true); setError(null);
    try {
      const res = await fetch("/api/mci/impactos-delimitacion/generar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          feedback: conFeedback,
        }),
      });
      const data = await res.json();
      // El endpoint ahora responde con la misma forma que /preguntas/propagar
      // cuando el circuito de convergencia bloquea (200 + circuito_detenido)
      // en vez de un 500 genérico — ver circuitoConvergencia.ts.
      if (data.circuito_detenido) {
        setError(`El circuito de convergencia detuvo la regeneración: ${data.motivo_circuito ?? "sin mejora tras varias rondas"}. Puede usar "bypass" si ya revisó el resultado actual.`);
        return;
      }
      if (!res.ok || !data.nodo) throw new Error(data.error ?? "Error generando la propuesta.");
      setNodos((prev) => [data.nodo, ...prev.filter(Boolean)]);
      // Filas reales recién sincronizadas para el nodo nuevo — reemplazan a
      // las del nodo anterior, que ya no aplican a la iteración en pantalla.
      setPreguntas(data.preguntas_sincronizadas ?? []);
      setMetrica(data.metrica); setFeedback(""); setEditando(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Error desconocido."); }
    finally { setGenerando(false); }
  }

  async function confirmar(editado: boolean) {
    if (!nodoActual) return;
    setConfirmando(true); setError(null);
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
        method: "POST", headers: { "Content-Type": "application/json" },
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
    if (!c) return;
    setEd(JSON.parse(JSON.stringify(c)));
    setEditando(true);
  }

  // Helpers de edición
  function setImpacto(i: number, imp: ImpactoDeclarado) {
    if (!ed) return;
    const nuevos = [...ed.impactos];
    nuevos[i] = imp;
    setEd({ ...ed, impactos: nuevos });
  }
  function eliminarImpacto(i: number) {
    if (!ed) return;
    const nuevos = ed.impactos.filter((_, idx) => idx !== i);
    setEd({ ...ed, impactos: nuevos });
  }
  function agregarImpacto() {
    if (!ed) return;
    setEd({
      ...ed,
      impactos: [...ed.impactos, { tipo: "cientifico", descripcion: "", indicador_verificacion_futura: "" }]
    });
  }

  function setRecurso(i: number, rec: RecursoDetalle) {
    if (!ed) return;
    const nuevos = [...ed.recursos];
    nuevos[i] = rec;
    setEd({ ...ed, recursos: nuevos });
  }
  function eliminarRecurso(i: number) {
    if (!ed) return;
    const nuevos = ed.recursos.filter((_, idx) => idx !== i);
    setEd({ ...ed, recursos: nuevos });
  }
  function agregarRecurso() {
    if (!ed) return;
    setEd({
      ...ed,
      recursos: [...ed.recursos, { categoria: "humano", descripcion: "" }]
    });
  }

  function setLimitacion(i: number, lim: Limitacion) {
    if (!ed) return;
    const nuevos = [...ed.limitaciones];
    nuevos[i] = lim;
    setEd({ ...ed, limitaciones: nuevos });
  }
  function eliminarLimitacion(i: number) {
    if (!ed) return;
    const nuevos = ed.limitaciones.filter((_, idx) => idx !== i);
    setEd({ ...ed, limitaciones: nuevos });
  }
  function agregarLimitacion() {
    if (!ed) return;
    setEd({
      ...ed,
      limitaciones: [...ed.limitaciones, { descripcion: "", justificacion: "" }]
    });
  }

  function setRiesgo(i: number, r: Riesgo) {
    if (!ed) return;
    const nuevos = [...ed.riesgos];
    nuevos[i] = r;
    setEd({ ...ed, riesgos: nuevos });
  }
  function eliminarRiesgo(i: number) {
    if (!ed) return;
    const nuevos = ed.riesgos.filter((_, idx) => idx !== i);
    setEd({ ...ed, riesgos: nuevos });
  }
  function agregarRiesgo() {
    if (!ed) return;
    setEd({
      ...ed,
      riesgos: [...ed.riesgos, { descripcion: "", probabilidad: "baja", impacto: "baja", mitigacion: "" }]
    });
  }

  function badgeRiesgo(nivel: string) {
    switch (nivel) {
      case "alta":
        return "bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 rounded-full text-[10px] font-medium";
      case "media":
        return "bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-medium";
      case "baja":
        return "bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-medium";
      default:
        return "bg-gray-100 text-gray-800 border border-gray-200 px-2 py-0.5 rounded-full text-[10px] font-medium";
    }
  }

  // Agrupamiento para lectura
  const impactosPorTipo = c
    ? c.impactos.reduce((acc, imp) => {
        if (!acc[imp.tipo]) acc[imp.tipo] = [];
        acc[imp.tipo].push(imp);
        return acc;
      }, {} as Record<TipoImpacto, ImpactoDeclarado[]>)
    : {} as Record<TipoImpacto, ImpactoDeclarado[]>;

  const recursosPorCategoria = c
    ? c.recursos.reduce((acc, rec) => {
        if (!acc[rec.categoria]) acc[rec.categoria] = [];
        acc[rec.categoria].push(rec);
        return acc;
      }, {} as Record<CategoriaRecurso, RecursoDetalle[]>)
    : {} as Record<CategoriaRecurso, RecursoDetalle[]>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <NavegacionNodos projectId={project.id} />

      <div>
        <h1 className="text-2xl font-semibold text-faro-navy">
          Formulación — IMPACTOS Y DELIMITACIÓN {nodoActual ? `(iteración ${nodoActual.iteracion})` : ""}
        </h1>
        <p className="text-sm text-gray-600">
          {project.tau}{project.subtipo_dti ? ` · ${project.subtipo_dti}` : ""} · {project.nu} · {project.alpha_area}
        </p>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

      {!nodoActual && (
        <div className="text-center py-12 space-y-4">
          <p className="text-gray-600">
            Todavía no hay una propuesta de Impactos y Delimitación — se construye a partir de RUTA,
            NOVA, Objetivos y Metodología ya confirmados.
          </p>
          <button onClick={() => generar()} disabled={generando}
            className="bg-faro-navy text-white rounded-md px-6 py-3 font-medium disabled:opacity-40">
            {generando ? "Generando..." : "Generar propuesta de Impactos y Delimitación →"}
          </button>
          {generando && <IndicadorGenerando />}
        </div>
      )}

      {nodoActual && c && !editando && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-5 space-y-5">
            {/* Impactos */}
            <div>
              <h2 className="text-sm font-semibold text-faro-navy uppercase tracking-wide border-b pb-1.5 mb-3">🚀 Impactos Esperados</h2>
              {Object.keys(impactosPorTipo).length === 0 ? (
                <p className="text-xs text-gray-500 italic">No se declararon impactos.</p>
              ) : (
                <div className="space-y-3">
                  {(Object.keys(impactosPorTipo) as TipoImpacto[]).map((tipo) => (
                    <div key={tipo} className="border rounded-md p-3 bg-sky-50/20 border-sky-100">
                      <p className="text-xs font-bold text-sky-800">{TIPO_IMPACTO_LABEL[tipo]}</p>
                      <ul className="mt-1.5 space-y-2">
                        {impactosPorTipo[tipo].map((imp: ImpactoDeclarado, idx: number) => (
                          <li key={idx} className="text-xs text-gray-700 space-y-1">
                            <p><strong>Descripción:</strong> {imp.descripcion}</p>
                            <p className="text-[11px] text-gray-500"><strong>Indicador de verificación futura:</strong> {imp.indicador_verificacion_futura}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recursos */}
            <div className="border-t pt-4">
              <h2 className="text-sm font-semibold text-faro-navy uppercase tracking-wide border-b pb-1.5 mb-3">🛠️ Recursos Requeridos</h2>
              {Object.keys(recursosPorCategoria).length === 0 ? (
                <p className="text-xs text-gray-500 italic">No se catalogaron recursos.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(Object.keys(recursosPorCategoria) as CategoriaRecurso[]).map((cat) => (
                    <div key={cat} className="border rounded-md p-3 bg-emerald-50/10 border-emerald-100">
                      <p className="text-xs font-bold text-emerald-800">{CATEGORIA_RECURSO_LABEL[cat]}</p>
                      <ul className="mt-1.5 list-disc list-inside text-xs text-gray-700 space-y-1">
                        {recursosPorCategoria[cat].map((rec: RecursoDetalle, idx: number) => (
                          <li key={idx}>{rec.descripcion}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Limitaciones */}
            <div className="border-t pt-4">
              <h2 className="text-sm font-semibold text-faro-navy uppercase tracking-wide border-b pb-1.5 mb-3">⚠️ Limitaciones del Alcance</h2>
              {c.limitaciones.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No se declararon limitaciones.</p>
              ) : (
                <ul className="space-y-2">
                  {c.limitaciones.map((lim, idx) => (
                    <li key={idx} className="text-xs text-gray-700 border-l-2 border-amber-300 pl-3">
                      <p className="font-medium">{lim.descripcion}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5"><strong>Justificación estructural:</strong> {lim.justificacion}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Riesgos */}
            <div className="border-t pt-4">
              <h2 className="text-sm font-semibold text-faro-navy uppercase tracking-wide border-b pb-1.5 mb-3">⚡ Riesgos Operativos y Mitigación</h2>
              {c.riesgos.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No se identificaron riesgos.</p>
              ) : (
                <div className="space-y-3">
                  {c.riesgos.map((r, idx) => (
                    <div key={idx} className="border rounded-lg p-3 bg-gray-50/50">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-gray-800">{r.descripcion}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400">Probabilidad:</span>
                          <span className={badgeRiesgo(r.probabilidad)}>{r.probabilidad}</span>
                          <span className="text-[10px] text-gray-400">Impacto:</span>
                          <span className={badgeRiesgo(r.impacto)}>{r.impacto}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-600 mt-1.5">
                        <strong>Mitigación:</strong> {r.mitigacion}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {preguntas.length > 0 && (
              <div className="border-t pt-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    El agente necesita que usted aclare esto — responda las que apliquen:
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Cada respuesta se registra con su procedencia y actualiza los nodos que
                    dependan de ella. No es obligatorio responder todas.
                  </p>
                </div>
                {preguntas.map((p) => (
                  <div key={p.id} className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-medium text-gray-900 leading-relaxed">{p.texto_pregunta}</p>
                      <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        {p.prioridad}
                      </span>
                    </div>
                    <TriagePregunta
                      preguntaId={p.id}
                      projectId={project.id}
                      textoPregunta={p.texto_pregunta}
                      onResuelta={() => router.refresh()}
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400">Confianza del agente: {nodoActual.confianza_agente}</p>
          </div>

          {metrica && (
            <div className="bg-white rounded-lg border p-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-gray-500 text-xs">δ</p><p className="font-semibold">{metrica.deltaI}</p></div>
              <div><p className="text-gray-500 text-xs">Ω</p><p className="font-semibold">{metrica.omega}</p></div>
              <div><p className="text-gray-500 text-xs">L_FARO</p><p className="font-semibold">{metrica.lFaro}</p></div>
              <div><p className="text-gray-500 text-xs">τc</p><p className="font-semibold">{metrica.tauC}</p></div>
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
              <p className="text-xs text-amber-800">Este nodo ya está confirmado. Reábralo para editar.</p>
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
              placeholder="Ej. Debería incluirse el impacto ambiental tecnológico de reducción de CO2..." />
            {/* Ya NO ensambla las respuestas de las preguntas en el feedback:
                esas viajan por TriagePregunta (con procedencia y resolución
                real de la fila). Este botón regenera solo con la instrucción
                libre de arriba, que es lo que su nombre siempre implicó. */}
            <button onClick={() => generar(feedback.trim() || undefined)} disabled={generando}
              className="border border-faro-navy text-faro-navy rounded-md px-5 py-2.5 font-medium hover:bg-faro-navy hover:text-white transition-colors disabled:opacity-40">
              {generando ? "Generando nueva iteración..." : "Regenerar propuesta →"}
            </button>
            {generando && <IndicadorGenerando mensaje="Regenerando propuesta con el agente de IA..." />}
          </div>
        </div>
      )}

      {editando && ed && (
        <div className="bg-white rounded-lg border p-5 space-y-6">
          {/* Edición de Impactos */}
          <div>
            <div className="flex items-center justify-between border-b pb-2 mb-3">
              <p className="text-sm font-semibold text-faro-navy uppercase">🚀 Editar Impactos</p>
              <button onClick={agregarImpacto} className="text-xs bg-faro-navy text-white px-2.5 py-1 rounded">
                + Agregar impacto
              </button>
            </div>
            <div className="space-y-4">
              {ed.impactos.map((imp, i) => (
                <div key={i} className="border p-3 rounded bg-gray-50/50 space-y-2 relative">
                  <button onClick={() => eliminarImpacto(i)} className="absolute top-2 right-2 text-xs text-red-600">✕</button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs text-gray-500 font-medium">Tipo de Impacto</span>
                      <select value={imp.tipo}
                        onChange={(e) => setImpacto(i, { ...imp, tipo: e.target.value as TipoImpacto })}
                        className="mt-1 w-full border rounded px-2 py-1 text-xs bg-white text-gray-900">
                        {Object.entries(TIPO_IMPACTO_LABEL).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500 font-medium">Indicador de Verificación Futura</span>
                      <input type="text" value={imp.indicador_verificacion_futura}
                        onChange={(e) => setImpacto(i, { ...imp, indicador_verificacion_futura: e.target.value })}
                        placeholder="Cómo se medirá en el futuro"
                        className="mt-1 w-full border rounded px-2 py-1 text-xs bg-white text-gray-900" />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs text-gray-500 font-medium">Descripción Cualitativa Fundamentada</span>
                    <textarea value={imp.descripcion}
                      onChange={(e) => setImpacto(i, { ...imp, descripcion: e.target.value })}
                      placeholder="Explicación argumentada del efecto de largo plazo"
                      className="mt-1 w-full border rounded px-2 py-1 text-xs bg-white text-gray-900" rows={2} />
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Edición de Recursos */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between border-b pb-2 mb-3">
              <p className="text-sm font-semibold text-faro-navy uppercase">🛠️ Editar Recursos</p>
              <button onClick={agregarRecurso} className="text-xs bg-faro-navy text-white px-2.5 py-1 rounded">
                + Agregar recurso
              </button>
            </div>
            <div className="space-y-3">
              {ed.recursos.map((rec, i) => (
                <div key={i} className="flex gap-2 items-center border p-2.5 rounded bg-gray-50/50">
                  <select value={rec.categoria}
                    onChange={(e) => setRecurso(i, { ...rec, categoria: e.target.value as CategoriaRecurso })}
                    className="w-40 border rounded px-2 py-1 text-xs bg-white text-gray-900">
                    {Object.entries(CATEGORIA_RECURSO_LABEL).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                  <input type="text" value={rec.descripcion}
                    onChange={(e) => setRecurso(i, { ...rec, descripcion: e.target.value })}
                    placeholder="Descripción del recurso específico"
                    className="flex-1 border rounded px-2 py-1 text-xs bg-white text-gray-900" />
                  <button onClick={() => eliminarRecurso(i)} className="text-xs text-red-600 px-1">✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* Edición de Limitaciones */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between border-b pb-2 mb-3">
              <p className="text-sm font-semibold text-faro-navy uppercase">⚠️ Editar Limitaciones</p>
              <button onClick={agregarLimitacion} className="text-xs bg-faro-navy text-white px-2.5 py-1 rounded">
                + Agregar limitación
              </button>
            </div>
            <div className="space-y-4">
              {ed.limitaciones.map((lim, i) => (
                <div key={i} className="border p-3 rounded bg-gray-50/50 space-y-2 relative">
                  <button onClick={() => eliminarLimitacion(i)} className="absolute top-2 right-2 text-xs text-red-600">✕</button>
                  <label className="block">
                    <span className="text-xs text-gray-500 font-medium">Descripción de la Limitación</span>
                    <input type="text" value={lim.descripcion}
                      onChange={(e) => setLimitacion(i, { ...lim, descripcion: e.target.value })}
                      placeholder="Restricción estructural"
                      className="mt-1 w-full border rounded px-2 py-1 text-xs bg-white text-gray-900" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500 font-medium">Justificación del Alcance</span>
                    <textarea value={lim.justificacion}
                      onChange={(e) => setLimitacion(i, { ...lim, justificacion: e.target.value })}
                      placeholder="Por qué es insalvable científica/metodológicamente"
                      className="mt-1 w-full border rounded px-2 py-1 text-xs bg-white text-gray-900" rows={2} />
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Edición de Riesgos */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between border-b pb-2 mb-3">
              <p className="text-sm font-semibold text-faro-navy uppercase">⚡ Editar Riesgos</p>
              <button onClick={agregarRiesgo} className="text-xs bg-faro-navy text-white px-2.5 py-1 rounded">
                + Agregar riesgo
              </button>
            </div>
            <div className="space-y-4">
              {ed.riesgos.map((r, i) => (
                <div key={i} className="border p-3 rounded bg-gray-50/50 space-y-2 relative">
                  <button onClick={() => eliminarRiesgo(i)} className="absolute top-2 right-2 text-xs text-red-600">✕</button>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="block">
                      <span className="text-xs text-gray-500 font-medium">Descripción</span>
                      <input type="text" value={r.descripcion}
                        onChange={(e) => setRiesgo(i, { ...r, descripcion: e.target.value })}
                        placeholder="Descripción del evento incierto"
                        className="mt-1 w-full border rounded px-2 py-1 text-xs bg-white text-gray-900" />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500 font-medium">Probabilidad</span>
                      <select value={r.probabilidad}
                        onChange={(e) => setRiesgo(i, { ...r, probabilidad: e.target.value as NivelProbabilidadImpacto })}
                        className="mt-1 w-full border rounded px-2 py-1 text-xs bg-white text-gray-900">
                        <option value="baja">Baja</option>
                        <option value="media">Media</option>
                        <option value="alta">Alta</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500 font-medium">Impacto</span>
                      <select value={r.impacto}
                        onChange={(e) => setRiesgo(i, { ...r, impacto: e.target.value as NivelProbabilidadImpacto })}
                        className="mt-1 w-full border rounded px-2 py-1 text-xs bg-white text-gray-900">
                        <option value="baja">Baja</option>
                        <option value="media">Media</option>
                        <option value="alta">Alta</option>
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs text-gray-500 font-medium">Plan de Mitigación</span>
                    <input type="text" value={r.mitigacion}
                      onChange={(e) => setRiesgo(i, { ...r, mitigacion: e.target.value })}
                      placeholder="Acción preventiva o correctiva"
                      className="mt-1 w-full border rounded px-2 py-1 text-xs bg-white text-gray-900" />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t">
            <button onClick={() => confirmar(true)} disabled={confirmando}
              className="bg-faro-navy text-white rounded-md px-5 py-2.5 font-medium disabled:opacity-40">
              {confirmando ? "Guardando..." : "Guardar edición y aceptar"}
            </button>
            <button onClick={() => setEditando(false)} className="text-sm text-gray-500">Cancelar</button>
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
