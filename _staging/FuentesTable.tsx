// ============================================================
// FARO — Tabla de corpus bibliográfico, estilo Elicit
// Componente D del roadmap de RSL (vista dedicada, no la tarjeta
// embebida en FormulacionRuta.tsx).
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

"use client";

import { useMemo, useState } from "react";

export interface FuenteCorpus {
  id: string;
  titulo: string;
  autores: string | null;
  doi: string | null;
  anio: number | null;
  revista: string | null;
  resumen_hallazgo: string | null;
  estado_verificacion: "sin_verificar" | "verificado" | "descartado";
  fuente: string;
  creado_en: string;
}

type FiltroEstado = "todos" | "verificado" | "sin_verificar";

export function FuentesTable({ fuentes }: { fuentes: FuenteCorpus[] }) {
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [busqueda, setBusqueda] = useState("");

  const fuentesFiltradas = useMemo(() => {
    return fuentes
      .filter((f) => filtroEstado === "todos" || f.estado_verificacion === filtroEstado)
      .filter((f) => {
        if (!busqueda.trim()) return true;
        const q = busqueda.toLowerCase();
        return (
          f.titulo.toLowerCase().includes(q) ||
          (f.autores ?? "").toLowerCase().includes(q) ||
          (f.revista ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.anio ?? 0) - (a.anio ?? 0));
  }, [fuentes, filtroEstado, busqueda]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar por título, autor o revista..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="flex-1 min-w-[220px] rounded border px-3 py-1.5 text-sm"
        />
        <div className="flex gap-1">
          {(["todos", "verificado", "sin_verificar"] as FiltroEstado[]).map((estado) => (
            <button
              key={estado}
              onClick={() => setFiltroEstado(estado)}
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                filtroEstado === estado
                  ? "bg-slate-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {estado === "todos" ? "Todos" : estado === "verificado" ? "Verificados" : "Sin verificar"}
              {" "}
              ({fuentes.filter((f) => estado === "todos" || f.estado_verificacion === estado).length})
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Título</th>
              <th className="px-3 py-2">Autores</th>
              <th className="px-3 py-2">Año</th>
              <th className="px-3 py-2">Revista</th>
              <th className="px-3 py-2">DOI</th>
              <th className="px-3 py-2">Hallazgo principal</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {fuentesFiltradas.map((f) => (
              <tr key={f.id} className="border-t align-top hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{f.titulo}</td>
                <td className="px-3 py-2 text-gray-600">{f.autores ?? "—"}</td>
                <td className="px-3 py-2">{f.anio ?? "—"}</td>
                <td className="px-3 py-2 text-gray-600">{f.revista ?? "—"}</td>
                <td className="px-3 py-2">
                  {f.doi ? (
                    <a
                      href={`https://doi.org/${f.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      DOI
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 max-w-sm text-gray-600">{f.resumen_hallazgo ?? "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      f.estado_verificacion === "verificado"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {f.estado_verificacion === "verificado" ? "Verificado" : "Sin verificar"}
                  </span>
                </td>
              </tr>
            ))}
            {fuentesFiltradas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                  Ninguna fuente coincide con el filtro actual.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
