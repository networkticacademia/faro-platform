// ============================================================
// FARO — Convergencia de proyecto completo
//
// Agrega, de forma determinística, todo lo que ya se calculó en otras
// piezas (L_FARO por nodo, δᵢⱼ semántico, Φ de rúbrica, brechas
// estructurales, contradicciones) en una sola definición de "¿este
// proyecto converge?" — con explicación de POR QUÉ, no solo un booleano.
//
// PESOS PROVISIONALES: hasta tener el banco de +20 proyectos de
// Minciencias para calibración estadística real (ya documentado en
// arquitectura de FARO), se usan pesos iguales/simples, declarados
// explícitamente como provisionales — no se presentan como definitivos.
// ============================================================

import type { ResultadoCoherenciaPar } from "./verificadorSemantico";
import type { BrechaTrazabilidad } from "./verificadorEstructural";
import type { ContradiccionDetectada } from "./mci";

// Pesos provisionales — declarados aparte para que sea fácil ajustarlos
// cuando haya datos reales de calibración, sin tocar la lógica.
export const PESO_DELTA_IJ_PROVISIONAL = 0.3;
export const PESO_PHI_PROVISIONAL = 0.3;

// Desglose por nodo — para poder decirle al formulador CUÁL nodo corregir,
// no solo que el total supera el umbral.
export interface DetalleLFaroNodo {
  nodo: string;
  l_faro: number;
  confianza_agente: string | null;
  num_preguntas_pendientes: number;
  sugerencia: string; // texto accionable, calculated aquí mismo, determinístico
}

function generarSugerenciaNodo(d: { l_faro: number; confianza_agente: string | null; num_preguntas_pendientes: number }): string {
  if (d.num_preguntas_pendientes > 0) {
    return `Tiene ${d.num_preguntas_pendientes} pregunta(s) sin resolver — respóndalas y regenere con esa información como retroalimentación.`;
  }
  if (d.confianza_agente === "baja") {
    return `El agente declaró confianza baja al generarlo — revise el contenido con cuidado y considere regenerar con instrucciones más específicas.`;
  }
  if (d.confianza_agente === "media") {
    return `Confianza media del agente — revise si hay algo impreciso y regenere con feedback puntual si es necesario.`;
  }
  return `L_FARO individual alto sin causa evidente declarada — revise el contenido manualmente, puede haber una contradicción con RSL (Δ) no resuelta.`;
}

export function ordenarNodosPorContribucion(detalles: DetalleLFaroNodo[]): DetalleLFaroNodo[] {
  return [...detalles].sort((a, b) => b.l_faro - a.l_faro);
}

export interface CondicionConvergencia {
  id: "completitud" | "l_faro" | "estructural" | "contradicciones" | "cronograma";
  nombre: string;
  cumple: boolean;
  explicacion: string; // específica, no genérica — dice QUÉ falta exactamente
}

export interface ResultadoConvergenciaProyecto {
  convergio: boolean;
  l_faro_proyecto: number;
  tau_c_proyecto: number;
  condiciones: CondicionConvergencia[];
  phi: number | null; // null si no hay rúbrica cargada
  promedio_delta_ij: number | null; // null si no se ha corrido la verificación semántica
  es_provisional: boolean; // true mientras falten piezas (δᵢⱼ o Φ no calculados)
  detalle_l_faro_por_nodo: DetalleLFaroNodo[]; // ordenado de mayor a menor contribución — para saber QUÉ nodo corregir primero
}

