"use client";

import { useState } from "react";
import Link from "next/link";
import type { NovaOutput } from "@/lib/faro/nova";
import type { RutaOutput } from "@/lib/faro/ruta";
import type { TipoProyecto } from "@/lib/faro/types";
import type { SubtipoDti } from "@/lib/faro/tipologiaProyecto";
import { NovaInfoPanel } from "./NovaInfoPanel";
import { CifrasContextoInput, type CifraContexto } from "./CifrasContextoInput";

interface NodoGrafo {
  id: string;
  project_id: string;
  tipo: string;
  iteracion: number;
  contenido: NovaOutput;
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
  cifras_contexto?: CifraContexto[] | null;
  mu: string;
  alpha_area: string;
  u0_initial: number;
  estado: string;
}

// Campos de texto plano — los compuestos (cadena causal, cifras de
// contexto) se muestran aparte, no en esta lista simple.
const CAMPOS_EDITABLES: { key: keyof NovaOutput; etiqueta: string; multilinea?: boolean }[] = [
  { key: "nucleo_brecha_conocimiento", etiqueta: "Núcleo — Brecha de conocimiento (científica)", multilinea: true },
  { key: "nucleo_causa_raiz", etiqueta: "Núcleo — Causa raíz (MGA)", multilinea: true },
  { key: "onda_consecuencias", etiqueta: "Onda — Consecuencias (científica)", multilinea: true },
  { key: "onda_efectos_arbol_problema", etiqueta: "Onda — Efectos, árbol de problemas (MGA)", multilinea: true },
  { key: "valor_contribucion", etiqueta: "Valor — Contribución (científica)", multilinea: true },
  { key: "valor_justificacion_social", etiqueta: "Valor — Justificación social (MGA)", multilinea: true },
  { key: "avance_novedad_estado_arte", etiqueta: "Avance — Novedad frente al estado del arte (científica)", multilinea: true },
  { key: "avance_detalle", etiqueta: "Avance — Detalle (TRL o cualitativo, MGA)", multilinea: true },
  { key: "problema_formulado", etiqueta: "Problema formulado (síntesis completa)", multilinea: true },
];

export default function FormulacionNova({
  project,
  nodosIniciales,
  rutaOutputConfirmado,
}: {
  project: ProjectRow;
  nodosIniciales: NodoGrafo[];
  rutaOutputConfirmado?: RutaOutput | null;
}) {
  const [nodos, setNodos] = useState<NodoGrafo[]>(nodosIniciales);
  const [metrica, setMetrica] = useState<Metrica | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [editando, setEditando] = useState(false);
  const [contenidoEditado, setContenidoEditado] = useState<NovaOutput | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const nodoActual = nodos[0] ?? null;

  async function generar(conFeedback?: string) {
    setGenerando(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/nova/generar", {
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

  // Reutiliza /api/mci/ruta/confirmar tal cual — ya es genérico por
  // nodo_id, no existe (ni hace falta) /api/mci/nova/confirmar aparte.
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
      <NovaInfoPanel />
      <CifrasContextoInput
        projectId={project.id}
        cifrasIniciales={project.cifras_contexto ?? []}
        rutaOutput={rutaOutputConfirmado ?? null}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-faro-navy">
            Formulación — NOVA {nodoActual ? `(iteración ${nodoActual.iteracion})` : ""}
          </h1>
          <p className="text-sm text-gray-600">
            {project.tau}{project.subtipo_dti ? ` · ${project.subtipo_dti}` : ""} · {project.nu} · {project.alpha_area}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/formulacion/${project.id}`}
            className="text-xs px-3 py-1.5 rounded-md border border-faro-navy text-faro-navy hover:bg-faro-navy hover:text-white transition-colors font-medium"
          >
            ← RUTA
          </Link>
          <Link
            href={`/formulacion/${project.id}/fuentes`}
            className="text-xs px-3 py-1.5 rounded-md border border-faro-navy text-faro-navy hover:bg-faro-navy hover:text-white transition-colors font-medium flex items-center gap-1"
          >
            📚 Fuentes
          </Link>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

      {!nodoActual && (
        <div className="text-center py-12 space-y-4">
          <p className="text-gray-600">
            Todavía no hay una propuesta de NOVA para este proyecto — se construye a partir del nodo RUTA
            ya confirmado y, si existe, la síntesis bibliográfica de RSL.
          </p>
          <button
            onClick={() => generar()}
            disabled={generando}
            className="bg-faro-navy text-white rounded-md px-6 py-3 font-medium disabled:opacity-40"
          >
            {generando ? "Generando..." : "Generar propuesta NOVA →"}
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
              <p className="text-xs text-gray-500 uppercase tracking-wide">Avance — medida aplicada</p>
              <p className="text-sm">
                {nodoActual.contenido.avance_medida === "conocimiento" && "Contribución al conocimiento (sin TRL)"}
                {nodoActual.contenido.avance_medida === "trl" && "Escala TRL"}
                {nodoActual.contenido.avance_medida === "trl_mercado" && "TRL + potencial de mercado/adopción"}
                {nodoActual.contenido.avance_medida === null && (
                  <span className="text-amber-700">
                    Sin clasificar — complete el subtipo DTI en la pantalla de RUTA
                  </span>
                )}
              </p>
            </div>

            {nodoActual.contenido.nucleo_cadena_causal?.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Cadena causal (5 porqués)</p>
                <ol className="text-sm list-decimal list-inside space-y-1">
                  {nodoActual.contenido.nucleo_cadena_causal.map((p, i) => (
                    <li key={i}>
                      <span className="text-gray-600">{p.pregunta}</span> → {p.respuesta}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {nodoActual.contenido.onda_cifras_contexto?.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Cifras de contexto</p>
                <ul className="text-sm space-y-1">
                  {nodoActual.contenido.onda_cifras_contexto.map((c, i) => (
                    <li key={i}>
                      [{c.nivel}] {c.cifra} — {c.fuente}{" "}
                      {c.verificado ? (
                        <span className="text-green-700 text-xs">(verificada)</span>
                      ) : (
                        <span className="text-amber-600 text-xs">(reportada, sin verificación automática)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Estado de evidencia (Núcleo)</p>
              <p className={`text-xs mt-1 ${
                nodoActual.contenido.estado_evidencia === "confirmado_por_rsl" ? "text-green-700" :
                nodoActual.contenido.estado_evidencia === "contradicho_por_rsl" ? "text-red-700" :
                "text-amber-600"
              }`}>
                {nodoActual.contenido.estado_evidencia === "confirmado_por_rsl" ? "confirmado por RSL" :
                 nodoActual.contenido.estado_evidencia === "contradicho_por_rsl" ? "contradicho por RSL" :
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

          {metrica && (
            <div className="bg-white rounded-lg border p-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-gray-500 text-xs">δ_NOVA</p><p className="font-semibold">{metrica.deltaI}</p></div>
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
              className="w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
              rows={2}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Ej. La causa raíz no coincide con lo que documenté en la cadena de porqués..."
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
                  className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
                  rows={3}
                  value={String(contenidoEditado[key] ?? "")}
                  onChange={(e) => setContenidoEditado({ ...contenidoEditado, [key]: e.target.value })}
                />
              ) : (
                <input
                  className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
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
