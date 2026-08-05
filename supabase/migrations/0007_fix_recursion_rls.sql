-- ============================================================
-- FARO Platform — Corrige recursión infinita en RLS
-- (Ya aplicada manualmente vía SQL Editor el 2026-08-04.
--  Se agrega aquí como archivo para que el repositorio quede
--  completo y documentado — no es necesario volver a correrla.)
-- ============================================================

create or replace function public.es_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.usuarios_plataforma
    where id = (select auth.uid()) and rol = 'admin'
  );
$$;

comment on function public.es_admin is 'Verifica si el usuario autenticado tiene rol admin, sin disparar recursión en las políticas RLS de usuarios_plataforma (SECURITY DEFINER bypassa RLS internamente).';

drop policy if exists "usuarios_plataforma_select_own" on public.usuarios_plataforma;
create policy "usuarios_plataforma_select_own" on public.usuarios_plataforma
  for select using ((select auth.uid()) = id or public.es_admin());

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
  for select using ((select auth.uid()) = usuario_id or public.es_admin());

drop policy if exists "sesiones_mci_select_own" on public.sesiones_mci_log;
create policy "sesiones_mci_select_own" on public.sesiones_mci_log
  for select using (exists (
    select 1 from public.projects p
    where p.id = sesiones_mci_log.project_id
      and (p.usuario_id = (select auth.uid()) or public.es_admin())
  ));

drop policy if exists "grafo_nodos_select_own" on public.grafo_nodos;
create policy "grafo_nodos_select_own" on public.grafo_nodos
  for select using (exists (
    select 1 from public.projects p
    where p.id = grafo_nodos.project_id
      and (p.usuario_id = (select auth.uid()) or public.es_admin())
  ));
