/**
 * AcercaFaroDefinicion.tsx
 *
 * Bloque de definición operativa de FARO para la página estática "Acerca de FARO".
 */

export default function AcercaFaroDefinicion() {
  return (
    <section className="space-y-6 pt-4">
      <div className="rounded-2xl border bg-white p-6 shadow-sm border-gray-100">
        <h2 className="mb-3 text-sm font-bold text-faro-navy uppercase tracking-wider">¿Qué es FARO?</h2>
        <p className="text-xs sm:text-sm leading-relaxed text-gray-700">
          FARO es un framework para la formulación asistida de proyectos de
          investigación con inteligencia artificial y contexto. Comienza
          diagnosticando el estado de conocimiento e incertidumbre del
          investigador, y usa esa información —junto con el problema, la
          evidencia científica y el estado real del proyecto— para adaptar
          progresivamente su acompañamiento. FARO propone, contrasta,
          orienta y alerta; usted decide.
        </p>
      </div>

      <blockquote className="rounded-xl border-l-4 border-faro-navy bg-faro-navy/5 p-5 text-center">
        <p className="text-xs sm:text-sm font-medium italic text-faro-navy">
          &ldquo;FARO no adapta al investigador a la herramienta; adapta la
          herramienta al investigador y al estado del proyecto.&rdquo;
        </p>
      </blockquote>

      <div className="flex flex-wrap justify-center gap-2">
        {["Contextualizada", "Adaptativa", "El investigador decide"].map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-faro-navy/20 bg-white px-3 py-1 text-xs font-medium text-faro-navy shadow-sm"
          >
            {chip}
          </span>
        ))}
      </div>
    </section>
  );
}
