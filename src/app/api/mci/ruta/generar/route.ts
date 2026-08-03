import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { construirPromptRuta, type RutaOutput } from "@/lib/faro/ruta";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import {
  calcularDeltaI, calcularOmega, calcularDeltaModulada, calcularLFaroReducida,
  calcularSeTauCompleto, calcularTauC, haConvergido,
  type ContradiccionDetectada,
} from "@/lib/faro/mci";

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
  const tiempoMs = Date.now() - inicio;

  // 4. Contradicciones estructurales (función SQL ya existente)
  const { data: contradicciones } = await supabase.rpc("detectar_contradicciones", {
    p_tau: project.tau,
    p_lambda_trl: project.lambda_trl,
    p_mu: project.mu,
  });
  const contradiccionesTyped = (contradicciones ?? []) as ContradiccionDetectada[];

  // 5. Matemática de la MCI reducida a un nodo
  const deltaI = calcularDeltaI(rutaOutput);
  const omega = calcularOmega(rutaOutput);
  const deltaModulada = calcularDeltaModulada(contradiccionesTyped, project.u2_competencia_metodologica ?? 0);
  const lFaro = calcularLFaroReducida({ deltaI, omega, deltaModulada });
  const seTau = calcularSeTauCompleto({ nu: project.nu, u0: project.u0_initial });
  const tauC = calcularTauC(seTau);
  const convergio = haConvergido(lFaro, tauC, contradiccionesTyped);

  // 6. Persistir: nodo del grafo + traza de la sesión MCI
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
  });
}
