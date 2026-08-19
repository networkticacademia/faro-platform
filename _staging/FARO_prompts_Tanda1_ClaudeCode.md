# FARO — Prompts Tanda 1 para Claude Code ("Cierre determinístico del ciclo")

**Cómo usar este documento:** cada bloque `PROMPT ETAPA N` se pega
directamente a la sesión de Claude Code que tiene el repo
`networkticacademia/faro-platform`. Ejecutar EN ORDEN. No pasar a la
siguiente etapa hasta que la anterior esté verificada con la evidencia que
cada prompt pide.

**Contexto operativo (Jorge corre varias sesiones de Claude Code en
paralelo):** antes de pegar cada prompt, confirmar que es la ventana con el
repo faro-platform en `main` y working tree limpio.

**Flujo de despliegue:** Claude Code coloca los archivos, corre
`npx tsc --noEmit`, y hace commit + push. Las migraciones SQL las aplica
Jorge manualmente en el SQL Editor de Supabase (Claude Code entrega el
archivo de migración, no lo ejecuta contra la BD).

**Principio de verificación de Jorge:** evidencia dura (git diff, SQL real,
conteos reales contra el proyecto piña `63e3aa2f-0eec-4628-a1c3-0380d3922025`),
nunca "compiló" ni "debería funcionar".

---

## PROMPT ETAPA 0 — Verificación de esquema (sin código de producción)

```
Contexto: vamos a implementar el "cierre determinístico del ciclo" de FARO
en 5 etapas. Esta Etapa 0 es SOLO verificación de esquema real — no
modifiques ningún archivo de producción todavía.

Detecté por inspección del repo que los nombres de nodo NO son consistentes
entre capas:
- NODOS_REQUERIDOS (src/lib/faro/resumenNodos.ts) usa "IMPACTOS_DELIMITACION"
- preguntas_pendientes.nodo_tipo (CHECK, migración 0018) usa "IMPACTOS"
- grafo_nodos.tipo (CHECK, migración 0004) tiene solo el conjunto viejo de 5:
  RUTA, NOVA, OBJETIVOS, RSL, METODOLOGIA — sin IMPACTOS ni MARCO_REFERENCIAL

Necesito que verifiques contra la BD REAL de Supabase (SQL directo, no
supuestos) y me devuelvas:

1. El CHECK constraint REAL vigente hoy de grafo_nodos.tipo. Query:
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'public.grafo_nodos'::regclass AND contype = 'c';

2. Lo mismo para preguntas_pendientes (nodo_tipo, estado, prioridad,
   estado_procedencia):
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'public.preguntas_pendientes'::regclass AND contype = 'c';

3. Los valores DISTINCT que existen de verdad hoy en los datos:
   SELECT DISTINCT tipo FROM public.grafo_nodos ORDER BY tipo;
   SELECT DISTINCT nodo_tipo FROM public.preguntas_pendientes ORDER BY nodo_tipo;

4. Cuántos nodos hay por tipo y confirmado_humano para el proyecto piña:
   SELECT tipo, confirmado_humano, count(*), max(iteracion) AS max_iter
   FROM public.grafo_nodos
   WHERE project_id = '63e3aa2f-0eec-4628-a1c3-0380d3922025'
   GROUP BY tipo, confirmado_humano ORDER BY tipo;

5. Estado actual de preguntas del proyecto piña:
   SELECT nodo_tipo, prioridad, estado, count(*)
   FROM public.preguntas_pendientes
   WHERE project_id = '63e3aa2f-0eec-4628-a1c3-0380d3922025'
   GROUP BY nodo_tipo, prioridad, estado
   ORDER BY nodo_tipo, prioridad, estado;

Con esos resultados, entrégame una TABLA DE CORRESPONDENCIA canónica de
nombres de nodo entre las 3 capas (resumenNodos / grafo_nodos /
preguntas_pendientes), señalando qué CHECK habría que ampliar y a qué
valores exactos, PERO sin aplicarlo todavía. Solo el diagnóstico.

No toques código. No hagas commit. Solo SQL de lectura + el informe.
```

