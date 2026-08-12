"use client";

import { useState } from "react";
import type { RubricaProyecto } from "@/lib/faro/rubrica";

const NODO_LABEL: Record<string, string> = {
  RUTA: "RUTA",
  NOVA: "NOVA",
  OBJETIVOS: "Objetivos",
  METODOLOGIA: "Metodología",
  MARCO_REFERENCIAL: "Marco Referencial",
  PRESUPUESTO: "Presupuesto",
  TRANSVERSAL: "Transversal (todo el proyecto)",
};

export function CargaRubrica({
  projectId,
  rubricaInicial,
}: {
  projectId: string;
  rubricaInicial: RubricaProyecto | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [rubrica, setRubrica] = useState<RubricaProyecto | null>(rubricaInicial);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    if (!texto.trim()) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/rubrica/cargar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, texto_rubrica: texto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al procesar la rúbrica.");
      setRubrica(data.rubrica);
      setTexto("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setCargando(false);
    }
  }

  const diferenciales = rubrica?.items.filter((i) => i.es_enfoque_diferencial_territorial) ?? [];
  const calidad = rubrica?.items.filter((i) => !i.es_enfoque_diferencial_territorial) ?? [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white mb-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-gray-400 text-xs">{abierto ? "▾" : "▸"}</span>
          <span className="text-sm font-medium text-faro-navy">
            Rúbrica de evaluación / términos de referencia
          </span>
        </span>
        {rubrica && (
          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            {rubrica.items.length} ítems cargados
            {rubrica.puntaje_total_declarado ? ` · sobre ${rubrica.puntaje_total_declarado} pts` : ""}
          </span>
        )}
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-4">
          <p className="text-xs text-gray-600">
            Pegue aquí el texto de la rúbrica de evaluación o términos de referencia de la
            convocatoria (si es una convocatoria específica) — o déjelo genérico si todavía no
            la tiene. FARO extrae los ítems puntuables y a qué parte del proyecto corresponde
            cada uno, para que pueda verificarlos más adelante.
          </p>

          {error && <div className="bg-red-50 text-red-700 text-xs p-2 rounded-md">{error}</div>}

          <textarea
            className="w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
            rows={6}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Pegue aquí el texto completo de la rúbrica o términos de referencia..."
          />
          <button
            onClick={cargar}
            disabled={cargando || !texto.trim()}
            className="bg-faro-navy text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {cargando ? "Extrayendo ítems..." : rubrica ? "Reemplazar rúbrica actual" : "Extraer ítems de la rúbrica"}
          </button>

          {rubrica && (
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs text-gray-500">
                {rubrica.tipo_rubrica === "convocatoria" ? "Rúbrica de convocatoria pública" :
                 rubrica.tipo_rubrica === "proyecto_grado" ? "Rúbrica de proyecto de grado" : "Rúbrica"}
                {rubrica.nombre_convocatoria_o_fuente ? ` — ${rubrica.nombre_convocatoria_o_fuente}` : ""}
              </p>

              <div>
                <p className="text-xs font-semibold text-faro-navy mb-1">Ítems de calidad/metodología ({calidad.length})</p>
                <ul className="space-y-1.5">
                  {calidad.map((item) => (
                    <li key={item.id} className="text-xs border-l-2 border-sky-300 pl-2">
                      <span className="text-gray-800">{item.descripcion}</span>
                      {item.peso !== null && <span className="text-gray-400"> ({item.peso} pts)</span>}
                      <span className="text-[10px] text-gray-400 block">
                        → {item.nodo_esperado.map((n) => NODO_LABEL[n] ?? n).join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {diferenciales.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1">
                    Ítems de enfoque diferencial/territorial ({diferenciales.length})
                  </p>
                  <p className="text-[10px] text-amber-600 mb-1">
                    Estos NO se corrigen mejorando el diseño metodológico — necesitan evidencia
                    documental específica.
                  </p>
                  <ul className="space-y-1.5">
                    {diferenciales.map((item) => (
                      <li key={item.id} className="text-xs border-l-2 border-amber-300 pl-2">
                        <span className="text-gray-800">{item.descripcion}</span>
                        {item.peso !== null && <span className="text-gray-400"> ({item.peso} pts)</span>}
                        <span className="text-[10px] text-gray-400 block">
                          → {item.nodo_esperado.map((n) => NODO_LABEL[n] ?? n).join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
