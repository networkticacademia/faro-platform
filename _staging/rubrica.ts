// ============================================================
// FARO — Ingesta de rúbrica de evaluación / términos de referencia
//
// Primera pieza del mecanismo de "Capa 2" (evidencia y elegibilidad)
// especificado por Jorge: antes de verificar si un proyecto CUBRE los
// requisitos de su rúbrica, hay que convertir esa rúbrica (texto libre,
// pegado o subido) en una lista de ítems puntuables estructurados, cada
// uno con el nodo de FARO donde se espera que ese ítem tenga cobertura.
//
// Esto NO verifica todavía si el proyecto cumple — solo extrae QUÉ hay
// que verificar y DÓNDE. La verificación de cobertura real (comparar
// contra el contenido de cada nodo) es la siguiente pieza, pendiente.
// ============================================================

export type NodoFaro =
  | "RUTA"
  | "NOVA"
  | "OBJETIVOS"
  | "METODOLOGIA"
  | "MARCO_REFERENCIAL"
  | "IMPACTOS_DELIMITACION"
  | "PRESUPUESTO"
  | "TRANSVERSAL"; // aplica a todo el proyecto, no a un nodo específico

export type TipoRubrica = "convocatoria" | "proyecto_grado" | "otra";

export interface ItemRubrica {
  id: string; // asignado en código tras la extracción (ITEM-1, ITEM-2...)
  descripcion: string; // texto del ítem tal como aparece en la rúbrica
  peso: number | null; // puntos o porcentaje, si la rúbrica lo declara — null si no aplica
  nodo_esperado: NodoFaro[]; // uno o más nodos donde debería tener cobertura
  criterio_verificacion: string; // qué debe poder leerse en el proyecto para considerarlo cubierto
  es_enfoque_diferencial_territorial: boolean; // marca los ítems tipo "zona PDET", "mujeres", "discapacidad" — no son de calidad metodológica, son de elegibilidad/equidad
}

export interface RubricaProyecto {
  tipo_rubrica: TipoRubrica;
  nombre_convocatoria_o_fuente: string | null; // ej. "Convocatoria 963-2025 Orquídeas", o null si es genérica
  items: ItemRubrica[];
  puntaje_total_declarado: number | null; // ej. 100, si la rúbrica lo especifica
  fecha_carga: string; // ISO, asignada en código
}

export const CAMPOS_OBLIGATORIOS_RUBRICA: (keyof RubricaProyecto)[] = [
  "tipo_rubrica",
  "items",
];

// ============================================================
// Asignación determinística de IDs — igual que en los demás nodos,
// el LLM no numera, se asigna después en código.
// ============================================================

export function asignarIdsRubrica(rubrica: RubricaProyecto): RubricaProyecto {
  return {
    ...rubrica,
    items: rubrica.items.map((item, i) => ({ ...item, id: `ITEM-${i + 1}` })),
  };
}

// ============================================================
// construirPromptExtraccionRubrica()
// ============================================================

export function construirPromptExtraccionRubrica(params: {
  textoRubrica: string;
  nu: string; // nivel del proyecto (pregrado/maestria/doctorado/convocatoria) — orienta qué tipo de rúbrica es probable
}): string {
  const { textoRubrica, nu } = params;

  return `Eres el agente de ingesta de rúbricas de FARO. Tu tarea es leer el texto de una rúbrica de evaluación o términos de referencia (pegado por el formulador, tal cual, sin reformatear) y extraer una lista estructurada de ítems puntuables — SIN evaluar ni inventar contenido del proyecto, solo estructurar lo que la rúbrica exige.

CONTEXTO: el proyecto que se va a formular es de nivel "${nu}". Si la rúbrica que sigue es claramente de convocatoria pública (menciona enfoque diferencial, desarrollo regional, alianzas, apropiación social con comunidades) o de evaluación académica (menciona objetivos, metodología, marco teórico, estado del arte, sin territorio ni enfoque diferencial), clasifícala como corresponda en tipo_rubrica — no asumas por el nivel del proyecto, lee la rúbrica misma.

TEXTO DE LA RÚBRICA (tal como lo aportó el formulador):
"""
${textoRubrica}
"""

PARA CADA ÍTEM PUNTUABLE que identifiques en el texto:

1. descripcion: el texto del ítem, resumido pero fiel al original — no lo reescribas de más.
2. peso: el puntaje o porcentaje que la rúbrica le asigna, si lo declara explícitamente. Si no hay un peso claro para ese ítem específico, usa null — NO inventes un número.
3. nodo_esperado: a cuál(es) de estos nodos de FARO corresponde verificar este ítem — usa EXACTAMENTE estos valores, uno o más por ítem:
   "RUTA" (delimitación: espacio/tiempo/población/alcance)
   "NOVA" (problema, árbol de causas/efectos, justificación)
   "OBJETIVOS" (objetivo general/específicos, hipótesis/variables)
   "METODOLOGIA" (diseño, técnicas, actividades, cronograma, productos)
   "MARCO_REFERENCIAL" (marco teórico/conceptual/contextual/legal)
   "PRESUPUESTO" (rubros, cofinanciación)
   "TRANSVERSAL" (aplica a todo el proyecto, no a una sección puntual — ej. "coherencia general", "redacción")
4. criterio_verificacion: en una frase, qué debería poder leerse literalmente en esa sección del proyecto para considerar el ítem cubierto. Sé concreto y verificable, no genérico. Ejemplo bueno: "El texto de NOVA/Metodología menciona explícitamente el municipio o zona PDET declarada como área de impacto". Ejemplo malo (evita esto): "Que el proyecto sea territorial".
5. es_enfoque_diferencial_territorial: true si el ítem es sobre equidad, género, discapacidad, víctimas del conflicto, grupos étnicos, territorio priorizado (PDET/ZOMAC) o similar — false si es sobre calidad científica/metodológica/técnica. Esta distinción importa porque son dos capas de evaluación distintas (calidad intrínseca vs. evidencia de elegibilidad), y la pérdida de puntos en la segunda capa NO se corrige mejorando el diseño metodológico.

REGLA CRÍTICA — no inventes ítems que no estén en el texto, y no fusiones dos ítems distintos en uno solo aunque estén en la misma línea. Si un ítem menciona varios subcriterios con pesos individuales (ej. "1.1 Calidad técnica 35%, 1.2 Apropiación social 5%"), sepáralos en ítems distintos.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "tipo_rubrica": "convocatoria" | "proyecto_grado" | "otra",
  "nombre_convocatoria_o_fuente": "string" | null,
  "items": [
    {
      "descripcion": "string",
      "peso": number | null,
      "nodo_esperado": ["RUTA"|"NOVA"|"OBJETIVOS"|"METODOLOGIA"|"MARCO_REFERENCIAL"|"IMPACTOS_DELIMITACION"|"PRESUPUESTO"|"TRANSVERSAL"],
      "criterio_verificacion": "string",
      "es_enfoque_diferencial_territorial": boolean
    }
  ],
  "puntaje_total_declarado": number | null
}
`;
}

