-- 0019_procedencia_dato.sql
-- Activa el placeholder estado_procedencia con un catálogo cerrado.
-- Jorge: aplicar manualmente en Supabase SQL Editor, igual que 0018.

alter table public.preguntas_pendientes
  drop constraint if exists preguntas_pendientes_estado_procedencia_check;

alter table public.preguntas_pendientes
  add constraint preguntas_pendientes_estado_procedencia_check
  check (estado_procedencia is null or estado_procedencia in (
    'fuente_oficial',
    'articulo_cientifico',
    'base_de_datos',
    'documento_institucional',
    'documento_investigador',
    'conocimiento_directo',
    'estimacion',
    'supuesto',
    'pendiente_de_verificacion'
  ));

-- Estado "en búsqueda externa" reutiliza el estado ya existente 'diferida'
-- (no requiere columna nueva) — se distingue de una diferida normal por
-- tener estado_procedencia = 'pendiente_de_verificacion' o null y
-- respuesta = null.
