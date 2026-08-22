-- 0027_arbol_preguntas.sql
-- Estructura de árbol para preguntas compuestas: primaria y dependientes.
-- Absorbe requerimientos de árbol lógico y compatibilidad de estados.

ALTER TABLE public.preguntas_pendientes
  ADD COLUMN IF NOT EXISTS agrupada_en       uuid REFERENCES public.preguntas_pendientes(id),
  ADD COLUMN IF NOT EXISTS depende_de        uuid REFERENCES public.preguntas_pendientes(id),
  ADD COLUMN IF NOT EXISTS condicion_activacion text,
  ADD COLUMN IF NOT EXISTS cerrada_por_rama  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS razon_cierre      text;

CREATE INDEX IF NOT EXISTS idx_preguntas_pendientes_agrupada_en
  ON public.preguntas_pendientes(agrupada_en);

CREATE INDEX IF NOT EXISTS idx_preguntas_depende_de
  ON public.preguntas_pendientes(depende_de);

-- Ampliar estados: 'no_aplica' para dependientes cerradas por rama, 'agrupada' para secundarias
ALTER TABLE public.preguntas_pendientes
  DROP CONSTRAINT IF EXISTS preguntas_pendientes_estado_check;
ALTER TABLE public.preguntas_pendientes
  ADD CONSTRAINT preguntas_pendientes_estado_check
  CHECK (estado IN ('abierta', 'resuelta', 'diferida', 'agrupada', 'no_aplica'));

-- Sincronizar agrupada_en con pregunta_raiz_id en filas ya agrupadas
UPDATE public.preguntas_pendientes
SET agrupada_en = pregunta_raiz_id
WHERE (estado = 'agrupada' OR estado = 'diferida')
  AND pregunta_raiz_id IS NOT NULL
  AND agrupada_en IS NULL;

-- Actualizar filas diferidas de agrupamiento a estado 'agrupada' si quedase alguna
UPDATE public.preguntas_pendientes
SET estado = 'agrupada'
WHERE estado = 'diferida'
  AND pregunta_raiz_id IS NOT NULL;

COMMENT ON COLUMN public.preguntas_pendientes.agrupada_en IS
  'Id de la pregunta representante bajo la cual se agrupa esta pregunta secundaria.';
COMMENT ON COLUMN public.preguntas_pendientes.depende_de IS
  'Id de la pregunta primaria de la cual esta depende logicamente. NULL si es primaria. Difiere de pregunta_padre_causal_id que modela la profundidad causal del arbol de problemas (5 porquees).';
COMMENT ON COLUMN public.preguntas_pendientes.condicion_activacion IS
  'Descripcion de la condicion bajo la cual esta dependiente se activa tras responder la primaria.';
COMMENT ON COLUMN public.preguntas_pendientes.cerrada_por_rama IS
  'True si se cerro automaticamente porque la respuesta a la primaria la volvio inaplicable.';
COMMENT ON COLUMN public.preguntas_pendientes.razon_cierre IS
  'Texto explicando por que se cerro por rama. Permite auditoria y reapertura manual.';
