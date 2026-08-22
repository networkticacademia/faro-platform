-- 0025_riesgos_origen_tipo.sql
-- Ampliación de orígenes y campos estructurados para el mapa de riesgos de FARO
-- Soporta derivaciones desde: banda de rechazo, proceso (sellado con preguntas) y rúbrica.

ALTER TABLE public.riesgos_proyecto
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS nodo_origen text,
  ADD COLUMN IF NOT EXISTS mitigacion text;

-- Eliminar el check anterior si existe para ampliar los orígenes permitidos
ALTER TABLE public.riesgos_proyecto
  DROP CONSTRAINT IF EXISTS riesgos_proyecto_origen_check;

ALTER TABLE public.riesgos_proyecto
  ADD CONSTRAINT riesgos_proyecto_origen_check CHECK (origen IN (
    'contradiccion_delta_ij',
    'pregunta_operativa',
    'excedente_tope',
    'error_verificador',
    'banda_rechazo',
    'proceso',
    'rubrica',
    'contradiccion_l3'
  ));

COMMENT ON COLUMN public.riesgos_proyecto.tipo IS
  'Clasificación específica del riesgo (ej. pregunta_no_resuelta, brecha_rubrica, etc.)';

COMMENT ON COLUMN public.riesgos_proyecto.nodo_origen IS
  'Tipo o identificador del nodo donde se originó el riesgo (RUTA, NOVA, etc.)';

COMMENT ON COLUMN public.riesgos_proyecto.mitigacion IS
  'Texto libre o estructurado de la estrategia de mitigación propuesta';
