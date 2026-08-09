// ============================================================
// FARO — Panel explicativo "¿Qué es NOVA?"
// Colapsable, no bloquea el flujo — se monta al inicio de
// FormulacionNova.tsx, cerrado por defecto. Usa el diagrama SVG que
// Jorge diseñó (ciclo N→O→V→A alrededor de "Problema formulado").
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

"use client";

export function NovaInfoPanel() {
  return (
    <details className="bg-white rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium text-faro-navy">
        ¿Qué es NOVA?
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-gray-600">
          NOVA construye el problema de investigación a partir de la delimitación ya hecha por RUTA,
          en cuatro componentes que se retroalimentan en ciclo — cada uno con dos lecturas simultáneas,
          científica y tipo MGA (para convocatorias institucionales):
        </p>
        <svg width="100%" viewBox="0 0 690 480" role="img">
          <title>Framework NOVA — Construcción del problema</title>
          <desc>
            Los 4 componentes de NOVA en ciclo: Núcleo (Causa), Onda (Efecto), Valor (Aporte), Avance (Innovación)
          </desc>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>

          <rect x="0" y="0" width="680" height="60" fill="#1A2744" />
          <text fontFamily="sans-serif" fontSize="22" fontWeight="700" fill="#F5F0E8" x="340" y="28" textAnchor="middle">NOVA</text>
          <text fontFamily="sans-serif" fontSize="11" fill="#9FB3C8" x="340" y="48" textAnchor="middle">
            Núcleo · Onda · Valor · Avance — Construcción formal del problema de investigación
          </text>

          <circle cx="340" cy="275" r="58" fill="#1A2744" stroke="#2B4A80" strokeWidth="1.5" />
          <text fontFamily="sans-serif" fontSize="11" fontWeight="600" fill="#9FB3C8" x="340" y="268" textAnchor="middle">Problema</text>
          <text fontFamily="sans-serif" fontSize="11" fontWeight="600" fill="#9FB3C8" x="340" y="284" textAnchor="middle">formulado</text>

          <path d="M 310 142 Q 430 130 460 200" fill="none" stroke="#9B4A2E" strokeWidth="2" markerEnd="url(#arr)" />
          <path d="M 490 240 Q 510 330 455 380" fill="none" stroke="#2B6CB0" strokeWidth="2" markerEnd="url(#arr)" />
          <path d="M 360 415 Q 240 430 215 370" fill="none" stroke="#0F6E56" strokeWidth="2" markerEnd="url(#arr)" />
          <path d="M 195 240 Q 185 145 278 138" fill="none" stroke="#5B6D7A" strokeWidth="2" markerEnd="url(#arr)" />

          <rect x="242" y="80" width="196" height="72" rx="10" fill="#9B4A2E" stroke="#B5593A" strokeWidth="0.5" />
          <text fontFamily="sans-serif" fontSize="16" fontWeight="700" fill="#F5F0E8" x="340" y="106" textAnchor="middle">N · NÚCLEO</text>
          <text fontFamily="sans-serif" fontSize="11" fontWeight="500" fill="#F5C4B3" x="340" y="124" textAnchor="middle">Causa raíz del problema</text>
          <text fontFamily="sans-serif" fontSize="10" fill="#F5C4B3" x="340" y="142" textAnchor="middle">Árbol de problemas · diagnóstico</text>

          <rect x="480" y="196" width="180" height="72" rx="10" fill="#2B6CB0" stroke="#3A7EC0" strokeWidth="0.5" />
          <text fontFamily="sans-serif" fontSize="16" fontWeight="700" fill="#F5F0E8" x="570" y="222" textAnchor="middle">O · ONDA</text>
          <text fontFamily="sans-serif" fontSize="11" fontWeight="500" fill="#BDD7F5" x="570" y="240" textAnchor="middle">Efectos e impactos</text>
          <text fontFamily="sans-serif" fontSize="10" fill="#BDD7F5" x="570" y="258" textAnchor="middle">Brecha de conocimiento</text>

          <rect x="242" y="378" width="196" height="72" rx="10" fill="#5B6D7A" stroke="#6D8090" strokeWidth="0.5" />
          <text fontFamily="sans-serif" fontSize="16" fontWeight="700" fill="#F5F0E8" x="340" y="404" textAnchor="middle">V · VALOR</text>
          <text fontFamily="sans-serif" fontSize="11" fontWeight="500" fill="#C8D4DC" x="340" y="422" textAnchor="middle">Aporte científico</text>
          <text fontFamily="sans-serif" fontSize="10" fill="#C8D4DC" x="340" y="440" textAnchor="middle">Justificación · relevancia</text>

          <rect x="20" y="196" width="180" height="72" rx="10" fill="#0F6E56" stroke="#1D9E75" strokeWidth="0.5" />
          <text fontFamily="sans-serif" fontSize="16" fontWeight="700" fill="#F5F0E8" x="110" y="222" textAnchor="middle">A · AVANCE</text>
          <text fontFamily="sans-serif" fontSize="11" fontWeight="500" fill="#9FE1CB" x="110" y="240" textAnchor="middle">Innovación propuesta</text>
          <text fontFamily="sans-serif" fontSize="10" fill="#9FE1CB" x="110" y="258" textAnchor="middle">Pregunta · hipótesis</text>
        </svg>
        <p className="text-xs text-gray-500">
          Cada componente se completa con doble lectura: una científica (para el artículo/tesis) y una tipo MGA
          (para convocatorias institucionales como Minciencias) — ambas se generan juntas, no por separado.
        </p>
      </div>
    </details>
  );
}
