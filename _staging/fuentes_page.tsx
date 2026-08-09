// ============================================================
// FARO — Vista dedicada del corpus bibliográfico del proyecto
// Componente D del roadmap de RSL. Ruta: /formulacion/[projectId]/fuentes
//
// v3 (2026-08-09): exportar a BibTeX ahora respeta la selección de
// filas (checkboxes en FuentesTable) en vez de exportar siempre todo
// lo verificado. La descarga pasa de <a href> a fetch+blob porque el
// endpoint cambió de GET a POST (la lista de ids no cabe bien en
// query string).
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
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<string | null>(null);

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
        // Selección inicial por defecto: solo lo verificado, para que
        // el botón de exportar funcione de inmediato sin pasos extra.
        setSeleccionadas(
          new Set(lista.filter((f) => f.estado_verificacion === "verificado").map((f) => f.id))
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error desconocido"))
      .finally(() => setCargando(false));
  }, [projectId]);

  async function exportarBibtex() {
    if (seleccionadas.size === 0) {
      setErrorExportar("Seleccione al menos una fuente para exportar.");
      return;
    }
    setExportando(true);
    setErrorExportar(null);
    try {
      const respuesta = await fetch("/api/mci/corpus/exportar-bib", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, ids: Array.from(seleccionadas) }),
      });
      if (!respuesta.ok) {
        const data = await respuesta.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al exportar");
      }
      const blob = await respuesta.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `faro_corpus_${projectId}.bib`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorExportar(e instanceof Error ? e.message : "Error desconocido al exportar");
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
          disabled={exportando}
          className="ml-auto rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {exportando ? "Generando..." : `Exportar seleccionadas a BibTeX (${seleccionadas.size})`}
        </button>
      </div>

      {errorExportar && <p className="text-sm text-red-600">{errorExportar}</p>}
      {cargando && <p className="text-gray-500">Cargando corpus...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!cargando && !error && (
        <>
          {vista === "tabla" ? (
            <FuentesTable
              fuentes={fuentes}
              seleccionadas={seleccionadas}
              onCambiarSeleccion={setSeleccionadas}
            />
          ) : (
            <FuentesGrafo fuentes={fuentes} />
          )}
        </>
      )}
    </div>
  );
}
