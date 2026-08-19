-- 0023_riesgos_proyecto.sql
-- FASE 1: Tanda 1 - Cierre determinístico del ciclo (Mapa de Riesgos + Sellado + Documento Consolidado)

-- 1. Crear tabla riesgos_proyecto
create table if not exists public.riesgos_proyecto (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  origen text not null check (origen in (
    'contradiccion_delta_ij',   -- δᵢⱼ aceptada como L3
    'pregunta_operativa',       -- solo verificable en ejecución
    'excedente_tope',           -- superó el tope de preguntas
    'error_verificador'         -- marcado por verificadores
  )),
  nodo_tipo text check (nodo_tipo in (
    'RUTA','NOVA','OBJETIVOS','METODOLOGIA','MARCO_REFERENCIAL','IMPACTOS'
  )),
  descripcion text not null,
  severidad text not null check (severidad in ('baja','media','alta')) default 'media',
  actividad_mitigacion_ref text, -- referencia a la actividad en metodología (ej. OE-1)
  pregunta_origen_id uuid references public.preguntas_pendientes(id) on delete set null,
  estado text not null check (estado in ('abierto','mitigado','aceptado')) default 'abierto',
  created_at timestamptz not null default now()
);

-- Índices para búsquedas eficientes
create index if not exists idx_riesgos_proyecto_project on public.riesgos_proyecto(project_id);
create index if not exists idx_riesgos_proyecto_project_origen on public.riesgos_proyecto(project_id, origen);

-- Habilitar RLS
alter table public.riesgos_proyecto enable row level security;

-- Políticas RLS basadas en el patrón canónico
drop policy if exists "riesgos_proyecto_select_own" on public.riesgos_proyecto;
create policy "riesgos_proyecto_select_own" on public.riesgos_proyecto
  for select using (exists (
    select 1 from public.projects p
    where p.id = riesgos_proyecto.project_id
      and (p.usuario_id = (select auth.uid()) or public.es_admin())
  ));

drop policy if exists "riesgos_proyecto_insert_own" on public.riesgos_proyecto;
create policy "riesgos_proyecto_insert_own" on public.riesgos_proyecto
  for insert with check (exists (
    select 1 from public.projects p
    where p.id = riesgos_proyecto.project_id
      and (p.usuario_id = (select auth.uid()) or public.es_admin())
  ));

drop policy if exists "riesgos_proyecto_update_own" on public.riesgos_proyecto;
create policy "riesgos_proyecto_update_own" on public.riesgos_proyecto
  for update using (exists (
    select 1 from public.projects p
    where p.id = riesgos_proyecto.project_id
      and (p.usuario_id = (select auth.uid()) or public.es_admin())
  ));

-- 2. Agregar columna 'sellado' a grafo_nodos
alter table public.grafo_nodos
  add column if not exists sellado boolean not null default false;

-- 3. Agregar columna 'documento_consolidado' a projects
alter table public.projects
  add column if not exists documento_consolidado jsonb default null;

-- 4. Ajustar el UNIQUE constraint de preguntas_pendientes
-- Eliminar duplicados existentes en preguntas_pendientes antes de aplicar el UNIQUE constraint
delete from public.preguntas_pendientes q1
using public.preguntas_pendientes q2
where q1.id > q2.id
  and q1.project_id = q2.project_id
  and q1.nodo_tipo = q2.nodo_tipo
  and q1.texto_hash = q2.texto_hash;

-- Eliminar el UNIQUE constraint anterior si existe (por defecto es preguntas_pendientes_nodo_id_texto_hash_key)
alter table public.preguntas_pendientes
  drop constraint if exists preguntas_pendientes_nodo_id_texto_hash_key;

-- Añadir el nuevo UNIQUE constraint por (project_id, nodo_tipo, texto_hash)
alter table public.preguntas_pendientes
  add constraint preguntas_pendientes_project_nodo_hash_key unique (project_id, nodo_tipo, texto_hash);
