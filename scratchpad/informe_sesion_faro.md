# Informe de sesión — FARO Platform

**Repo:** `faro-platform` · **Rama:** `main` · **Fecha:** 2026-08-16

Cuatro piezas de trabajo, en orden cronológico. Todo verificado contra datos reales de Supabase (proyecto piña `63e3aa2f-0eec-4628-a1c3-0380d3922025` para lectura/verificación puntual, proyectos de prueba separados para operaciones destructivas), no solo `tsc --noEmit`.

---

## 1. Fix: clasificación de preguntas pendientes (P1/P2) + agrupamiento

**Problema real confirmado leyendo un nodo de `grafo_nodos`:** `preguntas_para_el_usuario` es un array de strings simples, no `{campo, pregunta}`. Por eso `clasificarPrioridad()` siempre recibía `campo_origen = null` y caía en el default P2 — el 100% de las preguntas quedaban en P2 sin importar su contenido real.

**Cambios:**
- `src/lib/faro/clasificacionPreguntas.ts` — clasificación ahora por palabras clave dentro del *texto* de la pregunta, no por `campo_origen`.
- `src/lib/faro/preguntas.ts` — sin cambios de fondo, pero validado contra el fix.
- `src/lib/faro/agrupamiento.ts` / `scripts/backfill_preguntas_pendientes.ts` — `reagruparPreguntasAbiertas()` se disparaba una vez **por nodo** durante el backfill; corregido para correr **una sola vez al final** del backfill completo.

**Verificación (proyecto piña, tabla `preguntas_pendientes` truncada y repoblada):**
- Antes: 29/29 preguntas en P2 (100%).
- Después: P1=8, P2=20, P3=1 — con reglas de keyword funcionando.
- Agrupamiento semántico: la pregunta "dron multiespectral" quedó correctamente agrupada cruzando RUTA/IMPACTOS/METODOLOGIA; la pregunta de "alcance excesivo para 6 meses" quedó aislada como P1 (correcto — es estructural, no debe agruparse).

**Estado:** ya committeado y pusheado a `origin/main` (commit `205ff6b`, mensaje genérico "cambios" generado por un checkpoint automático del entorno — no por mí explícitamente; el usuario decidió dejarlo así en vez de reescribir el mensaje).

---

## 2. Arquitectura de costo/calidad de OpenRouter

**Hallazgo clave — la arquitectura documentada no coincide con el código real:**
- `llamarOrquestador()` no selecciona modelo por caller. Lee **una sola** variable de entorno global (`OPENROUTER_MODEL`, default `anthropic/claude-sonnet-4.6`) y **todos** los llamadores la comparten.
- No existe Gemini Flash 2.0 en ningún lugar del código (el único match de "Gemini" es una entrada decorativa en una lista de herramientas externas, sin relación con llamadas del backend). RSL tiene un comentario propio reconociendo la brecha: *"no un 'modelo económico' separado — reemplazar cuando exista un cliente de modelo económico real"*.
- No existe Llama 3.3 70B en ningún lugar. Los 6 endpoints `generar*` (RUTA/NOVA/OBJETIVOS/METODOLOGIA/MARCO_REFERENCIAL/IMPACTOS) y RSL corren todos sobre Sonnet 4.6.
- Inventario completo: 10 call-sites de `llamarOrquestador()` en 9 archivos, todos sobre el mismo modelo hoy.

**Verificación de modelo ligero antes de conectar nada:**
- El usuario propuso DeepSeek; verifiqué el slug/precio exacto contra `openrouter.ai` directamente (no agregadores de terceros, que traían precios inconsistentes entre sí) → `deepseek/deepseek-v4-flash`, $0.06426/1M in, $0.1285/1M out.
- Prueba real: reconstruí el estado plano (sin agrupar) de preguntas del proyecto piña reutilizando el código real (`sincronizarPreguntasPendientes` con `reagrupar:false`, sin reimplementar nada) — 11 preguntas con 2 clusters de duplicados reales identificables a simple vista (dron ×3 nodos, fechas de muestreo ×2 nodos). DeepSeek acertó exactamente esos 2 grupos, JSON válido, 0 IDs alucinados, sin agrupar las 6 preguntas genuinamente distintas. Pasó — no hizo falta el respaldo (`gemini-3.5-flash-lite`, también verificado por si acaso).