**Qué espero de vuelta:** la tabla de correspondencia + los conteos reales.
Con eso confirmo el estado del piña y ajusto las etapas siguientes si algún
nombre difiere de lo que asumí.

---

## PROMPT ETAPA 1 — Tope graduado de preguntas (corazón anti-bucle)

```
Etapa 1 del cierre determinístico. Objetivo: que el sistema deje de generar
preguntas nuevas sin límite. La solución es DETERMINÍSTICA en código, NO en
prompt (la regla anti-preguntas-infinitas de los prompts no se respeta y no
la vamos a usar como mecanismo de control).

Punto de intervención ÚNICO: la función sincronizarPreguntasPendientes()
en src/lib/faro/preguntas.ts. Es el único embudo por el que pasan las
preguntas de los 6 nodos antes de insertarse en preguntas_pendientes.

REGLA DE TOPE GRADUADO (aplicar sobre las preguntas extraídas ANTES del
upsert):

- MOMENTO "génesis": el nodo no tiene ninguna iteración previa confirmada
  ni preguntas abiertas previas de ese nodo_tipo en el proyecto. Se permiten
  TODAS las P0/P1 (indispensables), sin número fijo. Las P2/P3 de génesis se
  permiten hasta un máximo prudente (define MAX_GENESIS = 5) y el resto se
  marca como excedente.

- MOMENTO "regeneración/checkpoint": el nodo YA tiene iteración previa o ya
  tuvo preguntas. Se permite MÁXIMO 1 pregunta nueva por nodo_tipo en esta
  sincronización: la de mayor prioridad (P0 > P1 > P2 > P3); si empatan, la
  primera en orden. TODAS las demás preguntas nuevas de esa sincronización
  son EXCEDENTE.

- Las preguntas EXCEDENTES no se descartan: por ahora, en esta etapa, NO se
  insertan como 'abierta' — se insertan con estado 'diferida' y una columna
  o marca que indique "excedente_tope" para que la Etapa 2 (mapa de riesgos)
  las recoja. Si añadir una marca requiere columna nueva, usa la migración
  0023 (aún no creada) — pero NO inventes el nombre del constraint sin antes
  confirmar el esquema real de la Etapa 0. Si prefieres no tocar esquema en
  esta etapa, marca el excedente reutilizando estado='diferida' + un campo
  jsonb existente (nodos_afectados o similar) con {"motivo":"excedente_tope"},
  y lo formalizamos en Etapa 2. Tú eliges la opción más limpia y me dices
  cuál tomaste.

- El discriminador génesis/regeneración debe basarse en evidencia real de
  BD (¿existe iteración previa del nodo_tipo? ¿existen preguntas previas de
  ese nodo_tipo en el proyecto?), NO en la presencia de feedback. Reutiliza
  el mismo criterio que ya usa verificarCircuitoAntesDeRegenerar() para
  "esRegeneracion" (consulta a grafo_nodos por project_id + tipo).

IMPORTANTE — deduplicación por nodo_tipo (bug #7 conocido): hoy el upsert
usa onConflict "nodo_id,texto_hash", y como cada regeneración crea un
nodo_id nuevo, la misma pregunta entra como fila nueva. Cámbialo a
deduplicar por (project_id, nodo_tipo, texto_hash) para que una pregunta
textualmente equivalente en una regeneración NO reingrese. Requiere ajustar
el UNIQUE de preguntas_pendientes (hoy es unique(nodo_id, texto_hash)) —
esto sí es cambio de esquema, ponlo en la migración 0023 y NO lo apliques
tú: entrégame el .sql para que Jorge lo corra. Mientras la migración no
esté aplicada, implementa la dedup por nodo_tipo en código (consulta previa
de texto_hash existentes por project_id+nodo_tipo antes de insertar).

VERIFICACIÓN OBLIGATORIA (evidencia dura, no "compiló"):
1. npx tsc --noEmit sin errores.
2. Contra el proyecto piña, muéstrame ANTES y DESPUÉS: cuántas preguntas
   nuevas 'abierta' produce una regeneración de un nodo que ya tiene
   iteración (elige NOVA o RUTA). El número debe caer a ≤1.
3. Confírmame por SQL que las excedentes quedaron marcadas (diferida +
   motivo), no perdidas.
4. git diff de los archivos tocados antes de commitear.

NO regeneres nodos del piña de forma destructiva para probar — usa una
regeneración normal y reversible, o una prueba en un proyecto de descarte.
El proyecto piña NUNCA se usa para pruebas destructivas.

Archivos que probablemente tocas: src/lib/faro/preguntas.ts (tope +
dedup), y quizás un helper nuevo src/lib/faro/topePreguntas.ts. Más la
migración 0023 (entregar, no aplicar).
```

