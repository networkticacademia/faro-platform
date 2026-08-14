-- 0014_duracion_impactos_delimitacion.sql

-- Duración confirmada del proyecto (Triángulo de Hierro) — null hasta que
-- el formulador la confirme al inicio de RUTA.
alter table public.projects
  add column if not exists duracion_meses_proyecto integer;

-- Nuevo tipo de nodo permitido en el grafo
alter table public.grafo_nodos
  drop constraint if exists grafo_nodos_tipo_check;

alter table public.grafo_nodos
  add constraint grafo_nodos_tipo_check
  check (tipo in ('RUTA','NOVA','OBJETIVOS','RSL','METODOLOGIA','MARCO_REFERENCIAL','IMPACTOS_DELIMITACION'));
