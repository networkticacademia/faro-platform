import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import {
  MATRIZ_DEPENDENCIA,
  construirPromptVerificacionSemantica,
  type ResultadoCoherenciaPar,
  type HallazgoIncoherencia,
} from "@/lib/faro/verificadorSemantico";
import {
  construirPromptVerificacionCobertura,
  calcularPhi,
  type CoberturaItem,
} from "@/lib/faro/rubrica";
import { calcularConvergenciaProyecto } from "@/lib/faro/convergenciaProyecto";
import { verificarHiloConductor } from "@/lib/faro/verificadorEstructural";
import {
  calcularSeTauCompleto,
  calcularTauC,
  type ContradiccionDetectada,
} from "@/lib/faro/mci";
import { semanaFinalCronograma } from "@/lib/faro/metodologia";
import type { RutaOutput } from "@/lib/faro/ruta";
import type { NovaOutput } from "@/lib/faro/nova";
import type { ObjetivosOutput } from "@/lib/faro/objetivos";
import type { MetodologiaOutput } from "@/lib/faro/metodologia";
import type { MarcoReferencialOutput } from "@/lib/faro/marcoReferencial";
import type { ImpactosDelimitacionOutput } from "@/lib/faro/impactosDelimitacion";
import { NODOS_REQUERIDOS, resumirNodo, type NodoRequerido } from "@/lib/faro/resumenNodos";

