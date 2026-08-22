/**
 * verificadorRubrica.ts — Verificador determinístico de cobertura de rúbrica.
 * 
 * Compara contenido_origen de los nodos del grafo contra los criterios de la rúbrica
 * mediante señales verificables en base de datos (IDs resueltos, citas verificadas, completitud).
 * NO realiza llamadas al LLM para evitar autoevaluaciones no contrastables.
 */

import type { RubricaProyecto, ItemRubrica } from "./rubrica";

export type EstadoCelda = "verde" | "ambar" | "rojo";

export interface CeldaCobertura {
  criterio_id: string;
  criterio_texto: string;
  nodo_tipo: string;
  estado: EstadoCelda;
  // verde: declarado y con evidencia verificable (cita confirmada, ID resuelto, campos completos)
  // ambar: declarado en texto pero sin evidencia registrada en DB
  // rojo: ausente
  evidencia?: string;
}

export interface MatrizCobertura {
  project_id: string;
  calculado_en: string;
  celdas: CeldaCobertura[];
  cobertura_ponderada: number; // Suma ponderada de coberturas [0, 1]
  riesgos_rubrica: string[];   // criterio_ids con estado rojo o ambar
}

export interface InsumosVerificacionRubrica {
  project_id: string;
  contenidoNodos: Record<string, Record<string, unknown>>; // nodo_tipo -> contenido_origen
  citasVerificadasRsl?: { doi?: string; verificado: boolean }[];
  hiloConductorValido?: boolean;
  brechasCriticasCount?: number;
}

/**
 * Evalúa el estado de un criterio individual a partir de señales verificables estructuradas.
 */
