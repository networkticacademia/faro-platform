"use client";

import { useState } from "react";
import {
  obtenerFase,
  FAMILIA_LABEL,
  type HerramientaReferencia,
} from "@/lib/faro/herramientasReferencia";

function dominioDesdeUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function LogoHerramienta({ url, nombre }: { url: string; nombre: string }) {
  const dominio = dominioDesdeUrl(url);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${dominio}&sz=64`}
      alt={`Logo de ${nombre}`}
      width={20}
      height={20}
      className="rounded-sm flex-shrink-0"
      loading="lazy"
    />
  );
}

function TarjetaHerramienta({
  herramienta,
  destacada,
}: {
  herramienta: HerramientaReferencia;
  destacada: boolean;
}) {
  return (
    <a
      href={herramienta.url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        destacada
          ? "flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 hover:border-blue-400 transition-colors"
          : "flex items-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 hover:border-gray-400 transition-colors"
      }
    >
      <LogoHerramienta url={herramienta.url} nombre={herramienta.nombre} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-gray-900">
            {herramienta.nombre}
          </span>
          {destacada && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-100 rounded px-1.5 py-0.5">
              En uso en FARO
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 leading-snug mt-0.5">
          {herramienta.uso}
        </p>
        <span className="text-[10px] text-gray-400">
          {FAMILIA_LABEL[herramienta.familia]}
          {herramienta.capRef ? ` · ${herramienta.capRef}` : ""}
        </span>
      </div>
    </a>
  );
}

export default function PanelHerramientasReferencia({
  faseId,
}: {
  faseId: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const fase = obtenerFase(faseId);

  if (!fase) return null;

  const destacadas = fase.herramientas.filter((h) => h.enUso);
  const referencia = fase.herramientas.filter((h) => !h.enUso);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{fase.icono}</span>
        <h4 className="text-sm font-semibold text-gray-800">
          Herramientas de IA — {fase.nombre}
        </h4>
      </div>

      {destacadas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {destacadas.map((h) => (
            <TarjetaHerramienta key={h.nombre} herramienta={h} destacada />
          ))}
        </div>
      )}

      {referencia.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <span>{abierto ? "▾" : "▸"}</span>
            {abierto
              ? "Ocultar otras herramientas de referencia"
              : `Ver otras ${referencia.length} herramientas de referencia (opcional, no usadas por FARO)`}
          </button>

          {abierto && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {referencia.map((h) => (
                <TarjetaHerramienta
                  key={h.nombre}
                  herramienta={h}
                  destacada={false}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
