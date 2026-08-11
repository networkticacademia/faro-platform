import Link from "next/link";

const FASES = [
  { num: "F1", nombre: "Reflexividad", detalle: "Tema + viabilidad · entrada al sistema", color: "#0F6E56" },
  { num: "F2", nombre: "Bibliometría", detalle: "Semilla + ecuación de búsqueda · PRISMA 2020", color: "#0F6E56" },
  { num: "F3", nombre: "RUTA — Delimitación", detalle: "Espacio · tiempo · población · unidad de análisis · alcance disciplinar · viabilidad metodológica", color: "#2B6CB0" },
  { num: "F4", nombre: "NOVA — Construcción del problema", detalle: "Árbol de problemas · pregunta de investigación · justificación · brecha de conocimiento", color: "#9B4A2E" },
  { num: "F5", nombre: "MCI — Cierre + trazabilidad + convergencia", detalle: "Índice de Convergencia Metodológica · embeddings + similitud · backpropagación conceptual adaptativa", color: "#4A5C6E" },
];

const COMPONENTES = [
  { sigla: "SM", nombre: "Situación problemática" },
  { sigla: "SC", nombre: "Sistematización científica" },
  { sigla: "SN", nombre: "Síntesis normativa" },
  { sigla: "SL", nombre: "Síntesis lógica de componentes" },
];

export default function AcercaDeFaroPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <Link href="/proyectos" className="text-xs text-faro-navy hover:underline">
        ← Volver a mis proyectos
      </Link>

      <div className="rounded-2xl bg-faro-navy text-white p-6 text-center">
        <h1 className="text-2xl font-bold">FRAMEWORK FARO</h1>
        <p className="text-sm text-gray-300 mt-1">
          Meta-framework metodológico y computacional · Formulación como problema de optimización
        </p>
        <div className="mt-4 bg-white/10 rounded-lg py-2 px-4 inline-block">
          <p className="text-xs italic font-mono">
            PF = f(SM → SC → SN → SL) ∘ RUTA ∘ NOVA × SE
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-faro-navy mb-3">
          Protocolo — 5 fases dinámicas e iterativas
        </h2>
        <div className="space-y-2">
          {FASES.map((f) => (
            <div
              key={f.num}
              className="rounded-lg p-3 text-white"
              style={{ backgroundColor: f.color }}
            >
              <p className="text-sm font-semibold">{f.num} · {f.nombre}</p>
              <p className="text-xs opacity-80 mt-0.5">{f.detalle}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Aunque tienen una secuencia lógica, las fases no son estrictamente unidireccionales —
          la salida de una puede reabrir una anterior si la pérdida de coherencia supera un umbral
          o si emerge nueva evidencia bibliográfica relevante.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-faro-navy mb-3">
          Componentes estructurales del framework
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {COMPONENTES.map((c) => (
            <div key={c.sigla} className="rounded-lg border bg-white p-3 text-center">
              <p className="text-lg font-bold text-faro-navy">{c.sigla}</p>
              <p className="text-[11px] text-gray-500 mt-1">{c.nombre}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <p className="text-sm font-semibold text-faro-navy">SE · Coherencia estructural emergente</p>
        <p className="text-xs text-gray-500 mt-1">
          Calculada por la MCI a partir de embeddings y similitud entre nodos del grafo
          metodológico. La capa de verificación semántica avanzada (nombre en diseño: SIGMA
          Guard) que contrastará esta coherencia contra literatura verificada está en fase de
          diseño arquitectónico — todavía no opera sobre proyectos reales en la plataforma.
        </p>
      </div>

      <div className="rounded-2xl bg-[#9B4A2E] text-white p-5 text-center">
        <p className="text-base font-semibold">PF · Proyecto formulado</p>
        <p className="text-xs text-[#F5C4B3] mt-1">
          Coherente · trazable · validado · listo para convocatoria
        </p>
      </div>

      <div className="rounded-lg bg-gray-50 border p-4 text-center">
        <p className="text-sm font-semibold text-faro-navy">Principio rector</p>
        <p className="text-xs italic text-gray-500 mt-2">
          El investigador lidera · la IA asiste sin sustituir la responsabilidad epistémica del
          formulador.
        </p>
      </div>
    </div>
  );
}
