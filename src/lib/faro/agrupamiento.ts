/**
 * lib/faro/agrupamiento.ts
 *
 * Agrupamiento semántico de preguntas abiertas (P0) — AUTO-PERSISTE el
 * resultado. Incluye la función extraeArrayJSON para aislar el array JSON
 * balanceado de corchetes ignorando cualquier texto explicativo adicional.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { llamarModeloLigero } from "@/lib/openrouter/client";

interface ClusterPropuesto {
  ids: string[];
  pregunta_consolidada: string;
}

interface RespuestaClusters {
  clusters?: ClusterPropuesto[];
}

/** Extrae el objeto o array JSON balanceado, ignorando cualquier texto antes o después. */
function extraerJSON(texto: string): string {
  const limpio = texto.replace(/```json|```/g, "").trim();
  const inicioObj = limpio.indexOf("{");
  const inicioArr = limpio.indexOf("[");

  let inicio = -1;
  let tipo: "obj" | "arr" = "obj";
  if (inicioObj !== -1 && (inicioArr === -1 || inicioObj < inicioArr)) {
    inicio = inicioObj;
    tipo = "obj";
  } else if (inicioArr !== -1) {
    inicio = inicioArr;
    tipo = "arr";
  }

  if (inicio === -1) return limpio;

  const apertura = tipo === "obj" ? "{" : "[";
  const cierre = tipo === "obj" ? "}" : "]";

  let profundidad = 0;
  for (let i = inicio; i < limpio.length; i++) {
    if (limpio[i] === apertura) profundidad++;
    if (limpio[i] === cierre) {
      profundidad--;
      if (profundidad === 0) return limpio.slice(inicio, i + 1);
    }
  }
  return limpio.slice(inicio);
}

