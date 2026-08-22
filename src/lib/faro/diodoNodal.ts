/**
 * diodoNodal.ts — Implementa la lógica de conducción y bloqueo del Diodo Nodal.
 * 
 * Principio:
 * - Abierto (sellado = false): Conduce (permite escritura/regeneración en contenido_origen).
 * - Sellado (sellado = true): Bloquea (contenido_origen inmutable).
 * 
 * NO modifica funciones de pérdida (L_FARO, delta_i, etc.).
 */

export interface EstadoDiodo {
  nodo_id?: string;
  id?: string;
  sellado: boolean;
  sellado_en?: string | null;
  reabierto_en?: string | null;
  reaperturas_count?: number;
}

/**
 * Verifica si el nodo permite escritura en contenido_origen.
 * Retorna true si conduce (escritura permitida), false si bloquea.
 */
export function conduce(estado: EstadoDiodo | null | undefined): boolean {
  if (!estado) return true;
  return !estado.sellado;
}

/**
 * Construye el payload de sellado para actualizar en base de datos.
 */
export function payloadSellado(): Record<string, unknown> {
  return {
    sellado: true,
    sellado_en: new Date().toISOString(),
    confirmado_humano: true,
  };
}

/**
 * Construye el payload de reapertura explícita del nodo.
 */
export function payloadReapertura(estado?: EstadoDiodo | null): Record<string, unknown> {
  return {
    sellado: false,
    confirmado_humano: false,
    reabierto_en: new Date().toISOString(),
    reaperturas_count: (estado?.reaperturas_count ?? 0) + 1,
  };
}
