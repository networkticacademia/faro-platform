# Instrucción para Antigravity — FASE 1: Gate + Checkpoints + Clasificación de preguntas (P0-P3)

Contexto completo en `FARO_auditoria_fase0_supervision_adaptativa.md` y
`FARO_fase1_gate_checkpoints_preguntas.md` (ya en el repo/proyecto de Jorge).
Este es el detalle de ejecución archivo por archivo.

**Principio general: si algo no está especificado o no coincide con el
esquema/tipos reales, detente y pregunta — no asumas.** Varios archivos
de este paquete incluyen supuestos explícitos marcados como
"IMPORTANTE PARA ANTIGRAVITY" que debes verificar antes de integrar.

---

## Orden de ejecución (no saltarse pasos)

### Paso 1 — Migración de base de datos
- **Archivo:** `supabase/migrations/0013_preguntas_pendientes.sql`
- **Acción:** Jorge la aplica MANUALMENTE en Supabase SQL Editor. Tú no la ejecutas.
- **Tu tarea:** antes de que Jorge la aplique, revisa el archivo y confirma o corrige:
  1. Que el patrón RLS coincide con `0007_fix_recursion_rls.sql`.
  2. Que `projects.usuario_id` es el nombre real de la columna de propiedad.
  3. Que no hay colisión con nombres de tabla/columna ya existentes.
- Reporta cualquier ajuste necesario antes de que Jorge la corra.

### Paso 2 — Código de soporte (sin integrar todavía)
Colocar tal cual, sin modificar lógica, solo ajustar imports si la
convención de paths (`@/lib/...`) difiere de la real del repo:

| Archivo en `_staging/` | Destino en el repo |
|---|---|
| `lib/faro/clasificacionPreguntas.ts` | `lib/faro/clasificacionPreguntas.ts` |
| `lib/faro/preguntas.ts` | `lib/faro/preguntas.ts` |
| `lib/faro/gate.ts` | `lib/faro/gate.ts` |

**Antes de continuar al paso 3:** contrastar `CAMPOS_CRITICOS_POR_NODO` en
`clasificacionPreguntas.ts` contra los campos reales de `RutaOutput`,
`NovaOutput`, `ObjetivosOutput`, `MetodologiaOutput`,
`MarcoReferencialOutput`, `ImpactosOutput`. Ajustar las claves del
diccionario a los nombres reales. Si algún campo crítico no tiene
equivalente claro, dejarlo fuera del diccionario (cae al default P2) y
reportarlo en vez de adivinar.

También contrastar `extraerPreguntasDelNodo()` en `preguntas.ts` contra la
forma real de `preguntas_para_el_usuario` (¿`string[]` o
`{campo, pregunta}[]`?) y ajustar si difiere de lo asumido.

### Paso 3 — Endpoints API
Colocar tal cual (ajustando imports/paths si difieren):

| Archivo en `_staging/` | Destino en el repo |
|---|---|
| `app/api/mci/gate/verificar/route.ts` | igual |
| `app/api/mci/preguntas/pendientes/route.ts` | igual |
| `app/api/mci/preguntas/responder/route.ts` | igual |
| `app/api/mci/preguntas/explicar/route.ts` | igual |
| `app/api/mci/preguntas/agrupar/route.ts` | igual |

**Antes de integrar `explicar/route.ts` y `agrupar/route.ts`:** verificar
la firma real de `llamarOrquestador()` en `lib/openrouter/client.ts` (se
asumió `(prompt: string) => Promise<string>`). Ajustar la llamada si el
contrato real difiere (por ejemplo si requiere modelo explícito o
devuelve un objeto en vez de string).

Correr `npx tsc --noEmit` después de este paso. No continuar si hay
errores de tipos sin resolver.

### Paso 4 — Backfill (una sola vez)
- **Archivo:** `scripts/backfill_preguntas_pendientes.ts`
- **Antes de correrlo:** confirmar el nombre real de la columna que
  distingue el tipo de nodo en `grafo_nodos` (el script asume `tipo`,
  ajustar `mapearTipoNodo()` y el `.select()` si el nombre real es otro).
- **Ejecutar** con el runner que use el repo (ej. `npx tsx ...`).
- **Verificación obligatoria con evidencia cruda** (no reportar "quedó
  listo" sin esto):
  ```sql
  select count(*) from grafo_nodos;
  select nodo_tipo, count(*) from preguntas_pendientes group by nodo_tipo;
  ```
  Contrastar el total contra las 37 preguntas conocidas del proyecto piña
  (6 en RUTA, 3 en NOVA, resto en los demás nodos) antes de dar el paso
  por cerrado.

### Paso 5 — Conectar sincronización en vivo
En cada uno de los 6 endpoints `/api/mci/{nodo}/generar` ya existentes,
agregar la llamada a `sincronizarPreguntasPendientes()` siguiendo la
instrucción documentada al final de `lib/faro/preguntas.ts`. **No
modificar ninguna otra línea de esos endpoints.**

Correr `npx tsc --noEmit` de nuevo.

### Paso 6 — Frontend: GateOverlay
- **Archivo:** `components/faro/GateOverlay.tsx`
- Ajustar clases/estilos al sistema de diseño real del repo (el archivo
  usa Tailwind genérico de ejemplo, no calibrado contra el resto de la
  plataforma).
- Integrar SOLO en el punto de navegación hacia la pestaña **Objetivos**
  (checkpoint C0) por ahora — no en las demás pestañas todavía. Antes de
  permitir el cambio de pestaña, llamar a `/api/mci/gate/verificar` con
  `checkpoint: "C0"`; si `bloqueado: true`, mostrar `GateOverlay` en vez
  de navegar.

### Paso 7 — Validar con proyecto piña real
Con Jorge: abrir el proyecto piña, confirmar que el Gate C0 se comporta
como se espera con las preguntas P1 reales de RUTA/NOVA ya backfilleadas.
Si el Gate resulta demasiado agresivo (bloquea con preguntas que en
realidad no son P1), ajustar `CAMPOS_CRITICOS_POR_NODO` antes de
extender a C1/C2 — eso queda para una siguiente instrucción, NO
implementar C1/C2 todavía en este paquete.

### Paso 8 — Commit
Commit + push solo después de que el paso 7 esté validado con Jorge, no
antes. Mensaje de commit sugerido:
`feat(gate): checkpoint C0 + clasificación P0-P3 de preguntas pendientes + ayuda contextual`

---

## Fuera de alcance de este paquete (no implementar)

- Checkpoints C1 y C2 (quedan definidos en `gate.ts` pero con `activo: false`).
- Propagación quirúrgica (respuesta → regeneración automática de nodos dependientes).
- Confirmación/persistencia del agrupamiento P0 propuesto por
  `agrupar/route.ts` (hoy solo devuelve la propuesta, no escribe
  `pregunta_raiz_id` — eso es un endpoint adicional del siguiente bloque).
- Procedencia transversal del dato (`estado_procedencia` queda como
  columna placeholder, sin lógica).
- Cualquier cambio a `tau`, a los 6 prompts de generación de nodos, o a
  `verificadorSemantico.ts` / `convergenciaProyecto.ts`.
