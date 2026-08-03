"use client";

import { useState } from "react";
import type { RutaOutput } from "@/lib/faro/ruta";

interface NodoGrafo {
  id: string;
  project_id: string;
  tipo: string;
  iteracion: number;
  contenido: RutaOutput;
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
  tau: string;
  mu: string;
  alpha_area: string;
  u0_initial: number;
  estado: string;
}

const CAMPOS_EDITABLES: { key: keyof RutaOutput; etiqueta: string; multilinea?: boolean }[] = [
  { key: "tema", etiqueta: "Tema" },
  { key: "problema", etiqueta: "Problema", multilinea: true },
  { key: "pregunta_investigacion", etiqueta: "Pregunta de investigación", multilinea: true },
  { key: "objeto_estudio", etiqueta: "Objeto de estudio" },
  { key: "poblacion_contexto", etiqueta: "Población / contexto" },
  { key: "alcance_temporal", etiqueta: "Alcance temporal" },
  { key: "alcance_espacial", etiqueta: "Alcance espacial" },
  { key: "justificacion_breve", etiqueta: "Justificación breve", multilinea: true },
];

export default function FormulacionRuta({
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
  const [contenidoEditado, setContenidoEditado] = useState<RutaOutput | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const nodoActual = nodos[0] ?? null;

  async function generar(conFeedback?: string) {
    setGenerando(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/ruta/generar", {
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
      const res = await fetch("/api/mci/ruta/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodo_id: nodoActual.id,
          contenido_editado: editado ? contenidoEditado : undefined,
        }),
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
    setContenidoEditado({ ...nodoActual.contenido });
    setEditando(true);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-faro-navy">
            Formulación — RUTA {nodoActual ? `(iteración ${nodoActual.iteracion})` : ""}
          </h1>
          <p className="text-sm text-gray-600">
            {project.tau} · {project.nu} · {project.alpha_area} · U₀={project.u0_initial?.toFixed(3)}
          </p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full ${
          project.estado === "en_formulacion" ? "bg-faro-blue/10 text-faro-blue" : "bg-gray-100 text-gray-500"
        }`}>
          {project.estado}
        </span>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

      {!nodoActual && (
        <div className="text-center py-12 space-y-4">
          <p className="text-gray-600">Todavía no hay una propuesta de delimitación (RUTA) para este proyecto.</p>
          <button
            onClick={() => generar()}
            disabled={generando}
            className="bg-faro-navy text-white rounded-md px-6 py-3 font-medium disabled:opacity-40"
          >
            {generando ? "Generando..." : "Generar propuesta RUTA →"}
          </button>
        </div>
      )}

      {nodoActual && !editando && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-5 space-y-3">
            {CAMPOS_EDITABLES.map(({ key, etiqueta }) => (
              <div key={key}>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{etiqueta}</p>
                <p className="text-sm">{String(nodoActual.contenido[key] ?? "")}</p>
              </div>
            ))}

            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Hipótesis de vacío / problema</p>
              <p className="text-sm">{nodoActual.contenido.vacio_conocimiento_hipotesis?.afirmacion}</p>
              <p className="text-xs text-amber-600 mt-1">
                Estado de evidencia: {nodoActual.contenido.vacio_conocimiento_hipotesis?.estado_evidencia} — sin verificar contra literatura real (RSL llega en F4)
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

          {metrica && (
            <div className="bg-white rounded-lg border p-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-gray-500 text-xs">δ_RUTA</p><p className="font-semibold">{metrica.deltaI}</p></div>
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
                  {metrica.contradicciones.map((c, i) => (
                    <p key={i}>[{c.nivel}] {c.mensaje}</p>
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
              className="w-full border rounded-md p-2 text-sm"
              rows={2}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Ej. El alcance espacial no corresponde a la región real del proyecto..."
            />
            <button
              onClick={() => generar(feedback || undefined)}
              disabled={generando}
              className="text-sm text-faro-blue underline disabled:opacity-40"
            >
              {generando ? "Generando nueva iteración..." : "Regenerar propuesta →"}
            </button>
          </div>
        </div>
      )}

      {editando && contenidoEditado && (
        <div className="bg-white rounded-lg border p-5 space-y-4">
          {CAMPOS_EDITABLES.map(({ key, etiqueta, multilinea }) => (
            <label key={key} className="block">
              <span className="text-sm font-medium">{etiqueta}</span>
              {multilinea ? (
                <textarea
                  className="mt-1 w-full border rounded-md p-2 text-sm"
                  rows={3}
                  value={String(contenidoEditado[key] ?? "")}
                  onChange={(e) => setContenidoEditado({ ...contenidoEditado, [key]: e.target.value })}
                />
              ) : (
                <input
                  className="mt-1 w-full border rounded-md p-2 text-sm"
                  value={String(contenidoEditado[key] ?? "")}
                  onChange={(e) => setContenidoEditado({ ...contenidoEditado, [key]: e.target.value })}
                />
              )}
            </label>
          ))}
          <div className="flex gap-3">
            <button
              onClick={() => confirmar(true)}
              disabled={confirmando}
              className="bg-faro-navy text-white rounded-md px-5 py-2.5 font-medium disabled:opacity-40"
            >
              {confirmando ? "Guardando..." : "Guardar edición y aceptar"}
            </button>
            <button
              onClick={() => setEditando(false)}
              className="text-sm text-gray-500"
            >
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
