"use client";

export function PreguntasPendientes({
  preguntas,
  respuestas,
  onCambiarRespuesta,
}: {
  preguntas: string[];
  respuestas: Record<number, string>;
  onCambiarRespuesta: (index: number, valor: string) => void;
}) {
  if (preguntas.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-amber-800">
        El agente necesita que usted aclare esto — responda las que apliquen (no es
        obligatorio responder todas antes de regenerar):
      </p>
      {preguntas.map((p, i) => (
        <div key={i} className="border-l-2 border-amber-300 pl-3">
          <p className="text-sm text-amber-800">
            <span className="font-medium">{i + 1}.</span> {p}
          </p>
          <textarea
            className="mt-1 w-full border rounded-md p-2 text-sm text-gray-900 bg-white"
            rows={2}
            placeholder="Su respuesta (déjelo vacío si no aplica)..."
            value={respuestas[i] ?? ""}
            onChange={(e) => onCambiarRespuesta(i, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

// Ensambla las preguntas respondidas en el texto de feedback que ya
// reciben todos los prompts — no cambia el backend, solo automatiza lo
// que antes había que copiar y pegar a mano.
export function ensamblarFeedbackDesdeRespuestas(
  preguntas: string[],
  respuestas: Record<number, string>
): string {
  return preguntas
    .map((p, i) => (respuestas[i]?.trim() ? `Pregunta: "${p}"\nRespuesta del formulador: "${respuestas[i].trim()}"` : null))
    .filter((x): x is string => x !== null)
    .join("\n\n");
}
