-- ============================================================
-- FARO Platform — Campos estructurados de arranque (R-U-T)
-- Sesión del 2026-08-04: en vez de un campo libre de "idea
-- inicial" que RUTA tenía que interpretar, se pregunta
-- directamente por Región, Usuarios y pistas de Tema — que es
-- literalmente lo que el operador RUTA=(R,U,T,A) estructura.
-- Inspirado en el instrumento real "Ejercicio No.1: Selección
-- del Tema de Proyecto de Grado" (declaración de integridad
-- académica: ciertos campos deben responderse SIN asistencia
-- de IA — ver motivacion_personal).
-- ============================================================

alter table public.projects
  add column if not exists region text,
  add column if not exists poblacion_usuarios text,
  add column if not exists tecnologia_interes text,
  add column if not exists palabras_clave text[],
  add column if not exists motivacion_personal text;

comment on column public.projects.region is 'R de RUTA: región/contexto geográfico o institucional declarado directamente por el formulador.';
comment on column public.projects.poblacion_usuarios is 'U de RUTA: población o usuarios objetivo declarado directamente por el formulador.';
comment on column public.projects.tecnologia_interes is 'Pista hacia el Tema de RUTA: tecnología, técnica o enfoque de interés declarado por el formulador (opcional, no vinculante).';
comment on column public.projects.palabras_clave is '3-5 palabras clave declaradas por el formulador — insumo directo de arranque para RSL (F4), igual que en el instrumento de selección de tema.';
comment on column public.projects.motivacion_personal is 'Motivación/interés personal del formulador. Por integridad académica (ver instrumento "Selección del Tema de Proyecto de Grado"), este campo debe responderse sin asistencia de IA — la plataforma no debe autocompletarlo ni sugerirlo.';
