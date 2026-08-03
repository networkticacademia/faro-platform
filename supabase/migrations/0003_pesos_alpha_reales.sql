-- ============================================================
-- FARO Platform — Corrección de pesos alpha_d por tipo de proyecto
-- Los pesos iguales (0.25 cada dimensión) eran un placeholder.
-- Estos son los pesos REALES, extraídos de la fórmula de la celda
-- U0_Global del instrumento ya validado (Excel de respuestas M0):
--   básica:   0.35*U1 + 0.30*U2 + 0.20*U3 + 0.15*U4
--   aplicada: 0.25*U1 + 0.25*U2 + 0.30*U3 + 0.20*U4
--   dti:      0.20*U1 + 0.20*U2 + 0.35*U3 + 0.25*U4
--   (tau indefinido): 0.25 cada una
-- ============================================================

create or replace function public.pesos_u0_por_tau(p_tau text)
returns jsonb
language sql
immutable
as $$
  select case p_tau
    when 'basica' then '{"u1":0.35,"u2":0.30,"u3":0.20,"u4":0.15}'::jsonb
    when 'aplicada' then '{"u1":0.25,"u2":0.25,"u3":0.30,"u4":0.20}'::jsonb
    when 'dti' then '{"u1":0.20,"u2":0.20,"u3":0.35,"u4":0.25}'::jsonb
    else '{"u1":0.25,"u2":0.25,"u3":0.25,"u4":0.25}'::jsonb
  end;
$$;

comment on function public.pesos_u0_por_tau is 'Pesos alpha_d reales por tipo de proyecto tau, extraídos de la fórmula validada del instrumento M0 (no placeholder).';

-- Reemplaza el trigger: ahora calcula los pesos según new.tau,
-- salvo que se hayan enviado pesos explícitos distintos del default parejo.
create or replace function public.trg_set_u0()
returns trigger
language plpgsql
as $$
declare
  v_pesos jsonb;
begin
  if new.u0_initial is null then
    -- Si no se especificaron pesos personalizados (o vinieron con el
    -- default parejo anterior), usar los pesos reales por tipo de proyecto.
    if new.alpha_pesos is null
       or new.alpha_pesos = '{"u1":0.25,"u2":0.25,"u3":0.25,"u4":0.25}'::jsonb then
      v_pesos := public.pesos_u0_por_tau(new.tau);
      new.alpha_pesos := v_pesos;
    else
      v_pesos := new.alpha_pesos;
    end if;

    new.u0_initial := public.calcular_u0(
      new.u1_claridad_conceptual, new.u2_competencia_metodologica,
      new.u3_viabilidad_contextual, new.u4_encaje_estructural,
      v_pesos
    );
    new.u0_current := new.u0_initial;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Actualizar admin_config con la tabla real (reemplaza el placeholder)
update public.admin_config
set valor = '{"basica":{"u1":0.35,"u2":0.30,"u3":0.20,"u4":0.15},"aplicada":{"u1":0.25,"u2":0.25,"u3":0.30,"u4":0.20},"dti":{"u1":0.20,"u2":0.20,"u3":0.35,"u4":0.25},"default":{"u1":0.25,"u2":0.25,"u3":0.25,"u4":0.25}}'::jsonb,
    descripcion = 'Pesos alpha_d reales por tipo de proyecto (tau), extraídos de la fórmula validada del instrumento M0'
where clave = 'alpha_pesos_default';

-- Nota: SE_tau en el Excel piloto fue una versión SIMPLIFICADA
-- (SE_tau = SE_nivel solamente, sin eta ni g(U0)), con tau0=0.3.
-- La fórmula canónica completa (eta1..eta4 + g(U0)) sigue pendiente
-- de decisión: usar la simplificada del piloto o implementar la completa.
-- No se toca aquí hasta esa decisión — se documenta para no perderla.
