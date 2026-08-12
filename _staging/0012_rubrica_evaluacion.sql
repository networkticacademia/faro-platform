-- 0012_rubrica_evaluacion.sql
-- Agrega la rúbrica de evaluación / términos de referencia como columna
-- del proyecto. Se guarda como JSONB (estructura RubricaProyecto de
-- src/lib/faro/rubrica.ts) — no requiere tabla propia porque hay como
-- máximo una rúbrica activa por proyecto en esta primera versión.

alter table public.projects
  add column if not exists rubrica_evaluacion jsonb;
