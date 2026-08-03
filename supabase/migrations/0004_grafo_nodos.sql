-- ============================================================
-- FARO Platform — F2: nodos del grafo metodológico
-- Tabla genérica y extensible: en F2 solo se usa tipo='RUTA',
-- pero el esquema ya soporta múltiples tipos de nodo para F4
-- (NOVA, Objetivos, RSL, etc.) sin migración adicional.
-- ============================================================

create table if not exists public.grafo_nodos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  tipo text not null check (tipo in ('RUTA','NOVA','OBJETIVOS','RSL','METODOLOGIA')),
  iteracion int not null default 0,
  contenido jsonb not null,              -- salida estructurada del agente (ver lib/faro/ruta.ts)
  confianza_agente text check (confianza_agente in ('alta','media','baja')),
  preguntas_pendientes jsonb default '[]'::jsonb,
  confirmado_humano boolean not null default false,
  editado_humano boolean not null default false,
  delta_nodal numeric(6,4),
  created_at timestamptz not null default now()
);

comment on table public.grafo_nodos is 'Nodos del grafo metodológico G. Cada fila es una propuesta (iteración) de un agente especializado para un nodo del proyecto, con su confirmación/edición humana.';

create index if not exists idx_grafo_nodos_project on public.grafo_nodos(project_id);
create index if not exists idx_grafo_nodos_tipo on public.grafo_nodos(tipo);

alter table public.grafo_nodos enable row level security;

create policy "grafo_nodos_select_own" on public.grafo_nodos
  for select using (exists (
    select 1 from public.projects p
    where p.id = grafo_nodos.project_id
      and (p.usuario_id = auth.uid() or exists (
        select 1 from public.usuarios_plataforma a where a.id = auth.uid() and a.rol = 'admin'
      ))
  ));

create policy "grafo_nodos_insert_own" on public.grafo_nodos
  for insert with check (exists (
    select 1 from public.projects p
    where p.id = grafo_nodos.project_id and p.usuario_id = auth.uid()
  ));

create policy "grafo_nodos_update_own" on public.grafo_nodos
  for update using (exists (
    select 1 from public.projects p
    where p.id = grafo_nodos.project_id and p.usuario_id = auth.uid()
  ));
