# FARO — Resumen de cierre de sesión — 2026-08-15

Sesión larga y densa: se resolvió el bloque completo de gestión de
preguntas pendientes (el problema de las 37 preguntas sin priorizar que
motivó la auditoría original), se migró de Antigravity a Claude Code a
mitad de sesión, y se cerró con una decisión conceptual importante:
incorporar trazabilidad de IA como tercer pilar formal de FARO.

---

## Verificado con evidencia real (no solo "compiló")

**Gate + clasificación + agrupamiento + propagación quirúrgica** —
bloque completo, probado end-to-end contra el proyecto piña real
(`63e3aa2f-0eec-4628-a1c3-0380d3922025`):
- Clasificación P1-P3 por palabras clave en el texto (no por campo
  estructurado — se confirmó que `preguntas_para_el_usuario` es
  `string[]` plano en los 6 nodos reales, nunca `{campo, pregunta}`).
- Agrupamiento automático validado con alta precisión: distinguió
  correctamente preguntas de "acceso a dron" (sí agrupar) vs.
  "estrategia de fuente de datos" (no agrupar, pese a mencionar dron
  también), y respetó la regla de no agrupar la pregunta de
  alcance/viabilidad general.
- Propagación quirúrgica probada en vivo: responder la pregunta raíz
  del dron (IMPACTOS+RUTA+METODOLOGIA) disparó regeneración en cascada
  correcta de los 3 nodos.
- Triage de 3 caminos (tengo el dato / no sé dónde buscarlo / no
  entiendo) con selector de procedencia, funcionando en la interfaz
  real.

**Modelo ligero para tareas de clasificación/agrupamiento** —
`llamarModeloLigero()` nuevo en `client.ts`, configurable por
`OPENROUTER_MODEL_LIGERO`, default `deepseek/deepseek-v4-flash`
($0.0675/$0.135 por millón de tokens, el modelo de texto más usado de
OpenRouter en volumen). Probado con metodología rigurosa (estado plano
sin agrupar, no contra datos ya depurados) contra el proyecto piña:
acertó los 2 grupos reales, sin alucinar IDs, sin fallar el parseo
JSON. `llamarOrquestador()` queda intacto para sus 8 llamadores
existentes — cero riesgo de regresión.

**Eliminar proyecto** — diseñado y entregado a Antigravity (migración
0020 de verificación de cascade + endpoint + componente de
confirmación por nombre exacto), pero la migración a Claude Code
interrumpió el seguimiento — **no confirmado si se llegó a aplicar**.
Ver pendientes.

---

## Pendiente inmediato para la próxima sesión

1. **Confirmar si "Eliminar proyecto" se aplicó** — quedó en manos de
   Antigravity justo antes de migrar a Claude Code. Verificar con
   Claude Code si la migración 0020 (verificación de `ON DELETE
   CASCADE`) se aplicó, y si no, retomarla ahí en vez de Antigravity.
2. **Investigar la desviación de modelo en los 6 `generar*Core()`** —
   hallazgo del cierre de hoy: si esos 6 nodos están corriendo sobre
   Sonnet 4.6 (vía `llamarOrquestador()`) en vez de Llama 3.3 70B como
   dice la arquitectura documentada, ese es probablemente el verdadero
   motor del gasto de la gráfica de OpenRouter — no el agrupamiento de
   preguntas que se optimizó hoy, que es marginal en comparación.
   Pregunta ya formulada para Claude Code, sin responder todavía.
3. **Investigar la redacción duplicada dentro de una misma pregunta**
   — se observó en RUTA tras la regeneración con feedback de
   propagación quirúrgica (la misma idea repetida dos veces con
   redacción distinta dentro del mismo ítem). Hipótesis sin verificar:
   el feedback de propagación podría estar concatenándose con algún
   feedback previo del nodo, duplicando contexto en el prompt.
4. **Confirmar si RUTA/METODOLOGIA/IMPACTOS conservaron su contenido**
   tras la regeneración en cascada de la prueba de propagación — se
   pidió verificar pero no llegó confirmación explícita antes de
   pasar a otros temas.
5. **Tema de fondo, no urgente:** ¿los 6 prompts de generación de
   nodos están siendo demasiado exhaustivos, generando preguntas de
   más que no son indispensables para avanzar? Observación de Jorge
   sobre RUTA — merece revisión de los prompts base en sesión propia,
   con cabeza fresca, no como ajuste puntual.
6. **Limpieza de proyectos de prueba** — sigue pendiente (9 proyectos
   de prueba en "Mis proyectos", solo uno es el piña real). Ahora
   depende de que el punto 1 esté resuelto.

---

## Decisión conceptual del cierre: trazabilidad como tercer pilar de FARO

FARO pasa de definirse por dos cualidades (adaptativa, contextualizada)
a tres — la tercera no es una funcionalidad más, es un principio que
refuerza directamente la responsabilidad epistémica del investigador,
ya central en la definición canónica.

