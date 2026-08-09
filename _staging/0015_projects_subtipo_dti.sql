-- 0015_projects_subtipo_dti.sql
-- Campo NUEVO, separado de tau — NO toca el CHECK existente de tau
-- ('basica','aplicada','dti') ni los pesos U0 calibrados del
-- instrumento M0 validado. Solo aplica cuando tau='dti', para que
-- NOVA sepa si "Avance" debe medirse como TRL puro (desarrollo
-- tecnológico) o TRL+mercado (innovación de producto/proceso/
-- organizacional) — distinción que tau por sí solo no captura.

alter table public.projects
  add column if not exists subtipo_dti text
  check (subtipo_dti in (
    'desarrollo_tecnologico',
    'innovacion_producto',
    'innovacion_proceso',
    'innovacion_organizacional'
  ));
