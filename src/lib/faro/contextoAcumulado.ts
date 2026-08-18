/**
 * lib/faro/contextoAcumulado.ts
 *
 * Memoria entre iteraciones de un mismo nodo.
 *
 * PROBLEMA QUE RESUELVE (confirmado en producción, proyecto piña,
 * 18-ago-2026): los 6 generarXCore() construyen su prompt con los nodos
 * CONFIRMADOS de aguas arriba + el feedback de la respuesta actual, y nada
 * más. La consulta que cada uno hace a su propia iteración anterior es
 * `.select("iteracion")` — trae el número para calcular iteracion+1, nunca
 * el contenido. Resultado: cada regeneración arranca de cero y pierde todo
 * lo que el formulador había aportado en respuestas anteriores.
 *
 * Evidencia del bug, trazada iteración por iteración en IMPACTOS:
 *   #26 (tras responder sobre el dron) → "Dron DJI Phantom 4 Multiespectral
 *        (confirmado, propiedad de Unitropico — dato verificado)"
 *   #27 (tras responder AEROCIVIL)     → el Phantom 4 DESAPARECE, vuelve al
 *        genérico "MicaSense RedEdge-MX o equivalente"; aparece Aerocivil
 *   #28 (tras responder laboratorio)   → Aerocivil desaparece y la pregunta
 *        se RE-GENERA, pese a estar respondida y resuelta en la tabla
 * Jorge respondió lo de la habilitación AEROCIVIL tres veces desde el
 * 16-ago (ids 0dd83516, 7327fea1, 2bd48f9c) — se perdía en cada ciclo.
 *
 * POR QUÉ EL PARCHE ANTERIOR NO FUNCIONÓ: los prompts ya traían una "REGLA
 * ANTI-PREGUNTAS-INFINITAS" diciéndole al modelo que el formulador ya había
 * respondido antes y no repreguntara. Era inaplicable: al modelo nunca se le
 * pasaba QUÉ había respondido, así que no tenía forma de saber qué evitar.
 * Se había diagnosticado como indisciplina del modelo cuando era falta de
 * contexto. Este módulo aporta ese contexto faltante.
 *
 * DECISIÓN DE DISEÑO — historial de respuestas, NO la iteración previa
 * completa: los tres hechos que se documentó perdiéndose (Phantom 4,
 * AEROCIVIL, laboratorio) provienen de RESPUESTAS del formulador, no de
 * prosa generada. Un ledger de hechos verificados es compacto, conserva la
 * procedencia (el modelo distingue dato oficial de supuesto) y no arrastra
 * texto obsoleto que a veces SÍ debe cambiar. Pasar la iteración anterior
 * entera arriesga que el modelo la copie textualmente y congele errores.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NodoTipo } from "./clasificacionPreguntas";
import { esProcedenciaConfirmada, type Procedencia } from "./procedencia";

/**
 * Tope de hechos inyectados. El bloque crece con cada respuesta del
 * formulador y va dentro de CADA prompt de regeneración, así que sin tope
 * el costo por llamada crecería sin límite en proyectos largos. Se
 * conservan los MÁS RECIENTES (los últimos N por resolved_at) porque, ante
 * dos respuestas contradictorias sobre el mismo punto, la reciente es la
 * vigente. IMPACTOS en piña tiene 23 hechos — muy por debajo del tope.
 */
const MAX_HECHOS = 40;

export async function construirContextoAcumulado(
  supabase: SupabaseClient,
  project_id: string,
  nodo_tipo: NodoTipo
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("preguntas_pendientes")
    .select("texto_pregunta, respuesta, estado_procedencia, resolved_at")
    .eq("project_id", project_id)
    .eq("nodo_tipo", nodo_tipo)
    .eq("estado", "resuelta")
    .not("respuesta", "is", null)
    .order("resolved_at", { ascending: false })
    .limit(MAX_HECHOS);

  if (error) {
    // Fail-open deliberado: si esta consulta falla, la regeneración sigue
    // sin memoria (comportamiento anterior) en vez de romper la generación
    // completa del nodo. Se registra para no perder la señal.
    console.error("[construirContextoAcumulado] error:", error.message);
    return undefined;
  }

  const filas = (data ?? []).filter((f) => (f.respuesta as string | null)?.trim());
  if (filas.length === 0) return undefined;

  // Se pidieron en orden descendente para que el tope conserve los más
  // recientes; se presentan en orden ASCENDENTE para que el modelo lea la
  // cronología real y la regla de "prevalece el más reciente" sea aplicable.
  filas.reverse();

  const lineas = filas.map((f, i) => {
    const procedencia = (f.estado_procedencia as Procedencia | null) ?? null;
    const solidez = esProcedenciaConfirmada(procedencia)
      ? "dato verificado"
      : "supuesto de trabajo, sin verificación formal";
    return [
      `${i + 1}. Pregunta: "${(f.texto_pregunta as string).trim()}"`,
      `   Respuesta del formulador: "${(f.respuesta as string).trim()}"`,
      `   Procedencia declarada: ${procedencia ?? "no declarada"} (${solidez})`,
    ].join("\n");
  });

  return [
    "HECHOS YA VERIFICADOS POR EL FORMULADOR",
    "",
    "Estos puntos YA fueron preguntados y respondidos en iteraciones anteriores de este mismo nodo, en orden cronológico (el más reciente al final).",
    "",
    lineas.join("\n\n"),
    "",
    "REGLAS DE USO OBLIGATORIAS:",
    "- Incorpora estos hechos al contenido que generes, con el nivel de certeza que indica su procedencia: los marcados como 'dato verificado' van como hechos confirmados; los marcados como 'supuesto de trabajo' van declarados explícitamente como supuestos.",
    "- NO vuelvas a preguntar por ninguno de estos puntos en preguntas_para_el_usuario. Ya están respondidos.",
    "- NO los degrades a incertidumbre ni los reemplaces por alternativas genéricas. Si el formulador confirmó un equipo, una entidad o una cifra concreta, esa es la que va — no la sustituyas por un ejemplo genérico.",
    "- Si dos hechos de la lista se contradicen entre sí, prevalece el más reciente (el de número mayor).",
    "- Solo puedes contradecir un hecho de esta lista si la RETROALIMENTACIÓN de esta iteración lo contradice explícitamente.",
  ].join("\n");
}
