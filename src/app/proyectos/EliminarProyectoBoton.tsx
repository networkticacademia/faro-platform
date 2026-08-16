"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EliminarProyectoBoton({
  projectId,
  tituloProyecto,
}: {
  projectId: string;
  tituloProyecto: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeEliminar = confirmacion === tituloProyecto && !eliminando;

  function cerrar() {
    setAbierto(false);
    setConfirmacion("");
    setError(null);
  }

  async function confirmarEliminacion() {
    setEliminando(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/proyecto/eliminar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "No se pudo eliminar el proyecto.");
        setEliminando(false);
        return;
      }
      router.refresh();
      cerrar();
    } catch {
      setError("No se pudo eliminar el proyecto. Verifique su conexión.");
      setEliminando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAbierto(true);
        }}
        aria-label={`Eliminar proyecto ${tituloProyecto}`}
        title="Eliminar proyecto"
        className="p-1.5 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrar();
          }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-faro-navy">Eliminar proyecto</h2>
              <p className="text-sm text-gray-600 mt-2">
                Esta acción es <strong>irreversible</strong>. Se eliminará permanentemente
                el proyecto <strong>&quot;{tituloProyecto}&quot;</strong> junto con todo su
                grafo de nodos, preguntas pendientes, fuentes de corpus, verificaciones RSL
                y métricas de convergencia asociadas.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-gray-700">
                Para confirmar, escriba el nombre exacto del proyecto:
              </label>
              <input
                type="text"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                placeholder={tituloProyecto}
                autoFocus
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={cerrar}
                disabled={eliminando}
                className="px-4 py-2 text-sm rounded-md border text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEliminacion}
                disabled={!puedeEliminar}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white disabled:bg-red-200 disabled:cursor-not-allowed hover:bg-red-700"
              >
                {eliminando ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