**Implementación (mínimamente invasiva):**
- `src/lib/openrouter/client.ts` — nueva función `llamarModeloLigero()` (lee `OPENROUTER_MODEL_LIGERO`, default `deepseek/deepseek-v4-flash`), sin tocar la firma ni comportamiento de `llamarOrquestador()`.
- Migradas a `llamarModeloLigero()`: `agrupamiento.ts` (`reagruparPreguntasAbiertas`), `preguntas/explicar/route.ts`, `preguntas/derivar-busqueda/route.ts`.
- Sin tocar: los 6 `generar*Core()`, `regenerarNodoConFeedback()`, RSL, convergencia, rúbrica, parser de corpus — siguen en Sonnet 4.6.

---

## 3. "Eliminar proyecto" en Mis Proyectos

**Verificación previa a escribir migración (contra `information_schema`, ejecutada por el usuario, resultados leídos antes de proceder):**
- Las 6 tablas con FK hacia `projects` (`convergencia_proyecto`, `corpus_fuentes`, `grafo_nodos`, `preguntas_pendientes`, `sesiones_mci_log`, `verificaciones_rsl`) **ya tenían `ON DELETE CASCADE`** — no requirió fix de FKs.
- `projects` tenía policies RLS de SELECT/INSERT/UPDATE pero **ninguna de DELETE**.
- Columna real de título: `titulo_provisional` (no "titulo").

**Migración:** `supabase/migrations/0020_projects_delete_policy.sql` — agrega `projects_delete_own` (mismo patrón que `projects_update_own`: `(select auth.uid()) = usuario_id`).

**Implementación:**
- `src/app/api/mci/proyecto/eliminar/route.ts` — `DELETE`, auth + filtro por `usuario_id` (defensa en profundidad sobre la policy RLS).
- `src/app/proyectos/EliminarProyectoBoton.tsx` — ícono de papelera discreto + modal que exige escribir el nombre exacto del proyecto antes de habilitar el borrado.
- Reestructuré la tarjeta en `proyectos/page.tsx` para no anidar el botón dentro del `<Link>` de navegación.

**Prueba real** (proyecto de prueba `1f75749d-...`, no el real):

| Tabla | Antes | Después |
|---|---|---|
| grafo_nodos | 1 | 0 |
| preguntas_pendientes | 6 | 0 |
| sesiones_mci_log | 1 | 0 |
| projects (fila propia) | existe | no existe |

Proyecto real confirmado intacto tras la prueba.

**Limitación reconocida:** la prueba de cascada se hizo con `DELETE` directo vía service role (mismo mecanismo SQL que ejercita el endpoint), no con un click real en el navegador con sesión logueada — no había credenciales de usuario de prueba disponibles en el entorno.

---

## 4. Checkpoint C1 + verificación semántica compuesta + insignia flotante

**Corrección de terminología (aportada por el usuario, no por mí — quede claro en el registro):** "protocolo L1/L2/L3" fue una imprecisión del propio usuario al describir la tarea. `verificadorSemantico.ts` usa `severidad: "critica"|"advertencia"` (2 niveles, sobre δᵢⱼ — coherencia cruzada entre nodos). El protocolo L1/L2/L3 real (`ContradiccionDetectada.nivel` en `mci.ts`) opera sobre un mecanismo distinto (`Δ`, contradicción declaración-evidencia) — comparten numeración por coincidencia de diseño, no la misma maquinaria. Mapeo usado: `severidad === "critica"` → bloqueante. Vocabulario fijado de aquí en adelante: "hallazgos con severidad crítica" para el Gate semántico, L1/L2/L3 reservado exclusivamente para `Δ`.

**Caso de prueba original descartado:** "Objetivos '5 parcelas' vs. Metodología '15-20'" es un caso OBJETIVOS↔METODOLOGIA — fuera del alcance de C1 por diseño (C1 evalúa solo RUTA/NOVA/OBJETIVOS, porque bloquea el *ingreso* a Metodología). De los 5 pares en `MATRIZ_DEPENDENCIA`, confirmé leyendo la matriz completa que solo `RUTA→NOVA` y `NOVA→OBJETIVOS` tienen ambos extremos dentro del conjunto de C1.

