"use client";

import { useState } from "react";
import NavegacionNodos from "@/components/faro/NavegacionNodos";
import type { MarcoReferencialOutput } from "@/lib/faro/marcoReferencial";
import { generarPromptsFundamentacionTeorica } from "@/lib/faro/marcoReferencial";
import type { TipoProyecto } from "@/lib/faro/types";
import type { SubtipoDti } from "@/lib/faro/tipologiaProyecto";

interface NodoGrafo {
  id: string;
  project_id: string;
  tipo: string;
  iteracion: number;
  contenido: MarcoReferencialOutput;
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

export default function FormulacionMarcoReferencial({
  project, nodosIniciales, problemaProyecto,
}: { project: ProjectRow; nodosIniciales: NodoGrafo[]; problemaProyecto: string }) {
  const [nodos, setNodos] = useState<NodoGrafo[]>(nodosIniciales);
  const [panelPromptsAbierto, setPanelPromptsAbierto] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const prompts = generarPromptsFundamentacionTeorica(problemaProyecto);

  function copiar(texto: string, etiqueta: string) {
    navigator.clipboard.writeText(texto);
    setCopiado(etiqueta);
    setTimeout(() => setCopiado(null), 2000);
  }
  const [metrica, setMetrica] = useState<Metrica | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [editando, setEditando] = useState(false);
  const [ed, setEd] = useState<MarcoReferencialOutput | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);

  const nodoActual = nodos[0] ?? null;
  const c = nodoActual?.contenido;

