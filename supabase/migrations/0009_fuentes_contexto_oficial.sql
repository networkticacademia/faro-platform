-- ============================================================
-- FARO Platform — Fuentes de Contexto Oficial (declaración del formulador)
-- Sesión 2026-08-05: nueva clase de nodo "de evidencia" (junto a RSL),
-- distinta de literatura científica — datos estadísticos/institucionales
-- (FAO/FAOSTAT, Banco Mundial, ministerios, gobernaciones, planes de
-- desarrollo). Se declara UNA vez en M0, junto a R-U-T, y alimenta tanto
-- a RUTA (Región) como a NOVA (Contexto) cuando lo necesiten — no se
-- repite por nodo.
-- ============================================================

alter table public.projects
  add column if not exists fuentes_contexto_oficial text;

comment on column public.projects.fuentes_contexto_oficial is 'Cifras, datos o fuentes oficiales que el formulador ya conoce (FAO, DANE, ministerios, gobernaciones, Banco Mundial, ONU, UNESCO, planes de desarrollo, la propia institución). Insumo compartido para el componente Región de RUTA y Contexto de NOVA — declarado una sola vez en M0, no por nodo. Opcional.';
