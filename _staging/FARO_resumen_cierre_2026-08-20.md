# Resumen de Cierre de Sesión - FARO Platform (2026-08-20)

Este documento sirve como bitácora y estado de transferencia para continuar el desarrollo del proyecto en cualquier otro equipo sincronizado mediante Git, utilizando el asistente **Antigravity**.

---

## 1. Trabajo Realizado en esta Sesión

### A. Correcciones de Datos y Robustez (Null-Safety)
* **Limpieza en BD:** Se eliminó un registro duplicado para el nodo **RUTA** en la tabla `grafo_nodos` correspondiente a la iteración 32, resolviendo un conflicto en el historial.
* **Control de Nulls en Formularios:** Se agregó filtrado defensivo `.filter(Boolean)` a la lista de historial de iteraciones de todos los 6 componentes de formulación (`Ruta`, `Objetivos`, `Nova`, `Metodología`, `Marco Referencial`, `Impactos y Delimitación`), previniendo errores por nodos vacíos o indefinidos.
* **Manejo de Circuito Detenido:** Se adaptó el frontend de los componentes para capturar limpiamente la respuesta `{ circuito_detenido: true }` y mostrar el banner explicativo en lugar de intentar añadir un nodo indefinido a la UI.

### B. Separación de Pre-propuesta y Humanización
* **Borrador en Bruto por Defecto:** Se modificó la API de consulta de la propuesta consolidada (`GET /api/mci/proyecto/documento`) para que devuelva el Markdown **en bruto** por defecto. Esto preserva la nomenclatura exacta e IDs (`CAUSA-X`, `OE-X`, `VAR-X`) requeridos para la trazabilidad y la auditoría interna.
* **Agente Humanizador FARO:** Se creó el servicio del humanizador científico en [`humanizador.ts`](file:///d:/Documents/GitHub/faro-platform/src/lib/faro/humanizador.ts) cargando las directrices académicas Q1. Se implementó una **regla de oro** de no-invención: la IA no puede agregar ideas ni alterar los hechos de los nodos, solo refinar el estilo (cero guiones largos `—`, voz activa y eliminación de AI-speak).
* **Servicio de Humanización Bajo Demanda:** Se creó la ruta `/api/mci/proyecto/humanizar` para aplicar esta humanización únicamente cuando el usuario lo solicite explícitamente para impresión o descarga.

### C. Registro de Autor y Asistente de Título
* **Metadatos del Autor:** Se implementó el paso 1 en la pantalla de la propuesta para registrar los datos reales del investigador (Nombre, Filiación institucional, Facultad, Programa, Rol), guardándolos dentro de la metadata del documento consolidado.
* **Generador de Títulos Científicos:** Se desarrolló la API `/api/mci/proyecto/titulo` que, basándose en la pregunta de investigación y el objetivo general, propone:
  * **Opción A (Simetría Absoluta - Hilo Dorado):** Una frase nominal pura idéntica al objetivo general sin verbos infinitivos de Bloom.
  * **Opción B (Baena Paz / PICO-SPIDER):** Un título de dos partes separado por dos puntos (`:`) con gancho de publicación y delimitaciones espaciales/temporales.
  * **Sugerencia de 5 Palabras Clave (Regla 2-2-1):** Genera descriptores que complementan el título (2 temáticos, 2 técnicos/metodológicos, 1 contexto) y que **no duplican** palabras de las opciones de títulos.
* El autor selecciona/edita el título y palabras clave, los cuales se actualizan en las columnas correspondientes del proyecto.

### D. Visualización e Interactividad LaTeX
* **Enlaces de Citas Activos (hyperref):** Se editó la plantilla LaTeX base [`proyecto_main.tex`](file:///d:/Documents/GitHub/faro-platform/plantillas/proyecto_main.tex) agregando el paquete `hyperref` configurado con links de color azul (`citecolor=blue`, `linkcolor=blue`). Al compilar en Overleaf, hacer clic en cualquier cita redirige automáticamente a la sección de referencias.
* **Previsualización de Impresión en Vivo (LaTeX Style):** Se implementó el componente [`LaTeXPreview.tsx`](file:///d:/Documents/GitHub/faro-platform/src/components/faro/LaTeXPreview.tsx) que renderiza el borrador humanizado simulando una hoja A4 académica (márgenes LaTeX de 1 pulgada, tipografía Serif, resumen cursiva indentado, justificación de texto y numeración de secciones).
* **Menú Navegación:** Se quitó la pestaña "Propuesta" del menú general [`NavegacionNodos.tsx`](file:///d:/Documents/GitHub/faro-platform/src/components/faro/NavegacionNodos.tsx) y se trasladó como una tarjeta premium especial integrada en el Dashboard del proyecto (`DashboardProyecto.tsx`) debajo de la matriz de convergencia.

---

## 2. Próximos Pasos (Hoja de Ruta para continuar en otro equipo)

Cuando cargues este proyecto en otro computador usando Git y abras Antigravity, puedes pedirle que proceda con los siguientes puntos de la Tanda 2:

1. **Revisar e implementar los Contratos Tipo NOVA:**
   * Diseñar o estructurar los tipos de contratos correspondientes al nodo NOVA.
2. **Asociación de Objetivos por Causa ID (`causa_id`):**
   * Completar la correspondencia de objetivos específicos asociándolos estrictamente a los IDs de causas en las iteraciones y el circuito de convergencia.
3. **Optimización de SIGMA Guard (Opcional):**
   * Integrar verificadores semánticos adicionales entre los nodos en bruto para reportar advertencias contextuales antes del cálculo final de L_FARO.
