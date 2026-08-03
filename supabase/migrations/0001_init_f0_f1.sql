-- ============================================================
-- ⚠️ SUPERADA — NO EJECUTAR.
-- Esta versión asumía tablas "estudiantes/diagnosticos_m0/
-- sesiones_log" vacías. La auditoría del 02-ago-2026 confirmó
-- que ya existen con datos reales del estudio empírico y otra
-- estructura. Usar en su lugar: 0002_plataforma_definitiva.sql
-- Se conserva este archivo solo como referencia histórica.
-- ============================================================
-- FARO Platform — Migración inicial (Fase 0 + Fase 1)
-- Alcance: M0 Diagnóstico (z0*, U0) + registro de sesiones MCI
-- Fuera de alcance aquí (se agrega en F4/F5 sin romper esto):
--   skill_registry, journal_registry, rsl_screening_log,
--   historical_memory (pgvector), RAG por nodo
-- ============================================================

-- ------------------------------------------------------------
-- 1. ESTUDIANTES / USUARIOS DEL SISTEMA
--    (perfil de investigador vinculado a auth.users de Supabase)
-- ------------------------------------------------------------
create table if not exists public.estudiantes (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null,
  correo text not null unique,
  institucion text default 'Unitrópico',
  programa text,
  rol text not null default 'formulador' check (rol in ('formulador', 'admin', 'validador_externo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.estudiantes is 'Perfil de cada usuario/formulador del sistema FARO.';

-- ------------------------------------------------------------
-- 2. PROJECTS — vector de estado z0* + incertidumbre U0
--    (reemplaza y extiende lo que antes se llamaba diagnosticos_m0)
-- ------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  titulo_provisional text,

  -- ---- z0* = (nu, tau, mu, alpha, rho, sigma, lambda, u0) ----
  nu text not null check (nu in ('pregrado','maestria','doctorado','convocatoria')),
  tau text not null check (tau in ('basica','aplicada','dti')),
  mu text not null check (mu in ('cuantitativo','cualitativo','mixto')),
  alpha_area text not null,
  rho jsonb default '{}'::jsonb,           -- términos de referencia / convocatoria
  sigma text,                               -- disponibilidad de artículos semilla
  lambda_trl smallint check (lambda_trl between 1 and 9),

  -- ---- Perfil de certeza Psi por variable (confirmado/tentativo/nosabe) ----
  psi jsonb default '{}'::jsonb,

  -- ---- U0: incertidumbre inicial, 4 dimensiones ----
  u1_claridad_conceptual numeric(4,3) check (u1_claridad_conceptual between 0 and 1),
  u2_competencia_metodologica numeric(4,3) check (u2_competencia_metodologica between 0 and 1),
  u3_viabilidad_contextual numeric(4,3) check (u3_viabilidad_contextual between 0 and 1),
  u4_encaje_estructural numeric(4,3) check (u4_encaje_estructural between 0 and 1),
  alpha_pesos jsonb default '{"u1":0.25,"u2":0.25,"u3":0.25,"u4":0.25}'::jsonb,

  u0_initial numeric(4,3),   -- U0^(0) — NUNCA se sobreescribe tras el cálculo inicial
  u0_current numeric(4,3),  -- U0^(t) — se actualiza durante la sesión

  -- ---- SE_tau y umbral de convergencia ----
  se_tau numeric(4,3),
  tau_c numeric(4,3),

  -- ---- Política de activación pi: z0* -> M*(z0*) ----
  activation_policy jsonb default '{}'::jsonb,
  ruta_asignada text, -- ej: 'directa' | 'guiada_breve' | 'reforzamiento' | 'nivelacion_previa'

  estado text not null default 'diagnostico' check (
    estado in ('diagnostico','en_formulacion','convergido','abandonado')
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.projects is 'Un registro por proyecto de investigación formulado en FARO: z0*, U0 y su ruta de activación.';

create index if not exists idx_projects_estudiante on public.projects(estudiante_id);
create index if not exists idx_projects_estado on public.projects(estado);

-- ------------------------------------------------------------
-- 3. SESIONES_LOG — trayectoria de convergencia del MCI
--    Un registro por iteración t del backpropagation conceptual
-- ------------------------------------------------------------
create table if not exists public.sesiones_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  modulo text not null,           -- ej: 'M0','RUTA','NOVA','RSL','Objetivos'
  iteracion int not null default 0,
  l_faro numeric(6,4),            -- L_FARO en esta iteración
  delta_nodal jsonb,              -- {node_id: delta_i}
  delta_relacional jsonb,         -- {edge_id: delta_ij}
  omega numeric(6,4),             -- penalización estructural
  nodo_reabierto text,            -- i* = argmax kappa_i
  contradicciones jsonb default '[]'::jsonb, -- lista de xi_k detectadas, con nivel L1/L2/L3
  convergio boolean not null default false,
  tiempo_ms int,                  -- latencia de la llamada al modelo
  modelo_usado text default 'claude-sonnet-4-6',
  created_at timestamptz not null default now()
);

comment on table public.sesiones_log is 'Traza completa de cada iteración del loop MCI: insumo directo para L0, Lf, N_iter, tc del artículo.';

create index if not exists idx_sesiones_project on public.sesiones_log(project_id);
create index if not exists idx_sesiones_modulo on public.sesiones_log(modulo);

-- ------------------------------------------------------------
-- 4. ADMIN_CONFIG — parámetros globales ajustables sin redeploy
-- ------------------------------------------------------------
create table if not exists public.admin_config (
  clave text primary key,
  valor jsonb not null,
  descripcion text,
  updated_at timestamptz not null default now()
);

comment on table public.admin_config is 'Parámetros globales: pesos w, gamma, umbrales tau0, eta por SE_tau, etc.';

insert into public.admin_config (clave, valor, descripcion) values
  ('alpha_pesos_default', '{"u1":0.25,"u2":0.25,"u3":0.25,"u4":0.25}', 'Pesos por defecto de las 4 dimensiones de U0'),
  ('se_tau_eta', '{"eta1":0.3,"eta2":0.3,"eta3":0.2,"eta4":0.2}', 'Pesos eta de SE_tau (nivel, tipo, convocatoria, U0)'),
  ('tau0_default', '0.35', 'Umbral base de convergencia antes de escalar por SE_tau'),
  ('gamma_omega', '0.4', 'Peso gamma de la penalización estructural Omega en L_FARO')
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- 5. FUNCIÓN calcular_u0
--    Ud = 1 - (sum si)/(nd * smax);  U0 = sum(alpha_d * Ud)
-- ------------------------------------------------------------
create or replace function public.calcular_u0(
  p_u1 numeric, p_u2 numeric, p_u3 numeric, p_u4 numeric,
  p_alpha jsonb default '{"u1":0.25,"u2":0.25,"u3":0.25,"u4":0.25}'::jsonb
) returns numeric
language plpgsql
immutable
as $$
declare
  v_u0 numeric;
begin
  v_u0 := (p_u1 * (p_alpha->>'u1')::numeric)
        + (p_u2 * (p_alpha->>'u2')::numeric)
        + (p_u3 * (p_alpha->>'u3')::numeric)
        + (p_u4 * (p_alpha->>'u4')::numeric);
  return round(v_u0, 3);
end;
$$;

comment on function public.calcular_u0 is 'Calcula U0 global a partir de las 4 dimensiones parciales y sus pesos alpha_d.';

-- Trigger: recalcula u0_initial/u0_current automáticamente al insertar
create or replace function public.trg_set_u0()
returns trigger
language plpgsql
as $$
begin
  if new.u0_initial is null then
    new.u0_initial := public.calcular_u0(
      new.u1_claridad_conceptual, new.u2_competencia_metodologica,
      new.u3_viabilidad_contextual, new.u4_encaje_estructural,
      coalesce(new.alpha_pesos, '{"u1":0.25,"u2":0.25,"u3":0.25,"u4":0.25}'::jsonb)
    );
    new.u0_current := new.u0_initial;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_u0_before_insert on public.projects;
create trigger set_u0_before_insert
  before insert on public.projects
  for each row execute function public.trg_set_u0();

-- ------------------------------------------------------------
-- 6. FUNCIÓN detectar_contradicciones
--    Primera versión: reglas explícitas tipo xi_1
--    (ej. TRL declarado incompatible con tipo de proyecto declarado)
-- ------------------------------------------------------------
create or replace function public.detectar_contradicciones(
  p_tau text, p_lambda_trl smallint, p_mu text
) returns jsonb
language plpgsql
immutable
as $$
declare
  v_alertas jsonb := '[]'::jsonb;
begin
  -- xi_1: proyecto tipo DTI con TRL 1-2 (baja madurez tecnológica declarada
  -- para un proyecto de Desarrollo Tecnológico e Innovación) -> alerta L2
  if p_tau = 'dti' and p_lambda_trl is not null and p_lambda_trl <= 2 then
    v_alertas := v_alertas || jsonb_build_object(
      'codigo', 'xi_1',
      'nivel', 'L2',
      'mensaje', 'TRL declarado (1-2) es inconsistente con un proyecto de tipo DTI. Requiere validación doble y justificación escrita.',
      'phi', 0.8
    );
  end if;

  -- xi_2: proyecto basico con TRL alto (>6) -> alerta L1 informativa
  if p_tau = 'basica' and p_lambda_trl is not null and p_lambda_trl > 6 then
    v_alertas := v_alertas || jsonb_build_object(
      'codigo', 'xi_2',
      'nivel', 'L1',
      'mensaje', 'TRL alto declarado para investigación básica. Verificar clasificación tau.',
      'phi', 0.4
    );
  end if;

  return v_alertas;
end;
$$;

comment on function public.detectar_contradicciones is 'Detección de contradicciones declaración-evidencia (componente Delta de L_FARO). Reglas se amplían en F2+.';

-- ------------------------------------------------------------
-- 7. VISTAS
-- ------------------------------------------------------------
create or replace view public.v_resumen_estudiantes as
select
  e.id,
  e.nombre_completo,
  e.institucion,
  e.programa,
  count(p.id) as total_proyectos,
  avg(p.u0_initial) as u0_promedio,
  max(p.updated_at) as ultima_actividad
from public.estudiantes e
left join public.projects p on p.estudiante_id = e.id
group by e.id, e.nombre_completo, e.institucion, e.programa;

create or replace view public.v_estadisticas_generales as
select
  count(distinct p.id) as total_proyectos,
  avg(p.u0_initial) as u0_inicial_promedio,
  avg(p.u0_current) as u0_actual_promedio,
  count(*) filter (where p.estado = 'convergido') as total_convergidos,
  avg(sl.iteracion) filter (where sl.convergio) as n_iter_promedio_convergencia
from public.projects p
left join public.sesiones_log sl on sl.project_id = p.id;

-- ------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.estudiantes enable row level security;
alter table public.projects enable row level security;
alter table public.sesiones_log enable row level security;
alter table public.admin_config enable row level security;

-- estudiantes: cada quien ve/edita su propio perfil; admin ve todo
create policy "estudiantes_select_own" on public.estudiantes
  for select using (auth.uid() = id or exists (
    select 1 from public.estudiantes a where a.id = auth.uid() and a.rol = 'admin'
  ));
create policy "estudiantes_update_own" on public.estudiantes
  for update using (auth.uid() = id);
create policy "estudiantes_insert_own" on public.estudiantes
  for insert with check (auth.uid() = id);

-- projects: cada quien ve/edita solo sus proyectos; admin ve todo
create policy "projects_select_own" on public.projects
  for select using (auth.uid() = estudiante_id or exists (
    select 1 from public.estudiantes a where a.id = auth.uid() and a.rol = 'admin'
  ));
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = estudiante_id);
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = estudiante_id);

-- sesiones_log: visible solo si el proyecto es del usuario (o admin)
create policy "sesiones_select_own" on public.sesiones_log
  for select using (exists (
    select 1 from public.projects p
    where p.id = sesiones_log.project_id
      and (p.estudiante_id = auth.uid() or exists (
        select 1 from public.estudiantes a where a.id = auth.uid() and a.rol = 'admin'
      ))
  ));
create policy "sesiones_insert_own" on public.sesiones_log
  for insert with check (exists (
    select 1 from public.projects p
    where p.id = sesiones_log.project_id and p.estudiante_id = auth.uid()
  ));

-- admin_config: solo lectura para autenticados, escritura solo admin
create policy "admin_config_select_all" on public.admin_config
  for select using (auth.role() = 'authenticated');
create policy "admin_config_write_admin" on public.admin_config
  for all using (exists (
    select 1 from public.estudiantes a where a.id = auth.uid() and a.rol = 'admin'
  ));
