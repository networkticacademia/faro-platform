# Instrucción para Antigravity — Triage con contexto + Procedencia + Propagación quirúrgica + Agrupamiento automático

Contexto: build sobre el bloque ya integrado (Gate C0, clasificación
P1-P3, GateOverlay, PreguntasPendientesAgrupadas, ContadorPreguntasPrioridad).
Este paquete cambia 3 comportamientos y agrega 1 pieza crítica que
requiere tu verificación cuidadosa antes de integrar.

**Regla de siempre: si algo no coincide con el código real, detente y
pregunta.** Esta entrega en particular tiene una pieza deliberadamente
incompleta (`regenerarNodoConFeedback` en `propagacion.ts`) que SOLO tú
puedes completar, porque requiere ver la lógica real de los 6 endpoints
`/generar`.

---

## Paso 1 — Migración

`supabase/migrations/0019_procedencia_dato.sql` — Jorge la aplica
manualmente en Supabase SQL Editor, igual que la anterior. Antes de que
la corra: revisa que no haya datos existentes en `estado_procedencia`
que violen el nuevo CHECK (debería estar vacío en todos, ya que era
placeholder sin uso — confírmalo con `select distinct estado_procedencia
from preguntas_pendientes` antes de aplicar).

## Paso 2 — Código de soporte

| Archivo en el paquete | Destino |
|---|---|
| `lib/faro/procedencia.ts` | igual, archivo nuevo |
| `lib/faro/agrupamiento.ts` | igual, archivo nuevo |
| `lib/faro/propagacion.ts` | igual, archivo nuevo — **ver Paso 3, no está completo a propósito** |

## Paso 3 — LA PIEZA CRÍTICA: conectar `regenerarNodoConFeedback()`

Al final de `lib/faro/propagacion.ts` hay una función placeholder que
lanza error. Debes reemplazarla por la invocación real a la lógica de
regeneración de cada nodo. Antes de decidir cómo, revisa los 6
endpoints `/api/mci/{nodo}/generar` reales y evalúa:

- **Si ya existe (o es fácil extraer sin romper nada) una función pura
  reutilizable** que reciba `(project_id, feedback?)` y haga la
  generación + guardado en `grafo_nodos` — úsala directamente,
  exportándola si hace falta. Es la opción preferida: evita duplicar
  prompts y lógica MCI.
- **Si extraerla es riesgoso** (los 6 endpoints están muy entrelazados
  con el handler HTTP), usa invocación server-to-server vía `fetch` a
  los endpoints ya existentes, con el mismo mecanismo de autenticación
  interna que ya use el resto del backend para llamadas server-side (si
  no existe un mecanismo así todavía, pregúntale a Jorge antes de
  inventar uno).

Cualquiera de las dos opciones que elijas, la función debe:
1. Recibir `nodoTipo`, `project_id`, `feedback` (string).
2. Ejecutar la regeneración de ESE nodo con el feedback como contexto
   adicional (mismo mecanismo que ya usa `ensamblarFeedbackDesdeRespuestas`
   para el flujo manual existente dentro de cada nodo).
3. Dejar que el `sincronizarPreguntasPendientes()` que ya corre al
   final de cada `/generar` haga su trabajo normal (sincronizar
   preguntas nuevas) — no lo dupliques aquí.
4. Lanzar excepción si falla (ya está manejado por el `try/catch` en
   `ejecutarPropagacion()` — no atrapes el error dentro de esta función).

## Paso 4 — Agrupamiento automático (reemplaza el manual)

- Si `app/api/mci/preguntas/agrupar/route.ts` ya existe (de la entrega
  anterior), **modifícalo** para que llame a
  `reagruparPreguntasAbiertas()` de `lib/faro/agrupamiento.ts` en vez de
  tener su propia lógica — evita el prompt duplicado. Puede seguir
  existiendo como "recalcular agrupamiento" manual.
- En `lib/faro/preguntas.ts`, al final de `sincronizarPreguntasPendientes()`,
  después de insertar preguntas nuevas exitosamente (`insertadas > 0`),
  agrega una llamada a `reagruparPreguntasAbiertas(supabase, project_id)`.
  No la llames si `insertadas === 0` — evita costo innecesario.

## Paso 5 — Endpoints nuevos

Colocar tal cual:
- `app/api/mci/preguntas/propagar/route.ts`
- `app/api/mci/preguntas/derivar-busqueda/route.ts`
- `app/api/mci/preguntas/desagrupar/route.ts`

Verificar firma real de `llamarOrquestador()` de nuevo si cambió desde
la entrega anterior.

## Paso 6 — Reemplazar el endpoint de listado

`app/api/mci/preguntas/pendientes/route.ts` — este SÍ reemplaza al
existente (cambio de comportamiento intencional: ya no devuelve las
preguntas crudas, solo raíces con conteo). Verifica que
`ContadorPreguntasPrioridad.tsx` y `PreguntasPendientesAgrupadas.tsx`
(entregas anteriores) sigan funcionando con la nueva forma de respuesta
— el campo `conteo` se mantiene igual, pero `preguntas` ahora trae
`agrupa_count` y `nodos_involucrados` adicionales.

## Paso 7 — Frontend: integrar `TriagePregunta.tsx`

- Colocar en `components/faro/TriagePregunta.tsx`.
- **Reemplaza** el bloque de "Resolver" (textarea directo) tanto en
  `GateOverlay.tsx` como en `PreguntasPendientesAgrupadas.tsx` — en
  ambos casos, donde antes había un textarea + botón "Guardar
  respuesta", ahora va `<TriagePregunta preguntaId={p.id}
  projectId={projectId} textoPregunta={p.texto_pregunta}
  onResuelta={cargar} />` (ajustar nombres de props/callbacks al patrón
  real de cada componente).
- El botón "No entiendo esta pregunta" que ya existía en ambos
  componentes queda REDUNDANTE con el nuevo triage (que ya lo incluye)
  — elimínalo del código externo a `TriagePregunta` para no duplicar la
  opción.

## Paso 8 — Verificación

`npx tsc --noEmit`. No continuar si hay errores.

---

## Qué debe correr Jorge (no Antigravity)

1. Aplicar `0019_procedencia_dato.sql` en Supabase SQL Editor.
2. **Prueba end-to-end en la plataforma real, con el proyecto piña**,
   sobre el hallazgo real que ya identificamos:
   - Ir a la pregunta de "viabilidad de alcance" (Metodología, la que
     debería ser P1 — confirmar primero si ya quedó reclasificada;
     si no, es un ajuste pendiente en `CAMPOS_CRITICOS_POR_NODO`, no de
     este paquete).
   - Responder con "Sí tengo esta información", elegir procedencia
     `conocimiento_directo` o la que aplique.
   - Confirmar que la previsualización de nodos afectados tenga
     sentido.
   - Confirmar y observar si la regeneración en cascada corre sin error.
   - Repetir con la pregunta de "dron multiespectral" (la que agrupa
     Metodología + Impactos + RUTA según nuestro análisis manual) para
     validar que el agrupamiento automático la detectó como un solo
     grupo — si NO la agrupó, es señal de que el prompt de
     `agrupamiento.ts` necesita ajuste.
3. Reportar aquí, con evidencia (capturas o texto exacto), qué pasó en
   cada paso — no solo "funcionó" o "no funcionó".

## Fuera de alcance (todavía)

- Checkpoints C1/C2 — siguen desactivados.
- No tocar `tau`, los 6 prompts originales de generación, ni
  `verificadorSemantico.ts`.
