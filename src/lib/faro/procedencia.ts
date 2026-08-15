/**
 * lib/faro/procedencia.ts
 *
 * Catálogo de procedencia del dato — universal, no depende del dominio
 * del proyecto.
 */

export type Procedencia =
  | "fuente_oficial"
  | "articulo_cientifico"
  | "base_de_datos"
  | "documento_institucional"
  | "documento_investigador"
  | "conocimiento_directo"
  | "estimacion"
  | "supuesto"
  | "pendiente_de_verificacion";

export const ETIQUETAS_PROCEDENCIA: Record<Procedencia, string> = {
  fuente_oficial: "Fuente oficial (entidad gubernamental, gremio, censo)",
  articulo_cientifico: "Artículo científico / literatura revisada por pares",
  base_de_datos: "Base de datos pública (DANE, Agronet, World Bank, etc.)",
  documento_institucional: "Documento institucional (plan, informe, registro)",
  documento_investigador: "Documento propio aportado por el investigador",
  conocimiento_directo: "Conocimiento directo del investigador (experiencia de campo)",
  estimacion: "Estimación propia, sin fuente formal",
  supuesto: "Supuesto de trabajo, aún sin sustento",
  pendiente_de_verificacion: "Pendiente de verificación",
};

/** Categorías que NO deben tratarse como hecho confirmado al propagar. */
export const PROCEDENCIAS_NO_CONFIRMADAS: Procedencia[] = [
  "estimacion",
  "supuesto",
  "pendiente_de_verificacion",
];

export function esProcedenciaConfirmada(p: Procedencia | null | undefined): boolean {
  if (!p) return false;
  return !PROCEDENCIAS_NO_CONFIRMADAS.includes(p);
}
