import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { construirPromptRuta, type RutaOutput } from "@/lib/faro/ruta";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import {
  calcularDeltaI, calcularOmega, calcularDeltaModulada, calcularLFaroReducida,
  calcularSeTauCompleto, calcularTauC, haConvergido,
  type ContradiccionDetectada,
} from "@/lib/faro/mci";
import { verificarHipotesis } from "@/lib/faro/rsl/rsl";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id, feedback } = body;
  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  // 1. Cargar el proyecto (RLS garantiza que solo se acceda a los propios)
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
  }

  // 2. Calcular iteración actual para este nodo
  const { data: nodosPrevios } = await supabase
    .from("grafo_nodos")
    .select("iteracion")
    .eq("project_id", project_id)
    .eq("tipo", "RUTA")
    .order("iteracion", { ascending: false })
    .limit(1);

  const iteracion = (nodosPrevios?.[0]?.iteracion ?? -1) + 1;

  // 3. Construir prompt y llamar al orquestador
  const prompt = construirPromptRuta({
    nu: project.nu,
    tau: project.tau,
    mu: project.mu,
    alphaArea: project.alpha_area,
    lambdaTrl: project.lambda_trl,
    u0: project.u0_initial,
    region: project.region,
    poblacionUsuarios: project.poblacion_usuarios,
    tecnologiaInteres: project.tecnologia_interes,
    palabrasClave: project.palabras_clave,
    fuentesContextoOficial: project.fuentes_contexto_oficial,
    tituloProvisional: project.titulo_provisional,
    feedbackIteracionAnterior: feedback,
  });

  const inicio = Date.now();
  let rutaOutput: RutaOutput;
  try {
    const respuestaCruda = await llamarOrquestador(prompt);
    rutaOutput = parsearJsonRespuesta<RutaOutput>(respuestaCruda);
  } catch (e) {
    return NextResponse.json({ error: `Error del orquestador: ${(e as Error).message}` }, { status: 502 });
  }

  // 4. RSL reactivo — verifica la hipótesis declarada por RUTA ANTES de persistir
  //    el nodo, para que (a) el nodo guardado ya lleve estado_evidencia real y
  //    (b) una eventual contradicción de RSL entre al cálculo de Δ de ESTA
  //    iteración, no de la siguiente. No requiere nodo_id — eso solo hace
  //    falta más abajo, para la tabla de auditoría verificaciones_rsl.
  const resultadoRSL = await verificarHipotesis(rutaOutput.vacio_conocimiento_hipotesis);
  rutaOutput.vacio_conocimiento_hipotesis.estado_evidencia = resultadoRSL.estado_evidencia;

  const tiempoMs = Date.now() - inicio;

  // 5. Contradicciones estructurales (función SQL ya existente) + la de RSL, si hay
  const { data: contradiccionesEstructurales } = await supabase.rpc("detectar_contradicciones", {
    p_tau: project.tau,
    p_lambda_trl: project.lambda_trl,
    p_mu: project.mu,
  });
  const contradiccionesTyped: ContradiccionDetectada[] = [
    ...((contradiccionesEstructurales ?? []) as ContradiccionDetectada[]),
    ...(resultadoRSL.contradiccion ? [resultadoRSL.contradiccion] : []),
  ];

  // 6. Matemática de la MCI reducida a un nodo — ya incluye la señal de RSL
  const deltaI = calcularDeltaI(rutaOutput);
  const omega = calcularOmega(rutaOutput);
  const deltaModulada = calcularDeltaModulada(contradiccionesTyped, project.u2_competencia_metodologica ?? 0);
  const lFaro = calcularLFaroReducida({ deltaI, omega, deltaModulada });
  const seTau = calcularSeTauCompleto({ nu: project.nu, u0: project.u0_initial });
  const tauC = calcularTauC(seTau);
  const convergio = haConvergido(lFaro, tauC, contradiccionesTyped);

  // 7. Persistir: nodo del grafo (ya con estado_evidencia actualizado por RSL)
  const { data: nodo, error: nodoError } = await supabase
    .from("grafo_nodos")
    .insert({
      project_id,
      tipo: "RUTA",
      iteracion,
      contenido: rutaOutput,
      confianza_agente: rutaOutput.nivel_confianza_agente,
      preguntas_pendientes: rutaOutput.preguntas_para_el_usuario,
      delta_nodal: deltaI,
    })
    .select()
    .single();

  if (nodoError) {
    return NextResponse.json({ error: nodoError.message }, { status: 500 });
  }

  // 8. Traza de auditoría de RSL — ahora sí con nodo_id real, para reconstruir
  //    después el diagrama PRISMA-ScR (identificado/cribado/incluido)
  const { error: verificacionError } = await supabase.from("verificaciones_rsl").insert({
    project_id,
    nodo_id: nodo.id,
    hipotesis_afirmacion: rutaOutput.vacio_conocimiento_hipotesis.afirmacion,
    estado_evidencia: resultadoRSL.estado_evidencia,
    citas: resultadoRSL.citas,
    contradiccion: resultadoRSL.contradiccion,
    modo: resultadoRSL.modo,
  });

  if (verificacionError) {
    // No se aborta la respuesta por esto — el nodo ya se guardó correctamente.
    // Se registra en consola para no perder trazabilidad silenciosamente.
    console.error("[rsl] Fallo al persistir verificaciones_rsl:", verificacionError.message);
  }

  // 9. Traza de la sesión MCI
  await supabase.from("sesiones_mci_log").insert({
    project_id,
    modulo: "RUTA",
    iteracion,
    l_faro: lFaro,
    delta_nodal: { RUTA: deltaI },
    omega,
    contradicciones: contradiccionesTyped,
    convergio,
    tiempo_ms: tiempoMs,
    modelo_usado: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6",
  });

  return NextResponse.json({
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
    rsl: resultadoRSL,
  });
}