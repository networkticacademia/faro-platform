/**
 * lib/faro/arbolPreguntas.ts
 *
 * Módulo puro de descomposición de preguntas compuestas en árboles
 * de dos niveles (primaria y dependientes).
 *
 * Usa llamarModeloLigero() (DeepSeek) únicamente para el juicio de descomposición;
 * toda la persistencia y validación de tipos y asignaciones es determinística.
 */

import { llamarModeloLigero } from "@/lib/openrouter/client";

export interface DependientePregunta {
  texto: string;
  prioridad: "P0" | "P1" | "P2" | "P3";
  condicion_activacion: string; // ej: "si la respuesta indica sensor montado en dron"
}

export interface NodoPregunta {
  es_compuesta: boolean;
  primarias_independientes?: { texto: string; prioridad: "P0" | "P1" | "P2" | "P3" }[];
  primaria: {
    texto: string;
    prioridad: "P0" | "P1" | "P2" | "P3";
  };
  dependientes: DependientePregunta[];
}

function extraerJSON(texto: string): string {
  const limpio = texto.replace(/```json|```/g, "").trim();
  const inicioObj = limpio.indexOf("{");
  if (inicioObj === -1) return limpio;

  let profundidad = 0;
  for (let i = inicioObj; i < limpio.length; i++) {
    if (limpio[i] === "{") profundidad++;
    if (limpio[i] === "}") {
      profundidad--;
      if (profundidad === 0) return limpio.slice(inicioObj, i + 1);
    }
  }
  return limpio.slice(inicioObj);
}

/**
 * Descompone una pregunta compuesta en árbol primaria/dependientes o separa primarias independientes.
 * Si la pregunta es atómica, devuelve un nodo sin dependientes.
 */
export async function descomponerPregunta(
  textoPregunta: string,
  prioridadOriginal: "P0" | "P1" | "P2" | "P3" = "P2"
): Promise<NodoPregunta> {
  const prompt = `Analiza esta pregunta de formulación de proyecto:

"${textoPregunta}"

Determina si la pregunta es ATÓMICA (pide un único dato/hecho) o COMPUESTA (pide múltiples datos).

CRITERIOS DE CLASIFICACIÓN:
1. Si pide un solo dato/hecho:
   es_compuesta: false, dependientes: []

2. Si pide datos INDEPENDIENTES (ninguna parte condiciona la validez de las demás):
   es_compuesta: false, primarias_independientes: [ {"texto": "...", "prioridad": "P1|P2"}, {"texto": "...", "prioridad": "P1|P2"} ]

3. Si hay DEPENDENCIA CONDICIONAL (el espacio de respuestas válidas de una cambia según cómo se responda la otra):
   es_compuesta: true
   primaria: la pregunta fundamental cuya respuesta define el camino.
   dependientes: las preguntas de seguimiento, con su "condicion_activacion".

REGLAS:
- La prioridad de la primaria es la más alta del conjunto (P0 si una respuesta negativa invalidaría el proyecto, P1 si altera objetivos/alcance, P2 si es operativa/metodológica).
- Prioridad original sugerida: ${prioridadOriginal}.

Responde EXCLUSIVAMENTE un JSON válido con esta estructura:
{
  "es_compuesta": true|false,
  "primarias_independientes": [ ... ], // opcional, solo si son independientes
  "primaria": {"texto": "...", "prioridad": "P0|P1|P2|P3"},
  "dependientes": [
    {"texto": "...", "prioridad": "P0|P1|P2|P3", "condicion_activacion": "..."}
  ]
}`;

  try {
    const raw = await llamarModeloLigero(prompt);
    const parsed = JSON.parse(extraerJSON(raw)) as NodoPregunta;

    // Validación determinística de estructura
    if (parsed && typeof parsed === "object") {
      const primariaValida = parsed.primaria && typeof parsed.primaria.texto === "string" && parsed.primaria.texto.trim().length > 0;
      const dependientesValidas = Array.isArray(parsed.dependientes) ? parsed.dependientes : [];

      return {
        es_compuesta: Boolean(parsed.es_compuesta && dependientesValidas.length > 0),
        primarias_independientes: Array.isArray(parsed.primarias_independientes) ? parsed.primarias_independientes : undefined,
        primaria: primariaValida ? parsed.primaria : { texto: textoPregunta, prioridad: prioridadOriginal },
        dependientes: dependientesValidas,
      };
    }
  } catch (e) {
    console.error("[descomponerPregunta] error:", e);
  }

  // Fallback determinístico seguro
  return {
    es_compuesta: false,
    primaria: { texto: textoPregunta, prioridad: prioridadOriginal },
    dependientes: [],
  };
}

/**
 * Evalúa si una condición de activación de una pregunta dependiente se cumple
 * ante la respuesta provista por el formulador a la pregunta primaria.
 * Sesgo hacia la seguridad: ante error o duda, devuelve activar: true.
 */
export async function evaluarCondicionActivacion(
  preguntaPrimaria: string,
  respuestaDada: string,
  preguntaDependiente: string,
  condicionActivacion: string
): Promise<{ activar: boolean; razon: string }> {
  const prompt = `Pregunta primaria:
"${preguntaPrimaria}"

Respuesta del formulador:
"${respuestaDada}"

Pregunta dependiente:
"${preguntaDependiente}"

Condición de activación requerida:
"${condicionActivacion}"

Determina si la respuesta del formulador CUMPLE la condición de activación para que la pregunta dependiente deba responderse, o si por el contrario la respuesta volvió la pregunta dependiente completamente INAPLICABLE (cerrada por rama).

REGLA DE SEGURIDAD: Si hay duda o la respuesta no es concluyente, activa la pregunta (activar: true).

Responde EXCLUSIVAMENTE un JSON:
{"activar": true|false, "razon": "Explicación breve"}`;

  try {
    const raw = await llamarModeloLigero(prompt);
    const parsed = JSON.parse(extraerJSON(raw)) as { activar?: boolean; razon?: string };
    if (typeof parsed?.activar === "boolean") {
      return {
        activar: parsed.activar,
        razon: parsed.razon || (parsed.activar ? "Condición cumplida" : "Inaplicable según respuesta a la primaria"),
      };
    }
  } catch (e) {
    console.error("[evaluarCondicionActivacion] error:", e);
  }

  // Sesgo hacia preguntar ante falla
  return {
    activar: true,
    razon: "Activada por regla de seguridad ante respuesta no excluyente",
  };
}
