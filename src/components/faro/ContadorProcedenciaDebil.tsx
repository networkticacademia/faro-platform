"use client";

/**
 * ContadorProcedenciaDebil.tsx
 *
 * Complementa ContadorPreguntasPrioridad — mismo patrón (carga automática
 * al entrar, sin disparar nada costoso). Cuenta procedencia sólida vs.
 * débil por nodo, en el ORDEN del pipeline (RUTA→...→IMPACTOS) para que la
 * concentración temprana vs. tardía de procedencia débil sea visible de
 * un vistazo — es el instrumento para validar si C0/C1 están cumpliendo
 * su función.
 */

import { useEffect, useState } from "react";

interface FilaResumen {
  nodo_tipo: string;
  solida: number;
  debil: number;
}

const ORDEN_NODOS = ["RUTA", "NOVA", "OBJETIVOS", "METODOLOGIA", "MARCO_REFERENCIAL", "IMPACTOS"];
const NODO_LABEL: Record<string, string> = {
  RUTA: "RUTA",
  NOVA: "NOVA",
  OBJETIVOS: "Objetivos",
  METODOLOGIA: "Metodología",
  MARCO_REFERENCIAL: "Marco Referencial",
  IMPACTOS: "Impactos",
};

export default function ContadorProcedenciaDebil({ projectId }: { projectId: string }) {
  const [resumen, setResumen] = useState<FilaResumen[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/mci/preguntas/procedencia-resumen?project_id=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelado) setResumen(data.resumen ?? []);
      });
    return () => {
      cancelado = true;
    };
  }, [projectId]);

  if (!resumen) return null;

  const porNodo = new Map(resumen.map((r) => [r.nodo_tipo, r]));
  const totalDebil = resumen.reduce((acc, r) => acc + r.debil, 0);
  const totalSolida = resumen.reduce((acc, r) => acc + r.solida, 0);

  if (totalDebil === 0 && totalSolida === 0) return null;

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-faro-navy">Procedencia de respuestas por nodo</h3>
        <span className="text-xs text-gray-400">
          {totalSolida} sólida{totalSolida !== 1 ? "s" : ""} · {totalDebil} débil{totalDebil !== 1 ? "es" : ""}
        </span>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Preguntas resueltas con procedencia declarada, por nodo (orden del pipeline). Débil = supuesto,
        estimación o pendiente de verificación. Si se concentra en RUTA/NOVA, los checkpoints tempranos
        están cumpliendo su función; si se acumula en Metodología/Impactos, algo se dejó pasar antes.
      </p>
      <div className="space-y-2">
        {ORDEN_NODOS.map((tipo) => {
          const fila = porNodo.get(tipo);
          const solida = fila?.solida ?? 0;
          const debil = fila?.debil ?? 0;
          const total = solida + debil;
          const pctDebil = total > 0 ? (debil / total) * 100 : 0;
          return (
            <div key={tipo} className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-600 w-32 shrink-0">{NODO_LABEL[tipo]}</span>
              {total === 0 ? (
                <span className="text-[11px] text-gray-300">sin datos</span>
              ) : (
                <>
                  <div className="flex-1 h-2.5 rounded-full bg-green-100 overflow-hidden">
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${pctDebil}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500 w-20 text-right shrink-0">
                    {debil}/{total} débil
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
