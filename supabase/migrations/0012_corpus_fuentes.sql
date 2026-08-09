-- 0012_corpus_fuentes.sql
-- Tabla transversal de proyecto: acumula toda la evidencia bibliográfica
-- verificada, sin importar en qué nodo se originó. Distinta de
-- verificaciones_rsl (log de eventos por nodo, se mantiene sin cambios).
--
-- Diseñada pensando en reutilización futura (visión de fases FARO):
-- Fase 2 (análisis de resultados) y Fase 3 (redacción de artículo)
-- necesitarán consultar "todo lo que este proyecto acumuló como
-- evidencia" sin reconstruirlo desde los logs por nodo.

create table if not exists public.corpus_fuentes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  fuente text not null check (fuente in (
    'openalex', 'crossref', 'semantic_scholar', 'lens',
    'manual', 'asistida_manual'
  )),
  doi text,
  titulo text not null,
  anio integer,
  revista text,
  resumen_hallazgo text,
  estado_verificacion text not null default 'sin_verificar' check (
    estado_verificacion in ('sin_verificar', 'verificado', 'descartado')
  ),
  usado_en_manuscrito boolean not null default false,
  agregado_por uuid references auth.users(id),
  nodo_origen_id uuid references public.grafo_nodos(id),
  creado_en timestamptz not null default now()
);

-- Evita duplicados exactos por DOI dentro del mismo proyecto
-- (títulos sin DOI no se restringen aquí; la dedupe fina ya vive en rsl.ts)
create unique index if not exists corpus_fuentes_project_doi_uidx
  on public.corpus_fuentes (project_id, doi)
  where doi is not null;

create index if not exists corpus_fuentes_project_id_idx
  on public.corpus_fuentes (project_id);

alter table public.corpus_fuentes enable row level security;

-- Patrón RLS confirmado del proyecto (ver 0007_fix_recursion_rls.sql):
-- public.es_admin() SECURITY DEFINER evita recursión;
-- (select auth.uid()) en subselect por rendimiento.

create policy "select_corpus_fuentes_propio"
  on public.corpus_fuentes for select
  using (
    public.es_admin()
    or project_id in (
      select id from public.projects
      where usuario_id = (select auth.uid())
    )
  );

create policy "insert_corpus_fuentes_propio"
  on public.corpus_fuentes for insert
  with check (
    public.es_admin()
    or project_id in (
      select id from public.projects
      where usuario_id = (select auth.uid())
    )
  );

create policy "update_corpus_fuentes_propio"
  on public.corpus_fuentes for update
  using (
    public.es_admin()
    or project_id in (
      select id from public.projects
      where usuario_id = (select auth.uid())
    )
  );

create policy "delete_corpus_fuentes_propio"
  on public.corpus_fuentes for delete
  using (
    public.es_admin()
    or project_id in (
      select id from public.projects
      where usuario_id = (select auth.uid())
    )
  );