### Definición formal (versión integrada — para libro, artículo y plataforma)

> **FARO** (Formulación Aumentada y Revisión Optimizada mediante
> Inteligencia Artificial) es un framework metodológico y
> computacional para la formulación adaptativa, contextualizada y
> asistida de proyectos de investigación mediante inteligencia
> artificial. Su arquitectura parte de un diagnóstico inicial del
> investigador que permite identificar su estado de conocimiento,
> capacidades, necesidades e incertidumbres, y utiliza esta
> información junto con el problema de investigación, el contexto
> situacional, la evidencia científica, el Corpus y el estado de
> construcción del proyecto para adaptar progresivamente la asistencia
> que proporciona.
>
> FARO integra agentes y modelos de inteligencia artificial
> especializados según las tareas requeridas y coordina su
> participación dentro de la construcción del proyecto. La IA puede
> explicar, orientar, buscar, contrastar, sintetizar, proponer y
> alertar, pero no sustituye al investigador ni transfiere a los
> sistemas de IA la responsabilidad sobre las decisiones científicas.
> El investigador conserva la autoridad decisional y la
> responsabilidad epistémica sobre el proyecto.
>
> Como principio de transparencia y responsabilidad, FARO mantiene la
> trazabilidad de las intervenciones de inteligencia artificial,
> registrando, cuando corresponda, las herramientas y modelos
> utilizados, la etapa o nodo en el que intervinieron, el propósito de
> la intervención, la información o evidencia generada, las fuentes
> asociadas, la validación realizada por el investigador y la decisión
> finalmente adoptada. Esta trazabilidad permite reconstruir el papel
> que tuvo la IA en la formulación y generar reportes de uso y
> declaraciones de IA adaptables a las políticas del destino editorial
> o institucional correspondiente.
>
> De esta manera, FARO no constituye un sistema de generación
> automática de proyectos, sino un entorno de formulación asistida,
> adaptativa y contextualizada, en el que la inteligencia artificial
> aumenta las capacidades del investigador sin sustituir su criterio,
> su voz ni su responsabilidad científica.

### Frases identitarias (dos, complementarias)

> "FARO no adapta al investigador a la herramienta; adapta la
> asistencia al investigador y al estado del proyecto."

> "FARO no oculta la intervención de la inteligencia artificial; la
> hace trazable."

### Los tres pilares, con función distinta cada uno

- **Adaptativa** — ajusta la asistencia según el diagnóstico
  ($\mathbf{z}_0^*$, $U_0$) y la evolución del proyecto. Ya validado
  empíricamente vía $\pi(\mathbf{z}_0^*)$ (42.3%/26.9%/26.9%/3.8%).
- **Contextualizada** — trabaja sobre el problema, Corpus, evidencia,
  documentos y estado real del proyecto, no sobre instrucciones
  aisladas.
- **Trazable** — registra qué IA intervino, con qué modelo/herramienta,
  con qué propósito, y qué decisión terminó tomando el investigador.

### Implicación técnica — NO construir todavía, registrar para revisar con Claude Code

Jorge señaló correctamente una consecuencia de diseño importante: **no
basta con guardar el modelo/proveedor en una configuración global**
(como `OPENROUTER_MODEL_LIGERO` de hoy). FARO usa modelos distintos
según la tarea (Claude para el Orquestador, Llama para nodos, DeepSeek
para clasificación ligera, potencialmente Perplexity/Gemini para
búsqueda) — el registro de trazabilidad debe ser **granular, por
intervención significativa**, no un ajuste de configuración.

Estructura conceptual propuesta (a diseñar formalmente en sesión
dedicada, con el mismo rigor de auditoría FASE 0 que se aplicó al
bloque de preguntas):

| Etapa | Herramienta | Modelo | Propósito | Tipo de intervención | Validación |
|---|---|---|---|---|---|
| RUTA | Claude | (modelo del Orquestador) | delimitación | orientación | investigador |
| RSL | Perplexity | — | búsqueda | recuperación | investigador |
| RSL | DeepSeek | v4-flash | análisis | síntesis | investigador |
| Objetivos | — | Llama 3.3 70B | formulación | propuesta | investigador |
| Preguntas | DeepSeek | v4-flash | clasificación/agrupamiento | triage | investigador |

Salida esperada del sistema: **FARO → Reporte de uso de IA →
declaración editorial adaptada** (Springer/MDPI/Minciencias tienen
requisitos distintos de declaración de uso de IA — el reporte debe
poder adaptarse al destino, no ser un formato único).

**No construir en la próxima sesión sin antes**: decidir el modelo de
datos (¿tabla nueva `intervenciones_ia` normalizada, o extender el
patrón ya existente de `sesiones_mci_log`?), y qué se considera
"intervención significativa" vs. ruido operativo (no cada llamada
HTTP necesita quedar registrada, solo las que producen contenido,
evidencia o decisión relevante para el proyecto).

