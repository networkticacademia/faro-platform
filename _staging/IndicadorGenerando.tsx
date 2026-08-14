"use client";

export function IndicadorGenerando({ mensaje }: { mensaje?: string }) {
  return (
    <div className="rounded-lg border border-faro-navy/20 bg-faro-navy/5 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full border-2 border-faro-navy border-t-transparent animate-spin" />
        <span className="text-sm font-medium text-faro-navy">
          {mensaje ?? "Generando propuesta con el agente de IA..."}
        </span>
      </div>
      <div className="h-1.5 w-full bg-faro-navy/10 rounded-full overflow-hidden">
        <div className="h-full w-1/3 bg-faro-navy rounded-full animate-[barraIndeterminada_1.4s_ease-in-out_infinite]" />
      </div>
      <p className="text-xs text-gray-500">
        Esto puede tardar hasta un minuto — el agente está leyendo el contexto del proyecto y
        redactando la propuesta completa. No cierre ni recargue la página.
      </p>
      <style>{`
        @keyframes barraIndeterminada {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(150%); }
        }
      `}</style>
    </div>
  );
}
