import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import {
  construirPromptImpactosDelimitacion,
  CAMPOS_OBLIGATORIOS_IMPACTOS_DELIMITACION,
  type ImpactosDelimitacionOutput,
} from "@/lib/faro/impactosDelimitacion";
import {
  calcularDeltaI, calcularOmega, calcularDeltaModulada, calcularLFaroReducida,
  calcularSeTauCompleto, calcularTauC, haConvergido,
  type ContradiccionDetectada,
} from "@/lib/faro/mci";
import { sincronizarPreguntasPendientes } from "@/lib/faro/preguntas";
import { construirContextoAcumulado } from "@/lib/faro/contextoAcumulado";
import { verificarCircuitoAntesDeRegenerar, CircuitoDetenidoError, type BypassCircuito } from "@/lib/faro/circuitoConvergencia";

export async function generarImpactosCore(
  supabase: SupabaseClient,
  params: { project_id: string; feedback?: string; bypassCircuito?: BypassCircuito }
) {
  const { project_id, feedback } = params;

  // Solo aplica a REGENERACIÓN (ya existe una iteración previa de
  // IMPACTOS_DELIMITACION para este proyecto) — la primera generación no
  // tiene nada que comparar todavía. Ver circuitoConvergencia.ts para
  // por qué NO se usa "feedback presente" como discriminador.
  await verificarCircuitoAntesDeRegenerar(supabase, project_id, "IMPACTOS_DELIMITACION", params.bypassCircuito);

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
    throw new Error("Se requiere un nodo RUTA confirmado antes de generar Impactos y Delimitación.");
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
    throw new Error("Se requiere un nodo NOVA confirmado antes de generar Impactos y Delimitación.");
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
    throw new Error("Se requiere un nodo OBJETIVOS confirmado antes de generar Impactos y Delimitación.");
  }

  const { data: nodoMetodologia, error: errMetodologia } = await supabase
    .from("grafo_nodos")
    .select("*")
    .eq("project_id", project_id)
    .eq("tipo", "METODOLOGIA")
    .eq("confirmado_humano", true)
    .order("iteracion", { ascending: false })
    .limit(1)
    .single();

  if (errMetodologia || !nodoMetodologia) {
    throw new Error("Se requiere un nodo METODOLOGIA confirmado antes de generar Impactos y Delimitación.");
  }

  const rutaOutput = nodoRuta.contenido;
  const novaOutput = nodoNova.contenido;
  const objetivosOutput = nodoObjetivos.contenido;
  const metodologiaOutput = nodoMetodologia.contenido;

  const { data: nodosPrevios } = await supabase
    .from("grafo_nodos")
    .select("iteracion")
    .eq("project_id", project_id)
    .eq("tipo", "IMPACTOS_DELIMITACION")
    .order("iteracion", { ascending: false })
    .limit(1);

  const iteracion = (nodosPrevios?.[0]?.iteracion ?? -1) + 1;

  // Memoria entre iteraciones: sin esto, cada regeneración arranca de
  // cero y pierde las respuestas que el formulador ya dio a este nodo
  // (ver lib/faro/contextoAcumulado.ts).
  const hechosVerificados = await construirContextoAcumulado(supabase, project_id, "IMPACTOS");

  const prompt = construirPromptImpactosDelimitacion({
    nu: project.nu,
    tau: project.tau,
    subtipoDti: project.subtipo_dti ?? null,
    duracionMesesProyecto: project.duracion_meses_proyecto ?? null,
    rutaOutput,
    novaOutput,
    objetivosOutput,
    metodologiaOutput,
    feedbackIteracionAnterior: feedback,
    hechosVerificados,
  });

  const inicio = Date.now();
  const respuestaCruda = await llamarOrquestador(prompt);
  const impactosOutput = parsearJsonRespuesta<ImpactosDelimitacionOutput>(respuestaCruda);
  const tiempoMs = Date.now() - inicio;

  const { data: contradiccionesEstructurales } = await supabase.rpc("detectar_contradicciones", {
    p_tau: project.tau,
    p_lambda_trl: project.lambda_trl,
    p_mu: project.mu,
  });
  const contradiccionesTyped = (contradiccionesEstructurales ?? []) as ContradiccionDetectada[];

  const deltaI = calcularDeltaI(impactosOutput);
  const omega = calcularOmega(impactosOutput, CAMPOS_OBLIGATORIOS_IMPACTOS_DELIMITACION);
  const deltaModulada = calcularDeltaModulada(contradiccionesTyped, project.u2_competencia_metodologica ?? 0);
  const lFaro = calcularLFaroReducida({ deltaI, omega, deltaModulada });
  const seTau = calcularSeTauCompleto({ nu: project.nu, u0: project.u0_initial });
  const tauC = calcularTauC(seTau);
  const convergio = haConvergido(lFaro, tauC, contradiccionesTyped);

  const { data: nodo, error: nodoError } = await supabase
    .from("grafo_nodos")
    .insert({
      project_id,
      tipo: "IMPACTOS_DELIMITACION",
      iteracion,
      contenido: impactosOutput,
      confianza_agente: impactosOutput.nivel_confianza_agente,
      preguntas_pendientes: impactosOutput.preguntas_para_el_usuario,
      delta_nodal: deltaI,
    })
    .select()
    .single();

  if (nodoError) {
    throw new Error(`Error al guardar nodo IMPACTOS_DELIMITACION: ${nodoError.message}`);
  }

  await supabase.from("sesiones_mci_log").insert({
    project_id,
    modulo: "IMPACTOS_DELIMITACION",
    iteracion,
    l_faro: lFaro,
    delta_nodal: { IMPACTOS_DELIMITACION: deltaI },
    omega,
    contradicciones: contradiccionesTyped,
    convergio,
    tiempo_ms: tiempoMs,
    modelo_usado: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6",
  });

  const { preguntas: preguntasSincronizadas } = await sincronizarPreguntasPendientes(supabase, {
    project_id,
    nodo_id: nodo.id,
    nodo_tipo: "IMPACTOS",
    contenido: nodo.contenido,
  });

  return {
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
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
    const resultado = await generarImpactosCore(supabase, {
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
