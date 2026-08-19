import type { SupabaseClient } from "@supabase/supabase-js";
import type { NodoTipo } from "./clasificacionPreguntas";

export type OrigenRiesgo =
  | "contradiccion_delta_ij"
  | "pregunta_operativa"
  | "excedente_tope"
  | "error_verificador";

export type SeveridadRiesgo = "baja" | "media" | "alta";
export type EstadoRiesgo = "abierto" | "mitigado" | "aceptado";

export interface RiesgoProyecto {
  id: string;
  project_id: string;
  origen: OrigenRiesgo;
  nodo_tipo: NodoTipo | null;
  descripcion: string;
  severidad: SeveridadRiesgo;
  actividad_mitigacion_ref: string | null;
  pregunta_origen_id: string | null;
  estado: EstadoRiesgo;
  created_at: string;
}

export interface RegistrarRiesgoParams {
  project_id: string;
  origen: OrigenRiesgo;
  nodo_tipo?: NodoTipo | null;
  descripcion: string;
  severidad?: SeveridadRiesgo;
  actividad_mitigacion_ref?: string | null;
  pregunta_origen_id?: string | null;
  estado?: EstadoRiesgo;
}

/**
 * Inserta un riesgo en la tabla riesgos_proyecto.
 */
export async function registrarRiesgo(
  supabase: SupabaseClient,
  params: RegistrarRiesgoParams
): Promise<{ data: RiesgoProyecto | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("riesgos_proyecto")
    .insert({
      project_id: params.project_id,
      origen: params.origen,
      nodo_tipo: params.nodo_tipo ?? null,
      descripcion: params.descripcion,
      severidad: params.severidad ?? "media",
      actividad_mitigacion_ref: params.actividad_mitigacion_ref ?? null,
      pregunta_origen_id: params.pregunta_origen_id ?? null,
      estado: params.estado ?? "abierto",
    })
    .select()
    .single();

  if (error) {
    console.error("[registrarRiesgo] error:", error.message);
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as RiesgoProyecto, error: null };
}

/**
 * Toma una pregunta_pendiente, la migra a riesgos_proyecto e invalida/difiera la pregunta original.
 * Es idempotente: si la pregunta ya fue migrada a riesgos, no la duplica.
 */
export async function migrarPreguntaARiesgo(
  supabase: SupabaseClient,
  preguntaId: string
): Promise<{ success: boolean; error: Error | null }> {
  // 1. Verificar si ya existe un riesgo migrado para esta pregunta
  const { data: existente, error: errExistente } = await supabase
    .from("riesgos_proyecto")
    .select("id")
    .eq("pregunta_origen_id", preguntaId)
    .maybeSingle();

  if (errExistente) {
    console.error("[migrarPreguntaARiesgo] error buscando duplicado:", errExistente.message);
    return { success: false, error: new Error(errExistente.message) };
  }

  if (existente) {
    // Ya migrado, asegurar que la pregunta esté en estado diferida y retornar success
    await supabase
      .from("preguntas_pendientes")
      .update({ estado: "diferida" })
      .eq("id", preguntaId);
    return { success: true, error: null };
  }

  // 2. Traer la pregunta pendiente
  const { data: pregunta, error: errPregunta } = await supabase
    .from("preguntas_pendientes")
    .select("*")
    .eq("id", preguntaId)
    .maybeSingle();

  if (errPregunta || !pregunta) {
    console.error("[migrarPreguntaARiesgo] error obteniendo pregunta:", errPregunta?.message ?? "Pregunta no encontrada");
    return { success: false, error: new Error(errPregunta?.message ?? "Pregunta no encontrada") };
  }

  // 3. Determinar origen del riesgo
  // Si fue marcada en el tope graduado (estado_procedencia = 'excedente_tope'), origen es 'excedente_tope'.
  // Si no, asumimos que es 'pregunta_operativa'.
  const origen: OrigenRiesgo =
    pregunta.estado_procedencia === "excedente_tope"
      ? "excedente_tope"
      : "pregunta_operativa";

  // Determinar severidad sugerida por prioridad
  const severidad: SeveridadRiesgo =
    pregunta.prioridad === "P0" || pregunta.prioridad === "P1" ? "alta" : "media";

  // 4. Registrar en riesgos_proyecto
  const { error: errInsert } = await registrarRiesgo(supabase, {
    project_id: pregunta.project_id,
    origen,
    nodo_tipo: pregunta.nodo_tipo as NodoTipo,
    descripcion: pregunta.texto_pregunta,
    severidad,
    pregunta_origen_id: pregunta.id,
    actividad_mitigacion_ref: "OE-1", // Mitigado típicamente por las actividades iniciales
  });

  if (errInsert) {
    return { success: false, error: errInsert };
  }

  // 5. Marcar pregunta como diferida
  const { error: errUpdate } = await supabase
    .from("preguntas_pendientes")
    .update({ estado: "diferida" })
    .eq("id", preguntaId);

  if (errUpdate) {
    console.error("[migrarPreguntaARiesgo] error actualizando pregunta:", errUpdate.message);
    return { success: false, error: new Error(errUpdate.message) };
  }

  return { success: true, error: null };
}

/**
 * Retorna todos los riesgos registrados para un proyecto.
 */
export async function listarRiesgos(
  supabase: SupabaseClient,
  projectId: string
): Promise<RiesgoProyecto[]> {
  const { data, error } = await supabase
    .from("riesgos_proyecto")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[listarRiesgos] error:", error.message);
    return [];
  }

  return (data ?? []) as RiesgoProyecto[];
}
