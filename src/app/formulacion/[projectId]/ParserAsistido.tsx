// ============================================================
// FARO — Componente B del roadmap de RSL, pieza de UI
// Textarea donde el formulador pega el reporte de NotebookLM/
// Perplexity/Elicit/SciSpace, y botón que lo envía a
// /api/mci/corpus/asistida para parseo + verificación + inserción.
//
// Autocontenido a propósito: se monta dentro de FormulacionRuta.tsx
// (o de la futura vista dedicada de RSL) sin depender de su estado
// interno — solo necesita projectId y, opcionalmente, el nodo_origen.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

"use client";

import { useState } from "react";

interface ResultadoProcesamiento {
  total_extraidos: number;
  insertados: number;
  descartados: { titulo: string; motivo: string }[];
  sin_doi: { titulo: string }[];
}

export function ParserAsistido({
  projectId,
  nodoOrigenId,
}: {
  projectId: string;
  nodoOrigenId?: string;
}) {
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoProcesamiento | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function procesar() {
    setCargando(true);
    setError(null);
    setResultado(null);
    try {
      const respuesta = await fetch("/api/mci/corpus/asistida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          texto_pegado: texto,
          nodo_origen_id: nodoOrigenId,
        }),
      });
      if (!respuesta.ok) throw new Error("Error del servidor al procesar el texto");
      setResultado(await respuesta.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
      <h3 className="font-semibold text-sm">
        Pegar reporte de NotebookLM / Perplexity / Elicit / SciSpace
      </h3>
      <p className="text-xs text-gray-600">
        Pegue aquí el texto tal como lo devolvió la herramienta externa —
        no necesita reformatearlo. Cada cita con DOI se verifica contra
        Crossref antes de agregarse al corpus del proyecto.
      </p>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={8}
        className="w-full rounded border p-2 text-sm"
        placeholder="Pegue aquí el reporte completo del asistente..."
      />
      <button
        onClick={procesar}
        disabled={cargando || texto.trim().length === 0}
        className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {cargando ? "Procesando..." : "Procesar y verificar"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {resultado && (
        <div className="text-sm space-y-2">
          <p>
            {resultado.total_extraidos} fuentes detectadas ·{" "}
            <span className="font-medium text-green-700">
              {resultado.insertados} agregadas al corpus
            </span>{" "}
            · {resultado.descartados.length} descartadas
          </p>
          {resultado.sin_doi.length > 0 && (
            <p className="text-amber-700">
              {resultado.sin_doi.length} sin DOI — quedaron como
              "sin_verificar", requieren revisión manual antes de usarse
              en el manuscrito.
            </p>
          )}
          {resultado.descartados.length > 0 && (
            <ul className="list-disc pl-5 text-red-700">
              {resultado.descartados.map((d, i) => (
                <li key={i}>
                  {d.titulo} — {d.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
