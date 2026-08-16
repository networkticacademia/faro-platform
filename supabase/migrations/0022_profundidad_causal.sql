-- 0022_profundidad_causal.sql
--
-- Tope de profundidad causal (2 niveles) para el bucle de triage/propagación:
-- pregunta 1 = intento directo, pregunta 2 = una profundización, y si tras
-- la 2 sigue sin procedencia sólida, se detiene (no genera una 3ª pregunta
-- más profunda) y se marca "profundidad_agotada" — ver propagacion.ts.
--
-- Campo NUEVO y separado de pregunta_raiz_id a propósito: pregunta_raiz_id
-- ya se usa para agrupamiento SEMÁNTICO (reagruparPreguntasAbiertas,
-- lib/faro/agrupamiento.ts) — mezclar ambos conceptos en el mismo campo
-- haría que una pregunta agrupada por similitud con otra de distinto nodo
-- se confundiera con una pregunta que es la profundización causal de otra.

alter table public.preguntas_pendientes
  add column if not exists nivel_profundidad_causal integer not null default 1,
  add column if not exists pregunta_padre_causal_id uuid references public.preguntas_pendientes(id);

create index if not exists idx_preguntas_pendientes_padre_causal
  on public.preguntas_pendientes(pregunta_padre_causal_id);
