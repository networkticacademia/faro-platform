export default function Home() {
  return (
    <main className="min-h-screen bg-faro-navy text-faro-cream flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl text-center space-y-6">
        <p className="text-sm tracking-[0.3em] text-faro-blue uppercase">
          Framework for Research
        </p>
        <h1 className="text-5xl font-semibold">FARO</h1>
        <p className="text-faro-cream/80 leading-relaxed">
          Formulación Aumentada y Revisión Optimizada mediante Inteligencia
          Artificial. Un meta-framework computacional que modela la
          formulación de proyectos de investigación como un proceso de
          optimización sobre un grafo metodológico.
        </p>
        <p className="text-xs text-faro-cream/50 pt-8">
          Fase 0 — cimientos de la plataforma en construcción.
        </p>
        <a
          href="/diagnostico"
          className="inline-block bg-faro-blue text-white px-8 py-3 rounded-md font-medium hover:opacity-90 transition-opacity"
        >
          Iniciar diagnóstico M0 →
        </a>
      </div>
    </main>
  );
}