interface NodoConfirmado {
  tipo: NodoRequerido;
  contenido: Record<string, unknown>;
  iteracion: number;
  confianza_agente: string | null;
  preguntas_pendientes: string[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id } = body;
  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  // 1. Cargar proyecto
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
  }

  // 2. Traer el último nodo CONFIRMADO de cada tipo (tipo → nodo confirmado más reciente)
  const { data: nodosRaw } = await supabase
    .from("grafo_nodos")
    .select("tipo, contenido, iteracion, confirmado_humano, confianza_agente, preguntas_pendientes")
    .eq("project_id", project_id)
    .eq("confirmado_humano", true)
    .in("tipo", [...NODOS_REQUERIDOS])
    .order("iteracion", { ascending: false });

  // Tomar el confirmado con mayor iteración por tipo
  const nodosConfirmados: Partial<Record<NodoRequerido, NodoConfirmado>> = {};
  for (const nodo of nodosRaw ?? []) {
    const tipo = nodo.tipo as NodoRequerido;
    if (!nodosConfirmados[tipo]) {
      nodosConfirmados[tipo] = {
        tipo,
        contenido: nodo.contenido as Record<string, unknown>,
        iteracion: nodo.iteracion,
        confianza_agente: nodo.confianza_agente ?? null,
        preguntas_pendientes: (nodo.preguntas_pendientes as string[]) ?? [],
      };
    }
  }

  const nodosConfirmadosTotal = Object.keys(nodosConfirmados).length;
  const nodosRequeridosTotal = NODOS_REQUERIDOS.length;

  // 3. Para cada nodo confirmado, traer el L_FARO de la sesión correspondiente
  //    a su iteración exacta (no la más reciente — ver decisión de diseño)
  const lFarosPorNodo: { nodo: string; l_faro: number; confianza_agente: string | null; num_preguntas_pendientes: number }[] = [];
  for (const [tipo, nodo] of Object.entries(nodosConfirmados) as [NodoRequerido, NodoConfirmado][]) {
    const { data: sesion } = await supabase
      .from("sesiones_mci_log")
      .select("l_faro")
      .eq("project_id", project_id)
      .eq("modulo", tipo)
      .eq("iteracion", nodo.iteracion)
      .single();
    if (sesion?.l_faro != null) {
      lFarosPorNodo.push({
        nodo: tipo,
        l_faro: sesion.l_faro,
        confianza_agente: nodo.confianza_agente,
        num_preguntas_pendientes: (nodo.preguntas_pendientes ?? []).length,
      });
    }
  }

  // 4. τc del proyecto
  const seTau = calcularSeTauCompleto({ nu: project.nu, u0: project.u0_initial ?? 0 });
  const tauCProyecto = calcularTauC(seTau);

  // 5. Brechas estructurales (determinístico, sin LLM)
  const brechasEstructurales = verificarHiloConductor({
    nova: nodosConfirmados["NOVA"]?.contenido as unknown as NovaOutput ?? null,
    objetivos: nodosConfirmados["OBJETIVOS"]?.contenido as unknown as ObjetivosOutput ?? null,
    metodologia: nodosConfirmados["METODOLOGIA"]?.contenido as unknown as MetodologiaOutput ?? null,
  });

  // 6. Contradicciones estructurales (función SQL)
  const { data: contradiccionesEstructurales } = await supabase.rpc("detectar_contradicciones", {
    p_tau: project.tau,
    p_lambda_trl: project.lambda_trl,
    p_mu: project.mu,
  });
  const contradicciones = (contradiccionesEstructurales ?? []) as ContradiccionDetectada[];

  // 7. Verificación semántica: evaluar los pares donde AMBOS nodos están confirmados
  const deltasIj: ResultadoCoherenciaPar[] = [];

  for (const par of MATRIZ_DEPENDENCIA) {
    const origen = nodosConfirmados[par.nodoOrigen as NodoRequerido];
    const destino = nodosConfirmados[par.nodoDestino as NodoRequerido];
    if (!origen || !destino) continue; // omitir par si algún nodo no está confirmado aún

    const contenidoOrigenResumido = resumirNodo(par.nodoOrigen as NodoRequerido, origen.contenido);
    const contenidoDestinoResumido = resumirNodo(par.nodoDestino as NodoRequerido, destino.contenido);

    const prompt = construirPromptVerificacionSemantica({
      par,
      contenidoOrigenResumido,
      contenidoDestinoResumido,
    });

    try {
      const respuestaCruda = await llamarOrquestador(prompt);
      const parsed = parsearJsonRespuesta<{
        delta_ij: number;
        hallazgos: HallazgoIncoherencia[];
        resumen: string;
      }>(respuestaCruda);

      deltasIj.push({
        nodoOrigen: par.nodoOrigen,
        nodoDestino: par.nodoDestino,
        delta_ij: parsed.delta_ij,
        hallazgos: parsed.hallazgos ?? [],
        resumen: parsed.resumen ?? "",
      });
    } catch {
      // Si un par falla, lo omitimos y el resultado será provisional
      // (es_provisional=true cuando promedio_delta_ij=null)
      continue;
    }
  }

  // 8. Verificación de cobertura de rúbrica (Φ) — solo si hay rúbrica cargada
  let phi: number | null = null;
  let phiDetalle: { itemsConsiderados: number; itemsSinPeso: number } | null = null;

  const rubrica = project.rubrica_evaluacion as {
    items?: { id: string; descripcion: string; peso: number | null; nodo_esperado: NodoRequerido[]; criterio_verificacion: string; es_enfoque_diferencial_territorial: boolean }[];
  } | null;

  if (rubrica?.items && rubrica.items.length > 0) {
    const coberturas: CoberturaItem[] = [];

    for (const item of rubrica.items) {
      // Extraer el contenido de todos los nodos esperados para este ítem
      const fragmentos: string[] = [];
      for (const nodoEsperado of item.nodo_esperado) {
        const nodo = nodosConfirmados[nodoEsperado];
        if (nodo) {
          fragmentos.push(`=== ${nodoEsperado} ===\n${resumirNodo(nodoEsperado, nodo.contenido)}`);
        }
      }
      if (fragmentos.length === 0) continue; // ningún nodo esperado confirmado aún

      const prompt = construirPromptVerificacionCobertura({
        item,
        contenidoNodoResumido: fragmentos.join("\n\n"),
      });

      try {
        const respuestaCruda = await llamarOrquestador(prompt);
        const parsed = parsearJsonRespuesta<{
          estado_cobertura: "cubierto" | "parcial" | "no_cubierto";
          evidencia_textual: string | null;
          justificacion: string;
        }>(respuestaCruda);

        coberturas.push({
          item_id: item.id,
          estado_cobertura: parsed.estado_cobertura,
          evidencia_textual: parsed.evidencia_textual ?? null,
          justificacion: parsed.justificacion ?? "",
        });
      } catch {
        continue;
      }
    }

    if (coberturas.length > 0) {
      const resultado = calcularPhi(
        rubrica.items as Parameters<typeof calcularPhi>[0],
        coberturas
      );
      phi = resultado.phi;
      phiDetalle = {
        itemsConsiderados: resultado.itemsConsiderados,
        itemsSinPeso: resultado.itemsSinPeso,
      };
    }
  }

  // 9. cronogramaExcedeDuracion — cálculo real usando semana_fin numérico de cada actividad.
  // semanaFinalCronograma() toma el máximo semana_fin (no la suma — actividades pueden correr en paralelo).
  let cronogramaExcedeDuracion: boolean | null = null;
  let mesesExcedidos: number | undefined = undefined;

  const nodoMetodologia = nodosConfirmados["METODOLOGIA"];
  const duracionMeses: number | null = project.duracion_meses_proyecto ?? null;

  if (nodoMetodologia && duracionMeses !== null) {
    const plan = (nodoMetodologia.contenido as unknown as MetodologiaOutput).plan_por_objetivo ?? [];
    const semanaFinal = semanaFinalCronograma(plan);
    const semanasDisponibles = duracionMeses * 4;
    if (semanaFinal > semanasDisponibles) {
      cronogramaExcedeDuracion = true;
      mesesExcedidos = Math.ceil((semanaFinal - semanasDisponibles) / 4);
    } else if (semanaFinal > 0) {
      // semanaFinal=0 significa que ninguna actividad tiene semana_fin definido (nodos generados
      // antes de agregar semana_inicio/fin) — en ese caso no se puede evaluar
      cronogramaExcedeDuracion = false;
    }
    // Si semanaFinal===0 (campos no definidos aún), cronogramaExcedeDuracion queda null
  }

  // 10. Calcular convergencia del proyecto
  const resultadoConvergencia = calcularConvergenciaProyecto({
    lFaroReducidaPorNodoConfirmado: lFarosPorNodo,
    tauCProyecto,
    deltasIj: deltasIj.length > 0 ? deltasIj : null,
    phi,
    brechasEstructurales,
    contradicciones,
    nodosRequeridosTotal,
    nodosConfirmadosTotal,
    cronogramaExcedeDuracion,
    mesesExcedidos,
  });

  // Adjuntar detalle de δᵢⱼ y Φ al resultado para guardarlo y mostrarlo
  const resultadoCompleto = {
    ...resultadoConvergencia,
    deltas_ij: deltasIj.length > 0 ? deltasIj : null,
    phi_detalle: phiDetalle,
  };

  // 11. Persistir (INSERT siempre — histórico completo, mismo patrón que sesiones_mci_log)
  const { error: insertError } = await supabase
    .from("convergencia_proyecto")
    .insert({
      project_id,
      resultado: resultadoCompleto,
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ resultado: resultadoCompleto });
}
