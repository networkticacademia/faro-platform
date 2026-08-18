import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import {
  construirPromptMarcoReferencial,
  CAMPOS_OBLIGATORIOS_MARCO_REFERENCIAL,
  type MarcoReferencialOutput,
} from "@/lib/faro/marcoReferencial";
import {
  calcularDeltaI, calcularOmega, calcularDeltaModulada, calcularLFaroReducida,
  calcularSeTauCompleto, calcularTauC, haConvergido,
  type ContradiccionDetectada,
} from "@/lib/faro/mci";
import { sincronizarPreguntasPendientes } from "@/lib/faro/preguntas";
import { verificarCircuitoAntesDeRegenerar } from "@/lib/faro/circuitoConvergencia";

export async function generarMarcoReferencialCore(
  supabase: SupabaseClient,
  params: { project_id: string; feedback?: string; fuentes_externas_verificadas?: string }
) {
  const { project_id, feedback, fuentes_externas_verificadas } = params;

  // Solo aplica a REGENERACIÓN (ya existe una iteración previa de
  // MARCO_REFERENCIAL para este proyecto) — la primera generación no
  // tiene nada que comparar todavía. Ver circuitoConvergencia.ts para
  // por qué NO se usa "feedback presente" como discriminador.
  await verificarCircuitoAntesDeRegenerar(supabase, project_id, "MARCO_REFERENCIAL");

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
    throw new Error("Se requiere un nodo RUTA confirmado antes de generar Marco Referencial.");
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
    throw new Error("Se requiere un nodo NOVA confirmado antes de generar Marco Referencial.");
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
    throw new Error("Se requiere un nodo OBJETIVOS confirmado antes de generar Marco Referencial.");
  }

  const rutaOutput = nodoRuta.contenido;
  const novaOutput = nodoNova.contenido;
  const objetivosOutput = nodoObjetivos.contenido;

  const { data: nodosPrevios } = await supabase
    .from("grafo_nodos")
    .select("iteracion")
    .eq("project_id", project_id)
    .eq("tipo", "MARCO_REFERENCIAL")
    .order("iteracion", { ascending: false })
    .limit(1);

  const iteracion = (nodosPrevios?.[0]?.iteracion ?? -1) + 1;

  const { data: corpusFuentes } = await supabase
    .from("corpus_fuentes")
    .select("doi, titulo, autores, anio, revista, resumen_hallazgo")
    .eq("project_id", project_id)
    .eq("estado_verificacion", "verificado");

  const corpusRSL =
    corpusFuentes && corpusFuentes.length > 0
      ? corpusFuentes
          .map(
            (f) =>
              `- ${f.autores ? f.autores + " " : ""}(${
                f.anio ?? "s.f."
              }). ${f.titulo}. ${f.revista ? f.revista + ". " : ""}${
                f.doi ? `DOI: ${f.doi}. ` : ""
              }${f.resumen_hallazgo ? `Hallazgos: ${f.resumen_hallazgo}` : ""}`
          )
          .join("\n")
      : undefined;

  const prompt = construirPromptMarcoReferencial({
    nu: project.nu,
    tau: project.tau,
    subtipoDti: project.subtipo_dti ?? null,
    rutaOutput,
    novaOutput,
    objetivosOutput,
    corpusRSL,
    fuentesExternasVerificadas: fuentes_externas_verificadas,
    feedbackIteracionAnterior: feedback,
  });

  const inicio = Date.now();
  const respuestaCruda = await llamarOrquestador(prompt);
  const marcoOutput = parsearJsonRespuesta<MarcoReferencialOutput>(respuestaCruda);
  const tiempoMs = Date.now() - inicio;

  const { data: contradiccionesEstructurales } = await supabase.rpc("detectar_contradicciones", {
    p_tau: project.tau,
    p_lambda_trl: project.lambda_trl,
    p_mu: project.mu,
  });
  const contradiccionesTyped = (contradiccionesEstructurales ?? []) as ContradiccionDetectada[];

  const deltaI = calcularDeltaI(marcoOutput);
  const omega = calcularOmega(marcoOutput, CAMPOS_OBLIGATORIOS_MARCO_REFERENCIAL);
  const deltaModulada = calcularDeltaModulada(contradiccionesTyped, project.u2_competencia_metodologica ?? 0);
  const lFaro = calcularLFaroReducida({ deltaI, omega, deltaModulada });
  const seTau = calcularSeTauCompleto({ nu: project.nu, u0: project.u0_initial });
  const tauC = calcularTauC(seTau);
  const convergio = haConvergido(lFaro, tauC, contradiccionesTyped);

  const { data: nodo, error: nodoError } = await supabase
    .from("grafo_nodos")
    .insert({
      project_id,
      tipo: "MARCO_REFERENCIAL",
      iteracion,
      contenido: marcoOutput,
      confianza_agente: marcoOutput.nivel_confianza_agente,
      preguntas_pendientes: marcoOutput.preguntas_para_el_usuario,
      delta_nodal: deltaI,
    })
    .select()
    .single();

  if (nodoError) {
    throw new Error(`Error al guardar nodo MARCO_REFERENCIAL: ${nodoError.message}`);
  }

  await supabase.from("sesiones_mci_log").insert({
    project_id,
    modulo: "MARCO_REFERENCIAL",
    iteracion,
    l_faro: lFaro,
    delta_nodal: { MARCO_REFERENCIAL: deltaI },
    omega,
    contradicciones: contradiccionesTyped,
    convergio,
    tiempo_ms: tiempoMs,
    modelo_usado: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6",
  });

  await sincronizarPreguntasPendientes(supabase, {
    project_id,
    nodo_id: nodo.id,
    nodo_tipo: "MARCO_REFERENCIAL",
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
  const { project_id, feedback, fuentes_externas_verificadas } = body;
  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  try {
    const resultado = await generarMarcoReferencialCore(supabase, { project_id, feedback, fuentes_externas_verificadas });
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
