-- ============================================================
-- FARO Platform — 0010_verificaciones_rsl
-- Trazabilidad del operador reactivo de RSL. Sin esta tabla no se
-- puede reconstruir el diagrama PRISMA-ScR (identificado/cribado/
-- incluido) prometido como salida del modo formal de RSL.
--
-- Patrón de RLS idéntico al ya corregido en 0007_fix_recursion_rls:
-- usa public.es_admin() (SECURITY DEFINER, evita recursión) y
-- envuelve auth.uid() en (select ...) por rendimiento — mismo
-- patrón exacto que grafo_nodos_select_own y sesiones_mci_select_own.
-- ============================================================

create table if not exists public.verificaciones_rsl (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  nodo_id uuid not null references public.grafo_nodos(id) on delete cascade,
  hipotesis_afirmacion text not null,
  estado_evidencia text not null check (
    estado_evidencia in ('sin_verificar', 'confirmado_por_rsl', 'contradicho_por_rsl')
  ),
  citas jsonb not null default '[]'::jsonb,
  contradiccion jsonb, -- null si no hay contradicción; shape {codigo,nivel,mensaje,phi}
  modo text not null default 'reactivo' check (modo in ('reactivo', 'formal')),
  creado_en timestamptz not null default now()
);

create index if not exists idx_verificaciones_rsl_project_id
  on public.verificaciones_rsl (project_id);

create index if not exists idx_verificaciones_rsl_nodo_id
  on public.verificaciones_rsl (nodo_id);

alter table public.verificaciones_rsl enable row level security;

-- SELECT: mismo patrón exacto que grafo_nodos_select_own / sesiones_mci_select_own
drop policy if exists "verificaciones_rsl_select_own" on public.verificaciones_rsl;
create policy "verificaciones_rsl_select_own" on public.verificaciones_rsl
  for select using (exists (
    select 1 from public.projects p
    where p.id = verificaciones_rsl.project_id
      and (p.usuario_id = (select auth.uid()) or public.es_admin())
  ));

-- INSERT: mismo patrón de propiedad, aplicado como with check en vez de using.
-- Necesaria porque verificarHipotesis() se invoca desde route.ts con el cliente
-- de sesión del usuario (no service role) — sin esta política, el insert
-- fallaría silenciosamente contra RLS.
drop policy if exists "verificaciones_rsl_insert_own" on public.verificaciones_rsl;
create policy "verificaciones_rsl_insert_own" on public.verificaciones_rsl
  for insert with check (exists (
    select 1 from public.projects p
    where p.id = verificaciones_rsl.project_id
      and (p.usuario_id = (select auth.uid()) or public.es_admin())
  ));
