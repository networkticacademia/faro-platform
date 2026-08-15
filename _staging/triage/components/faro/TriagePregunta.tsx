"use client";

/**
 * TriagePregunta.tsx
 *
 * Reemplaza el textbox directo de respuesta por el flujo de 3 caminos
 * descrito en la arquitectura acordada: FARO como asesor con contexto,
 * no como caja de texto vacía. Genérico — no depende del dominio del
 * proyecto.
 *
 * Úsalo tanto dentro de GateOverlay como dentro de
 * PreguntasPendientesAgrupadas — es el componente de "responder una
 * pregunta" común a ambos.
 */

import { useState } from "react";
import { ETIQUETAS_PROCEDENCIA, type Procedencia } from "@/lib/faro/procedencia";

type Camino = "inicial" | "tengo_dato" | "no_se_donde" | "no_entiendo";

interface NodoAfectado {
  nodo_id: string;
  nodo_tipo: string;
  preguntas_que_resuelve: string[];
}

interface Props {
  preguntaId: string;
  projectId: string;
  textoPregunta: string;
  onResuelta: () => void; // refresca la lista/contador tras resolver
}

export default function TriagePregunta({ preguntaId, projectId, textoPregunta, onResuelta }: Props) {
  const [camino, setCamino] = useState<Camino>("inicial");
  const [respuestaTexto, setRespuestaTexto] = useState("");
  const [procedencia, setProcedencia] = useState<Procedencia | "">("");
  const [explicacion, setExplicacion] = useState<string | null>(null);
  const [derivacion, setDerivacion] = useState<{
    orientacion: string;
    prompt_busqueda: string;
    prompt_retorno: string;
  } | null>(null);
  const [nodosAfectados, setNodosAfectados] = useState<NodoAfectado[] | null>(null);
  const [cargando, setCargando] = useState(false);

  async function pedirExplicacion() {
    setCamino("no_entiendo");
    setCargando(true);
    try {
      const res = await fetch("/api/mci/preguntas/explicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta_id: preguntaId }),
      });
      const data = await res.json();
      setExplicacion(data.explicacion);
    } finally {
      setCargando(false);
    }
  }

  async function pedirDerivacion() {
    setCamino("no_se_donde");
    setCargando(true);
    try {
      const res = await fetch("/api/mci/preguntas/derivar-busqueda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta_id: preguntaId }),
      });
      const data = await res.json();
      setDerivacion(data);
    } finally {
      setCargando(false);
    }
  }

  async function previsualizarYConfirmar() {
    if (!respuestaTexto.trim() || !procedencia) return;
    setCargando(true);
    try {
      const res = await fetch("/api/mci/preguntas/propagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo: "previsualizar", pregunta_raiz_id: preguntaId }),
      });
      const data = await res.json();
      setNodosAfectados(data.nodos_afectados ?? []);
    } finally {
      setCargando(false);
    }
  }

  async function ejecutar() {
    if (!nodosAfectados || !procedencia) return;
    setCargando(true);
    try {
      const res = await fetch("/api/mci/preguntas/propagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: "ejecutar",
          project_id: projectId,
          pregunta_raiz_id: preguntaId,
          respuesta: respuestaTexto,
          procedencia,
          nodos_confirmados: nodosAfectados,
        }),
      });
      if (res.ok) onResuelta();
    } finally {
      setCargando(false);
    }
  }

  // --- Paso 1: triage inicial ---
  if (camino === "inicial") {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
          onClick={() => setCamino("tengo_dato")}
        >
          Sí tengo esta información
        </button>
        <button
          className="rounded border px-3 py-1 text-sm"
          disabled={cargando}
          onClick={pedirDerivacion}
        >
          No sé dónde conseguirla
        </button>
        <button
          className="rounded border px-3 py-1 text-sm"
          disabled={cargando}
          onClick={pedirExplicacion}
        >
          No entiendo la pregunta
        </button>
      </div>
    );
  }

  // --- Camino: no entiendo ---
  if (camino === "no_entiendo") {
    return (
      <div className="space-y-2">
        {cargando && <p className="text-sm text-gray-500">Consultando...</p>}
        {explicacion && (
          <div className="whitespace-pre-wrap rounded bg-white p-3 text-sm text-gray-700">
            {explicacion}
          </div>
        )}
        <button className="text-sm text-blue-600 underline" onClick={() => setCamino("inicial")}>
          Volver a las opciones
        </button>
      </div>
    );
  }

  // --- Camino: no sé dónde buscarlo ---
  if (camino === "no_se_donde") {
    return (
      <div className="space-y-2">
        {cargando && <p className="text-sm text-gray-500">Preparando orientación...</p>}
        {derivacion && (
          <div className="space-y-2 rounded bg-white p-3 text-sm">
            <p className="text-gray-700">{derivacion.orientacion}</p>
            <div>
              <p className="mb-1 text-xs font-semibold text-gray-500">
                Prompt para buscar (copie en Perplexity/NotebookLM):
              </p>
              <textarea
                readOnly
                className="w-full rounded border bg-gray-50 p-2 text-xs"
                rows={3}
                value={derivacion.prompt_busqueda}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-gray-500">
                Prompt para traer el resultado en formato usable:
              </p>
              <textarea
                readOnly
                className="w-full rounded border bg-gray-50 p-2 text-xs"
                rows={3}
                value={derivacion.prompt_retorno}
              />
            </div>
            <p className="text-xs text-gray-500">
              Esta pregunta queda en espera — vuelva cuando tenga el dato.
            </p>
          </div>
        )}
        <button className="text-sm text-blue-600 underline" onClick={() => setCamino("inicial")}>
          Volver a las opciones
        </button>
      </div>
    );
  }

  // --- Camino: tengo el dato ---
  return (
    <div className="space-y-2">
      <textarea
        className="w-full rounded border p-2 text-sm"
        rows={3}
        value={respuestaTexto}
        onChange={(e) => setRespuestaTexto(e.target.value)}
        placeholder="Su respuesta..."
      />

      <select
        className="w-full rounded border p-2 text-sm"
        value={procedencia}
        onChange={(e) => setProcedencia(e.target.value as Procedencia)}
      >
        <option value="">¿De dónde proviene este dato?</option>
        {Object.entries(ETIQUETAS_PROCEDENCIA).map(([valor, etiqueta]) => (
          <option key={valor} value={valor}>
            {etiqueta}
          </option>
        ))}
      </select>

      {!nodosAfectados ? (
        <div className="flex gap-2">
          <button
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
            disabled={!respuestaTexto.trim() || !procedencia || cargando}
            onClick={previsualizarYConfirmar}
          >
            Continuar
          </button>
          <button className="rounded border px-3 py-1 text-sm" onClick={() => setCamino("inicial")}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="space-y-2 rounded border bg-yellow-50 p-3 text-sm">
          <p>
            Esta respuesta afecta a:{" "}
            <strong>{nodosAfectados.map((n) => n.nodo_tipo).join(", ")}</strong>
            {nodosAfectados.length > 1 ? " — ¿regenerar estos nodos con su respuesta?" : ""}
          </p>
          <div className="flex gap-2">
            <button
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
              disabled={cargando}
              onClick={ejecutar}
            >
              {cargando ? "Regenerando..." : "Confirmar y regenerar"}
            </button>
            <button className="rounded border px-3 py-1 text-sm" onClick={() => setNodosAfectados(null)}>
              Volver
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
