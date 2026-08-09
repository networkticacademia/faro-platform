// ============================================================
// FARO — Vista dedicada del corpus bibliográfico del proyecto
// Componente D del roadmap de RSL: reemplaza mirar el corpus solo
// desde Supabase. Ruta: /formulacion/[projectId]/fuentes
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

  useEffect(() => {
    if (!projectId) return;
    setCargando(true);
    fetch(`/api/mci/corpus?project_id=${projectId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Error al cargar el corpus");
        return r.json();
      })
      .then((data) => setFuentes(data.fuentes ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Error desconocido"))
      .finally(() => setCargando(false));
  }, [projectId]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Fuentes del proyecto</h1>
        <p className="text-sm text-gray-500">
          Corpus bibliográfico acumulado — RSL automático, carga manual y captura asistida.
        </p>
      </div>

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

      {cargando && <p className="text-gray-500">Cargando corpus...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!cargando && !error && (
        <>
          {vista === "tabla" ? <FuentesTable fuentes={fuentes} /> : <FuentesGrafo fuentes={fuentes} />}
        </>
      )}
    </div>
  );
}
