-- 0018_preguntas_pendientes.sql
-- FASE 1: Gate + Checkpoints + Clasificación de preguntas (P0-P3)

create table if not exists public.preguntas_pendientes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  nodo_id uuid not null references public.grafo_nodos(id) on delete cascade,
  nodo_tipo text not null check (nodo_tipo in (
    'RUTA','NOVA','OBJETIVOS','METODOLOGIA','MARCO_REFERENCIAL','IMPACTOS'
  )),
  campo_origen text,
  texto_pregunta text not null,
  texto_hash text not null, -- hash del texto normalizado, para deduplicar en sincronización
  prioridad text not null check (prioridad in ('P0','P1','P2','P3')) default 'P2',
  pregunta_raiz_id uuid references public.preguntas_pendientes(id),
  nodos_afectados jsonb not null default '[]'::jsonb,
  estado text not null check (estado in ('abierta','resuelta','diferida')) default 'abierta',
  respuesta text,
  estado_procedencia text, -- placeholder, no se usa en este bloque
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (nodo_id, texto_hash)
);

create index if not exists idx_preguntas_pendientes_project
  on public.preguntas_pendientes(project_id);
create index if not exists idx_preguntas_pendientes_estado_prioridad
  on public.preguntas_pendientes(project_id, estado, prioridad);

alter table public.preguntas_pendientes enable row level security;

drop policy if exists "preguntas_pendientes_select_own" on public.preguntas_pendientes;
create policy "preguntas_pendientes_select_own"
  on public.preguntas_pendientes for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = preguntas_pendientes.project_id
        and (p.usuario_id = (select auth.uid()) or public.es_admin())
    )
  );

drop policy if exists "preguntas_pendientes_insert_own" on public.preguntas_pendientes;
create policy "preguntas_pendientes_insert_own"
  on public.preguntas_pendientes for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = preguntas_pendientes.project_id
        and (p.usuario_id = (select auth.uid()) or public.es_admin())
    )
  );

drop policy if exists "preguntas_pendientes_update_own" on public.preguntas_pendientes;
create policy "preguntas_pendientes_update_own"
  on public.preguntas_pendientes for update
  using (
    exists (
      select 1 from public.projects p
      where p.id = preguntas_pendientes.project_id
        and (p.usuario_id = (select auth.uid()) or public.es_admin())
    )
  );
