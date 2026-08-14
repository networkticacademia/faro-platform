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
import type { RutaOutput } from "@/lib/faro/ruta";
import type { NovaOutput } from "@/lib/faro/nova";
import type { ObjetivosOutput } from "@/lib/faro/objetivos";
import type { MetodologiaOutput } from "@/lib/faro/metodologia";
import type { MarcoReferencialOutput } from "@/lib/faro/marcoReferencial";
import type { ImpactosDelimitacionOutput } from "@/lib/faro/impactosDelimitacion";

// Tipos de nodo soportados en esta verificación
const NODOS_REQUERIDOS = [
  "RUTA",
  "NOVA",
  "OBJETIVOS",
  "METODOLOGIA",
  "MARCO_REFERENCIAL",
  "IMPACTOS_DELIMITACION",
] as const;

type NodoRequerido = typeof NODOS_REQUERIDOS[number];

interface NodoConfirmado {
  tipo: NodoRequerido;
  contenido: Record<string, unknown>;
  iteracion: number;
}

// ============================================================
// Extractores de contenido resumido por nodo
// Principio: mandar solo los campos que el verificador necesita
// para evaluar la relación semántica — no el JSON completo.
// ============================================================

function resumirRuta(c: RutaOutput): string {
  return [
    `Problema central: ${c.problema}`,
    `Objeto de estudio: ${c.objeto_estudio}`,
    `Población/contexto: ${c.poblacion_contexto}`,
    `Alcance espacial: ${c.alcance_espacial}`,
    `Alcance temporal: ${c.alcance_temporal}`,
  ].join("\n");
}

function resumirNova(c: NovaOutput): string {
  const causas = (c.nucleo_causas_estructuradas ?? [])
    .map((ca) => `${ca.id} [${ca.tipo}]: ${ca.texto}`)
    .join("\n");
  return [
    `Problema formulado: ${c.problema_formulado ?? ""}`,
    `Causas estructuradas:\n${causas}`,
  ].join("\n\n");
}

function resumirObjetivos(c: ObjetivosOutput): string {
  const oes = (c.objetivos_especificos ?? [])
    .map((oe) => `${oe.id}: ${oe.texto} (causa_id: ${oe.causa_id ?? "null"}, causa_asociada: ${oe.causa_asociada ?? "null"})`)
    .join("\n");
  const vars = (c.variables ?? [])
    .map((v) => `${v.id} — ${v.nombre} (${v.tipo}, ${v.nivel_medicion}): ${v.definicion_conceptual}`)
    .join("\n");
  const cats = (c.categorias_analisis ?? [])
    .map((cat) => `${cat.id} — ${cat.nombre}: ${cat.definicion}`)
    .join("\n");
  return [
    `Objetivo general: ${c.objetivo_general}`,
    `Objetivos específicos:\n${oes}`,
    vars ? `Variables:\n${vars}` : "",
    cats ? `Categorías de análisis:\n${cats}` : "",
  ].filter(Boolean).join("\n\n");
}

function resumirMetodologia(c: MetodologiaOutput): string {
  const plan = (c.plan_por_objetivo ?? [])
    .map((p) => {
      const productos = (p.productos ?? [])
        .map((prod) => {
          const acts = (prod.actividades ?? []).map((a) => `    - ${a.actividad}`).join("\n");
          return `  Producto: ${prod.nombre_producto}\n${acts}`;
        })
        .join("\n");
      return `${p.objetivo_id} (${p.objetivo_especifico.slice(0, 80)}...):\n${productos}`;
    })
    .join("\n\n");
  const tecnicas = (c.tecnicas_instrumentos ?? [])
    .map((t) => `- ${t.tecnica}: ${t.instrumento}`)
    .join("\n");
  return [
    `Técnicas/instrumentos:\n${tecnicas}`,
    `Plan por objetivo:\n${plan}`,
  ].join("\n\n");
}

function resumirMarcoReferencial(c: MarcoReferencialOutput): string {
  const defs = (c.marco_conceptual?.definiciones ?? [])
    .map((d) => `  ${d.termino} (variable_o_categoria_id: ${d.variable_o_categoria_id ?? "null"}): ${d.definicion}`)
    .join("\n");
  return [
    `Marco teórico — postura: ${c.marco_teorico?.postura_teorica ?? ""}`,
    `Marco teórico — teorías sustantivas: ${(c.marco_teorico?.teorias_sustantivas ?? []).join(", ")}`,
    `Marco conceptual — definiciones:\n${defs || "(ninguna)"}`,
  ].join("\n\n");
}

function resumirImpactosDelimitacion(c: ImpactosDelimitacionOutput): string {
  const impactos = (c.impactos ?? [])
    .map((i) => `- [${i.tipo}] ${i.descripcion}`)
    .join("\n");
  const recursos = (c.recursos ?? [])
    .map((r) => `- [${r.categoria}] ${r.descripcion}`)
    .join("\n");
  const riesgos = (c.riesgos ?? [])
    .map((r) => `- ${r.descripcion} (prob: ${r.probabilidad}, impacto: ${r.impacto})`)
    .join("\n");
  return [
    `Impactos:\n${impactos || "(ninguno)"}`,
    `Recursos:\n${recursos || "(ninguno)"}`,
    `Riesgos:\n${riesgos || "(ninguno)"}`,
  ].join("\n\n");
}

// Despacha el resumidor correcto según el tipo de nodo
function resumirNodo(tipo: NodoRequerido, contenido: Record<string, unknown>): string {
  switch (tipo) {
    case "RUTA":           return resumirRuta(contenido as unknown as RutaOutput);
    case "NOVA":           return resumirNova(contenido as unknown as NovaOutput);
    case "OBJETIVOS":      return resumirObjetivos(contenido as unknown as ObjetivosOutput);
    case "METODOLOGIA":    return resumirMetodologia(contenido as unknown as MetodologiaOutput);
    case "MARCO_REFERENCIAL": return resumirMarcoReferencial(contenido as unknown as MarcoReferencialOutput);
    case "IMPACTOS_DELIMITACION": return resumirImpactosDelimitacion(contenido as unknown as ImpactosDelimitacionOutput);
  }
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
    .select("tipo, contenido, iteracion, confirmado_humano")
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
      };
    }
  }

  const nodosConfirmadosTotal = Object.keys(nodosConfirmados).length;
  const nodosRequeridosTotal = NODOS_REQUERIDOS.length;

  // 3. Para cada nodo confirmado, traer el L_FARO de la sesión correspondiente
  //    a su iteración exacta (no la más reciente — ver decisión de diseño)
  const lFarosPorNodo: number[] = [];
  for (const [tipo, nodo] of Object.entries(nodosConfirmados) as [NodoRequerido, NodoConfirmado][]) {
    const { data: sesion } = await supabase
      .from("sesiones_mci_log")
      .select("l_faro")
      .eq("project_id", project_id)
      .eq("modulo", tipo)
      .eq("iteracion", nodo.iteracion)
      .single();
    if (sesion?.l_faro != null) {
      lFarosPorNodo.push(sesion.l_faro);
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

  // 9. cronogramaExcedeDuracion: pendiente de estructurar tiempo_estimado como semanas numéricas.
  // Los campos tiempo_estimado de Metodología son texto libre ("Semanas 1-3", etc.) — no es posible
  // sumarlos de forma confiable sin parseo frágil. Se deja null hasta que se estructure ese campo.
  const cronogramaExcedeDuracion: boolean | null = null;

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
