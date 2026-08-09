-- ============================================================
-- FARO Platform — Vista v_proyectos_ultima_actividad
-- Calcula la fecha de actividad más reciente para cada proyecto
-- (coalesce entre la fecha del nodo más reciente en grafo_nodos y
-- la fecha de creación del proyecto) para ordenar y mostrar en "Mis proyectos".
--
-- Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
-- ============================================================

create or replace view public.v_proyectos_ultima_actividad
with (security_invoker = on) as
select
  p.id,
  p.usuario_id,
  p.titulo_provisional,
  p.nu,
  p.tau,
  p.mu,
  p.alpha_area,
  p.u0_initial,
  p.estado,
  p.created_at,
  p.updated_at,
  coalesce(max(g.created_at), p.created_at) as ultima_actividad
from public.projects p
left join public.grafo_nodos g on g.project_id = p.id
group by p.id;

comment on view public.v_proyectos_ultima_actividad is 'Vista de proyectos con cálculo de última actividad reciente basada en el nodo más reciente de grafo_nodos.';
