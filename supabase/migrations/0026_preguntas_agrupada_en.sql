-- 0026_preguntas_agrupada_en.sql
-- Soporte para agrupamiento semántico cross-nodo de preguntas duplicadas

ALTER TABLE public.preguntas_pendientes
  ADD COLUMN IF NOT EXISTS agrupada_en uuid REFERENCES public.preguntas_pendientes(id);

CREATE INDEX IF NOT EXISTS idx_preguntas_pendientes_agrupada_en
  ON public.preguntas_pendientes(agrupada_en);

-- Actualizar check de estado para incluir 'agrupada'
ALTER TABLE public.preguntas_pendientes
  DROP CONSTRAINT IF EXISTS preguntas_pendientes_estado_check;

ALTER TABLE public.preguntas_pendientes
  ADD CONSTRAINT preguntas_pendientes_estado_check
  CHECK (estado IN ('abierta', 'resuelta', 'diferida', 'agrupada'));

COMMENT ON COLUMN public.preguntas_pendientes.agrupada_en IS
  'ID de la pregunta representante del clúster semántico en el que quedó agrupada';
