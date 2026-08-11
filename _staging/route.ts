import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import {
  construirPromptObjetivos,
  camposObligatoriosParaEnfoque,
  ensamblarMatrizConsistencia,
  asignarIdsObjetivos,
  estructuraSegunEnfoque,
  type ObjetivosOutput,
} from "@/lib/faro/objetivos";
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

  // 2. Traer el último nodo RUTA confirmado del proyecto (D(θ) es obligatorio)
  const { data: nodoRuta, error: errRuta } = await supabase
    .from("grafo_nodos")
    .select("*")
    .eq("project_id", project_id)
    .eq("tipo", "RUTA")
    .eq("confirmado_humano", true)
    .order("iteracion", { ascending: false })
    .limit(1)
    .single();

  if (errRuta || !nodoRuta) {
    return NextResponse.json(
      { error: "Se requiere un nodo RUTA confirmado antes de generar Objetivos" },
      { status: 400 }
    );
  }

  // 3. Traer el último nodo NOVA confirmado del proyecto (árbol de causas es obligatorio)
  const { data: nodoNova, error: errNova } = await supabase
    .from("grafo_nodos")
    .select("*")
    .eq("project_id", project_id)
    .eq("tipo", "NOVA")
    .eq("confirmado_humano", true)
    .order("iteracion", { ascending: false })
    .limit(1)
    .single();

  if (errNova || !nodoNova) {
    return NextResponse.json(
      { error: "Se requiere un nodo NOVA confirmado antes de generar Objetivos" },
      { status: 400 }
    );
  }

  const rutaOutput = nodoRuta.contenido;
  const novaOutput = nodoNova.contenido;

  // 4. Calcular iteración actual para este nodo (mismo patrón que RUTA)
  const { data: nodosPrevios } = await supabase
    .from("grafo_nodos")
    .select("iteracion")
    .eq("project_id", project_id)
    .eq("tipo", "OBJETIVOS")
    .order("iteracion", { ascending: false })
    .limit(1);

  const iteracion = (nodosPrevios?.[0]?.iteracion ?? -1) + 1;

  // 5. Construir el prompt y llamar al orquestador
  const prompt = construirPromptObjetivos({
    nu: project.nu,
    mu: project.mu,
    rutaOutput,
    novaOutput,
    feedbackIteracionAnterior: feedback,
  });

  const inicio = Date.now();
  let objetivosOutput: ObjetivosOutput;
  try {
    const respuestaCruda = await llamarOrquestador(prompt);
    objetivosOutput = parsearJsonRespuesta<ObjetivosOutput>(respuestaCruda);
    objetivosOutput = asignarIdsObjetivos(objetivosOutput);
  } catch (e) {
    return NextResponse.json({ error: `Error del orquestador: ${(e as Error).message}` }, { status: 502 });
  }
  const tiempoMs = Date.now() - inicio;

  // 6. Validar campos obligatorios según el enfoque ya resuelto
  const enfoque = estructuraSegunEnfoque(project.mu);
  const camposObligatorios = camposObligatoriosParaEnfoque(enfoque);

  // 7. Ensamblar la matriz de consistencia de forma determinística (no la generó el LLM)
  const matrizConsistencia = ensamblarMatrizConsistencia(objetivosOutput);

  // 8. Contradicciones estructurales (misma función SQL que usa RUTA)
  const { data: contradiccionesEstructurales } = await supabase.rpc("detectar_contradicciones", {
    p_tau: project.tau,
    p_lambda_trl: project.lambda_trl,
    p_mu: project.mu,
  });
  const contradiccionesTyped = (contradiccionesEstructurales ?? []) as ContradiccionDetectada[];

  // 9. Matemática de la MCI (mismo patrón que ruta/generar)
  const deltaI = calcularDeltaI(objetivosOutput);
  const omega = calcularOmega(objetivosOutput, camposObligatorios);
  const deltaModulada = calcularDeltaModulada(contradiccionesTyped, project.u2_competencia_metodologica ?? 0);
  const lFaro = calcularLFaroReducida({ deltaI, omega, deltaModulada });
  const seTau = calcularSeTauCompleto({ nu: project.nu, u0: project.u0_initial });
  const tauC = calcularTauC(seTau);
  const convergio = haConvergido(lFaro, tauC, contradiccionesTyped);

  // 10. Persistir: nodo del grafo (contenido incluye la matriz de consistencia ensamblada)
  const { data: nodo, error: nodoError } = await supabase
    .from("grafo_nodos")
    .insert({
      project_id,
      tipo: "OBJETIVOS",
      iteracion,
      contenido: { ...objetivosOutput, matriz_consistencia: matrizConsistencia },
      confianza_agente: objetivosOutput.nivel_confianza_agente,
      preguntas_pendientes: objetivosOutput.preguntas_para_el_usuario,
      delta_nodal: deltaI,
    })
    .select()
    .single();

  if (nodoError) {
    return NextResponse.json({ error: nodoError.message }, { status: 500 });
  }

  // 11. Traza de la sesión MCI
  await supabase.from("sesiones_mci_log").insert({
    project_id,
    modulo: "OBJETIVOS",
    iteracion,
    l_faro: lFaro,
    delta_nodal: { OBJETIVOS: deltaI },
    omega,
    contradicciones: contradiccionesTyped,
    convergio,
    tiempo_ms: tiempoMs,
    modelo_usado: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6",
  });

  return NextResponse.json({
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
    matriz_consistencia: matrizConsistencia,
  });
}
