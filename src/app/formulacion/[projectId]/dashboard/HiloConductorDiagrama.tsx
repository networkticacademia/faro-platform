"use client";

/**
 * HiloConductorDiagrama.tsx
 *
 * Diagrama de flujo FIJO (posiciones hardcodeadas, no react-force-graph-2d
 * — esa librería es para Fuentes, donde la estructura sí varía; acá
 * siempre son los mismos 6 nodos en las mismas 5 relaciones).
 *
 * Las 5 flechas coinciden EXACTO con MATRIZ_DEPENDENCIA en
 * verificadorSemantico.ts: RUTA→NOVA, NOVA→OBJETIVOS, OBJETIVOS→METODOLOGIA,
 * OBJETIVOS→MARCO_REFERENCIAL, METODOLOGIA→IMPACTOS_DELIMITACION.
 *
 * Fuente de datos: el MISMO resultado que ya devuelve "Verificar
 * convergencia" (detalle_l_faro_por_nodo + deltas_ij) — no llama a ningún
 * endpoint nuevo, no dispara ninguna llamada LLM.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DetalleLFaroNodo } from "@/lib/faro/convergenciaProyecto";
import type { ResultadoCoherenciaPar } from "@/lib/faro/verificadorSemantico";

const RADIO = 32;

const POSICIONES: Record<string, { x: number; y: number }> = {
  RUTA: { x: 70, y: 70 },
  NOVA: { x: 240, y: 70 },
  OBJETIVOS: { x: 410, y: 70 },
  METODOLOGIA: { x: 580, y: 70 },
  IMPACTOS_DELIMITACION: { x: 710, y: 190 },
  MARCO_REFERENCIAL: { x: 410, y: 210 },
};

const NODO_LABEL: Record<string, string> = {
  RUTA: "RUTA",
  NOVA: "NOVA",
  OBJETIVOS: "Objetivos",
  METODOLOGIA: "Metodología",
  IMPACTOS_DELIMITACION: "Impactos",
  MARCO_REFERENCIAL: "Marco Referencial",
};

// Coincide exacto con MATRIZ_DEPENDENCIA (verificadorSemantico.ts).
const FLECHAS: { origen: string; destino: string }[] = [
  { origen: "RUTA", destino: "NOVA" },
  { origen: "NOVA", destino: "OBJETIVOS" },
  { origen: "OBJETIVOS", destino: "METODOLOGIA" },
  { origen: "OBJETIVOS", destino: "MARCO_REFERENCIAL" },
  { origen: "METODOLOGIA", destino: "IMPACTOS_DELIMITACION" },
];

function colorNodo(lFaro: number | undefined, tauC: number): string {
  if (lFaro === undefined) return "#D1D5DB"; // gris — sin confirmar
  if (lFaro <= tauC) return "#16A34A"; // verde
  if (lFaro <= tauC * 2) return "#D97706"; // ámbar
  return "#DC2626"; // rojo
}

// Mismos umbrales que ya usaba la tabla de texto (0.2 / 0.5), para que el
// lenguaje de color no cambie entre lo que había y el diagrama nuevo.
function colorFlecha(deltaIj: number | undefined): string {
  if (deltaIj === undefined) return "#D1D5DB";
  if (deltaIj <= 0.2) return "#16A34A";
  if (deltaIj <= 0.5) return "#D97706";
  return "#DC2626";
}

/** Punto sobre el borde del círculo de radio RADIO, en dirección de (x1,y1)→(x2,y2). */
function puntoEnBorde(cx: number, cy: number, haciaX: number, haciaY: number): [number, number] {
  const dx = haciaX - cx;
  const dy = haciaY - cy;
  const dist = Math.hypot(dx, dy) || 1;
  return [cx + (dx / dist) * RADIO, cy + (dy / dist) * RADIO];
}

