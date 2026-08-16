/**
 * Cliente OpenRouter — SOLO se usa en el servidor (API routes / route handlers).
 * OPENROUTER_API_KEY nunca debe exponerse al navegador (no usar NEXT_PUBLIC_).
 */

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function llamarModelo(prompt: string, modelo: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY no está configurada en el entorno del servidor.");
  }

  const messages: OpenRouterMessage[] = [{ role: "user", content: prompt }];

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://faro-platform.vercel.app",
      "X-Title": "FARO Platform",
    },
    body: JSON.stringify({
      model: modelo,
      messages,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const contenido = data?.choices?.[0]?.message?.content;
  if (!contenido) {
    throw new Error("OpenRouter no devolvió contenido en la respuesta.");
  }
  return contenido;
}

/**
 * Modelo "orquestador" de calidad completa — usado por la generación de
 * nodos (generar*Core()) y RSL. NO cambiar su modelo por defecto ni su
 * firma sin evaluar el impacto en esos flujos.
 */
export async function llamarOrquestador(prompt: string): Promise<string> {
  const modelo = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6";
  return llamarModelo(prompt, modelo);
}

/**
 * Modelo económico para tareas ligeras (clasificación/agrupamiento de
 * texto corto, explicaciones cortas) que no requieren el razonamiento
 * profundo del Orquestador. Verificado 2026-08-15 contra el prompt real
 * de reagruparPreguntasAbiertas() sobre datos reales del proyecto piña:
 * JSON válido, 0 IDs alucinados, agrupamiento correcto. Ver
 * openrouter.ai/deepseek/deepseek-v4-flash para precio/specs vigentes.
 */
export async function llamarModeloLigero(prompt: string): Promise<string> {
  const modelo = process.env.OPENROUTER_MODEL_LIGERO ?? "deepseek/deepseek-v4-flash";
  return llamarModelo(prompt, modelo);
}

/**
 * Extrae y parsea JSON de la respuesta del modelo, tolerando que venga
 * envuelto en ```json ... ``` (algunos modelos lo hacen pese a la instrucción).
 */
export function parsearJsonRespuesta<T>(texto: string): T {
  const limpio = texto.replace(/```json\s*|```\s*/g, "").trim();
  try {
    return JSON.parse(limpio) as T;
  } catch (e) {
    throw new Error(`No se pudo parsear la respuesta del modelo como JSON: ${(e as Error).message}\n\nRespuesta cruda: ${texto.slice(0, 500)}`);
  }
}
