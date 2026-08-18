import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { construirPromptRuta, type RutaOutput } from "@/lib/faro/ruta";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import {
  calcularDeltaI, calcularOmega, CAMPOS_OBLIGATORIOS_RUTA, calcularDeltaModulada, calcularLFaroReducida,
  calcularSeTauCompleto, calcularTauC, haConvergido,
  type ContradiccionDetectada,
} from "@/lib/faro/mci";
import { proponerCadenaBusqueda } from "@/lib/faro/rsl/cadenaBusqueda";
import { sincronizarPreguntasPendientes } from "@/lib/faro/preguntas";
import { verificarCircuitoAntesDeRegenerar } from "@/lib/faro/circuitoConvergencia";

export async function generarRutaCore(
  supabase: SupabaseClient,
  params: { project_id: string; feedback?: string }
) {
  const { project_id, feedback } = params;

  // Solo aplica a REGENERACIÓN (ya existe una iteración previa de RUTA
  // para este proyecto) — la primera generación no tiene nada que
  // comparar todavía. Ver circuitoConvergencia.ts para por qué NO se usa
  // "feedback presente" como discriminador.
  await verificarCircuitoAntesDeRegenerar(supabase, project_id, "RUTA");

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single();

  if (projectError || !project) {
    throw new Error("Proyecto no encontrado.");
  }

  const { data: nodosPrevios } = await supabase
    .from("grafo_nodos")
    .select("iteracion")
    .eq("project_id", project_id)
    .eq("tipo", "RUTA")
    .order("iteracion", { ascending: false })
    .limit(1);

  const iteracion = (nodosPrevios?.[0]?.iteracion ?? -1) + 1;

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
  const respuestaCruda = await llamarOrquestador(prompt);
  const rutaOutput = parsearJsonRespuesta<RutaOutput>(respuestaCruda);
  const tiempoMs = Date.now() - inicio;

  const propuestaBusqueda = proponerCadenaBusqueda({
    palabrasClaveM0: project.palabras_clave ?? [],
    rutaOutput,
  });

  const { data: contradiccionesEstructurales } = await supabase.rpc("detectar_contradicciones", {
    p_tau: project.tau,
    p_lambda_trl: project.lambda_trl,
    p_mu: project.mu,
  });
  const contradiccionesTyped = (contradiccionesEstructurales ?? []) as ContradiccionDetectada[];

  const deltaI = calcularDeltaI(rutaOutput);
  const omega = calcularOmega(rutaOutput, CAMPOS_OBLIGATORIOS_RUTA);
  const deltaModulada = calcularDeltaModulada(contradiccionesTyped, project.u2_competencia_metodologica ?? 0);
  const lFaro = calcularLFaroReducida({ deltaI, omega, deltaModulada });
  const seTau = calcularSeTauCompleto({ nu: project.nu, u0: project.u0_initial });
  const tauC = calcularTauC(seTau);
  const convergio = haConvergido(lFaro, tauC, contradiccionesTyped);

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
    throw new Error(`Error al guardar nodo RUTA: ${nodoError.message}`);
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

  await sincronizarPreguntasPendientes(supabase, {
    project_id,
    nodo_id: nodo.id,
    nodo_tipo: "RUTA",
    contenido: nodo.contenido,
  });

  return {
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
    propuesta_busqueda: propuestaBusqueda,
  };
}

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

  try {
    const resultado = await generarRutaCore(supabase, { project_id, feedback });
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}