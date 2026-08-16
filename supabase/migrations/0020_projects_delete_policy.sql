-- 0020_projects_delete_policy.sql
--
-- Contexto: implementación de "Eliminar proyecto" en Mis Proyectos.
--
-- Verificado contra information_schema antes de escribir esta migración:
-- 1. Las 6 tablas con FK hacia public.projects (convergencia_proyecto,
--    corpus_fuentes, grafo_nodos, preguntas_pendientes, sesiones_mci_log,
--    verificaciones_rsl) YA tienen ON DELETE CASCADE — no requieren cambio.
-- 2. public.projects tiene policies de SELECT/INSERT/UPDATE ("_own", mismo
--    patrón (select auth.uid()) = usuario_id) pero NINGUNA de DELETE.
--
-- Esta migración solo agrega la policy de DELETE faltante, con el mismo
-- alcance que projects_update_own (dueño del proyecto únicamente).

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
  for delete using ((select auth.uid()) = usuario_id);