function evaluarCriterio(
  item: ItemRubrica,
  insumos: InsumosVerificacionRubrica
): { estado: EstadoCelda; evidencia: string } {
  const nodoTarget = item.nodo_esperado?.[0] ?? "RUTA";
  const contenido = insumos.contenidoNodos[nodoTarget];

  if (!contenido) {
    return {
      estado: "rojo",
      evidencia: `El nodo requerido ${nodoTarget} no ha sido generado ni confirmado aún.`,
    };
  }

  const textoCriterioLower = `${item.descripcion} ${item.criterio_verificacion}`.toLowerCase();

  // 1. Criterios de Referencias / Citas / Estado del Arte
  if (
    textoCriterioLower.includes("cita") ||
    textoCriterioLower.includes("bibliograf") ||
    textoCriterioLower.includes("estado del arte") ||
    textoCriterioLower.includes("referencial")
  ) {
    const citas = insumos.citasVerificadasRsl ?? [];
    const citasConDoi = citas.filter((c) => c.verificado && !!c.doi);
    if (citasConDoi.length > 0) {
      return {
        estado: "verde",
        evidencia: `${citasConDoi.length} cita(s) verificada(s) con identificador persistente (DOI) en RSL.`,
      };
    }
    const citasTotales = (contenido.citas as unknown[]) ?? (contenido.fuentes as unknown[]) ?? [];
    if (citasTotales.length > 0) {
      return {
        estado: "ambar",
        evidencia: "Citas presentes en el texto pero sin verificación formal de DOI en base de datos.",
      };
    }
    return { estado: "rojo", evidencia: "Sin referencias bibliográficas estructuradas." };
  }

  // 2. Criterios de Objetivos / Coherencia Metodológica
  if (
    textoCriterioLower.includes("objetivo") ||
    textoCriterioLower.includes("coherencia") ||
    textoCriterioLower.includes("cadena de valor")
  ) {
    const objetivos = insumos.contenidoNodos["OBJETIVOS"];
    if (objetivos && insumos.brechasCriticasCount === 0) {
      return {
        estado: "verde",
        evidencia: "Nodo de objetivos estructurado con trazabilidad intacta en el hilo conductor (Xi(G)).",
      };
    }
    if (objetivos) {
      return {
        estado: "ambar",
        evidencia: "Nodo de objetivos presente pero con brechas referenciales pendientes.",
      };
    }
    return { estado: "rojo", evidencia: "Nodo de objetivos no confirmado." };
  }

  // 3. Criterios de Enfoque Diferencial / Territorial / Impactos
  if (
    item.es_enfoque_diferencial_territorial ||
    textoCriterioLower.includes("territori") ||
    textoCriterioLower.includes("comunidad") ||
    textoCriterioLower.includes("diferencial") ||
    textoCriterioLower.includes("impacto")
  ) {
    const impactos = insumos.contenidoNodos["IMPACTOS_DELIMITACION"];
    if (impactos) {
      const tienePoblacion = !!impactos.poblacion_beneficiaria || !!contenido.poblacion_contexto;
      const tieneTerritorio = !!impactos.delimitacion_espacial || !!contenido.alcance_espacial;
      if (tienePoblacion && tieneTerritorio) {
        return {
          estado: "verde",
          evidencia: "Población objetivo y delimitación territorial explícitas en contenido_origen.",
        };
      }
      return {
        estado: "ambar",
        evidencia: "Mención parcial en texto sin delimitación cuantitativa completa.",
      };
    }
    return { estado: "rojo", evidencia: "Sin nodo de impactos ni delimitación territorial estructurada." };
  }

  // 4. Criterios de Madurez Tecnológica / Metodología / Cronograma
  if (
    textoCriterioLower.includes("metodolog") ||
    textoCriterioLower.includes("actividad") ||
    textoCriterioLower.includes("cronograma") ||
    textoCriterioLower.includes("trl")
  ) {
    const metodo = insumos.contenidoNodos["METODOLOGIA"];
    if (metodo) {
      const plan = (metodo.plan_por_objetivo as unknown[]) ?? [];
      if (plan.length > 0) {
        return {
          estado: "verde",
          evidencia: "Plan de actividades por objetivo específico desglosado con tiempos.",
        };
      }
      return {
        estado: "ambar",
        evidencia: "Metodología declarada sin desglose detallado de actividades.",
      };
    }
    return { estado: "rojo", evidencia: "Nodo de metodología ausente." };
  }

  // Evaluación genérica basada en contenido_origen presente
  const camposContenido = Object.values(contenido).filter(
    (v) => typeof v === "string" && v.trim().length > 20
  );
  if (camposContenido.length >= 3) {
    return {
      estado: "ambar",
      evidencia: "Texto declarado en nodo correspondiente; requiere validación de evidencia empírica.",
    };
  }

  return {
    estado: "rojo",
    evidencia: `Contenido insuficiente en el nodo ${nodoTarget} para satisfacer el criterio.`,
  };
}

/**
 * Calcula la matriz de cobertura determinística del proyecto frente a la rúbrica.
 */
export function calcularMatrizCobertura(
  insumos: InsumosVerificacionRubrica,
  rubrica: RubricaProyecto
): MatrizCobertura {
  const celdas: CeldaCobertura[] = [];
  const riesgosRubrica: string[] = [];

  let puntosAcumulados = 0;
  let pesoTotal = 0;

  for (const item of rubrica.items ?? []) {
    const { estado, evidencia } = evaluarCriterio(item, insumos);
    const nodoTarget = item.nodo_esperado?.[0] ?? "RUTA";

    celdas.push({
      criterio_id: item.id,
      criterio_texto: item.criterio_verificacion || item.descripcion,
      nodo_tipo: nodoTarget,
      estado,
      evidencia,
    });

    if (estado !== "verde") {
      riesgosRubrica.push(item.id);
    }

    const pesoItem = item.peso ?? 1;
    pesoTotal += pesoItem;

    if (estado === "verde") {
      puntosAcumulados += pesoItem * 1.0;
    } else if (estado === "ambar") {
      puntosAcumulados += pesoItem * 0.5;
    } else {
      puntosAcumulados += 0;
    }
  }

  const coberturaPonderada =
    pesoTotal > 0 ? Math.round((puntosAcumulados / pesoTotal) * 1000) / 1000 : 0;

  return {
    project_id: insumos.project_id,
    calculado_en: new Date().toISOString(),
    celdas,
    cobertura_ponderada: coberturaPonderada,
    riesgos_rubrica: riesgosRubrica,
  };
}
