# Instrucción para Antigravity — Frontend: preguntas agrupadas, contador Dashboard, Acerca de FARO

**Contexto:** el backend/API de este bloque (Gate C0, clasificación P1-P3,
`preguntas_pendientes`) ya está aplicado y en verificación (backfill en
curso). Este paquete es solo frontend, tres piezas independientes.

---

## 1. `components/faro/PreguntasPendientesAgrupadas.tsx`

**Antes de colocarlo:** abre el `PreguntasPendientes.tsx` real que ya
existe en el repo (construido el 13-ago) y decide con criterio:

- Si ese componente opera DENTRO de un nodo específico (lee
  `preguntas_para_el_usuario` del `contenido` de un nodo y arma el
  feedback para regenerar vía `ensamblarFeedbackDesdeRespuestas()`) —
  **no lo toques, sigue siendo necesario**, es un caso de uso distinto.
- Este componente nuevo es una vista de **proyecto completo**, agrupada
  por prioridad, para el Dashboard o una pestaña propia. Colócalo como
  archivo nuevo, sin fusionar con el existente.
- Pregúntale a Jorge dónde debe vivir la ruta: propongo
  `app/proyectos/[id]/preguntas/page.tsx`, pero confirma la convención
  de rutas real del proyecto antes de crearla.

## 2. `components/faro/ContadorPreguntasPrioridad.tsx`

- Integrar en el Dashboard, junto a `TarjetaConvergencia`.
- A diferencia de `TarjetaConvergencia` (manual, bajo demanda), este
  widget SÍ puede cargar automáticamente al entrar al Dashboard — es
  una simple lectura de conteo (`/api/mci/preguntas/pendientes`), no
  dispara ningún cálculo LLM ni recalcula MCI. No romper esa distinción.
- El `href` apunta a la ruta que se decida en el punto 1 — ajustar si
  cambia.

## 3. `components/faro/AcercaFaroDefinicion.tsx`

- Ubicar en la página estática "Acerca de FARO" **después** del
  diagrama de arquitectura existente (el que ya tiene la fórmula
  central y el mapa visual del framework).
- **No modificar ni reemplazar** el nombre canónico del acrónimo que ya
  está en esa página — este bloque es contenido adicional, no
  sustitución.
- Es contenido estático puro, sin fetch — solo ajustar clases Tailwind
  al sistema de diseño real de la página.

---

## Orden sugerido

1. Colocar los 3 archivos.
2. `npx tsc --noEmit`.
3. Integrar el contador en el Dashboard (punto 2) — es el más simple y
   de menor riesgo.
4. Integrar la definición en Acerca de FARO (punto 3) — sin dependencias.
5. Decidir con Jorge la ruta para la vista agrupada (punto 1) antes de
   crear la página — no asumir la URL sin confirmar.
6. Commit + push solo después de que Jorge revise visualmente las tres
   piezas en el navegador.

## Fuera de alcance

- No tocar `GateOverlay.tsx` ya integrado.
- No tocar `PreguntasPendientes.tsx` original.
- No avanzar checkpoints C1/C2 — siguen desactivados (`activo: false`
  en `gate.ts`) hasta validar C0 con el proyecto piña.