export function calcularConvergenciaProyecto(params: {
  lFaroReducidaPorNodoConfirmado: { nodo: string; l_faro: number; confianza_agente: string | null; num_preguntas_pendientes: number }[];
  tauCProyecto: number;
  deltasIj: ResultadoCoherenciaPar[] | null; // null = todavía no se corrió esta verificación
  phi: number | null; // null = no hay rúbrica cargada, no se computó
  brechasEstructurales: BrechaTrazabilidad[];
  contradicciones: ContradiccionDetectada[];
  nodosRequeridosTotal: number;
  nodosConfirmadosTotal: number;
  cronogramaExcedeDuracion: boolean | null; // null = duración no confirmada todavía, no se puede evaluar
  mesesExcedidos?: number;
}): ResultadoConvergenciaProyecto {
  const {
    lFaroReducidaPorNodoConfirmado, tauCProyecto, deltasIj, phi,
    brechasEstructurales, contradicciones,
    nodosRequeridosTotal, nodosConfirmadosTotal,
    cronogramaExcedeDuracion, mesesExcedidos,
  } = params;

  const promedioLFaroNodos =
    lFaroReducidaPorNodoConfirmado.length > 0
      ? lFaroReducidaPorNodoConfirmado.reduce((a, b) => a + b.l_faro, 0) / lFaroReducidaPorNodoConfirmado.length
      : 0;

  const promedioDeltaIj =
    deltasIj && deltasIj.length > 0
      ? deltasIj.reduce((acc, d) => acc + d.delta_ij, 0) / deltasIj.length
      : null;

  // L_FARO_proyecto = promedio(L_FARO_reducida por nodo) + término δᵢⱼ (si existe) + término Φ (si existe, resta porque más cobertura = mejor)
  let lFaroProyecto = promedioLFaroNodos;
  if (promedioDeltaIj !== null) {
    lFaroProyecto += promedioDeltaIj * PESO_DELTA_IJ_PROVISIONAL;
  }
  if (phi !== null) {
    // Φ alto (buena cobertura de rúbrica) DEBE bajar L_FARO_proyecto (mejor convergencia)
    lFaroProyecto += (1 - phi) * PESO_PHI_PROVISIONAL;
  }

  const brechasCriticas = brechasEstructurales.filter((b) => b.severidad === "critica");
  const contradiccionesAbiertas = contradicciones.filter((c) => c.nivel === "L2" || c.nivel === "L3");

  const condiciones: CondicionConvergencia[] = [
    {
      id: "completitud",
      nombre: "Completitud de nodos",
      cumple: nodosConfirmadosTotal >= nodosRequeridosTotal,
      explicacion:
        nodosConfirmadosTotal >= nodosRequeridosTotal
          ? `Los ${nodosRequeridosTotal} nodos requeridos están confirmados.`
          : `Faltan ${nodosRequeridosTotal - nodosConfirmadosTotal} nodo(s) por confirmar (${nodosConfirmadosTotal}/${nodosRequeridosTotal}).`,
    },
    {
      id: "l_faro",
      nombre: "L_FARO del proyecto ≤ τc",
      cumple: lFaroProyecto <= tauCProyecto,
      explicacion:
        lFaroProyecto <= tauCProyecto
          ? `L_FARO_proyecto (${lFaroProyecto.toFixed(3)}) está dentro del umbral τc (${tauCProyecto.toFixed(3)}).`
          : `L_FARO_proyecto (${lFaroProyecto.toFixed(3)}) supera el umbral τc (${tauCProyecto.toFixed(3)}) — el proyecto todavía tiene incertidumbre acumulada por encima de lo aceptable para su nivel.`,
    },
    {
      id: "estructural",
      nombre: "Sin brechas estructurales críticas",
      cumple: brechasCriticas.length === 0,
      explicacion:
        brechasCriticas.length === 0
          ? "No hay referencias por ID rotas entre nodos."
          : `${brechasCriticas.length} referencia(s) por ID rota(s) entre nodos (ver Integridad del hilo conductor) — probablemente nodos generados antes de regenerar la cadena completa.`,
    },
    {
      id: "contradicciones",
      nombre: "Sin contradicciones estructurales abiertas",
      cumple: contradiccionesAbiertas.length === 0,
      explicacion:
        contradiccionesAbiertas.length === 0
          ? "No hay contradicciones de nivel L2/L3 sin resolver."
          : `${contradiccionesAbiertas.length} contradicción(es) estructural(es) abierta(s) (nivel L2/L3).`,
    },
    {
      id: "cronograma",
      nombre: "Cronograma dentro del tiempo declarado",
      cumple: cronogramaExcedeDuracion === false || cronogramaExcedeDuracion === null,
      explicacion:
        cronogramaExcedeDuracion === null
          ? "Duración del proyecto no confirmada todavía — esta condición no se puede evaluar."
          : cronogramaExcedeDuracion
          ? `El cronograma generado excede la duración declarada del proyecto por aproximadamente ${mesesExcedidos ?? "?"} mes(es).`
          : "El cronograma generado cabe dentro de la duración declarada del proyecto.",
    },
  ];

  const convergio = condiciones.every((c) => c.cumple);
  const esProvisional = promedioDeltaIj === null || phi === null;

  const detalleLFaroPorNodo = ordenarNodosPorContribucion(
    lFaroReducidaPorNodoConfirmado.map((d) => ({
      nodo: d.nodo,
      l_faro: d.l_faro,
      confianza_agente: d.confianza_agente,
      num_preguntas_pendientes: d.num_preguntas_pendientes,
      sugerencia: generarSugerenciaNodo(d),
    }))
  );

  return {
    convergio,
    l_faro_proyecto: Math.round(lFaroProyecto * 1000) / 1000,
    tau_c_proyecto: tauCProyecto,
    condiciones,
    phi,
    promedio_delta_ij: promedioDeltaIj !== null ? Math.round(promedioDeltaIj * 1000) / 1000 : null,
    es_provisional: esProvisional,
    detalle_l_faro_por_nodo: detalleLFaroPorNodo,
  };
}
