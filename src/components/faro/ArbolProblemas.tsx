"use client";

export interface CausaProblema {
  texto: string;
  tipo: "primaria" | "secundaria";
}

export interface EfectoProblema {
  texto: string;
  tipo: "directo" | "indirecto";
}

interface ArbolProblemasProps {
  problemaCentral: string;
  causas: CausaProblema[];
  efectos: EfectoProblema[];
}

function TarjetaNodo({
  texto,
  variante,
}: {
  texto: string;
  variante: "causa-primaria" | "causa-secundaria" | "efecto-directo" | "efecto-indirecto";
}) {
  const estilos: Record<typeof variante, string> = {
    "causa-primaria": "bg-amber-50 border-amber-400 text-amber-900",
    "causa-secundaria": "bg-amber-50/50 border-amber-200 text-amber-800",
    "efecto-directo": "bg-rose-50 border-rose-400 text-rose-900",
    "efecto-indirecto": "bg-rose-50/50 border-rose-200 text-rose-800",
  };

  const etiquetas: Record<typeof variante, string> = {
    "causa-primaria": "Causa primaria",
    "causa-secundaria": "Causa secundaria",
    "efecto-directo": "Efecto directo",
    "efecto-indirecto": "Efecto indirecto",
  };

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${estilos[variante]}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-70 mb-0.5">
        {etiquetas[variante]}
      </span>
      {texto}
    </div>
  );
}

function Conector({ direccion, etiqueta }: { direccion: "arriba" | "abajo"; etiqueta: string }) {
  return (
    <div className="flex flex-col items-center py-1">
      <span className="text-[10px] text-gray-400 uppercase tracking-wide">{etiqueta}</span>
      <span className="text-gray-300 text-lg leading-none">
        {direccion === "arriba" ? "▲" : "▼"}
      </span>
    </div>
  );
}

export default function ArbolProblemas({
  problemaCentral,
  causas,
  efectos,
}: ArbolProblemasProps) {
  if (!causas?.length && !efectos?.length) return null;

  const efectosDirectos = efectos?.filter((e) => e.tipo === "directo") ?? [];
  const efectosIndirectos = efectos?.filter((e) => e.tipo === "indirecto") ?? [];
  const causasPrimarias = causas?.filter((c) => c.tipo === "primaria") ?? [];
  const causasSecundarias = causas?.filter((c) => c.tipo === "secundaria") ?? [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 mt-4">
      <h4 className="text-sm font-semibold text-gray-800 mb-1">
        🌳 Árbol de problemas (estructura MGA)
      </h4>
      <p className="text-xs text-gray-500 mb-4">
        Misma información que la lectura científica de arriba, reorganizada como
        soporte visual estándar de marco lógico.
      </p>

      {/* Copa — efectos, orden: indirectos (más arriba) → directos */}
      {efectos?.length > 0 && (
        <div className="space-y-2 mb-1">
          {efectosIndirectos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {efectosIndirectos.map((e, i) => (
                <TarjetaNodo key={`ei-${i}`} texto={e.texto} variante="efecto-indirecto" />
              ))}
            </div>
          )}
          {efectosDirectos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {efectosDirectos.map((e, i) => (
                <TarjetaNodo key={`ed-${i}`} texto={e.texto} variante="efecto-directo" />
              ))}
            </div>
          )}
        </div>
      )}

      {efectos?.length > 0 && <Conector direccion="abajo" etiqueta="produce" />}

      {/* Tronco — problema central */}
      <div className="rounded-lg border-2 border-slate-700 bg-slate-800 text-white px-4 py-3 text-center">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-300 mb-1">
          Problema central
        </span>
        <span className="text-sm font-medium">{problemaCentral}</span>
      </div>

      {causas?.length > 0 && <Conector direccion="arriba" etiqueta="causado por" />}

      {/* Raíces — causas, orden: primarias (más cerca del tronco) → secundarias */}
      {causas?.length > 0 && (
        <div className="space-y-2">
          {causasPrimarias.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {causasPrimarias.map((c, i) => (
                <TarjetaNodo key={`cp-${i}`} texto={c.texto} variante="causa-primaria" />
              ))}
            </div>
          )}
          {causasSecundarias.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {causasSecundarias.map((c, i) => (
                <TarjetaNodo key={`cs-${i}`} texto={c.texto} variante="causa-secundaria" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
