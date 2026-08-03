-- ============================================================
-- FARO Platform — Migración definitiva F0+F1
-- NO toca: estudiantes, diagnosticos_m0, sesiones_log
--          (esas son el instrumento del estudio empírico ya
--           ejecutado con estudiantes de Unitrópico — se dejan
--           intactas, con sus FKs internas confirmadas)
-- Crea la capa nueva de la plataforma web, separada.
-- ============================================================

-- ------------------------------------------------------------
-- 1. USUARIOS_PLATAFORMA — cuentas reales, sí enlazadas a auth.users
--    (estudiantes NO está enlazada a auth.users — se confirmó
--     por ausencia de FK en pg_constraint)
-- ------------------------------------------------------------
create table if not exists public.usuarios_plataforma (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null,
  correo text not null unique,
  institucion text default 'Unitrópico',
  programa text,
  rol text not null default 'formulador' check (rol in ('formulador','admin','validador_externo')),
  -- enlace opcional al registro del estudio, si esta persona ya participó
  estudiante_id uuid references public.estudiantes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.usuarios_plataforma is 'Cuentas reales de la plataforma web FARO, enlazadas a Supabase Auth. Distinta de "estudiantes" (esa es el registro del estudio empírico M0).';

-- ------------------------------------------------------------
-- 2. PROJECTS — vector de estado z0* + incertidumbre U0
-- ------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios_plataforma(id) on delete cascade,
  -- enlace opcional al diagnóstico del estudio, si aplica
  diagnostico_m0_id uuid references public.diagnosticos_m0(id) on delete set null,

  titulo_provisional text,

  -- z0* = (nu, tau, mu, alpha, rho, sigma, lambda, u0)
  nu text not null check (nu in ('pregrado','maestria','doctorado','convocatoria')),
  tau text not null check (tau in ('basica','aplicada','dti')),
  mu text not null check (mu in ('cuantitativo','cualitativo','mixto')),
  alpha_area text not null,
  rho jsonb default '{}'::jsonb,
  sigma text,
  lambda_trl smallint check (lambda_trl between 1 and 9),

  psi jsonb default '{}'::jsonb, -- perfil de certeza Psi por variable

  -- U0: incertidumbre inicial, 4 dimensiones
  u1_claridad_conceptual numeric(4,3) check (u1_claridad_conceptual between 0 and 1),
  u2_competencia_metodologica numeric(4,3) check (u2_competencia_metodologica between 0 and 1),
  u3_viabilidad_contextual numeric(4,3) check (u3_viabilidad_contextual between 0 and 1),
  u4_encaje_estructural numeric(4,3) check (u4_encaje_estructural between 0 and 1),
  alpha_pesos jsonb default '{"u1":0.25,"u2":0.25,"u3":0.25,"u4":0.25}'::jsonb,

  u0_initial numeric(4,3),  -- U0^(0) — nunca se sobreescribe
  u0_current numeric(4,3), -- U0^(t) — se actualiza durante la sesión

  se_tau numeric(4,3),
  tau_c numeric(4,3),

  activation_policy jsonb default '{}'::jsonb,
  ruta_asignada text,

  estado text not null default 'diagnostico' check (
    estado in ('diagnostico','en_formulacion','convergido','abandonado')
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.projects is 'Un registro por proyecto de investigación formulado en la plataforma FARO: z0*, U0 y su ruta de activación.';

create index if not exists idx_projects_usuario on public.projects(usuario_id);
create index if not exists idx_projects_estado on public.projects(estado);

-- ------------------------------------------------------------
-- 3. SESIONES_MCI_LOG — trayectoria de convergencia del MCI
--    (nombre distinto a sesiones_log a propósito, para no
--     confundir con el log de auditoría del estudio)
-- ------------------------------------------------------------
create table if not exists public.sesiones_mci_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  modulo text not null,
  iteracion int not null default 0,
  l_faro numeric(6,4),
  delta_nodal jsonb,
  delta_relacional jsonb,
  omega numeric(6,4),
  nodo_reabierto text,
  contradicciones jsonb default '[]'::jsonb,
  convergio boolean not null default false,
  tiempo_ms int,
  modelo_usado text default 'claude-sonnet-4-6',
  created_at timestamptz not null default now()
);

comment on table public.sesiones_mci_log is 'Traza de cada iteración del loop MCI (L_FARO, deltas, convergencia). Insumo directo para L0, Lf, N_iter, tc del artículo. No confundir con sesiones_log (auditoría del estudio M0).';

create index if not exists idx_sesionesmci_project on public.sesiones_mci_log(project_id);
create index if not exists idx_sesionesmci_modulo on public.sesiones_mci_log(modulo);

-- ------------------------------------------------------------
-- 4. ADMIN_CONFIG — ya existe, solo se insertan llaves nuevas
--    usando las columnas reales (clave, valor, descripcion)
-- ------------------------------------------------------------
insert into public.admin_config (clave, valor, descripcion) values
  ('alpha_pesos_default', '{"u1":0.25,"u2":0.25,"u3":0.25,"u4":0.25}', 'Pesos por defecto de las 4 dimensiones de U0'),
  ('se_tau_eta', '{"eta1":0.3,"eta2":0.3,"eta3":0.2,"eta4":0.2}', 'Pesos eta de SE_tau (nivel, tipo, convocatoria, U0)'),
  ('tau0_default', '0.35', 'Umbral base de convergencia antes de escalar por SE_tau'),
  ('gamma_omega', '0.4', 'Peso gamma de la penalización estructural Omega en L_FARO')
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- 5. FUNCIÓN calcular_u0
-- ------------------------------------------------------------
create or replace function public.calcular_u0(
  p_u1 numeric, p_u2 numeric, p_u3 numeric, p_u4 numeric,
  p_alpha jsonb default '{"u1":0.25,"u2":0.25,"u3":0.25,"u4":0.25}'::jsonb
) returns numeric
language plpgsql immutable
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
  if p_tau = 'dti' and p_lambda_trl is not null and p_lambda_trl <= 2 then
    v_alertas := v_alertas || jsonb_build_object(
      'codigo', 'xi_1', 'nivel', 'L2',
      'mensaje', 'TRL declarado (1-2) es inconsistente con un proyecto de tipo DTI. Requiere validación doble y justificación escrita.',
      'phi', 0.8
    );
  end if;

  if p_tau = 'basica' and p_lambda_trl is not null and p_lambda_trl > 6 then
    v_alertas := v_alertas || jsonb_build_object(
      'codigo', 'xi_2', 'nivel', 'L1',
      'mensaje', 'TRL alto declarado para investigación básica. Verificar clasificación tau.',
      'phi', 0.4
    );
  end if;

  return v_alertas;
end;
$$;

comment on function public.detectar_contradicciones is 'Detección de contradicciones declaración-evidencia (componente Delta de L_FARO).';

-- ------------------------------------------------------------
-- 7. VISTAS (nombres nuevos, para no chocar con nada del estudio)
-- ------------------------------------------------------------
create or replace view public.v_resumen_usuarios_plataforma as
select
  u.id,
  u.nombre_completo,
  u.institucion,
  u.programa,
  count(p.id) as total_proyectos,
  avg(p.u0_initial) as u0_promedio,
  max(p.updated_at) as ultima_actividad
from public.usuarios_plataforma u
left join public.projects p on p.usuario_id = u.id
group by u.id, u.nombre_completo, u.institucion, u.programa;

create or replace view public.v_estadisticas_proyectos as
select
  count(distinct p.id) as total_proyectos,
  avg(p.u0_initial) as u0_inicial_promedio,
  avg(p.u0_current) as u0_actual_promedio,
  count(*) filter (where p.estado = 'convergido') as total_convergidos,
  avg(sl.iteracion) filter (where sl.convergio) as n_iter_promedio_convergencia
from public.projects p
left join public.sesiones_mci_log sl on sl.project_id = p.id;

-- ------------------------------------------------------------
-- 8. ROW LEVEL SECURITY — solo en las tablas nuevas
--    (estudiantes/diagnosticos_m0/sesiones_log quedan pendientes
--     de una auditoría de seguridad aparte, fuera de este alcance)
-- ------------------------------------------------------------
alter table public.usuarios_plataforma enable row level security;
alter table public.projects enable row level security;
alter table public.sesiones_mci_log enable row level security;

create policy "usuarios_plataforma_select_own" on public.usuarios_plataforma
  for select using (auth.uid() = id or exists (
    select 1 from public.usuarios_plataforma a where a.id = auth.uid() and a.rol = 'admin'
  ));
create policy "usuarios_plataforma_update_own" on public.usuarios_plataforma
  for update using (auth.uid() = id);
create policy "usuarios_plataforma_insert_own" on public.usuarios_plataforma
  for insert with check (auth.uid() = id);

create policy "projects_select_own" on public.projects
  for select using (auth.uid() = usuario_id or exists (
    select 1 from public.usuarios_plataforma a where a.id = auth.uid() and a.rol = 'admin'
  ));
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = usuario_id);
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = usuario_id);

create policy "sesiones_mci_select_own" on public.sesiones_mci_log
  for select using (exists (
    select 1 from public.projects p
    where p.id = sesiones_mci_log.project_id
      and (p.usuario_id = auth.uid() or exists (
        select 1 from public.usuarios_plataforma a where a.id = auth.uid() and a.rol = 'admin'
      ))
  ));
create policy "sesiones_mci_insert_own" on public.sesiones_mci_log
  for insert with check (exists (
    select 1 from public.projects p
    where p.id = sesiones_mci_log.project_id and p.usuario_id = auth.uid()
  ));
