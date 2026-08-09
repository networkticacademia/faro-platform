// ============================================================
// FARO — Grafo de relación entre fuentes del corpus, v1
// Componente D del roadmap de RSL. Decisión de librería tomada aquí
// (2026-08-09): react-force-graph-2d — liviana, se integra bien como
// componente React, adecuada para el volumen de nodos esperado
// (decenas, no miles). Esta misma librería debe reutilizarse después
// para la Vista de Grafo general de nodos (F4, δᵢⱼ), evitando
// decidir la librería dos veces.
//
// v1: las aristas son de SIMILITUD LÉXICA (palabras compartidas entre
// título+hallazgo), no de citación real — no requiere llamadas
// adicionales a APIs. Citación real (vía referenced_works de OpenAlex)
// queda como mejora futura si el costo adicional se justifica una vez
// esta versión esté en uso.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { FuenteCorpus } from "./FuentesTable";

// react-force-graph-2d usa canvas — no es compatible con SSR.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const STOPWORDS = new Set([
  "para", "como", "esto", "esta", "estos", "estas", "sobre", "entre",
  "desde", "hasta", "the", "and", "for", "with", "using", "based",
  "from", "that", "this", "into", "under", "estimation", "content",
]);

function extraerPalabrasClave(texto: string): Set<string> {
  return new Set(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((p) => p.length > 4 && !STOPWORDS.has(p))
  );
}

function similitud(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let comunes = 0;
  a.forEach((palabra) => {
    if (b.has(palabra)) comunes++;
  });
  return comunes / Math.min(a.size, b.size); // solapamiento normalizado por el conjunto más pequeño
}

const UMBRAL_ARISTA = 0.25; // mínimo de solapamiento para dibujar una conexión

export function FuentesGrafo({ fuentes }: { fuentes: FuenteCorpus[] }) {
  const datosGrafo = useMemo(() => {
    const nodos = fuentes.map((f) => ({
      id: f.id,
      name: f.titulo,
      anio: f.anio,
      val: f.estado_verificacion === "verificado" ? 4 : 2, // nodos verificados un poco más grandes
      color: f.estado_verificacion === "verificado" ? "#1B4965" : "#C9A66B",
    }));

    const palabrasClavePorFuente = fuentes.map((f) =>
      extraerPalabrasClave(`${f.titulo} ${f.resumen_hallazgo ?? ""}`)
    );

    const enlaces: { source: string; target: string; value: number }[] = [];
    for (let i = 0; i < fuentes.length; i++) {
      for (let j = i + 1; j < fuentes.length; j++) {
        const sim = similitud(palabrasClavePorFuente[i], palabrasClavePorFuente[j]);
        if (sim >= UMBRAL_ARISTA) {
          enlaces.push({ source: fuentes[i].id, target: fuentes[j].id, value: sim });
        }
      }
    }

    return { nodes: nodos, links: enlaces };
  }, [fuentes]);

  if (fuentes.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center text-gray-400">
        Aún no hay fuentes en el corpus de este proyecto.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Las conexiones representan similitud léxica entre título y hallazgo, no citación real.
        Nodos azul oscuro = verificados, dorado = sin verificar.
      </p>
      <div className="h-[500px] w-full rounded border bg-white">
        <ForceGraph2D
          graphData={datosGrafo}
          nodeLabel={(node: any) => `${node.name}${node.anio ? ` (${node.anio})` : ""}`}
          nodeColor={(node: any) => node.color}
          nodeVal={(node: any) => node.val}
          linkWidth={(link: any) => link.value * 3}
          linkColor={() => "rgba(150,150,150,0.4)"}
          backgroundColor="#ffffff"
        />
      </div>
    </div>
  );
}