**Qué espero de vuelta:** el conteo antes/después contra el piña (≤1), y la
decisión que tomó Claude Code sobre cómo marcó el excedente.

---

## PROMPT ETAPA 2 — Tabla `riesgos_proyecto` + migración 0023

```
Etapa 2 del cierre determinístico. Crear el DESTINO TERMINAL de lo que no
bloquea la convergencia: el mapa de riesgos.

Crea la migración 0023 (o consolídala con lo que ya dejaste pendiente de la
Etapa 1) con la tabla public.riesgos_proyecto:

- id uuid pk default gen_random_uuid()
- project_id uuid not null references projects(id) on delete cascade
- origen text not null check (origen in (
    'contradiccion_delta_ij',   -- δᵢⱼ aceptada como L3
    'pregunta_operativa',       -- solo verificable en ejecución
    'excedente_tope',           -- superó el tope graduado de la Etapa 1
    'error_verificador'         -- marcado por verificador estructural/semántico
  ))
- nodo_tipo text            -- nodo de donde proviene (nullable si es transversal)
- descripcion text not null -- el texto del riesgo/pregunta/contradicción
- severidad text not null check (severidad in ('baja','media','alta')) default 'media'
- actividad_mitigacion_ref text  -- enlace a la actividad de Metodología que lo mitiga (típicamente OE-1), nullable
- pregunta_origen_id uuid references preguntas_pendientes(id)  -- si vino de una pregunta, nullable
- estado text not null check (estado in ('abierto','mitigado','aceptado')) default 'abierto'
- created_at timestamptz not null default now()

Índices: por project_id, y por (project_id, origen).

RLS: usa EXACTAMENTE el patrón canónico de tablas nuevas (el de
preguntas_pendientes / migración 0018, con public.es_admin() y
(select auth.uid()) envuelto en subselect):

  exists (select 1 from public.projects p
    where p.id = riesgos_proyecto.project_id
      and (p.usuario_id = (select auth.uid()) or public.es_admin()))

para select/insert/update. NO uses la variante vieja de grafo_nodos con
usuarios_plataforma.rol inline.

Entrégame el .sql para que Jorge lo aplique manualmente en Supabase — no lo
ejecutes tú.

Crea también src/lib/faro/riesgos.ts con:
- tipos TypeScript RiesgoProyecto / OrigenRiesgo / SeveridadRiesgo
- función registrarRiesgo(supabase, params) que inserta un riesgo
- función migrarPreguntaARiesgo(supabase, pregunta_id) que toma una
  pregunta_pendiente, la inserta en riesgos_proyecto con origen apropiado
  (excedente_tope o pregunta_operativa), y marca la pregunta como
  estado='diferida' (ya existe ese valor en el CHECK). Idempotente: si la
  pregunta ya está en riesgos, no duplica.
- función listarRiesgos(supabase, project_id) para el Dashboard y el
  documento exportado.

Conecta la Etapa 1: las preguntas que quedaron marcadas como excedente en
la Etapa 1 ahora se migran de verdad a riesgos_proyecto vía
migrarPreguntaARiesgo.

VERIFICACIÓN:
1. npx tsc --noEmit limpio.
2. Jorge aplica 0023; confírmame por SQL que la tabla existe con el CHECK
   correcto.
3. Inserta un riesgo de prueba y léelo de vuelta (SQL). Bórralo después.
4. git diff antes de commitear.
```

---

