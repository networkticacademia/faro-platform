// ============================================================
// FARO — POST /api/mci/nova/generar
// Segundo nodo de contenido F2. Requiere que exista un nodo RUTA
// CONFIRMADO en el proyecto — NOVA implementa P = N(D(θ), B, ρ) y
// D(θ) es literalmente la salida de RUTA, no puede construirse sin
// ella. Reutiliza /api/mci/ruta/confirmar tal cual (ya es genérico
// por nodo_id) — no existe /api/mci/nova/confirmar por separado.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { construirPromptNova, asignarIdsNova, CAMPOS_OBLIGATORIOS_NOVA, type NovaOutput } from "@/lib/faro/nova";
import type { RutaOutput } from "@/lib/faro/ruta";
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

  // 1. Cargar el proyecto
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
  }

  // 2. NOVA requiere un nodo RUTA ya CONFIRMADO — es D(θ), no opcional.
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
    return NextResponse.json(
      { error: "NOVA requiere un nodo RUTA confirmado en este proyecto. Complete y confirme RUTA primero." },
      { status: 400 }
    );
  }
  const rutaOutput = nodoRuta.contenido as RutaOutput;

  // 3. Traer la última síntesis de RSL sobre la hipótesis de RUTA, si existe
  //    (B en P = N(D(θ), B, ρ)) — no la busca de nuevo, reutiliza lo ya
  //    verificado.
  const { data: verificacionRSL } = await supabase
    .from("verificaciones_rsl")
    .select("sintesis_narrativa, vacio_detectado")
    .eq("nodo_id", nodoRuta.id)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 4. Calcular iteración actual para el nodo NOVA
  const { data: nodosPrevios } = await supabase
    .from("grafo_nodos")
    .select("iteracion")
    .eq("project_id", project_id)
    .eq("tipo", "NOVA")
    .order("iteracion", { ascending: false })
    .limit(1);

  const iteracion = (nodosPrevios?.[0]?.iteracion ?? -1) + 1;

  // 5. Construir prompt y llamar al orquestador
  //    cifrasContextoAportadasPorFormulador ahora se lee de
  //    project.cifras_contexto (captura estructurada — ver
  //    CifrasContextoInput.tsx), no de un arreglo vacío. Sigue sin
  //    existir la UI para cadenaCausalAportada (5 porqués); el prompt
  //    maneja ese caso pidiéndole al agente que pregunte, no que invente.
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
  let novaOutput: NovaOutput;
  try {
    const respuestaCruda = await llamarOrquestador(prompt);
    novaOutput = parsearJsonRespuesta<NovaOutput>(respuestaCruda);
    novaOutput = asignarIdsNova(novaOutput);
  } catch (e) {
    return NextResponse.json({ error: `Error del orquestador: ${(e as Error).message}` }, { status: 502 });
  }
  const tiempoMs = Date.now() - inicio;

  // 6. Contradicciones estructurales (misma función SQL que RUTA — es a
  //    nivel de proyecto, no de nodo)
  const { data: contradiccionesEstructurales } = await supabase.rpc("detectar_contradicciones", {
    p_tau: project.tau,
    p_lambda_trl: project.lambda_trl,
    p_mu: project.mu,
  });
  const contradiccionesTyped = (contradiccionesEstructurales ?? []) as ContradiccionDetectada[];

  // 7. Matemática de la MCI — mismas funciones generalizadas hoy,
  //    CAMPOS_OBLIGATORIOS_NOVA en vez de CAMPOS_OBLIGATORIOS_RUTA.
  const deltaI = calcularDeltaI(novaOutput);
  const omega = calcularOmega(novaOutput, CAMPOS_OBLIGATORIOS_NOVA);
  const deltaModulada = calcularDeltaModulada(contradiccionesTyped, project.u2_competencia_metodologica ?? 0);
  const lFaro = calcularLFaroReducida({ deltaI, omega, deltaModulada });
  const seTau = calcularSeTauCompleto({ nu: project.nu, u0: project.u0_initial });
  const tauC = calcularTauC(seTau);
  const convergio = haConvergido(lFaro, tauC, contradiccionesTyped);

  // 8. Persistir: nodo del grafo
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
    return NextResponse.json({ error: nodoError.message }, { status: 500 });
  }

  // 9. Traza de la sesión MCI
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

  return NextResponse.json({
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
  });
}
