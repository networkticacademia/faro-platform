-- ============================================================
-- FARO Platform — 0011_verificaciones_rsl_sintesis
-- Agrega columnas para la síntesis profunda de RSL (sesión 2026-08-07):
-- antes solo se guardaban citas y contradiccion; ahora también se
-- persiste la síntesis narrativa, si se detectó un vacío real, y qué
-- fuentes respondieron — necesario para reconstruir el diagrama
-- PRISMA-ScR completo más adelante (modo formal de RSL).
-- ============================================================

alter table public.verificaciones_rsl
  add column if not exists sintesis_narrativa text,
  add column if not exists vacio_detectado boolean not null default false,
  add column if not exists fuentes_consultadas jsonb not null default '[]'::jsonb;
