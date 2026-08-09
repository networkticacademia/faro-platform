-- 0014_corpus_fuentes_autores.sql
-- Agrega la columna de autores, capturada por el parser desde el inicio
-- (CandidatoAsistido.autores) pero nunca persistida por un descuido en
-- la ruta de inserción. Necesaria para la vista estilo Elicit.

alter table public.corpus_fuentes
  add column if not exists autores text;