// ============================================================
// Verificación de cobertura de rúbrica — término Φ de la fórmula
// extendida de L_FARO (L_FARO = Σwᵢδᵢ + Σwᵢⱼδᵢⱼ + γΩ + βΔ(z₀*,B,G) +
// κΦ(z₀*,R)). Dos pasos, igual que en toda la plataforma: el LLM
// evalúa cada ítem por separado CON EVIDENCIA CITADA (nunca un
// porcentaje directo), el CÓDIGO agrega de forma determinística.
// ============================================================

export type EstadoCobertura = "cubierto" | "parcial" | "no_cubierto";

export interface CoberturaItem {
  item_id: string; // el id del ItemRubrica correspondiente
  estado_cobertura: EstadoCobertura;
  evidencia_textual: string | null; // cita exacta del nodo que respalda la cobertura, o null si no hay
  justificacion: string;
}

export function construirPromptVerificacionCobertura(params: {
  item: ItemRubrica;
  contenidoNodoResumido: string; // extracto relevante del/los nodo(s) esperado(s), ya armado por el endpoint
}): string {
  const { item, contenidoNodoResumido } = params;

  return `Eres el verificador de cobertura de rúbrica de FARO. Tu única tarea es determinar si el siguiente ítem de la rúbrica está cubierto por el contenido real del proyecto — con evidencia citada, nunca por impresión general.

ÍTEM A VERIFICAR: "${item.descripcion}"
CRITERIO DE VERIFICACIÓN: "${item.criterio_verificacion}"
${item.es_enfoque_diferencial_territorial ? `\nADVERTENCIA — este ítem es de ENFOQUE DIFERENCIAL/TERRITORIAL: NUNCA puede declararse "cubierto" completo solo porque el texto lo menciona. El máximo posible es "parcial", con la justificación explícita de que requiere soporte documental adjunto (certificados, actas, etc.) que un texto por sí solo no puede demostrar. Esta regla viene de un caso real (PROY-141612): un proyecto declaró enfoque diferencial en el texto sin documentos de soporte y perdió 8/10 puntos en evaluación real.` : ""}

CONTENIDO REAL DEL PROYECTO (nodo(s) esperado(s) para este ítem):
"""
${contenidoNodoResumido}
"""

REGLA CRÍTICA — evidencia citada obligatoria: si declaras "cubierto" o "parcial", debes citar el texto EXACTO del contenido de arriba que lo respalda en evidencia_textual. Si no hay ningún texto que lo respalde, declara "no_cubierto" con evidencia_textual=null — NUNCA declares cobertura sin poder señalar dónde está.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional:
{
  "estado_cobertura": "cubierto" | "parcial" | "no_cubierto",
  "evidencia_textual": "string (cita exacta)" | null,
  "justificacion": "string"
}
`;
}

// Agregación determinística en código — NO es el LLM diciendo un
// porcentaje directo. Ítems sin peso declarado en la rúbrica original
// se excluyen del cálculo (no se les asume un peso arbitrario).
export function calcularPhi(
  items: ItemRubrica[],
  coberturas: CoberturaItem[]
): { phi: number; itemsConsiderados: number; itemsSinPeso: number } {
  const puntajeCobertura: Record<EstadoCobertura, number> = {
    cubierto: 1,
    parcial: 0.5,
    no_cubierto: 0,
  };

  let sumaPonderada = 0;
  let sumaPesos = 0;
  let itemsSinPeso = 0;

  for (const item of items) {
    if (item.peso === null) {
      itemsSinPeso++;
      continue;
    }
    const cobertura = coberturas.find((c) => c.item_id === item.id);
    if (!cobertura) continue;
    sumaPonderada += item.peso * puntajeCobertura[cobertura.estado_cobertura];
    sumaPesos += item.peso;
  }

  const phi = sumaPesos > 0 ? sumaPonderada / sumaPesos : 0;

  return {
    phi: Math.round(phi * 1000) / 1000,
    itemsConsiderados: items.length - itemsSinPeso,
    itemsSinPeso,
  };
}