## PROMPT ETAPA 3 — Sellado con confirmación tipo transferencia

```
Etapa 3 del cierre determinístico. El operador de parada HUMANO: sellar un
nodo.

Comportamiento del botón "Aceptar y sellar" en cada pantalla FormulacionXxx:

1. Al pulsarlo, si el nodo tiene preguntas abiertas, mostrar un modal de
   confirmación tipo transferencia bancaria:
   "Este nodo tiene N preguntas abiertas. Al sellarlo, pasarán al mapa de
   riesgos y el nodo quedará protegido contra reapertura. ¿Confirmar?"
   con el LISTADO de esas N preguntas visible antes de confirmar.

2. Al confirmar:
   - marca grafo_nodos.confirmado_humano = true para la iteración vigente
   - migra las preguntas abiertas del nodo a riesgos_proyecto
     (migrarPreguntaARiesgo de la Etapa 2, origen 'excedente_tope' o
     'pregunta_operativa' según corresponda)
   - marca el nodo como PROTEGIDO contra cascada (ver punto 4)

3. Si el nodo NO tiene preguntas abiertas, sellar directo sin modal.

4. PROTECCIÓN CONTRA CASCADA (bug #5 conocido): un nodo sellado no debe
   reabrirse automáticamente por responder una pregunta multinodo aguas
   arriba. Implementación: añade una señal de "sellado" al nodo. Como
   grafo_nodos no tiene columna para esto, decide entre:
   (a) columna nueva grafo_nodos.sellado boolean default false (migración,
       entregar no aplicar), o
   (b) reutilizar confirmado_humano=true como "sellado" y añadir una
       verificación en la lógica de propagación/cascada que NO reabra un
       nodo con confirmado_humano=true sin confirmación explícita del
       usuario.
   Recomiendo (a) porque "confirmado" y "sellado/protegido" son estados
   conceptualmente distintos (un nodo puede estar confirmado y aún así
   Jorge querer reabrirlo con "Reabrir para editar", que ya existe). Dime
   cuál tomas y por qué.

5. DEGRADAR EL BLOQUEO C1 A ADVERTENCIA L3 (corrección de ortodoxia): hoy
   el checkpoint C1 y exigirSinContradiccionRSL BLOQUEAN todo-o-nada. El
   protocolo canónico L3 de FARO dice: "advertencia estructural permanente
   en el documento exportado, NO bloquear la exportación". Cambia el
   comportamiento: cuando el usuario sella/acepta pese a una contradicción,
   la contradicción NO bloquea — se registra en riesgos_proyecto con
   origen='contradiccion_delta_ij' y severidad='alta', y quedará como
   advertencia en el documento exportado (Etapa 4). El verificador SIGUE
   corriendo y SIGUE mostrando la advertencia en pantalla; lo que cambia es
   que deja de ser un muro.

"Reabrir para editar" (api/mci/nodo/reabrir, ya existe) sigue siendo la vía
para que Jorge reabra deliberadamente un nodo sellado — eso es acción
humana explícita, no cascada.

VERIFICACIÓN:
1. npx tsc --noEmit limpio.
2. Contra el piña (de forma reversible): sella un nodo con preguntas
   abiertas → confírmame por SQL que (a) las preguntas quedaron en
   riesgos_proyecto, (b) el nodo quedó sellado/protegido, (c) una respuesta
   a pregunta multinodo aguas arriba NO reabrió ese nodo.
3. git diff antes de commitear.

NO uses el proyecto piña para pruebas destructivas irreversibles. Si
necesitas sellar/reabrir repetidamente, usa un proyecto de descarte.
```

---

## PROMPT ETAPA 4 — Vista de Documento Consolidado + Exportar

