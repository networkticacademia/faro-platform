/**
 * AcercaFaroDefinicion.tsx
 *
 * Bloque de definición operativa de FARO para la página estática
 * "Acerca de FARO" — se ubica DESPUÉS del diagrama de arquitectura
 * existente, sin tocar ni reemplazar el nombre canónico del acrónimo
 * que ya está en esa página.
 *
 * Contenido tomado literalmente de FARO_definicion_formal_integrada.md,
 * sección 3 ("Para la plataforma"). Cualquier cambio de redacción debe
 * hacerse en ese documento fuente, no directamente aquí, para no
 * desincronizar plataforma / libro / artículo.
 *
 * IMPORTANTE PARA ANTIGRAVITY: componente estático, sin fetch ni
 * estado — es contenido puro. Ajustar únicamente clases Tailwind al
 * sistema de diseño real de la página (aquí se usan clases genéricas
 * de ejemplo).
 */

export default function AcercaFaroDefinicion() {
  return (
    <section className="mx-auto max-w-3xl space-y-6 py-10">
      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-800">¿Qué es FARO?</h2>
        <p className="text-sm leading-relaxed text-gray-700">
          FARO es un framework para la formulación asistida de proyectos de
          investigación con inteligencia artificial y contexto. Comienza
          diagnosticando el estado de conocimiento e incertidumbre del
          investigador, y usa esa información —junto con el problema, la
          evidencia científica y el estado real del proyecto— para adaptar
          progresivamente su acompañamiento. FARO propone, contrasta,
          orienta y alerta; usted decide.
        </p>
      </div>

      <blockquote className="border-l-4 border-blue-600 bg-blue-50 p-6 text-center">
        <p className="text-base font-medium italic text-gray-800">
          &ldquo;FARO no adapta al investigador a la herramienta; adapta la
          herramienta al investigador y al estado del proyecto.&rdquo;
        </p>
      </blockquote>

      <div className="flex justify-center gap-3">
        {["Contextualizada", "Adaptativa", "El investigador decide"].map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600"
          >
            {chip}
          </span>
        ))}
      </div>
    </section>
  );
}