---

## Insight de cierre: propagación quirúrgica ≈ incorporación de sugerencias de revisores

Observación de Jorge, capturada tal cual para no perderla: el mecanismo
construido hoy (pregunta pendiente → triage → procedencia →
propagación quirúrgica → regeneración) es **estructuralmente el mismo
problema** que incorporar las sugerencias de un comité/revisor a un
proyecto de grado ya formulado — en ambos casos hay una incertidumbre
señalada por un tercero, que el investigador resuelve con evidencia, y
que debe insertarse en el lugar correcto sin rehacer todo el documento.

**Por qué encaja mejor de lo que parece:** ya existe el mapeo casi 1:1
entre la rúbrica de proyecto de grado y los nodos de FARO (Problema→
RUTA+NOVA, Estado del Arte→RSL+Fuentes, Metodología→Metodología,
etc.) — un comentario de revisor cae naturalmente sobre un nodo
identificable, no sobre un lugar ambiguo del documento.

**Diferencia real que impide reusar el mecanismo tal cual:** la
propagación de hoy regenera el **nodo completo**. Eso es aceptable
durante la formulación (el nodo no tiene todavía una voz final que
proteger), pero no para un documento que ya pasó por el humanizador y
ya fue entregado — regenerar el nodo completo arriesga perder
redacción humanizada de partes que el revisor no cuestionó, o
introducir inconsistencia de estilo entre lo viejo y lo nuevo. Para
este caso, la inserción debe ser más fina: localizar el párrafo
exacto, insertar/tejer la respuesta ahí, humanizar solo ese fragmento.

**Conecta con piezas ya pendientes, no es una pieza aislada nueva:**
- Vista de Documento Consolidado (closing piece, no construida aún)
- Humanizador integrado a la plataforma (hoy manual/externo)
- Skill `response-to-reviewers` ya construida (estructura TAAV) — hoy
  vive separada de este mecanismo, debería terminar siendo la misma
  tubería

**Refinamiento de Jorge — dos momentos distintos, no un solo mecanismo
más fino:**

- **Momento A (formulación, lo construido hoy):** el grafo de nodos es
  mutable. Propagación quirúrgica y "Reabrir para editar" regeneran
  nodos completos porque el nodo no tiene todavía una versión final
  que proteger — coherente con que `grafo_nodos` ya guarda historial
  de iteraciones libremente.
- **Momento B (post-exportación/post-humanizador, "congelado"):** el
  documento deja de ser un grafo editable y pasa a ser una fotografía
  fija. Ahí no aplica regenerar el nodo — aplica **parchar el texto
  congelado en el punto exacto**, sin tocar el resto. Es un mecanismo
  de naturaleza distinta al de hoy, no una variante más precisa del
  mismo.

**Requisito técnico que se deriva, para diseñar en la fase de closing
pieces:** un evento de congelamiento explícito (marcar una `iteracion`
como versión exportada/fija) al humanizar-exportar por última vez, y
un mecanismo nuevo (sin nombre todavía) para corrección post-revisión
que opera sobre texto fijo, no sobre regeneración de nodo.

**Principio de diseño a preservar, más importante que el mecanismo en
sí** (palabras de Jorge): el objetivo de FARO no es tener un buen
mecanismo de corrección post-revisión — es que casi no se necesite,
porque el investigador fue honesto con el alcance y la procedencia
desde el Momento A. Esa es la razón de ser de la procedencia del dato,
el rechazo a respuestas de relleno, y el checkpoint de alcance que
sigue pendiente de activar (C1).

---

## Aprendizajes operativos del día

- **Backfill/scripts batch deben tener bandera para desactivar
  disparadores automáticos costosos** (ej. `reagrupar: false`) — ya
  corregido, pero es un patrón a aplicar por defecto en cualquier
  script futuro que toque `sincronizarPreguntasPendientes()` u otro
  disparador con costo LLM.
- **Verificar nombres reales de columnas/valores antes de escribir
  diccionarios de mapeo** (el caso `impactos` vs.
  `impactos_delimitacion` costó una ronda completa de depuración).
- **Antes de correr un script de backfill, confirmar que no hay una
  versión anterior corriendo en segundo plano** — el episodio del
  script v1 corriendo silenciosamente mientras se pensaba que ya
  estaba resuelto costó varias rondas y gasto real de tokens.
- **Claude Code, una vez conectado al repo real, resolvió en un solo
  turno cada verificación que por Antigravity + capturas tomaba 4-5
  rondas** — confirma la sospecha de Jorge sobre el costo del flujo
  indirecto. Recomendado como herramienta principal para el trabajo de
  depuración/verificación de aquí en adelante; Antigravity queda
  disponible si hace falta para tareas que Jorge prefiera mantener ahí.
