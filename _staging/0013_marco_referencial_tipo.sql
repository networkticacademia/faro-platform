-- 0013_marco_referencial_tipo.sql
-- Agrega 'MARCO_REFERENCIAL' a los valores permitidos de grafo_nodos.tipo

alter table public.grafo_nodos
  drop constraint if exists grafo_nodos_tipo_check;

alter table public.grafo_nodos
  add constraint grafo_nodos_tipo_check
  check (tipo in ('RUTA','NOVA','OBJETIVOS','RSL','METODOLOGIA','MARCO_REFERENCIAL'));
