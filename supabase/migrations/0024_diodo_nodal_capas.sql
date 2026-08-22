-- 0024_diodo_nodal_capas.sql
-- Separa contenido_origen (inmutable post-sellado) de contenido_presentacion
-- (editable siempre). Preserva contenido_origen a partir de contenido existente
-- y agrega timestamps y contadores de ciclo de vida para el diodo nodal.

ALTER TABLE public.grafo_nodos
  ADD COLUMN IF NOT EXISTS contenido_origen       jsonb,
  ADD COLUMN IF NOT EXISTS contenido_presentacion jsonb,
  ADD COLUMN IF NOT EXISTS sellado_en             timestamptz,
  ADD COLUMN IF NOT EXISTS reabierto_en           timestamptz,
  ADD COLUMN IF NOT EXISTS reaperturas_count      integer NOT NULL DEFAULT 0;

-- Migrar datos existentes: si contenido_origen está vacío, poblar desde contenido
UPDATE public.grafo_nodos
SET contenido_origen = contenido
WHERE contenido_origen IS NULL AND contenido IS NOT NULL;

-- Si contenido_presentacion está vacío, inicializar con el contenido actual
UPDATE public.grafo_nodos
SET contenido_presentacion = contenido
WHERE contenido_presentacion IS NULL AND contenido IS NOT NULL;

COMMENT ON COLUMN public.grafo_nodos.contenido_origen IS
  'Contenido en bruto del nodo, congelado al sellar. Fuente de verdad para delta_i, rubrica y mapa de riesgos. Inmutable post-sellado salvo reapertura explicita.';

COMMENT ON COLUMN public.grafo_nodos.contenido_presentacion IS
  'Contenido humanizado o formateado para mostrar al formulador. Siempre editable. No propaga hacia contenido_origen.';

COMMENT ON COLUMN public.grafo_nodos.sellado_en IS
  'Marca temporal exacta en la que el formulador sello el nodo.';

COMMENT ON COLUMN public.grafo_nodos.reabierto_en IS
  'Marca temporal de la ultima reapertura explicita del nodo.';

COMMENT ON COLUMN public.grafo_nodos.reaperturas_count IS
  'Numero total de reaperturas realizadas sobre el nodo para auditoria de estabilidad.';
