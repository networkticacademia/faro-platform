import type { SupabaseClient } from "@supabase/supabase-js";
import { construirPromptRuta, type RutaOutput } from "@/lib/faro/ruta";
import { construirPromptNova, asignarIdsNova, CAMPOS_OBLIGATORIOS_NOVA, type NovaOutput } from "@/lib/faro/nova";
import {
  construirPromptObjetivos,
  camposObligatoriosParaEnfoque,
  ensamblarMatrizConsistencia,
  asignarIdsObjetivos,
  estructuraSegunEnfoque,
  type ObjetivosOutput,
} from "@/lib/faro/objetivos";
import {
  construirPromptMetodologia,
  ensamblarMatrizExtendida,
  CAMPOS_OBLIGATORIOS_METODOLOGIA,
  type MetodologiaOutput,
} from "@/lib/faro/metodologia";
import {
  construirPromptMarcoReferencial,
  CAMPOS_OBLIGATORIOS_MARCO_REFERENCIAL,
  type MarcoReferencialOutput,
} from "@/lib/faro/marcoReferencial";
import {
  construirPromptImpactosDelimitacion,
  CAMPOS_OBLIGATORIOS_IMPACTOS_DELIMITACION,
  type ImpactosDelimitacionOutput,
} from "@/lib/faro/impactosDelimitacion";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import {
  calcularDeltaI,
  calcularOmega,
  CAMPOS_OBLIGATORIOS_RUTA,
  calcularDeltaModulada,
  calcularLFaroReducida,
  calcularSeTauCompleto,
  calcularTauC,
  haConvergido,
  type ContradiccionDetectada,
} from "@/lib/faro/mci";
import { proponerCadenaBusqueda } from "@/lib/faro/rsl/cadenaBusqueda";
import { sincronizarPreguntasPendientes } from "@/lib/faro/preguntas";
import { construirContextoAcumulado } from "@/lib/faro/contextoAcumulado";
import { verificarCircuitoAntesDeRegenerar, type BypassCircuito } from "@/lib/faro/circuitoConvergencia";

export async function generarRutaCore(
  supabase: SupabaseClient,
  params: { project_id: string; feedback?: string; bypassCircuito?: BypassCircuito }
) {
  const { project_id, feedback } = params;

  await verificarCircuitoAntesDeRegenerar(supabase, project_id, "RUTA", params.bypassCircuito);

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

  const hechosVerificados = await construirContextoAcumulado(supabase, project_id, "RUTA");

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
    hechosVerificados,
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
      contenido_origen: rutaOutput,
      contenido_presentacion: rutaOutput,
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

  const { preguntas: preguntasSincronizadas } = await sincronizarPreguntasPendientes(supabase, {
    project_id,
    nodo_id: nodo.id,
    nodo_tipo: "RUTA",
    contenido: (nodo.contenido_origen ?? nodo.contenido) as Record<string, unknown>,
    iteracion,
  });

  return {
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
    propuesta_busqueda: propuestaBusqueda,
    preguntas_sincronizadas: preguntasSincronizadas,
  };
}

export async function generarNovaCore(
  supabase: SupabaseClient,
  params: { project_id: string; feedback?: string; bypassCircuito?: BypassCircuito }
) {
  const { project_id, feedback } = params;

  await verificarCircuitoAntesDeRegenerar(supabase, project_id, "NOVA", params.bypassCircuito);

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
  const rutaOutput = (nodoRuta.contenido_origen ?? nodoRuta.contenido) as RutaOutput;

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

  const hechosVerificados = await construirContextoAcumulado(supabase, project_id, "NOVA");

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
    hechosVerificados,
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
      contenido_origen: novaOutput,
      contenido_presentacion: novaOutput,
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

  const { preguntas: preguntasSincronizadas } = await sincronizarPreguntasPendientes(supabase, {
    project_id,
    nodo_id: nodo.id,
    nodo_tipo: "NOVA",
    contenido: (nodo.contenido_origen ?? nodo.contenido) as Record<string, unknown>,
    iteracion,
  });

  return {
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
    preguntas_sincronizadas: preguntasSincronizadas,
  };
}