export async function reagruparPreguntasAbiertas(
  supabase: SupabaseClient,
  project_id: string
): Promise<{ gruposCreados: number }> {
  // Consultar TODAS las preguntas abiertas del proyecto (cross-nodo)
  const { data: preguntas, error } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, texto_pregunta, prioridad, created_at")
    .eq("project_id", project_id)
    .eq("estado", "abierta");

  if (error || !preguntas || preguntas.length < 2) {
    return { gruposCreados: 0 };
  }

  // Mapear por índice numérico (1..N) para evitar que el LLM abrevie UUIDs a 8 caracteres
  const indexToPregunta = new Map<number, typeof preguntas[0]>();
  const idToPregunta = new Map<string, typeof preguntas[0]>();
  preguntas.forEach((p, idx) => {
    indexToPregunta.set(idx + 1, p);
    idToPregunta.set(p.id, p);
  });

  const prompt = construirPromptAgrupamiento(preguntas);
  let rawClusters: any[] = [];
  let respuestaCruda = "";
  try {
    respuestaCruda = await llamarModeloLigero(prompt);
    const parsed = JSON.parse(extraerJSON(respuestaCruda));
    if (Array.isArray(parsed)) {
      rawClusters = parsed;
    } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).clusters)) {
      rawClusters = (parsed as any).clusters ?? [];
    }
  } catch (e) {
    console.error("[reagruparPreguntasAbiertas] error al interpretar respuesta:", e);
    console.error("[reagruparPreguntasAbiertas] respuesta cruda del LLM:", respuestaCruda);
    return { gruposCreados: 0 };
  }

  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  let gruposCreados = 0;
  const idsProcesados = new Set<string>();

  for (const cluster of rawClusters) {
    if (!cluster) continue;
    const items = cluster.indices ?? cluster.ids ?? [];
    if (!Array.isArray(items) || items.length < 2) continue;

    // Convertir índices o IDs a UUIDs reales de preguntas
    const preguntasCluster: typeof preguntas[0][] = [];
    for (const item of items) {
      let pEncontrada: typeof preguntas[0] | undefined;
      if (typeof item === "number" && indexToPregunta.has(item)) {
        pEncontrada = indexToPregunta.get(item);
      } else if (typeof item === "string") {
        const num = parseInt(item, 10);
        if (!isNaN(num) && indexToPregunta.has(num)) {
          pEncontrada = indexToPregunta.get(num);
        } else if (idToPregunta.has(item)) {
          pEncontrada = idToPregunta.get(item);
        } else {
          // Si el modelo devolvió un prefijo de UUID (ej: primeros 8 caracteres)
          pEncontrada = preguntas.find((p) => p.id.startsWith(item));
        }
      }
      if (pEncontrada && !idsProcesados.has(pEncontrada.id) && !preguntasCluster.some((x) => x.id === pEncontrada!.id)) {
        preguntasCluster.push(pEncontrada);
      }
    }

    if (preguntasCluster.length < 2) {
      continue;
    }

    // La pregunta de mayor prioridad del cluster queda como representante (y la más antigua en caso de empate)
    preguntasCluster.sort((a, b) => {
      const pA = priorityOrder[a.prioridad] ?? 2;
      const pB = priorityOrder[b.prioridad] ?? 2;
      if (pA !== pB) return pA - pB;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const representante = preguntasCluster[0];
    const secundarias = preguntasCluster.slice(1);
    const textoConsolidado = cluster.pregunta_consolidada?.trim() || representante.texto_pregunta;

    // 1. Actualizar representante con el texto consolidado y prioridad máxima
    await supabase
      .from("preguntas_pendientes")
      .update({
        texto_pregunta: textoConsolidado,
        prioridad: representante.prioridad,
        pregunta_raiz_id: null,
      })
      .eq("id", representante.id);

    // 2. Las secundarias pasan a estado='diferida' con pregunta_raiz_id=<representante.id>
    const idsSecundarias = secundarias.map((s) => s.id);
    const { error: errUpdateSec } = await supabase
      .from("preguntas_pendientes")
      .update({
        estado: "diferida",
        pregunta_raiz_id: representante.id,
      })
      .in("id", idsSecundarias);

    if (errUpdateSec) {
      console.error("[reagruparPreguntasAbiertas] Error actualizando secundarias:", errUpdateSec);
    }

    // Marcar como procesados
    preguntasCluster.forEach((p) => idsProcesados.add(p.id));
    gruposCreados++;
  }

  return { gruposCreados };
}

function construirPromptAgrupamiento(
  preguntas: { id: string; nodo_tipo: string; texto_pregunta: string }[]
): string {
  const lista = preguntas
    .map((p, idx) => `[${idx + 1}] (${p.nodo_tipo}) "${p.texto_pregunta}"`)
    .join("\n");

  return `Tienes esta lista de preguntas abiertas de formulación generadas para un proyecto de investigación:

${lista}

Tu tarea es identificar y agrupar TODOS los grupos de preguntas que solicitan la misma información de fondo o dato operativo (por ejemplo:
- Disponibilidad o licencias de software fotogramétrico (Pix4D, Agisoft, DJI Terra).
- Laboratorio acreditado / tiempo de respuesta / método Kjeldahl para análisis foliar.
- Definición de tratamientos o dosis de fertilización nitrogenada en el diseño experimental.
- Disponibilidad, calibración o características del sensor / dron multiespectral.
- Métricas o diseño del antecedente 2024 / estado de la RSL complementaria.
- Preguntas sobre la cadena causal de los 5 porqués.
- Acceso a predios, parcelas o acuerdos con productores).

REGLAS:
1. Agrupa cualquier par o grupo de preguntas que coincidan en el objeto principal de consulta.
2. Cada clúster debe tener al menos 2 números de índice de la lista.
3. Para cada clúster redacta una "pregunta_consolidada" unificada, clara y directa.
4. Responde con los números de índice enteros [1, 2, ...].

Responde EXCLUSIVAMENTE un objeto JSON válido con esta estructura:
{"clusters": [{"indices": [1, 2], "pregunta_consolidada": "Pregunta unificada..."}]}`;
}
