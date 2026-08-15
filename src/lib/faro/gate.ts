/**
 * lib/faro/gate.ts
 *
 * Verificación de Gate/Checkpoint — función de LECTURA pura, sin efectos
 * secundarios, invocada bajo demanda (al intentar avanzar de pestaña).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NodoTipo } from "./clasificacionPreguntas";

export type Checkpoint = "C0" | "C1" | "C2" | "C3";

interface ConfigCheckpoint {
  nodosEvaluados: NodoTipo[];
  activo: boolean;
}

const CONFIG_CHECKPOINTS: Record<Checkpoint, ConfigCheckpoint> = {
  C0: { nodosEvaluados: ["RUTA", "NOVA"], activo: true },
  C1: { nodosEvaluados: ["RUTA", "NOVA", "OBJETIVOS"], activo: false },
  C2: { nodosEvaluados: ["METODOLOGIA"], activo: false },
  C3: { nodosEvaluados: [], activo: false }, // ya cubierto por TarjetaConvergencia
};

export interface PreguntaBloqueante {
  id: string;
  nodo_tipo: string;
  campo_origen: string | null;
  texto_pregunta: string;
  nodos_afectados: string[];
}

export interface ResultadoGate {
  checkpoint: Checkpoint;
  bloqueado: boolean;
  activo: boolean; // si el checkpoint todavía no está activado, bloqueado siempre es false
  preguntas_bloqueantes: PreguntaBloqueante[];
}

export async function verificarGate(
  supabase: SupabaseClient,
  project_id: string,
  checkpoint: Checkpoint
): Promise<ResultadoGate> {
  const config = CONFIG_CHECKPOINTS[checkpoint];

  if (!config.activo) {
    return { checkpoint, bloqueado: false, activo: false, preguntas_bloqueantes: [] };
  }

  const { data, error } = await supabase
    .from("preguntas_pendientes")
    .select("id, nodo_tipo, campo_origen, texto_pregunta, nodos_afectados")
    .eq("project_id", project_id)
    .eq("estado", "abierta")
    .eq("prioridad", "P1")
    .in("nodo_tipo", config.nodosEvaluados);

  if (error) {
    console.error("[verificarGate] error:", error.message);
    // Fail-open deliberado: un error de lectura no debe impedir trabajar.
    return { checkpoint, bloqueado: false, activo: true, preguntas_bloqueantes: [] };
  }

  const preguntas = (data ?? []) as PreguntaBloqueante[];
  return {
    checkpoint,
    bloqueado: preguntas.length > 0,
    activo: true,
    preguntas_bloqueantes: preguntas,
  };
}