export async function generarObjetivosCore(
  supabase: SupabaseClient,
  params: { project_id: string; feedback?: string; bypassCircuito?: BypassCircuito }
) {
  const { project_id, feedback } = params;

  await verificarCircuitoAntesDeRegenerar(supabase, project_id, "OBJETIVOS", params.bypassCircuito);

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
    throw new Error("Se requiere un nodo RUTA confirmado antes de generar Objetivos.");
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
    throw new Error("Se requiere un nodo NOVA confirmado antes de generar Objetivos.");
  }

  const rutaOutput = (nodoRuta.contenido_origen ?? nodoRuta.contenido) as RutaOutput;
  const novaOutput = (nodoNova.contenido_origen ?? nodoNova.contenido) as NovaOutput;

  const { data: nodosPrevios } = await supabase
    .from("grafo_nodos")
    .select("iteracion")
    .eq("project_id", project_id)
    .eq("tipo", "OBJETIVOS")
    .order("iteracion", { ascending: false })
    .limit(1);

  const iteracion = (nodosPrevios?.[0]?.iteracion ?? -1) + 1;

  const hechosVerificados = await construirContextoAcumulado(supabase, project_id, "OBJETIVOS");

  const prompt = construirPromptObjetivos({
    nu: project.nu,
    mu: project.mu,
    rutaOutput,
    novaOutput,
    duracionMesesProyecto: project.duracion_meses_proyecto ?? null,
    feedbackIteracionAnterior: feedback,
    hechosVerificados,
  });

  const inicio = Date.now();
  const respuestaCruda = await llamarOrquestador(prompt);
  let objetivosOutput = parsearJsonRespuesta<ObjetivosOutput>(respuestaCruda);
  objetivosOutput = asignarIdsObjetivos(objetivosOutput);
  const tiempoMs = Date.now() - inicio;

  const enfoque = estructuraSegunEnfoque(project.mu);
  const camposObligatorios = camposObligatoriosParaEnfoque(enfoque);
  const matrizConsistencia = ensamblarMatrizConsistencia(objetivosOutput);

  const { data: contradiccionesEstructurales } = await supabase.rpc("detectar_contradicciones", {
    p_tau: project.tau,
    p_lambda_trl: project.lambda_trl,
    p_mu: project.mu,
  });
  const contradiccionesTyped = (contradiccionesEstructurales ?? []) as ContradiccionDetectada[];

  const deltaI = calcularDeltaI(objetivosOutput);
  const omega = calcularOmega(objetivosOutput, camposObligatorios);
  const deltaModulada = calcularDeltaModulada(contradiccionesTyped, project.u2_competencia_metodologica ?? 0);
  const lFaro = calcularLFaroReducida({ deltaI, omega, deltaModulada });
  const seTau = calcularSeTauCompleto({ nu: project.nu, u0: project.u0_initial });
  const tauC = calcularTauC(seTau);
  const convergio = haConvergido(lFaro, tauC, contradiccionesTyped);

  const { data: nodo, error: nodoError } = await supabase
    .from("grafo_nodos")
    .insert({
      project_id,
      tipo: "OBJETIVOS",
      iteracion,
      contenido_origen: { ...objetivosOutput, matriz_consistencia: matrizConsistencia },
      contenido_presentacion: { ...objetivosOutput, matriz_consistencia: matrizConsistencia },
      confianza_agente: objetivosOutput.nivel_confianza_agente,
      preguntas_pendientes: objetivosOutput.preguntas_para_el_usuario,
      delta_nodal: deltaI,
    })
    .select()
    .single();

  if (nodoError) {
    throw new Error(`Error al guardar nodo OBJETIVOS: ${nodoError.message}`);
  }

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

  const { preguntas: preguntasSincronizadas } = await sincronizarPreguntasPendientes(supabase, {
    project_id,
    nodo_id: nodo.id,
    nodo_tipo: "OBJETIVOS",
    contenido: (nodo.contenido_origen ?? nodo.contenido) as Record<string, unknown>,
    iteracion,
  });

  return {
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
    matriz_consistencia: matrizConsistencia,
    preguntas_sincronizadas: preguntasSincronizadas,
  };
}

