import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import {
  construirPromptMetodologia,
  ensamblarMatrizExtendida,
  CAMPOS_OBLIGATORIOS_METODOLOGIA,
  type MetodologiaOutput,
} from "@/lib/faro/metodologia";
import {
  calcularDeltaI, calcularOmega, calcularDeltaModulada, calcularLFaroReducida,
  calcularSeTauCompleto, calcularTauC, haConvergido,
  type ContradiccionDetectada,
} from "@/lib/faro/mci";
import { sincronizarPreguntasPendientes } from "@/lib/faro/preguntas";
import { construirContextoAcumulado } from "@/lib/faro/contextoAcumulado";
import { verificarCircuitoAntesDeRegenerar, CircuitoDetenidoError, type BypassCircuito } from "@/lib/faro/circuitoConvergencia";

export async function generarMetodologiaCore(
  supabase: SupabaseClient,
  params: { project_id: string; feedback?: string; bypassCircuito?: BypassCircuito }
) {
  const { project_id, feedback } = params;

  // Solo aplica a REGENERACIÓN (ya existe una iteración previa de
  // METODOLOGIA para este proyecto) — la primera generación no tiene
  // nada que comparar todavía. Ver circuitoConvergencia.ts para por qué
  // NO se usa "feedback presente" como discriminador.
  await verificarCircuitoAntesDeRegenerar(supabase, project_id, "METODOLOGIA", params.bypassCircuito);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single();

  if (projectError || !project) {
    throw new Error("Proyecto no encontrado.");
  }

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
    throw new Error("Se requiere un nodo RUTA confirmado antes de generar Metodología.");
  }

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
    throw new Error("Se requiere un nodo NOVA confirmado antes de generar Metodología.");
  }

  const { data: nodoObjetivos, error: errObjetivos } = await supabase
    .from("grafo_nodos")
    .select("*")
    .eq("project_id", project_id)
    .eq("tipo", "OBJETIVOS")
    .eq("confirmado_humano", true)
    .order("iteracion", { ascending: false })
    .limit(1)
    .single();

  if (errObjetivos || !nodoObjetivos) {
    throw new Error("Se requiere un nodo OBJETIVOS confirmado antes de generar Metodología.");
  }

  const rutaOutput = nodoRuta.contenido;
  const novaOutput = nodoNova.contenido;
  const objetivosOutput = nodoObjetivos.contenido;

  const { data: nodosPrevios } = await supabase
    .from("grafo_nodos")
    .select("iteracion")
    .eq("project_id", project_id)
    .eq("tipo", "METODOLOGIA")
    .order("iteracion", { ascending: false })
    .limit(1);

  const iteracion = (nodosPrevios?.[0]?.iteracion ?? -1) + 1;

  // Memoria entre iteraciones: sin esto, cada regeneración arranca de
  // cero y pierde las respuestas que el formulador ya dio a este nodo
  // (ver lib/faro/contextoAcumulado.ts).
  const hechosVerificados = await construirContextoAcumulado(supabase, project_id, "METODOLOGIA");

  const prompt = construirPromptMetodologia({
    nu: project.nu,
    tau: project.tau,
    rutaOutput,
    novaOutput,
    objetivosOutput,
    duracionMesesProyecto: project.duracion_meses_proyecto ?? null,
    feedbackIteracionAnterior: feedback,
    hechosVerificados,
  });

  const inicio = Date.now();
  const respuestaCruda = await llamarOrquestador(prompt);
  const metodologiaOutput = parsearJsonRespuesta<MetodologiaOutput>(respuestaCruda);
  const tiempoMs = Date.now() - inicio;

  const matrizExtendida = ensamblarMatrizExtendida(
    objetivosOutput.matriz_consistencia ?? [],
    metodologiaOutput.plan_por_objetivo
  );

  const { data: contradiccionesEstructurales } = await supabase.rpc("detectar_contradicciones", {
    p_tau: project.tau,
    p_lambda_trl: project.lambda_trl,
    p_mu: project.mu,
  });
  const contradiccionesTyped = (contradiccionesEstructurales ?? []) as ContradiccionDetectada[];

  const deltaI = calcularDeltaI(metodologiaOutput);
  const omega = calcularOmega(metodologiaOutput, CAMPOS_OBLIGATORIOS_METODOLOGIA);
  const deltaModulada = calcularDeltaModulada(contradiccionesTyped, project.u2_competencia_metodologica ?? 0);
  const lFaro = calcularLFaroReducida({ deltaI, omega, deltaModulada });
  const seTau = calcularSeTauCompleto({ nu: project.nu, u0: project.u0_initial });
  const tauC = calcularTauC(seTau);
  const convergio = haConvergido(lFaro, tauC, contradiccionesTyped);

  const { data: nodo, error: nodoError } = await supabase
    .from("grafo_nodos")
    .insert({
      project_id,
      tipo: "METODOLOGIA",
      iteracion,
      contenido: { ...metodologiaOutput, matriz_consistencia_extendida: matrizExtendida },
      confianza_agente: metodologiaOutput.nivel_confianza_agente,
      preguntas_pendientes: metodologiaOutput.preguntas_para_el_usuario,
      delta_nodal: deltaI,
    })
    .select()
    .single();

  if (nodoError) {
    throw new Error(`Error al guardar nodo METODOLOGIA: ${nodoError.message}`);
  }

  await supabase.from("sesiones_mci_log").insert({
    project_id,
    modulo: "METODOLOGIA",
    iteracion,
    l_faro: lFaro,
    delta_nodal: { METODOLOGIA: deltaI },
    omega,
    contradicciones: contradiccionesTyped,
    convergio,
    tiempo_ms: tiempoMs,
    modelo_usado: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6",
  });

  const { preguntas: preguntasSincronizadas } = await sincronizarPreguntasPendientes(supabase, {
    project_id,
    nodo_id: nodo.id,
    nodo_tipo: "METODOLOGIA",
    contenido: nodo.contenido,
  });

  return {
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
    matriz_consistencia_extendida: matrizExtendida,
    preguntas_sincronizadas: preguntasSincronizadas,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id, feedback, bypass_circuito } = body;
  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  try {
    const resultado = await generarMetodologiaCore(supabase, {
      project_id,
      feedback,
      bypassCircuito: bypass_circuito ? { confirmadoPor: user.email ?? user.id } : undefined,
    });
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof CircuitoDetenidoError) {
      return NextResponse.json({
        circuito_detenido: true,
        motivo_circuito: e.circuito.motivo,
        detalle_l_faro_por_nodo: e.circuito.ultimo_detalle_l_faro_por_nodo,
      });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
