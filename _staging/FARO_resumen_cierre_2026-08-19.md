# FARO — Resumen de cierre de sesión (2026-08-19)

**Para pegar al inicio del siguiente chat como contexto.**

Sesión de arquitectura pura (sin código nuevo todavía): se diagnosticó la
causa raíz del ciclo infinito de preguntas y se aprobó un plan de tres
tandas para cerrarlo. Se verificó el estado real del repo con evidencia
dura (git + inspección de código). Se dejaron listos los prompts de la
Tanda 1 completa para Claude Code.

---

## Diagnóstico central: el operador de iteración NO es contractivo

El problema que Jorge describió ("contesto preguntas, se regeneran a los
nodos, abren otras preguntas que son las mismas con otras palabras, no
para nunca, matemáticamente no converge") tiene una causa raíz precisa:
**cada regeneración de nodo puede emitir preguntas nuevas sin tope
estructural.** La "regla anti-preguntas-infinitas" es una instrucción de
prompt, y está confirmado que el modelo NO la respeta (hasta 10 preguntas
en una sola iteración). La solución debe ser **determinística, en código,
no en prompt.**

Matemáticamente: hay que forzar que el número de preguntas abiertas sea
**monótonamente no creciente** → así Ud decrece → L_FARO decrece →
el sistema converge por construcción.

---

## Verificación con evidencia real del repo (GitHub, 2026-08-19)

Repo `networkticacademia/faro-platform`, rama `main`:

- **Working tree LIMPIO** — todo commiteado. El pendiente #1 del cierre
  anterior ("commitear el working tree") YA está resuelto. Último commit
  `f1b1db4` (18-ago 15:05): el fix de amnesia (`contextoAcumulado.ts` +
  6 rutas `generar/route.ts` + 6 libs de nodo) está commiteado y en GitHub.
- **Bug del circuito "ventana saturada por overrides"** — YA abordado en
  código: la función `filasRealesRecientes()` en `circuitoConvergencia.ts`
  filtra por `l_faro_proyecto` numérico (excluye las filas de auditoría de
  override) y trae `MARGEN_CONSULTA = 12` filas. Falta CONFIRMAR el
  comportamiento contra la BD real (solo Claude Code puede).
- **Piloto TriagePregunta** — solo IMPACTOS lo usa. Los otros 5 nodos
  (RUTA/NOVA/OBJETIVOS/METODOLOGIA/MARCO_REFERENCIAL) siguen con
  `PreguntasPendientes`. Paso 3 (replicar) sin ejecutar.
- **`_staging/`** — tiene decenas de residuos de sesiones 15-18 ago sin
  limpiar. No indica trabajo pendiente (ya están en `src/`), pero conviene
  que Antigravity/Claude Code limpie la carpeta.

**Límite de este chat:** Claude (chat web) NO puede acceder a Supabase
(dominio no permitido en su entorno de red). El L_FARO real, los nodos
confirmados y cualquier estado de BD solo los confirma Claude Code con SQL
directo. El repo sí es accesible vía GitHub.

**Hallazgo de esquema (importante para la Tanda 1):** los nombres de nodo
NO son consistentes entre capas:
- `NODOS_REQUERIDOS` (resumenNodos.ts) usa `IMPACTOS_DELIMITACION`.
- `preguntas_pendientes.nodo_tipo` (CHECK) usa `IMPACTOS`.
- `grafo_nodos.tipo` (CHECK) quedó con el conjunto viejo de 5
  (`RUTA,NOVA,OBJETIVOS,RSL,METODOLOGIA`) — NO incluye IMPACTOS ni
  MARCO_REFERENCIAL.
Esto obliga a que la Tanda 1 empiece verificando el conjunto real de
valores en producción antes de tocar cualquier CHECK (misma disciplina que
se aplicó con `nu` el 16-ago).

**Hallazgo de arquitectura (simplifica la Tanda 1):** el tope de preguntas
debe vivir en `sincronizarPreguntasPendientes()` (lib/faro/preguntas.ts) —
es el ÚNICO embudo por el que pasan las preguntas de los 6 nodos antes de
tocar la BD. Un solo punto de intervención, no seis.

---

## LA SOLUCIÓN: tres tandas aprobadas por Jorge (en orden)

### TANDA 1 — Cierre determinístico del ciclo (INMEDIATA)
Objetivo: exportar YA un documento auditable, aunque imperfecto, para que
Jorge lo revise como par y lo circule a expertos externos.

**(a) Tope graduado post-LLM, en código (no prompt).**
- Génesis del nodo (sin iteración previa): permite las P1 indispensables,
  sin número fijo.
- Checkpoint / regeneración: máximo 1 pregunta por nodo (la de mayor
  prioridad), luego OBLIGA a permitir avanzar.
- Convergencia final del Dashboard: máximo 1 pregunta en TODO el proyecto
  = `i* = argmax κᵢ` literal (la de coincidencia MAX). Jorge lo llamó el
  "VIF entre comillas" sobre preguntas redundantes que piden el mismo dato
  → agrupar y dar UNA respuesta sólida.

**(b) Sellado ("Aceptar / Sellar").**
- Al sellar: Ψᵢ → `confirmado`, IRREVERSIBLE para la cascada; el nodo
  libera `h_i` aguas abajo y queda PROTEGIDO contra reapertura por cascada.
- Antes de sellar con preguntas abiertas: confirmación tipo transferencia
  bancaria — *"quedan N preguntas → pasarán al mapa de riesgos,
  ¿confirmar?"* (destino visible antes de la acción irreversible).
- El botón Aceptar NO silencia el verificador: DEGRADA el bloqueo a
  advertencia L3 registrada, permanente en el documento exportado. (El
  bloqueo todo-o-nada actual de C1 y `exigirSinContradiccionRSL` es una
  DESVIACIÓN del protocolo canónico L3, que dice "advertencia permanente en
  el documento exportado, no bloquear la exportación" — corregir a la
  ortodoxia.)

**(c) Mapa de riesgos (tabla `riesgos_proyecto` nueva).**
Destino terminal de: contradicciones δᵢⱼ aceptadas (L3), preguntas
operativas (solo verificables durante la ejecución, no la formulación),
preguntas excedentes del tope, y errores del verificador. Cada una con
origen, severidad y enlace a la actividad de Metodología que la mitiga
(típicamente OE-1). NO bloquea convergencia ni dispara regeneración. Se
renderiza como matriz de riesgos/supuestos en el documento.

**(d) Vista de Documento Consolidado + botón Exportar Propuesta Completa.**
HOY NO EXISTE (solo existe la exportación Fase 1: Introducción + Resumen).
**Borde de una sola vía** (corrección clave de Jorge): la convergencia
final GENERA el documento una sola vez (esa generación no se repite); el
documento resultante es SIEMPRE editable, pero la edición vive EN EL
DOCUMENTO, NO retrocede a los nodos, jamás regenera nodos. Exportación =
proyección de G al documento; ediciones post-exportación = operaciones
sobre el documento, fuera del grafo. Esto es la Fase 1 (generar + editar
documento); la Fase 2 es cuando ya está revisado por Jorge y pares.

**"Llamada a un amigo"** — NO es pieza nueva. Es el MISMO asistente
contextual que ya existe detrás de "No entiendo la pregunta" (chatbot con
contexto completo del proyecto), expuesto de forma permanente como apoyo al
formulador, sobre todo cuando debe insertar algo manual para minimizar un
riesgo. Es advisory, no generativa: recomienda en prosa cuál de 3 salidas
conviene (regenerar-una-vez / inserción-manual + humanizador-de-párrafo /
dejar-como-riesgo). Invocarla NO consume el disparo único; solo
"regenerar una vez" lo consume. Evolución prevista: "FARO chat con voz".

### TANDA 2 — Contrato tipado entre nodos (coherencia emergente)
NOVA entrega sus causas como ESTRUCTURA CERRADA TIPADA (ID + jerarquía +
sustancia). OBJETIVOS / Metodología / demás SELECCIONAN un `causa_id` de
esa lista cerrada en vez de REDESCRIBIR la causa con palabras propias — así
la sustitución de causa (el bug real actual: OE-2/OE-3 declaran CAUSA-1
pero operacionalizan CAUSA-4) se vuelve IMPOSIBLE por construcción. La
SKILL del nodo se vuelve asesora con contexto para que las preguntas
importantes se hagan DESDE LA GÉNESIS (al hacer la RSL: checklist +
checkpoint antes de seguir llenando la matriz). Meta: al llegar a
Objetivos, estos NO quedan huérfanos — cada uno pertenece a una CAUSA por
ID, y ese ID aparece en el presupuesto y en la actividad asociada a un
producto, y ese producto a un objetivo. Cadena de pertenencia:
`causa_id → objetivo → producto → actividad → presupuesto`. Este es el
"hacer bien la tarea desde el comienzo".

### TANDA 3 — Dashboard de Matriz de Consistencia en vivo
Hacer computable la Matriz de Consistencia del LIBRO de Jorge (cap. 4).
Lógica del libro: "la matriz NO empieza completa" — arranca casi vacía y
crece celda por celda con cada capítulo; "es un dashboard manual que
acompaña TODO el proceso". EQUIVALENCIA formal que alinea los 3 productos:
Matriz de Consistencia del libro (manual/pedagógica) = MCI de la plataforma
(computacional) = mismo objeto en dos registros; las celdas de relación son
los δᵢⱼ, el llenado progresivo es la construcción del grafo G. (Decisión
del cap. 2: UNA sola matriz conceptual, MCI reservada para lo
computacional, NO introducir segunda matriz.) Las 4 preguntas del libro en
metodología SON las aristas δᵢⱼ en orden: δ(alcance,pregunta),
δ(metodología,objetivos), δ(actividades,resultados),
δ(productos,resultados) + triángulo de hierro. Hilo lógico final:
problema→pregunta→objetivos→metodología→resultados→productos, y sobre eso
se incorporan actividades→tiempos→recursos. UI honesta: relaciones no
decididas EN GRIS (no "undefined"). Nodos con saturación ∝ κᵢ, aristas con
grosor ∝ δᵢⱼ (react-force-graph-2d). Anotar formalmente como "computar la
Matriz de Consistencia del libro, cap. 4" para que los 3 productos citen la
misma fuente.

**Razón del orden:** T1 da el entregable exportable esta semana; T2 arregla
la causa raíz (coherencia en origen); T3 la hace visible y pedagógica.
Invertirlo sería visualizar el problema antes de resolverlo.

---

## Regla de diseño transversal (fijada por Jorge)

**"Corregible en el nodo → se corrige; solo verificable en ejecución o
irreducible → riesgo."** El mapa de riesgos NO es el basurero de errores
corregibles. Ejemplo vivo: la contradicción NOVA→OBJETIVOS que aparece hoy
en pantalla (OE-2 y OE-3 declaran `causa_id` CAUSA-1 pero operacionalizan
CAUSA-4) NO es un riesgo: es un error de mapeo que se corrige a mano en
Objetivos en 2 minutos (Reabrir para editar → reasignar `causa_id` →
confirmar, sin regenerar). Debe corregirse antes de exportar la primera
propuesta.

---

## Acción inmediata de Jorge en la plataforma (para exportar hoy, sin código)

1. Responder la P1 crítica de NOVA (¿el antecedente Chaparro et al. 2024
   reporta métricas desagregadas por etapa fenológica?) — Jorge es autor de
   ese antecedente, tiene el dato de primera mano.
2. Corregir a mano el mapeo de `causa_id` en OBJETIVOS (OE-2 y OE-3 →
   CAUSA-4; corregir la causa_asociada de OE-1). Editar + confirmar no
   dispara cascada.
3. No responder nada más — confirmar los nodos restantes en sus iteraciones
   actuales.
4. Verificar convergencia → (cuando exista el botón) exportar, aun sin
   converger formalmente; lo residual se anota como riesgos/supuestos.

---

## Tanda 1 — 5 etapas de implementación (secuencia aprobada: 0→1→2→3→4)

- **Etapa 0** — Verificación de esquema (SQL, sin código de producción):
  conjunto real de `grafo_nodos.tipo` y `preguntas_pendientes.nodo_tipo`,
  mapa canónico de nombres entre las 3 capas.
- **Etapa 1** — Tope graduado en `sincronizarPreguntasPendientes()` (el
  corazón anti-bucle). Verificación: conteo de preguntas antes/después
  contra el proyecto piña, debe caer a ≤1 por regeneración.
- **Etapa 2** — Tabla `riesgos_proyecto` + migración 0023 + RLS canónico.
- **Etapa 3** — Sellado con confirmación tipo transferencia; degradación
  del bloqueo C1 a advertencia L3.
- **Etapa 4** — Vista de Documento Consolidado + botón Exportar.

Los prompts textuales de las 5 etapas para Claude Code están en el
documento aparte `FARO_prompts_Tanda1_ClaudeCode.md`.

---

## Datos técnicos de referencia (verificados en el repo, 2026-08-19)

- Siguiente migración: **0023**.
- Tablas existentes: `admin_config, convergencia_proyecto, corpus_fuentes,
  estudiantes, grafo_nodos, preguntas_pendientes, projects, sesiones_log,
  sesiones_mci_log, usuarios_plataforma, verificaciones_rsl`.
- `preguntas_pendientes` ya tiene `estado` con valor `'diferida'` en su
  CHECK — reutilizable para "migrada a riesgos".
- Patrón RLS canónico: `exists (select 1 from projects p where
  p.id = <tabla>.project_id and (p.usuario_id = (select auth.uid()) or
  public.es_admin()))`. (Nota: `grafo_nodos` usa una variante más vieja con
  `usuarios_plataforma.rol='admin'` inline — el patrón nuevo con
  `es_admin()` es el canónico para tablas nuevas.)
- Embudo único de preguntas: `sincronizarPreguntasPendientes()` en
  `src/lib/faro/preguntas.ts`, upsert por `(nodo_id, texto_hash)`.
- Circuito: `verificarCircuitoAntesDeRegenerar()` ya integrado en los 6
  `generar/route.ts` con `bypassCircuito`.

---

## Cola de trabajo para la próxima sesión

1. **Etapa 0 + 1 de Tanda 1** (tope graduado) — el prompt ya está listo.
2. Verificar contra proyecto piña que las preguntas caen a ≤1 por
   regeneración.
3. Etapas 2, 3, 4 de Tanda 1 (riesgos → sellado → exportar).
4. Confirmar contra BD que el fix del circuito (ventana de overrides)
   funciona de verdad.
5. Limpiar `_staging/`.
6. Recién entonces: Tanda 2 (contrato tipado) y Tanda 3 (dashboard matriz).
