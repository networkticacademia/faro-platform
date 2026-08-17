"use client";

/**
 * TriagePregunta.tsx
 *
 * Flujo de 3 caminos (Sí tengo esta información + procedencia,
 * No sé dónde conseguirla, No entiendo la pregunta) con previsualización
 * y confirmación de nodos afectados.
 *
 * "No entiendo la pregunta" abre un MODAL por encima de la tarjeta —no
 * reemplaza su contenido— para que cualquier estado en curso (borrador de
 * respuesta, procedencia elegida, previsualización de nodos afectados)
 * quede intacto debajo mientras el modal está abierto.
 */

import { useEffect, useState } from "react";
import { ETIQUETAS_PROCEDENCIA, type Procedencia } from "@/lib/faro/procedencia";
import { IndicadorGenerando } from "./IndicadorGenerando";

type Camino = "inicial" | "tengo_dato" | "no_se_donde";

interface NodoAfectado {
  nodo_id: string;
  nodo_tipo: string;
  preguntas_que_resuelve: string[];
}

interface Props {
  preguntaId: string;
  projectId: string;
  textoPregunta: string;
  onResuelta: () => void;
}

export default function TriagePregunta({ preguntaId, projectId, textoPregunta, onResuelta }: Props) {
  const [camino, setCamino] = useState<Camino>("inicial");
  const [respuestaTexto, setRespuestaTexto] = useState("");
  const [procedencia, setProcedencia] = useState<Procedencia | "">("");
  const [derivacion, setDerivacion] = useState<{
    orientacion: string;
    prompt_busqueda: string;
    prompt_retorno: string;
  } | null>(null);
  const [nodosAfectados, setNodosAfectados] = useState<NodoAfectado[] | null>(null);
  const [cargando, setCargando] = useState(false);

  // Modal "No entiendo la pregunta" — independiente de `camino`, para que
  // abrirlo/cerrarlo nunca desmonte ni reinicie el resto de la tarjeta.
  const [modalExplicacionAbierto, setModalExplicacionAbierto] = useState(false);
  const [explicacion, setExplicacion] = useState<string | null>(null);
  const [cargandoExplicacion, setCargandoExplicacion] = useState(false);

  async function pedirExplicacion() {
    setModalExplicacionAbierto(true);
    if (explicacion) return; // ya se consultó antes — no repetir la llamada al modelo
    setCargandoExplicacion(true);
    try {
      const res = await fetch("/api/mci/preguntas/explicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta_id: preguntaId }),
      });
      const data = await res.json();
      setExplicacion(data.explicacion);
    } finally {
      setCargandoExplicacion(false);
    }
  }

  function cerrarModalExplicacion() {
    setModalExplicacionAbierto(false);
  }

  useEffect(() => {
    if (!modalExplicacionAbierto) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") cerrarModalExplicacion();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalExplicacionAbierto]);

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

  let contenidoCamino: React.ReactNode;

  if (camino === "inicial") {
    contenidoCamino = (
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded bg-faro-navy px-3 py-1.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-faro-navy/90"
          onClick={() => setCamino("tengo_dato")}
        >
          Sí tengo esta información
        </button>
        <button
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50"
          disabled={cargando}
          onClick={pedirDerivacion}
        >
          No sé dónde conseguirla
        </button>
        <button
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={pedirExplicacion}
        >
          No entiendo la pregunta
        </button>
      </div>
    );
  } else if (camino === "no_se_donde") {
    contenidoCamino = (
      <div className="space-y-2">
        {cargando && <p className="text-xs text-gray-500">Preparando orientación de búsqueda...</p>}
        {derivacion && (
          <div className="space-y-2 rounded-lg border bg-white p-3 text-xs sm:text-sm">
            <p className="text-gray-700 font-medium">{derivacion.orientacion}</p>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Prompt para buscar (copie en Perplexity / NotebookLM / buscador):
              </p>
              <textarea
                readOnly
                className="w-full rounded border bg-gray-50 p-2 text-xs font-mono text-gray-700"
                rows={3}
                value={derivacion.prompt_busqueda}
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Prompt para traer el resultado en formato estructurado usable:
              </p>
              <textarea
                readOnly
                className="w-full rounded border bg-gray-50 p-2 text-xs font-mono text-gray-700"
                rows={3}
                value={derivacion.prompt_retorno}
              />
            </div>
            <p className="text-[11px] text-amber-700 italic">
              Esta pregunta ha quedado registrada en estado de espera — vuelva cuando disponga del dato.
            </p>
          </div>
        )}
        <button className="text-xs font-medium text-faro-navy hover:underline" onClick={() => setCamino("inicial")}>
          ← Volver a las opciones
        </button>
      </div>
    );
  } else {
    contenidoCamino = (
      <div className="space-y-3">
        <textarea
          className="w-full rounded-lg border p-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-faro-navy/20"
          rows={3}
          value={respuestaTexto}
          onChange={(e) => setRespuestaTexto(e.target.value)}
          placeholder="Escriba su respuesta o dato aportado..."
        />

        <select
          className="w-full rounded-lg border bg-white p-2 text-xs sm:text-sm text-gray-700"
          value={procedencia}
          onChange={(e) => setProcedencia(e.target.value as Procedencia)}
        >
          <option value="">¿De dónde proviene este dato? (Seleccionar procedencia)</option>
          {Object.entries(ETIQUETAS_PROCEDENCIA).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>

        {!nodosAfectados ? (
          <div className="flex gap-2">
            <button
              className="rounded bg-faro-navy px-3 py-1.5 text-xs sm:text-sm font-medium text-white disabled:opacity-50 shadow-sm"
              disabled={!respuestaTexto.trim() || !procedencia || cargando}
              onClick={previsualizarYConfirmar}
            >
              {cargando ? "Analizando impacto..." : "Continuar"}
            </button>
            <button className="rounded border px-3 py-1.5 text-xs sm:text-sm text-gray-600 hover:bg-gray-50" onClick={() => setCamino("inicial")}>
              Cancelar
            </button>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs sm:text-sm">
            <p className="text-amber-900 font-medium">
              Esta respuesta actualizará:{" "}
              <strong>{nodosAfectados.map((n) => n.nodo_tipo).join(", ")}</strong>
              {nodosAfectados.length > 1 ? " — ¿desea regenerar estos nodos en cascada con este dato?" : ""}
            </p>
            <div className="flex gap-2">
              <button
                className="rounded bg-faro-navy px-3 py-1.5 text-xs sm:text-sm font-medium text-white disabled:opacity-50 shadow-sm"
                disabled={cargando}
                onClick={ejecutar}
              >
                {cargando ? "Regenerando en cascada..." : "Confirmar y regenerar"}
              </button>
              <button className="rounded border bg-white px-3 py-1.5 text-xs sm:text-sm text-gray-700" onClick={() => setNodosAfectados(null)}>
                Volver
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {contenidoCamino}

      {modalExplicacionAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarModalExplicacion();
          }}
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-faro-navy">¿Qué significa esta pregunta?</h3>
                <p className="mt-1 text-xs text-gray-500">&quot;{textoPregunta}&quot;</p>
              </div>
            </div>

            {cargandoExplicacion && (
              <IndicadorGenerando mensaje="Consultando con contexto, espere un momento..." />
            )}

            {!cargandoExplicacion && explicacion && (
              <div className="whitespace-pre-wrap rounded-lg border bg-gray-50 p-3 text-xs sm:text-sm text-gray-700">
                {explicacion}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                className="rounded bg-faro-navy px-4 py-1.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-faro-navy/90"
                onClick={cerrarModalExplicacion}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
