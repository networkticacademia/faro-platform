-- 0016_projects_cifras_contexto.sql
-- Captura estructurada de cifras de contexto oficial (nivel/cifra/fuente),
-- reemplaza la dependencia de que estos datos vivan solo disueltos en
-- texto libre (fuentes_contexto_oficial). No se elimina esa columna —
-- sigue sirviendo como referencia narrativa para RUTA — pero de aquí
-- en adelante NOVA lee de este campo estructurado, no intenta
-- extraer/adivinar cifras del texto libre.

alter table public.projects
  add column if not exists cifras_contexto jsonb not null default '[]'::jsonb;