export default function HiloConductorDiagrama({
  projectId,
  detalleLFaroPorNodo,
  deltasIj,
  tauCProyecto,
}: {
  projectId: string;
  detalleLFaroPorNodo: DetalleLFaroNodo[];
  deltasIj: ResultadoCoherenciaPar[] | null;
  tauCProyecto: number;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<ResultadoCoherenciaPar | null>(null);
  const [clicado, setClicado] = useState<ResultadoCoherenciaPar | null>(null);

  const lFaroPorNodo = new Map(detalleLFaroPorNodo.map((d) => [d.nodo, d.l_faro]));
  const deltaPorPar = new Map(
    (deltasIj ?? []).map((d) => [`${d.nodoOrigen}->${d.nodoDestino}`, d])
  );

  const parMostrado = hover ?? clicado;

  return (
    <div>
      <p className="text-xs font-semibold text-faro-navy mb-2">
        Hilo conductor — coherencia entre nodos
      </p>

      <svg viewBox="0 0 780 260" className="w-full h-auto" style={{ maxHeight: 280 }}>
        <defs>
          <marker id="flecha-punta" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#9CA3AF" />
          </marker>
        </defs>

        {FLECHAS.map((f, i) => {
          const origen = POSICIONES[f.origen];
          const destino = POSICIONES[f.destino];
          const par = deltaPorPar.get(`${f.origen}->${f.destino}`);
          const [x1, y1] = puntoEnBorde(origen.x, origen.y, destino.x, destino.y);
          const [x2, y2] = puntoEnBorde(destino.x, destino.y, origen.x, origen.y);
          const color = colorFlecha(par?.delta_ij);
          const activa = parMostrado?.nodoOrigen === f.origen && parMostrado?.nodoDestino === f.destino;

          return (
            <g
              key={i}
              onMouseEnter={() => par && setHover(par)}
              onMouseLeave={() => setHover(null)}
              onClick={() => par && setClicado((prev) => (prev === par ? null : par))}
              style={{ cursor: par ? "pointer" : "default" }}
            >
              {/* área de interacción invisible, más ancha que la línea visible */}
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} />
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={activa ? 4 : 2.5}
                markerEnd="url(#flecha-punta)"
              />
            </g>
          );
        })}

        {Object.entries(POSICIONES).map(([tipo, pos]) => {
          const lFaro = lFaroPorNodo.get(tipo);
          return (
            <g
              key={tipo}
              onClick={() => router.push(`/formulacion/${projectId}/preguntas`)}
              style={{ cursor: "pointer" }}
            >
              <circle cx={pos.x} cy={pos.y} r={RADIO} fill={colorNodo(lFaro, tauCProyecto)} stroke="white" strokeWidth={2} />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="white">
                {lFaro !== undefined ? lFaro.toFixed(2) : "—"}
              </text>
              <text x={pos.x} y={pos.y + RADIO + 16} textAnchor="middle" fontSize={11} fill="#1F2937" fontWeight={600}>
                {NODO_LABEL[tipo]}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex items-center gap-4 text-[10px] text-gray-500 mt-1 mb-2">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#16A34A" }} /> bajo / coherente
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#D97706" }} /> medio
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#DC2626" }} /> alto / incoherente
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#D1D5DB" }} /> sin evaluar
        </span>
      </div>

      <div className="rounded-lg bg-gray-50 border p-3 text-xs text-gray-700 min-h-[3.5rem]">
        {parMostrado ? (
          <>
            <span className="font-mono font-semibold">
              {parMostrado.nodoOrigen} → {parMostrado.nodoDestino}
            </span>
            <span className="text-gray-400">
              {" "}— δᵢⱼ = <span className="font-mono">{parMostrado.delta_ij.toFixed(3)}</span>
            </span>
            <p className="mt-1">{parMostrado.resumen}</p>
          </>
        ) : (
          <span className="text-gray-400">
            Pase el cursor o haga clic sobre una flecha para ver el análisis de coherencia de ese par.
            Clic en un nodo → preguntas pendientes.
          </span>
        )}
      </div>
    </div>
  );
}
