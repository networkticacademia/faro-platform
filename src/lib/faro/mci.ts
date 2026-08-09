import type { NivelConfianza } from "./ruta";

/**
 * ⚠️ Simplificación explícita para F2, documentada como limitación en el
 * artículo (Sección Limitations, ítem 3): sin embeddings semánticos aún,
 * delta_i se aproxima a partir de señales estructuradas del propio agente
 * (confianza declarada + preguntas pendientes), no de similitud semántica
 * s(h_i, c_i) como en la formulación canónica. Se reemplaza por la versión
 * completa cuando se integren embeddings (Limitación 3 del artículo).
 */
const CONFIANZA_A_DELTA: Record<NivelConfianza, number> = {
  alta: 0.10,
  media: 0.40,
  baja: 0.70,
};

/**
 * v2 (2026-08-09) — generalización paso 6 del roadmap. Antes recibía
 * RutaOutput completo; ahora recibe solo los dos campos que realmente
 * usa. Por tipado estructural de TypeScript, RutaOutput sigue siendo
 * un argumento válido sin ningún cambio en ruta.ts — RutaOutput ya
 * tiene ambos campos, así que satisface esta interfaz más angosta
 * automáticamente. Cualquier nodo futuro (NOVA, Objetivos,
 * Metodología) puede reutilizar esta función pasando solo estos dos
 * campos de su propio esquema, sin necesitar RutaOutput para nada.
 */
export interface InsumoDeltaI {
  nivel_confianza_agente: NivelConfianza;
  preguntas_para_el_usuario: string[];
}

export function calcularDeltaI(insumo: InsumoDeltaI): number {
  const base = CONFIANZA_A_DELTA[insumo.nivel_confianza_agente];
  const penalizacionPreguntas = Math.min(insumo.preguntas_para_el_usuario.length, 4) * 0.05;
  return Math.min(1, Math.round((base + penalizacionPreguntas) * 1000) / 1000);
}

/**
 * v2 (2026-08-09) — generalización paso 6 del roadmap. La lista de
 * campos obligatorios ERA específica de RUTA, grabada dentro de la
 * función — imposible de reutilizar para otro tipo de nodo sin
 * copiar y pegar la función entera. Ahora es un parámetro genérico:
 * cualquier objeto de contenido + su propia lista de campos
 * obligatorios. CAMPOS_OBLIGATORIOS_RUTA se exporta como la lista que
 * antes estaba cableada, para que ruta.ts solo necesite un cambio de
 * una línea (pasar la lista explícitamente) y no romper nada más.
 */
export function calcularOmega<T extends Record<string, any>>(
  contenido: T,
  camposObligatorios: readonly (keyof T)[],
  longitudMinima = 8
): number {
  const incompletos = camposObligatorios.filter((campo) => {
    const valor = contenido[campo as string];
    return typeof valor !== "string" || valor.trim().length < longitudMinima;
  });
  return Math.round((incompletos.length / camposObligatorios.length) * 1000) / 1000;
}

/**
 * Lista de campos obligatorios específica de RUTA — antes vivía
 * cableada dentro de calcularOmega. Se exporta aquí para que ruta.ts
 * la importe y la pase explícitamente: calcularOmega(rutaOutput, CAMPOS_OBLIGATORIOS_RUTA).
 * Es EL ÚNICO cambio que requiere ruta.ts para seguir funcionando.
 */
export const CAMPOS_OBLIGATORIOS_RUTA = [
  "tema", "problema", "pregunta_investigacion", "objeto_estudio",
  "poblacion_contexto", "alcance_temporal", "alcance_espacial", "justificacion_breve",
] as const;

/** Contradicción detectada vía la función SQL detectar_contradicciones, ya ponderada por phi_k. */
export interface ContradiccionDetectada {
  codigo: string;
  nivel: "L1" | "L2" | "L3";
  mensaje: string;
  phi: number;
}

/**
 * mu(U2) = 1 + lambda*U2 — modulación de Delta por competencia declarada
 * (Ecuación en cas-dc-template.tex, Sección Global Loss Function).
 * lambda=0.5 es un valor inicial razonable, PENDIENTE DE CALIBRACIÓN
 * EMPÍRICA, tal como está documentado en el artículo.
 *
 * Ya era genérica antes de esta sesión — no depende de RutaOutput.
 */
const LAMBDA_MU_PENDIENTE_CALIBRACION = 0.5;

export function calcularDeltaModulada(contradicciones: ContradiccionDetectada[], u2: number): number {
  const mu = 1 + LAMBDA_MU_PENDIENTE_CALIBRACION * u2;
  const suma = contradicciones.reduce((acc, c) => acc + c.phi, 0);
  return Math.round(suma * mu * 1000) / 1000;
}

/**
 * L_FARO reducida a un solo nodo (F2): sin Sigma w_ij*delta_ij porque
 * todavía no hay múltiples nodos interactuando (eso llega en F4).
 * w_RUTA = 1 porque es el único nodo activo — con más nodos, este peso
 * se distribuye vía la matriz W(nu,tau,mu,rho,U0,H) ya documentada.
 *
 * Ya era genérica antes de esta sesión — no depende de RutaOutput.
 * Cuando F4 agregue múltiples nodos, esta función seguirá sirviendo
 * para el caso de un solo nodo activo; la versión con Sigma w_ij*delta_ij
 * será una función nueva, no un reemplazo de esta.
 */
export function calcularLFaroReducida(params: {
  deltaI: number;
  omega: number;
  deltaModulada: number;
  gamma?: number; // default: admin_config.gamma_omega = 0.4
  beta?: number;  // pendiente de calibración, default 1
}): number {
  const { deltaI, omega, deltaModulada, gamma = 0.4, beta = 1 } = params;
  const l = 1 * deltaI + gamma * omega + beta * deltaModulada;
  return Math.round(l * 1000) / 1000;
}

// ---- SE_tau completo (nu + tau + convocatoria + U0) ----
// Ya era genérica antes de esta sesión — recibe {nu, u0}, no RutaOutput.

const SE_TAU_NIVEL: Record<string, number> = {
  pregrado: 0.35,
  maestria: 0.25,
  doctorado: 0.15,
  convocatoria: 0.20, // no está en el artículo original — valor neutro asignado
};

// SE_tau^tipo y SE_tau^conv NO están definidos en el artículo (vacío detectado
// al construir F2). Se usa 0.25 (neutro) para ambos, pendiente de calibración
// empírica — igual que lambda de mu(U2). Documentar en el artículo cuando F2
// tenga datos reales.
const SE_TAU_TIPO_DEFAULT = 0.25;
const SE_TAU_CONV_DEFAULT = 0.25;

export function calcularSeTauCompleto(params: { nu: string; u0: number }): number {
  const eta1 = 0.3, eta2 = 0.3, eta3 = 0.2, eta4 = 0.2; // eta_k de admin_config.se_tau_eta
  const seNivel = SE_TAU_NIVEL[params.nu] ?? 0.25;
  const gU0 = params.u0; // g(U0) simplificado = U0 directo, igual que en F1

  const seTau = eta1 * seNivel + eta2 * SE_TAU_TIPO_DEFAULT + eta3 * SE_TAU_CONV_DEFAULT + eta4 * gU0;
  return Math.round(seTau * 1000) / 1000;
}

export function calcularTauC(seTau: number, tau0 = 0.35): number {
  return Math.round(tau0 * (1 - seTau) * 1000) / 1000;
}

export function haConvergido(lFaro: number, tauC: number, contradiccionesAbiertas: ContradiccionDetectada[]): boolean {
  return lFaro <= tauC && contradiccionesAbiertas.length === 0;
}