  async function generar(conFeedback?: string) {
    setGenerando(true); setError(null);
    try {
      const res = await fetch("/api/mci/marco-referencial/generar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id, feedback: conFeedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error generando la propuesta.");
      setNodos((prev) => [data.nodo, ...prev]);
      setMetrica(data.metrica); setFeedback(""); setEditando(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Error desconocido."); }
    finally { setGenerando(false); }
  }

  async function confirmar(editado: boolean) {
    if (!nodoActual) return;
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <NavegacionNodos projectId={project.id} />

      <div>
        <h1 className="text-2xl font-semibold text-faro-navy">
          Formulación — MARCO REFERENCIAL {nodoActual ? `(iteración ${nodoActual.iteracion})` : ""}
        </h1>
        <p className="text-sm text-gray-600">
          {project.tau}{project.subtipo_dti ? ` · ${project.subtipo_dti}` : ""} · {project.nu} · {project.alpha_area}
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          No todos los proyectos requieren los 5 tipos de marco — el agente decide cuáles aplican
          según el tipo de proyecto (tabla de decisión ya fundamentada).
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <button type="button" onClick={() => setPanelPromptsAbierto((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left">
          <span className="text-gray-400 text-xs">{panelPromptsAbierto ? "▾" : "▸"}</span>
          <span className="text-sm font-medium text-faro-navy">
            Prompts de fundamentación teórica (NotebookLM / Perplexity)
          </span>
        </button>
        {panelPromptsAbierto && (
          <div className="px-4 pb-4 space-y-4">
            {!problemaProyecto && (
              <p className="text-xs text-amber-600">
                No se encontró el problema de RUTA confirmado — estos prompts quedarán con el
                campo del problema vacío hasta que confirme RUTA.
              </p>
            )}
            <p className="text-xs text-gray-600">
              Antes de generar Marco Referencial, use estos prompts para conseguir fundamentación
              teórica verificable — cada herramienta se usa en dos pasos, sin mezclarlas.
            </p>

            {([
              { label: "NotebookLM — Paso 1: Búsqueda", texto: prompts.notebooklmBusqueda },
              { label: "NotebookLM — Paso 2: Extracción", texto: prompts.notebooklmExtraccion },
              { label: "Perplexity — Paso 1: Descubrimiento de fuentes", texto: prompts.perplexityBusqueda },
              { label: "Perplexity — Paso 2: Extracción con citas (mismo hilo)", texto: prompts.perplexityExtraccion },
            ] as const).map((p) => (
              <div key={p.label} className="border rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-faro-navy">{p.label}</span>
                  <button onClick={() => copiar(p.texto, p.label)}
                    className="text-[11px] border border-faro-navy text-faro-navy rounded px-2 py-0.5 whitespace-nowrap">
                    {copiado === p.label ? "✓ Copiado" : "Copiar"}
                  </button>
                </div>
                <pre className="text-[11px] text-gray-600 whitespace-pre-wrap font-sans">{p.texto}</pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

      {!nodoActual && (
        <div className="text-center py-12 space-y-4">
          <p className="text-gray-600">
            Todavía no hay una propuesta de Marco Referencial — se construye a partir de RUTA,
            NOVA y Objetivos ya confirmados.
          </p>
          <button onClick={() => generar()} disabled={generando}
            className="bg-faro-navy text-white rounded-md px-6 py-3 font-medium disabled:opacity-40">
            {generando ? "Generando..." : "Generar propuesta de Marco Referencial →"}
          </button>
        </div>
      )}

      {nodoActual && c && !editando && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-5 space-y-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">📚 Marco Teórico</p>
              <p className="text-sm font-medium mt-1">Postura teórica: {c.marco_teorico.postura_teorica}</p>
              <p className="text-[11px] text-gray-400">Teorías: {c.marco_teorico.teorias_sustantivas.join(", ")}</p>
              <p className="text-sm text-gray-700 mt-1">{c.marco_teorico.texto}</p>
              {c.marco_teorico.referencias.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {c.marco_teorico.referencias.map((r, i) => (
                    <li key={i} className="text-[11px] text-gray-500 border-l-2 border-gray-200 pl-2">
                      {r.autor} ({r.año}). <em>{r.titulo}</em>. {r.fuente}.
                      {r.doi_o_isbn ? ` DOI/ISBN: ${r.doi_o_isbn}.` : ""}
                      {r.nivel_confianza !== "alta" && (
                        <span className="text-amber-600"> [confianza {r.nivel_confianza} — verificar antes de citar]</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {c.marco_conceptual.incluido && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">🔤 Marco Conceptual</p>
                <p className="text-sm text-gray-700 mt-1">{c.marco_conceptual.texto}</p>
                {c.marco_conceptual.definiciones.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.marco_conceptual.definiciones.map((d, i) => (
                      <li key={i} className="text-xs border-l-2 border-sky-300 pl-2">
                        <span className="font-medium">{d.termino}:</span> {d.definicion}
                        {d.variable_o_categoria_id && <span className="text-gray-400"> ({d.variable_o_categoria_id})</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {c.marco_contextual.incluido && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">🌍 Marco Contextual</p>
                <p className="text-sm text-gray-700 mt-1">{c.marco_contextual.texto}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs">
                  <div><span className="text-gray-400">Geográfico-territorial:</span> {c.marco_contextual.dimension_geografica_territorial}</div>
                  <div><span className="text-gray-400">Institucional:</span> {c.marco_contextual.dimension_institucional_organizacional}</div>
                  <div><span className="text-gray-400">Sectorial:</span> {c.marco_contextual.dimension_sectorial}</div>
                </div>
              </div>
            )}

            {c.marco_legal.incluido && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">⚖️ Marco Legal</p>
                <p className="text-sm text-gray-700 mt-1">{c.marco_legal.texto}</p>
                {c.marco_legal.normas.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.marco_legal.normas.map((n, i) => (
                      <li key={i} className="text-xs border-l-2 border-amber-300 pl-2">
                        <span className="font-medium">[{n.tipo}] {n.identificacion}:</span> {n.relevancia}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {c.marco_historico.incluido && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">🕰️ Marco Histórico</p>
                <p className="text-sm text-gray-700 mt-1">{c.marco_historico.texto}</p>
              </div>
            )}

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
              placeholder="Ej. El Marco Legal debería incluir la normativa ambiental aplicable..." />
            <button onClick={() => generar(feedback || undefined)} disabled={generando}
              className="border border-faro-navy text-faro-navy rounded-md px-5 py-2.5 font-medium hover:bg-faro-navy hover:text-white transition-colors disabled:opacity-40">
              {generando ? "Generando nueva iteración..." : "Regenerar propuesta →"}
            </button>
          </div>
        </div>
      )}

      {editando && ed && (
        <div className="bg-white rounded-lg border p-5 space-y-5">
          <label className="block">
            <span className="text-sm font-medium">Marco Teórico — texto</span>
            <textarea className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm" rows={4}
              value={ed.marco_teorico.texto}
              onChange={(e) => setEd({ ...ed, marco_teorico: { ...ed.marco_teorico, texto: e.target.value } })} />
          </label>

          {ed.marco_conceptual.incluido && (
            <label className="block">
              <span className="text-sm font-medium">Marco Conceptual — texto</span>
              <textarea className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm" rows={4}
                value={ed.marco_conceptual.texto}
                onChange={(e) => setEd({ ...ed, marco_conceptual: { ...ed.marco_conceptual, texto: e.target.value } })} />
            </label>
          )}

          {ed.marco_contextual.incluido && (
            <label className="block">
              <span className="text-sm font-medium">Marco Contextual — texto</span>
              <textarea className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm" rows={4}
                value={ed.marco_contextual.texto}
                onChange={(e) => setEd({ ...ed, marco_contextual: { ...ed.marco_contextual, texto: e.target.value } })} />
            </label>
          )}

          {ed.marco_legal.incluido && (
            <label className="block">
              <span className="text-sm font-medium">Marco Legal — texto</span>
              <textarea className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm" rows={4}
                value={ed.marco_legal.texto}
                onChange={(e) => setEd({ ...ed, marco_legal: { ...ed.marco_legal, texto: e.target.value } })} />
            </label>
          )}

          {ed.marco_historico.incluido && (
            <label className="block">
              <span className="text-sm font-medium">Marco Histórico — texto</span>
              <textarea className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm" rows={3}
                value={ed.marco_historico.texto}
                onChange={(e) => setEd({ ...ed, marco_historico: { ...ed.marco_historico, texto: e.target.value } })} />
            </label>
          )}

          <p className="text-[11px] text-gray-400">
            Edición rápida de texto por ahora — las definiciones/normas individuales se ajustan
            regenerando con feedback específico.
          </p>

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
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
