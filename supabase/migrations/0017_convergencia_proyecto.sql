-- ============================================================
-- FARO Platform — tabla convergencia_proyecto
-- Histórico completo (INSERT siempre, mismo patrón que sesiones_mci_log).
-- Permite graficar la evolución de convergencia del proyecto en el tiempo.
-- RLS copiada exactamente de grafo_nodos (0004_grafo_nodos.sql):
--   columna de propiedad = usuario_id, patrón EXISTS, 3 políticas separadas.
-- ============================================================

create table if not exists public.convergencia_proyecto (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  resultado     jsonb not null,
  calculado_en  timestamptz not null default now()
);

create index if not exists idx_convergencia_proyecto_project_id
  on public.convergencia_proyecto(project_id, calculado_en desc);

alter table public.convergencia_proyecto enable row level security;

create policy "convergencia_proyecto_select_own" on public.convergencia_proyecto
  for select using (exists (
    select 1 from public.projects p
    where p.id = convergencia_proyecto.project_id
      and (p.usuario_id = auth.uid() or exists (
        select 1 from public.usuarios_plataforma a where a.id = auth.uid() and a.rol = 'admin'
      ))
  ));

create policy "convergencia_proyecto_insert_own" on public.convergencia_proyecto
  for insert with check (exists (
    select 1 from public.projects p
    where p.id = convergencia_proyecto.project_id and p.usuario_id = auth.uid()
  ));

create policy "convergencia_proyecto_update_own" on public.convergencia_proyecto
  for update using (exists (
    select 1 from public.projects p
    where p.id = convergencia_proyecto.project_id and p.usuario_id = auth.uid()
  ));
