// Tipos del núcleo matemático de FARO.
// Deben mantenerse 1:1 con supabase/migrations/0001_init_f0_f1.sql

export type Nivel = "pregrado" | "maestria" | "doctorado" | "convocatoria";
export type TipoProyecto = "basica" | "aplicada" | "dti";
export type Enfoque = "cuantitativo" | "cualitativo" | "mixto";
export type NivelCerteza = "confirmado" | "tentativo" | "nosabe";

// z0* = (nu, tau, mu, alpha, rho, sigma, lambda, u0)
export interface VectorEstadoInicial {
  nu: Nivel;
  tau: TipoProyecto;
  mu: Enfoque;
  alpha_area: string;
  rho: Record<string, unknown>; // términos de referencia / convocatoria
  sigma: string; // disponibilidad de artículos semilla
  lambda_trl: number; // 1-9
  u0: VectorIncertidumbre;
}

// u0 = (U1, U2, U3, U4)
export interface VectorIncertidumbre {
  u1_claridad_conceptual: number; // 0-1
  u2_competencia_metodologica: number; // 0-1
  u3_viabilidad_contextual: number; // 0-1
  u4_encaje_estructural: number; // 0-1
}

export interface PesosU0 {
  u1: number;
  u2: number;
  u3: number;
  u4: number;
}

export const PESOS_U0_DEFAULT: PesosU0 = { u1: 0.25, u2: 0.25, u3: 0.25, u4: 0.25 };

export type RutaActivacion =
  | "directa" // U0 bajo (0.00-0.20)
  | "guiada_breve" // U0 moderado (0.21-0.40)
  | "reforzamiento" // U0 medio-alto (0.41-0.80)
  | "nivelacion_previa"; // U0 crítico (0.81-1.00)

export interface Contradiccion {
  codigo: string; // xi_1, xi_2, ...
  nivel: "L1" | "L2" | "L3";
  mensaje: string;
  phi: number; // ponderación de la penalización
}