**Implementación:**
- `gate.ts` — C1 activado (`activo: true`); `C2`/`C3` sin tocar.
- `gateSemantico.ts` (nuevo) — filtra `MATRIZ_DEPENDENCIA` a los pares relevantes del checkpoint, reutiliza `construirPromptVerificacionSemantica` + `llamarOrquestador` **tal cual** (sin verificador nuevo).
- Control de costo: la llamada LLM solo ocurre con `incluir_verificacion_semantica:true`, enviado únicamente al intentar navegar a Metodología o al pulsar "Revisar coherencia semántica ahora" en la insignia — nunca en segundo plano.
- `InsigniaCheckpoint.tsx` (nuevo) — ícono flotante persistente, no modal, montado en `NavegacionNodos.tsx` (el chrome de facto — no existe `layout.tsx` compartido, confirmado por búsqueda en el código).
- `GateOverlay.tsx` extendido para mostrar también contradicciones semánticas (antes solo sabía renderizar preguntas; un bloqueo puramente semántico se habría visto como una superposición vacía).
- Endpoint nuevo `/api/mci/gate/resumen` — agrega todos los checkpoints activos, siempre sin LLM, para la lectura barata de la insignia.
- `resumenNodos.ts` (nuevo) — extracción pura de los resumidores de nodo desde el endpoint de convergencia, para no duplicarlos.

**Bugs reales encontrados y corregidos probando en vivo (proyecto real, solo lectura, sin gastar LLM ni escribir en él):**
1. **Deduplicación de preguntas.** C0=[RUTA,NOVA] y C1=[RUTA,NOVA,OBJETIVOS] se solapan — una misma pregunta P1 de RUTA/NOVA se contaba dos veces en la insignia (mostraba "4" en vez de "2"). Corregido con dedupe por `id`; verificado contra conteo SQL directo (2 preguntas P1 reales, coincide exacto).
2. **Caché nunca se invalidaba** (señalado por el usuario antes de aplicar la migración). `projects.gate_semantico_ultimo` se escribía pero nada lo invalidaba si RUTA/NOVA/OBJETIVOS se reabrían o regeneraban después — riesgo de falso "todo bien" en la insignia. *Matiz importante:* el bloqueo real de navegación nunca dependía del caché (siempre recalcula fresco), el riesgo era solo de la insignia ambiental. Corregido con snapshot de iteración por nodo: el caché guarda qué iteración confirmada de cada nodo se usó; al leerlo, se compara contra la iteración confirmada actual — si no coincide, se descarta y la insignia muestra un tercer estado visual distinto (ámbar "cambios sin verificar", no rojo "bloqueado", no silencio). Verificado en vivo que `grafo_nodos.tipo` usa mayúsculas exactas (mi supuesto era correcto) y que el proyecto real tiene RUTA con 19 iteraciones alternando `confirmado_humano` — ejemplo real del riesgo descrito.
3. Efecto colateral hallado durante esa verificación: la lectura del caché fallaba silenciosamente cuando la columna aún no existía (migración no aplicada) — no rompía nada (fail-open correcto) pero no quedaba registrado. Agregado logging explícito por consistencia con el resto del archivo.

**Migración:** `supabase/migrations/0021_gate_semantico_c1.sql` — agrega `projects.gate_semantico_ultimo jsonb`. No requiere policies nuevas (reutiliza `projects_select_own`/`projects_update_own`).

**Estado:** `tsc --noEmit` limpio en todas las etapas. **Pendiente:** el usuario aplique `0021` en el SQL Editor de Supabase — es lo único que falta para dar el bloque por validado.

---

## Pendientes / próximos pasos

- Aplicar migración `0021_gate_semantico_c1.sql`.
- La validación genuina del Gate semántico de C1 (que efectivamente bloquee ante una contradicción real RUTA↔NOVA o NOVA↔OBJETIVOS) queda pendiente para cuando se camine el proyecto nuevo desde cero — ahí sí se puede introducir deliberadamente una contradicción y confirmar que el bloqueo se dispara. El proyecto piña actual no tiene una discrepancia real conocida en esos pares específicos.
- No se probó el flujo de borrado de proyecto ni el checkpoint C1 con un login real en navegador (sin credenciales de prueba disponibles) — validado por verificación directa de base de datos y por código, no por click-through.
