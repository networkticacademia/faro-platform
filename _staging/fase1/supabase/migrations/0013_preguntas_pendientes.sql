-- 0013_preguntas_pendientes.sql
-- FASE 1: Gate + Checkpoints + Clasificación de preguntas (P0-P3)
--
-- IMPORTANTE PARA ANTIGRAVITY:
-- 1. Verificar el patrón RLS exacto usado en 0007_fix_recursion_rls.sql
--    (es_admin() SECURITY DEFINER + (select auth.uid()) en subselect) y
--    ajustar las policies de abajo si difieren del patrón real.
-- 2. Verificar que projects.usuario_id es efectivamente el nombre real de
--    la columna de propiedad (confirmado en sesiones previas, pero re-chequear).
-- 3. Esta migración la aplica Jorge manualmente en Supabase SQL Editor,
--    NO Antigravity.

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
  estado_procedencia text, -- placeholder, no se usa en este bloque (bloque futuro: procedencia del dato)
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (nodo_id, texto_hash)
);

create index if not exists idx_preguntas_pendientes_project
  on public.preguntas_pendientes(project_id);
create index if not exists idx_preguntas_pendientes_estado_prioridad
  on public.preguntas_pendientes(project_id, estado, prioridad);

alter table public.preguntas_pendientes enable row level security;

-- Ajustar al patrón exacto de 0007 si difiere.
create policy "preguntas_pendientes_select_own"
  on public.preguntas_pendientes for select
  using (
    public.es_admin()
    or project_id in (
      select id from public.projects where usuario_id = (select auth.uid())
    )
  );

create policy "preguntas_pendientes_insert_own"
  on public.preguntas_pendientes for insert
  with check (
    public.es_admin()
    or project_id in (
      select id from public.projects where usuario_id = (select auth.uid())
    )
  );

create policy "preguntas_pendientes_update_own"
  on public.preguntas_pendientes for update
  using (
    public.es_admin()
    or project_id in (
      select id from public.projects where usuario_id = (select auth.uid())
    )
  );
