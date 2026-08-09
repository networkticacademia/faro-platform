// ============================================================
// FARO Platform — Formateador de actividad reciente
// Muestra cuánto tiempo ha transcurrido desde la fecha de última
// actividad del proyecto (nodo más reciente en grafo_nodos o created_at).
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

export function formatearActividadReciente(fechaInput?: string | Date | null): string {
  if (!fechaInput) return "Sin actividad registrada";

  const fecha = typeof fechaInput === "string" ? new Date(fechaInput) : fechaInput;
  if (isNaN(fecha.getTime())) return "Fecha no disponible";

  const ahora = new Date();
  const diffMs = ahora.getTime() - fecha.getTime();

  if (diffMs < 0) return "hace un momento";

  const diffSegundos = Math.floor(diffMs / 1000);
  if (diffSegundos < 60) {
    return "hace unos segundos";
  }

  const diffMinutos = Math.floor(diffSegundos / 60);
  if (diffMinutos < 60) {
    return `hace ${diffMinutos} ${diffMinutos === 1 ? "minuto" : "minutos"}`;
  }

  const diffHoras = Math.floor(diffMinutos / 60);
  if (diffHoras < 24) {
    return `hace ${diffHoras} ${diffHoras === 1 ? "hora" : "horas"}`;
  }

  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias < 30) {
    return `hace ${diffDias} ${diffDias === 1 ? "día" : "días"}`;
  }

  const diffMeses = Math.floor(diffDias / 30);
  if (diffMeses < 12) {
    return `hace ${diffMeses} ${diffMeses === 1 ? "mes" : "meses"}`;
  }

  const diffAnios = Math.floor(diffDias / 365);
  return `hace ${diffAnios} ${diffAnios === 1 ? "año" : "años"}`;
}
