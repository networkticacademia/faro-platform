"use client";

import { useState } from "react";

const COMPONENTES = [
  {
    letra: "R",
    nombre: "Región",
    detalle: "Contexto geográfico e institucional",
    bg: "bg-[#9B4A2E]",
    bgClaro: "bg-[#9B4A2E]/10",
    borde: "border-[#9B4A2E]/30",
    texto: "text-[#9B4A2E]",
  },
  {
    letra: "U",
    nombre: "Usuarios",
    detalle: "Población objeto de la investigación",
    bg: "bg-[#2B6CB0]",
    bgClaro: "bg-[#2B6CB0]/10",
    borde: "border-[#2B6CB0]/30",
    texto: "text-[#2B6CB0]",
  },
  {
    letra: "T",
    nombre: "Tema",
    detalle: "Alcance disciplinar y temporal",
    bg: "bg-[#5B6D7A]",
    bgClaro: "bg-[#5B6D7A]/10",
    borde: "border-[#5B6D7A]/30",
    texto: "text-[#5B6D7A]",
  },
  {
    letra: "A",
    nombre: "Aplicación",
    detalle: "Tipo de proyecto y nivel TRL",
    bg: "bg-[#0F6E56]",
    bgClaro: "bg-[#0F6E56]/10",
    borde: "border-[#0F6E56]/30",
    texto: "text-[#0F6E56]",
  },
] as const;

export function RutaInfoPanel() {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white mb-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <span className="text-gray-400 text-xs">{abierto ? "▾" : "▸"}</span>
        <span className="text-sm font-medium text-faro-navy">¿Qué es RUTA?</span>
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-4">
          <p className="text-sm text-gray-600">
            RUTA es el primer operador metodológico de FARO — delimita de forma
            estructurada el objeto de estudio antes de construir el problema
            (eso lo hace NOVA, el siguiente nodo). Se resume en cuatro
            componentes que convergen en una sola pregunta de investigación:
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {COMPONENTES.map((c) => (
              <div
                key={c.letra}
                className={`rounded-lg border ${c.borde} ${c.bgClaro} p-3 text-center`}
              >
                <div
                  className={`w-9 h-9 mx-auto rounded-full ${c.bg} text-white flex items-center justify-center font-bold text-lg mb-1.5`}
                >
                  {c.letra}
                </div>
                <p className={`text-xs font-semibold ${c.texto}`}>{c.nombre}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{c.detalle}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-1">
            <span className="text-gray-300 text-lg leading-none">▾</span>
            <div className="w-full rounded-lg bg-faro-navy text-white text-center py-2.5 px-4">
              <p className="text-sm font-semibold">Pregunta de Investigación</p>
              <p className="text-[11px] text-gray-300 mt-0.5">
                Delimitada · contextualizada · verificada por la MCI
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Fórmula: D(θ) = (R, U, T, A) — este resultado es el punto de
            partida que NOVA usa después para construir el problema completo.
          </p>
        </div>
      )}
    </div>
  );
}
