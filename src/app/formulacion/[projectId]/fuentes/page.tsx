// ============================================================
// FARO — Vista dedicada del corpus bibliográfico del proyecto
// Componente D del roadmap de RSL.
// Ruta: /formulacion/[projectId]/fuentes
// v2: Exportación a BibTeX acotada a la selección de casillas.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { FuentesTable, type FuenteCorpus } from "./FuentesTable";
import { FuentesGrafo } from "./FuentesGrafo";

type Vista = "tabla" | "grafo";

export default function FuentesPage() {
  const params = useParams();
  const projectId = params?.projectId as string;

  const [fuentes, setFuentes] = useState<FuenteCorpus[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("tabla");
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setCargando(true);
    fetch(`/api/mci/corpus?project_id=${projectId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Error al cargar el corpus");
        return r.json();
      })
      .then((data) => {
        const lista: FuenteCorpus[] = data.fuentes ?? [];
        setFuentes(lista);
        // Por defecto, selecciona las fuentes verificadas
        const idsVerificados = new Set(
          lista.filter((f) => f.estado_verificacion === "verificado").map((f) => f.id)
        );
        setSeleccionados(idsVerificados);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error desconocido"))
      .finally(() => setCargando(false));
  }, [projectId]);

  function alternarSeleccion(id: string) {
    setSeleccionados((prev) => {
      const prox = new Set(prev);
      if (prox.has(id)) prox.delete(id);
      else prox.add(id);
      return prox;
    });
  }

  function seleccionarTodos() {
    if (seleccionados.size === fuentes.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(fuentes.map((f) => f.id)));
    }
  }

  function seleccionarSoloVerificados() {
    setSeleccionados(
      new Set(fuentes.filter((f) => f.estado_verificacion === "verificado").map((f) => f.id))
    );
  }

  async function exportarBibtex() {
    if (!projectId) return;
    setExportando(true);
    try {
      const res = await fetch("/api/mci/corpus/exportar-bib", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          ids: Array.from(seleccionados),
        }),
      });

      if (!res.ok) throw new Error("Error al generar BibTeX");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `faro_corpus_${projectId.slice(0, 8)}.bib`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al exportar BibTeX");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Fuentes del proyecto</h1>
          <p className="text-sm text-gray-500">
            Corpus bibliográfico acumulado — RSL automático, carga manual y captura asistida.
          </p>
        </div>
        <Link
          href={`/formulacion/${projectId}`}
          className="text-xs px-3 py-1.5 rounded-md border border-faro-navy text-faro-navy hover:bg-faro-navy hover:text-white transition-colors font-medium"
        >
          ← Volver a Formulación
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => setVista("tabla")}
            className={`rounded px-4 py-2 text-sm font-medium ${
              vista === "tabla" ? "bg-slate-900 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            Tabla
          </button>
          <button
            onClick={() => setVista("grafo")}
            className={`rounded px-4 py-2 text-sm font-medium ${
              vista === "grafo" ? "bg-slate-900 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            Grafo
          </button>
        </div>
        <button
          onClick={exportarBibtex}
          disabled={exportando || seleccionados.size === 0}
          className="ml-auto rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exportando
            ? "Generando .bib..."
            : `Exportar a BibTeX (${seleccionados.size} seleccionadas)`}
        </button>
      </div>

      {cargando && <p className="text-gray-500">Cargando corpus...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!cargando && !error && (
        <>
          {vista === "tabla" ? (
            <FuentesTable
              fuentes={fuentes}
              seleccionados={seleccionados}
              onAlternarSeleccion={alternarSeleccion}
              onSeleccionarTodos={seleccionarTodos}
              onSeleccionarSoloVerificados={seleccionarSoloVerificados}
            />
          ) : (
            <FuentesGrafo fuentes={fuentes} />
          )}
        </>
      )}
    </div>
  );
}
