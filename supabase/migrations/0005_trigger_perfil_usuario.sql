-- ============================================================
-- FARO Platform — Creación automática de perfil al registrarse
-- Corrige un bug real: con confirmación de correo activada, no
-- hay sesión en el navegador durante signUp(), así que el insert
-- de usuarios_plataforma hecho desde el cliente fallaba en
-- silencio por RLS (auth.uid() era null). Se reemplaza por un
-- trigger sobre auth.users, que sí corre con privilegios propios.
-- ============================================================

create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.usuarios_plataforma (id, nombre_completo, correo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre_completo', new.email),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.crear_perfil_usuario is 'Crea automáticamente el perfil en usuarios_plataforma cuando se crea una cuenta en auth.users, independiente de si hay sesión activa en el cliente.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_usuario();