export async function generarMetodologiaCore(
  supabase: SupabaseClient,
  params: { project_id: string; feedback?: string; bypassCircuito?: BypassCircuito }
) {
  const { project_id, feedback } = params;

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

  const rutaOutput = (nodoRuta.contenido_origen ?? nodoRuta.contenido) as RutaOutput;
  const novaOutput = (nodoNova.contenido_origen ?? nodoNova.contenido) as NovaOutput;
  const objetivosOutput = (nodoObjetivos.contenido_origen ?? nodoObjetivos.contenido) as ObjetivosOutput;

  const { data: nodosPrevios } = await supabase
    .from("grafo_nodos")
    .select("iteracion")
    .eq("project_id", project_id)
    .eq("tipo", "METODOLOGIA")
    .order("iteracion", { ascending: false })
    .limit(1);

  const iteracion = (nodosPrevios?.[0]?.iteracion ?? -1) + 1;

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
    (objetivosOutput as any).matriz_consistencia ?? [],
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
      contenido_origen: { ...metodologiaOutput, matriz_consistencia_extendida: matrizExtendida },
      contenido_presentacion: { ...metodologiaOutput, matriz_consistencia_extendida: matrizExtendida },
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
    contenido: (nodo.contenido_origen ?? nodo.contenido) as Record<string, unknown>,
    iteracion,
  });

  return {
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
    matriz_consistencia_extendida: matrizExtendida,
    preguntas_sincronizadas: preguntasSincronizadas,
  };
}

export async function generarMarcoReferencialCore(
  supabase: SupabaseClient,
  params: {
    project_id: string;
    feedback?: string;
    fuentes_externas_verificadas?: string;
    bypassCircuito?: BypassCircuito;
  }
) {
  const { project_id, feedback, fuentes_externas_verificadas } = params;

  await verificarCircuitoAntesDeRegenerar(supabase, project_id, "MARCO_REFERENCIAL", params.bypassCircuito);

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

  const rutaOutput = (nodoRuta.contenido_origen ?? nodoRuta.contenido) as RutaOutput;
  const novaOutput = (nodoNova.contenido_origen ?? nodoNova.contenido) as NovaOutput;
  const objetivosOutput = (nodoObjetivos.contenido_origen ?? nodoObjetivos.contenido) as ObjetivosOutput;

  const { data: verificacionesRSL } = await supabase
    .from("verificaciones_rsl")
    .select("sintesis_narrativa")
    .eq("nodo_id", nodoRuta.id)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  const hechosVerificados = await construirContextoAcumulado(supabase, project_id, "MARCO_REFERENCIAL");

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
    hechosVerificados,
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
      contenido_origen: marcoOutput,
      contenido_presentacion: marcoOutput,
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

  const { preguntas: preguntasSincronizadas } = await sincronizarPreguntasPendientes(supabase, {
    project_id,
    nodo_id: nodo.id,
    nodo_tipo: "MARCO_REFERENCIAL",
    contenido: (nodo.contenido_origen ?? nodo.contenido) as Record<string, unknown>,
    iteracion,
  });

  return {
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
    preguntas_sincronizadas: preguntasSincronizadas,
  };
}

export async function generarImpactosDelimitacionCore(
  supabase: SupabaseClient,
  params: { project_id: string; feedback?: string; bypassCircuito?: BypassCircuito }
) {
  const { project_id, feedback } = params;

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
    throw new Error("Se requiere un nodo RUTA confirmado antes de generar Impactos.");
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
    throw new Error("Se requiere un nodo NOVA confirmado antes de generar Impactos.");
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
    throw new Error("Se requiere un nodo OBJETIVOS confirmado antes de generar Impactos.");
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
    throw new Error("Se requiere un nodo METODOLOGIA confirmado antes de generar Impactos.");
  }

  const rutaOutput = (nodoRuta.contenido_origen ?? nodoRuta.contenido) as RutaOutput;
  const novaOutput = (nodoNova.contenido_origen ?? nodoNova.contenido) as NovaOutput;
  const objetivosOutput = (nodoObjetivos.contenido_origen ?? nodoObjetivos.contenido) as ObjetivosOutput;
  const metodologiaOutput = (nodoMetodologia.contenido_origen ?? nodoMetodologia.contenido) as MetodologiaOutput;

  const { data: nodosPrevios } = await supabase
    .from("grafo_nodos")
    .select("iteracion")
    .eq("project_id", project_id)
    .eq("tipo", "IMPACTOS_DELIMITACION")
    .order("iteracion", { ascending: false })
    .limit(1);

  const iteracion = (nodosPrevios?.[0]?.iteracion ?? -1) + 1;

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
      contenido_origen: impactosOutput,
      contenido_presentacion: impactosOutput,
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
    contenido: (nodo.contenido_origen ?? nodo.contenido) as Record<string, unknown>,
    iteracion,
  });

  return {
    nodo,
    metrica: { deltaI, omega, deltaModulada, lFaro, seTau, tauC, convergio, contradicciones: contradiccionesTyped },
    preguntas_sincronizadas: preguntasSincronizadas,
  };
}

// Alias para compatibilidad hacia atrás con endpoints y propagación existentes
export const generarImpactosCore = generarImpactosDelimitacionCore;
