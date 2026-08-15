import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { construirPromptRuta, type RutaOutput } from "@/lib/faro/ruta";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import {
  calcularDeltaI, calcularOmega, CAMPOS_OBLIGATORIOS_RUTA, calcularDeltaModulada, calcularLFaroReducida,
  calcularSeTauCompleto, calcularTauC, haConvergido,
  type ContradiccionDetectada,
} from "@/lib/faro/mci";
import { proponerCadenaBusqueda } from "@/lib/faro/rsl/cadenaBusqueda";
import { sincronizarPreguntasPendientes } from "@/lib/faro/preguntas";

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
  const tiempoMs = Date.now() - inicio;

  // NOTA — cambio de arquitectura (2026-08-06): RSL YA NO se dispara aquí
  // automáticamente. verificarHipotesis() mandaba la afirmación completa
  // de la hipótesis (40+ palabras en prosa) como consulta a OpenAlex, lo
  // que producía sistemáticamente cero candidatos en producción. Ahora
  // solo se PROPONE una cadena de búsqueda; el formulador la confirma o
  // edita en una pantalla nueva, y esa confirmación dispara la búsqueda
  // real vía api/mci/rsl/verificar (ver ese endpoint). El nodo se persiste
  // con estado_evidencia="sin_verificar" (el valor que ya trae del
  // orquestador) — sigue siendo honesto, solo que ahora la verificación
  // ocurre en un paso separado y explícito.
  const propuestaBusqueda = proponerCadenaBusqueda({
    palabrasClaveM0: project.palabras_clave ?? [],
    rutaOutput,
  });

  // 4. Contradicciones estructurales (función SQL ya existente) —
  //    sin la contribución de RSL todavía, porque RSL no ha corrido.
  const { data: contradiccionesEstructurales } = await supabase.rpc("detectar_contradicciones", {
    p_tau: project.tau,
    p_lambda_trl: project.lambda_trl,
    p_mu: project.mu,
  });
  const contradiccionesTyped = (contradiccionesEstructurales ?? []) as ContradiccionDetectada[];

  // 5. Matemática de la MCI reducida a un nodo
  const deltaI = calcularDeltaI(rutaOutput);
  const omega = calcularOmega(rutaOutput, CAMPOS_OBLIGATORIOS_RUTA);
  const deltaModulada = calcularDeltaModulada(contradiccionesTyped, project.u2_competencia_metodologica ?? 0);
  const lFaro = calcularLFaroReducida({ deltaI, omega, deltaModulada });
  const seTau = calcularSeTauCompleto({ nu: project.nu, u0: project.u0_initial });
  const tauC = calcularTauC(seTau);
  const convergio = haConvergido(lFaro, tauC, contradiccionesTyped);

  // 6. Persistir: nodo del grafo
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

  // 7. Traza de la sesión MCI
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

  await sincronizarPreguntasPendientes(supabase, {
    project_id,
    nodo_id: nodo.id,
    nodo_tipo: "RUTA",
    contenido: nodo.contenido,
  });

  return NextResponse.json({
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
    propuesta_busqueda: propuestaBusqueda,
  });
}