```
Etapa 4 del cierre determinístico. La pieza que HOY NO EXISTE: exportar la
propuesta completa. (Hoy solo existe exportación Fase 1: Introducción +
Resumen, en src/lib/faro/sintesisFinal.ts.)

Construye una Vista de Documento Consolidado (nueva pestaña/página) que
ensamble en UN documento:
- los nodos CONFIRMADOS del proyecto, en orden narrativo:
  RUTA (problema/pregunta/alcance) → NOVA (causas) → Marco Referencial →
  Objetivos → Metodología (con cadena de valor Objetivo→Producto→Actividad)
  → Impactos/Delimitación → Presupuesto
- la sección de RIESGOS Y SUPUESTOS al final, renderizando
  listarRiesgos(project_id) de la Etapa 2 como una matriz (origen,
  descripción, severidad, actividad de mitigación). Las contradicciones
  δᵢⱼ aceptadas aparecen aquí como advertencias L3 explícitas.
- reutiliza sintesisFinal.ts (generarIntroduccion/generarResumen) para la
  intro y el resumen — NO dupliques esa lógica.
- reutiliza el humanizadorDocumento.ts existente para el pase final.

BORDE DE UNA SOLA VÍA (regla de diseño crítica de Jorge, no negociable):
- La generación del documento ocurre UNA SOLA VEZ al converger/exportar.
- El documento resultante es SIEMPRE editable, PERO la edición vive EN EL
  DOCUMENTO, nunca retrocede a los nodos ni regenera nodos. Guarda el
  documento como un artefacto (tabla nueva documentos_proyecto, o columna
  jsonb en projects — tú decides, entrega migración si aplica). Las
  ediciones del usuario se guardan sobre ese artefacto, NO sobre los nodos.
- La exportación es una proyección de G al documento. Ediciones
  post-exportación = fuera del grafo.

Botón "Exportar Propuesta Completa":
- formato inicial: Markdown (.md) descargable, y LaTeX (.tex) reutilizando
  plantillas/proyecto_main.tex que ya existe. No hace falta PDF en esta
  etapa.
- la exportación NO exige convergencia formal: si el proyecto no convergió,
  exporta igual, con las advertencias L3 y los riesgos visibles. (Esto es
  lo que Jorge quiere: un documento imperfecto pero real que pueda auditar
  como par evaluador y circular a expertos.)

"Llamada a un amigo" (NO es pieza nueva): en los puntos donde el usuario
edita manualmente el documento, expón el asistente contextual que YA existe
detrás de "No entiendo la pregunta" (el chatbot con contexto del proyecto),
como apoyo permanente. Es advisory: recomienda en prosa cuál de 3 salidas
conviene (regenerar-una-vez / inserción-manual+humanizador / dejar-como-
riesgo). Invocarlo NO regenera nada por sí mismo.

VERIFICACIÓN:
1. npx tsc --noEmit limpio.
2. Exporta el proyecto piña → entrégame el .md real generado, con la
   sección de Riesgos y Supuestos poblada desde riesgos_proyecto.
3. Confírmame que editar el documento exportado NO modificó ningún
   grafo_nodos (SQL: los nodos siguen igual antes/después de editar el doc).
4. git diff antes de commitear.
```

---

## Orden de ejecución y puntos de control

| Etapa | Entrega | Verificación clave | ¿Migración? |
|-------|---------|--------------------|-------------|
| 0 | Tabla de correspondencia de nombres | SQL real de constraints | No |
| 1 | Tope en sincronizarPreguntasPendientes | Preguntas ≤1 por regeneración (piña) | 0023 (dedup) |
| 2 | Tabla riesgos_proyecto + riesgos.ts | Riesgo insertado y leído | 0023 |
| 3 | Sellado + degradación C1→L3 | Preguntas→riesgos, nodo protegido | posible col. sellado |
| 4 | Documento consolidado + exportar | .md real del piña con riesgos | posible doc artefacto |

**Regla transversal a recordarle a Claude Code en cada etapa:** el proyecto
piña (`63e3aa2f-0eec-4628-a1c3-0380d3922025`) NUNCA se usa para pruebas
destructivas. Toda prueba destructiva va en un proyecto de descarte.

**Después de la Tanda 1:** Tanda 2 (contrato tipado NOVA→Objetivos por
causa_id) y Tanda 3 (dashboard de Matriz de Consistencia en vivo). No
arrancar hasta que la Tanda 1 exporte un documento real verificado.
