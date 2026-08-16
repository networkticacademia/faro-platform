-- 0021_gate_semantico_c1.sql
--
-- Contexto: activación de checkpoint C1 + verificación semántica compuesta
-- (RUTA→NOVA, NOVA→OBJETIVOS) + insignia flotante persistente.
--
-- La insignia flotante consulta el estado del gate en CADA pantalla sin
-- disparar la llamada LLM de verificación semántica (eso solo ocurre al
-- intentar avanzar a Metodología o con el botón manual "Revisar ahora").
-- Para eso necesita leer el ÚLTIMO resultado ya calculado, sin recalcularlo.
-- Una sola columna jsonb alcanza porque hoy solo C1 tiene verificación
-- semántica compuesta (C2/C3 siguen inactivos); se reevalúa el diseño si
-- eso cambia.
--
-- No requiere policies nuevas: projects_select_own/projects_update_own
-- (ya existentes) cubren lectura y escritura de esta columna.

alter table public.projects
  add column if not exists gate_semantico_ultimo jsonb;
