// ============================================================
// FARO — POST /api/mci/nova/generar
// Segundo nodo de contenido F2. Requiere que exista un nodo RUTA
// CONFIRMADO en el proyecto.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { construirPromptNova, asignarIdsNova, CAMPOS_OBLIGATORIOS_NOVA, type NovaOutput } from "@/lib/faro/nova";
import type { RutaOutput } from "@/lib/faro/ruta";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import {
  calcularDeltaI, calcularOmega, calcularDeltaModulada, calcularLFaroReducida,
  calcularSeTauCompleto, calcularTauC, haConvergido,
  type ContradiccionDetectada,
} from "@/lib/faro/mci";
import { sincronizarPreguntasPendientes } from "@/lib/faro/preguntas";

export async function generarNovaCore(
  supabase: SupabaseClient,
  params: { project_id: string; feedback?: string }
) {
  const { project_id, feedback } = params;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single();

  if (projectError || !project) {
    throw new Error("Proyecto no encontrado.");
  }

  const { data: nodoRuta, error: rutaError } = await supabase
    .from("grafo_nodos")
    .select("*")
    .eq("project_id", project_id)
    .eq("tipo", "RUTA")
    .eq("confirmado_humano", true)
    .order("iteracion", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rutaError || !nodoRuta) {
    throw new Error("NOVA requiere un nodo RUTA confirmado en este proyecto. Complete y confirme RUTA primero.");
  }
  const rutaOutput = nodoRuta.contenido as RutaOutput;

  const { data: verificacionRSL } = await supabase
    .from("verificaciones_rsl")
    .select("sintesis_narrativa, vacio_detectado")
    .eq("nodo_id", nodoRuta.id)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: nodosPrevios } = await supabase
    .from("grafo_nodos")
    .select("iteracion")
    .eq("project_id", project_id)
    .eq("tipo", "NOVA")
    .order("iteracion", { ascending: false })
    .limit(1);

  const iteracion = (nodosPrevios?.[0]?.iteracion ?? -1) + 1;

  const prompt = construirPromptNova({
    nu: project.nu,
    tau: project.tau,
    subtipoDti: project.subtipo_dti ?? null,
    mu: project.mu,
    alphaArea: project.alpha_area,
    rutaOutput,
    sintesisRSL: verificacionRSL?.sintesis_narrativa ?? null,
    vacioDetectadoRSL: verificacionRSL?.vacio_detectado ?? null,
    cifrasContextoAportadasPorFormulador: project.cifras_contexto ?? [],
    cadenaCausalAportada: [],
    feedbackIteracionAnterior: feedback,
  });

  const inicio = Date.now();
  const respuestaCruda = await llamarOrquestador(prompt);
  let novaOutput = parsearJsonRespuesta<NovaOutput>(respuestaCruda);
  novaOutput = asignarIdsNova(novaOutput);
  const tiempoMs = Date.now() - inicio;

  const { data: contradiccionesEstructurales } = await supabase.rpc("detectar_contradicciones", {
    p_tau: project.tau,
    p_lambda_trl: project.lambda_trl,
    p_mu: project.mu,
  });
  const contradiccionesTyped = (contradiccionesEstructurales ?? []) as ContradiccionDetectada[];

  const deltaI = calcularDeltaI(novaOutput);
  const omega = calcularOmega(novaOutput, CAMPOS_OBLIGATORIOS_NOVA);
  const deltaModulada = calcularDeltaModulada(contradiccionesTyped, project.u2_competencia_metodologica ?? 0);
  const lFaro = calcularLFaroReducida({ deltaI, omega, deltaModulada });
  const seTau = calcularSeTauCompleto({ nu: project.nu, u0: project.u0_initial });
  const tauC = calcularTauC(seTau);
  const convergio = haConvergido(lFaro, tauC, contradiccionesTyped);

  const { data: nodo, error: nodoError } = await supabase
    .from("grafo_nodos")
    .insert({
      project_id,
      tipo: "NOVA",
      iteracion,
      contenido: novaOutput,
      confianza_agente: novaOutput.nivel_confianza_agente,
      preguntas_pendientes: novaOutput.preguntas_para_el_usuario,
      delta_nodal: deltaI,
    })
    .select()
    .single();

  if (nodoError) {
    throw new Error(`Error al guardar nodo NOVA: ${nodoError.message}`);
  }

  await supabase.from("sesiones_mci_log").insert({
    project_id,
    modulo: "NOVA",
    iteracion,
    l_faro: lFaro,
    delta_nodal: { NOVA: deltaI },
    omega,
    contradicciones: contradiccionesTyped,
    convergio,
    tiempo_ms: tiempoMs,
    modelo_usado: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6",
  });

  await sincronizarPreguntasPendientes(supabase, {
    project_id,
    nodo_id: nodo.id,
    nodo_tipo: "NOVA",
    contenido: nodo.contenido,
  });

  return {
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
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
    const resultado = await generarNovaCore(supabase, { project_id, feedback });
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
