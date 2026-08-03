import type { RutaOutput } from "./ruta";
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

export function calcularDeltaI(ruta: RutaOutput): number {
  const base = CONFIANZA_A_DELTA[ruta.nivel_confianza_agente];
  const penalizacionPreguntas = Math.min(ruta.preguntas_para_el_usuario.length, 4) * 0.05;
  return Math.min(1, Math.round((base + penalizacionPreguntas) * 1000) / 1000);
}

/**
 * Penalización estructural Omega: verifica completitud mínima de campos
 * obligatorios del esquema RUTA. No es semántica, es un chequeo de forma.
 */
export function calcularOmega(ruta: RutaOutput): number {
  const camposObligatorios: (keyof RutaOutput)[] = [
    "tema", "problema", "pregunta_investigacion", "objeto_estudio",
    "poblacion_contexto", "alcance_temporal", "alcance_espacial", "justificacion_breve",
  ];
  const incompletos = camposObligatorios.filter((campo) => {
    const valor = ruta[campo];
    return typeof valor !== "string" || valor.trim().length < 8;
  });
  return Math.round((incompletos.length / camposObligatorios.length) * 1000) / 1000;
}

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
