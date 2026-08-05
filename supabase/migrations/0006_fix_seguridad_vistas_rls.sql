-- ============================================================
-- FARO Platform — Corrección de seguridad: vistas y RLS
-- (Ya aplicada manualmente vía SQL Editor el 2026-08-03.
--  Se agrega aquí como archivo para que el repositorio quede
--  completo y documentado — no es necesario volver a correrla.)
-- ============================================================

alter view public.v_resumen_usuarios_plataforma set (security_invoker = on);
alter view public.v_estadisticas_proyectos set (security_invoker = on);

drop policy if exists "usuarios_plataforma_select_own" on public.usuarios_plataforma;
create policy "usuarios_plataforma_select_own" on public.usuarios_plataforma
  for select using ((select auth.uid()) = id or exists (
    select 1 from public.usuarios_plataforma a where a.id = (select auth.uid()) and a.rol = 'admin'
  ));

drop policy if exists "usuarios_plataforma_update_own" on public.usuarios_plataforma;
create policy "usuarios_plataforma_update_own" on public.usuarios_plataforma
  for update using ((select auth.uid()) = id);

drop policy if exists "usuarios_plataforma_insert_own" on public.usuarios_plataforma;
create policy "usuarios_plataforma_insert_own" on public.usuarios_plataforma
  for insert with check ((select auth.uid()) = id);

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
  for select using ((select auth.uid()) = usuario_id or exists (
    select 1 from public.usuarios_plataforma a where a.id = (select auth.uid()) and a.rol = 'admin'
  ));

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert with check ((select auth.uid()) = usuario_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update using ((select auth.uid()) = usuario_id);

drop policy if exists "sesiones_mci_select_own" on public.sesiones_mci_log;
create policy "sesiones_mci_select_own" on public.sesiones_mci_log
  for select using (exists (
    select 1 from public.projects p
    where p.id = sesiones_mci_log.project_id
      and (p.usuario_id = (select auth.uid()) or exists (
        select 1 from public.usuarios_plataforma a where a.id = (select auth.uid()) and a.rol = 'admin'
      ))
  ));

drop policy if exists "sesiones_mci_insert_own" on public.sesiones_mci_log;
create policy "sesiones_mci_insert_own" on public.sesiones_mci_log
  for insert with check (exists (
    select 1 from public.projects p
    where p.id = sesiones_mci_log.project_id and p.usuario_id = (select auth.uid())
  ));

drop policy if exists "grafo_nodos_select_own" on public.grafo_nodos;
create policy "grafo_nodos_select_own" on public.grafo_nodos
  for select using (exists (
    select 1 from public.projects p
    where p.id = grafo_nodos.project_id
      and (p.usuario_id = (select auth.uid()) or exists (
        select 1 from public.usuarios_plataforma a where a.id = (select auth.uid()) and a.rol = 'admin'
      ))
  ));

drop policy if exists "grafo_nodos_insert_own" on public.grafo_nodos;
create policy "grafo_nodos_insert_own" on public.grafo_nodos
  for insert with check (exists (
    select 1 from public.projects p
    where p.id = grafo_nodos.project_id and p.usuario_id = (select auth.uid())
  ));

drop policy if exists "grafo_nodos_update_own" on public.grafo_nodos;
create policy "grafo_nodos_update_own" on public.grafo_nodos
  for update using (exists (
    select 1 from public.projects p
    where p.id = grafo_nodos.project_id and p.usuario_id = (select auth.uid())
  ));
