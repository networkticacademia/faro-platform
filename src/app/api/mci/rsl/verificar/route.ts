import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verificarHipotesis } from "@/lib/faro/rsl/rsl";
import {
  calcularDeltaI, calcularOmega, calcularDeltaModulada, calcularLFaroReducida,
  calcularSeTauCompleto, calcularTauC, haConvergido,
  type ContradiccionDetectada,
} from "@/lib/faro/mci";
import type { RutaOutput } from "@/lib/faro/ruta";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id, nodo_id, cadena_confirmada } = body;

  if (!project_id || !nodo_id) {
    return NextResponse.json({ error: "Faltan project_id o nodo_id." }, { status: 400 });
  }
  if (!cadena_confirmada || typeof cadena_confirmada !== "string" || !cadena_confirmada.trim()) {
    return NextResponse.json({ error: "Falta cadena_confirmada (no puede ejecutarse sin confirmación del formulador)." }, { status: 400 });
  }

  // 1. Cargar el nodo (RLS garantiza acceso solo a los propios proyectos)
  const { data: nodo, error: nodoError } = await supabase
    .from("grafo_nodos")
    .select("*")
    .eq("id", nodo_id)
    .eq("project_id", project_id)
    .single();

  if (nodoError || !nodo) {
    return NextResponse.json({ error: "Nodo no encontrado." }, { status: 404 });
  }

  const rutaOutput = nodo.contenido as RutaOutput;
  if (!rutaOutput?.vacio_conocimiento_hipotesis) {
    return NextResponse.json({ error: "El nodo no tiene una hipótesis de vacío de conocimiento válida." }, { status: 422 });
  }

  // 2. Cargar el proyecto — necesario para recalcular la MCI completa
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
  }

  // 3. Ejecutar RSL con la cadena YA CONFIRMADA por el formulador —
  //    no la afirmación completa de la hipótesis.
  const resultadoRSL = await verificarHipotesis(rutaOutput.vacio_conocimiento_hipotesis, {
    cadenaBusquedaConfirmada: cadena_confirmada.trim(),
  });

  // 4. Actualizar el estado de evidencia dentro del contenido del nodo
  const rutaOutputActualizado: RutaOutput = {
    ...rutaOutput,
    vacio_conocimiento_hipotesis: {
      ...rutaOutput.vacio_conocimiento_hipotesis,
      estado_evidencia: resultadoRSL.estado_evidencia,
    },
  };

  const { data: nodoActualizado, error: updateError } = await supabase
    .from("grafo_nodos")
    .update({ contenido: rutaOutputActualizado })
    .eq("id", nodo_id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 5. Traza de auditoría en verificaciones_rsl
  const { error: verificacionError } = await supabase.from("verificaciones_rsl").insert({
    project_id,
    nodo_id,
    hipotesis_afirmacion: rutaOutput.vacio_conocimiento_hipotesis.afirmacion,
    estado_evidencia: resultadoRSL.estado_evidencia,
    citas: resultadoRSL.citas,
    contradiccion: resultadoRSL.contradiccion,
    modo: resultadoRSL.modo,
    sintesis_narrativa: resultadoRSL.sintesis_narrativa,
    vacio_detectado: resultadoRSL.vacio_detectado,
    fuentes_consultadas: resultadoRSL.fuentes_consultadas,
  });

  if (verificacionError) {
    console.error("[rsl] Fallo al persistir verificaciones_rsl:", verificacionError.message);
  }

  // 6. Recalcular Δ/L_FARO de este nodo, ya con la señal de RSL incluida
  const { data: contradiccionesEstructurales } = await supabase.rpc("detectar_contradicciones", {
    p_tau: project.tau,
    p_lambda_trl: project.lambda_trl,
    p_mu: project.mu,
  });
  const contradiccionesTyped: ContradiccionDetectada[] = [
    ...((contradiccionesEstructurales ?? []) as ContradiccionDetectada[]),
    ...(resultadoRSL.contradiccion ? [resultadoRSL.contradiccion] : []),
  ];

  const deltaI = calcularDeltaI(rutaOutputActualizado);
  const omega = calcularOmega(rutaOutputActualizado);
  const deltaModulada = calcularDeltaModulada(contradiccionesTyped, project.u2_competencia_metodologica ?? 0);
  const lFaro = calcularLFaroReducida({ deltaI, omega, deltaModulada });
  const seTau = calcularSeTauCompleto({ nu: project.nu, u0: project.u0_initial });
  const tauC = calcularTauC(seTau);
  const convergio = haConvergido(lFaro, tauC, contradiccionesTyped);

  // 7. Traza de esta actualización en sesiones_mci_log — modulo "RSL",
  //    distinta de las entradas "RUTA", para no mezclar ambas trazas.
  await supabase.from("sesiones_mci_log").insert({
    project_id,
    modulo: "RSL",
    iteracion: nodo.iteracion,
    l_faro: lFaro,
    delta_nodal: { RUTA: deltaI },
    omega,
    contradicciones: contradiccionesTyped,
    convergio,
    tiempo_ms: null,
    modelo_usado: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6",
  });

  return NextResponse.json({
    nodo: nodoActualizado,
    rsl: resultadoRSL,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
  });
}
