// ============================================================
// FARO — Nodo NOVA (operador de fundamentación del problema)
// Segundo nodo de contenido de F2, siguiente después de RUTA.
//
// Implementa: P = N(D(θ), B, ρ)
//   D(θ) = delimitación ya producida por RUTA (RutaOutput)
//   B    = evidencia bibliográfica (síntesis de RSL, cuando exista)
//   ρ    = términos de referencia/convocatoria (ya en VectorEstadoInicial)
//
// NOVA = (N, O, V, A) con DOBLE LECTURA cada componente — científica
// y MGA/institucional — según la Tabla 2 de cas-dc-template.tex:
//   N Núcleo: brecha de conocimiento / causa raíz (árbol de problemas)
//   O Onda:   consecuencias de la brecha / efectos (árbol de problemas)
//   V Valor:  contribución teórica-metodológica / justificación social
//   A Avance: novedad frente al estado del arte / TRL comprometido
//
// Mismo patrón de diseño que ruta.ts: un esquema universal, rigor
// variable por nu/tau como PARÁMETROS del prompt, no plantillas
// separadas. Misma regla de honestidad epistémica: NUNCA se afirma
// una brecha, una cifra, o una cadena causal como hecho verificado
// sin que el formulador o RSL la hayan aportado — todo lo que falte
// va a preguntas_para_el_usuario, nunca se rellena por inferencia.
//
// El componente "Avance" (A) se resuelve vía medidaAvanceParaProyecto
// (tipologiaProyecto.ts) — NO pregunta de nuevo el tipo de proyecto,
// lee tau/subtipo_dti ya capturados.
//
// El Componente Contexto (embudo SM/SC/SN/SL/SE con fuentes oficiales
// automatizadas) sigue como pieza PENDIENTE, con su propia ficha de
// diseño — este archivo solo consume cifras que el formulador ya haya
// aportado manualmente, no las busca por su cuenta todavía.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import type { EstadoEvidencia, NivelConfianza, RutaOutput } from "./ruta";
import type { TipoProyecto } from "./types";
import { medidaAvanceParaProyecto, type SubtipoDti, type MedidaAvance } from "./tipologiaProyecto";

export interface PreguntaRespuesta {
  pregunta: string;
  respuesta: string;
}

export interface CifraContexto {
  nivel: "mundial" | "continental" | "nacional" | "regional" | "especifico";
  cifra: string;
  fuente: string;
  // true SOLO si vino de una fuente automatizada verificada (Componente
  // Contexto, pendiente de construir). Mientras no exista, todo lo que
  // el formulador aporte manualmente queda en false — honestidad sobre
  // el origen del dato, no una falsa sensación de verificación.
  verificado: boolean;
}

export interface NovaOutput {
  // N — Núcleo
  nucleo_brecha_conocimiento: string; // lectura científica
  nucleo_causa_raiz: string; // lectura MGA — resultado de la cadena causal
  nucleo_cadena_causal: PreguntaRespuesta[]; // registro de la técnica de los 5 porqués

  // O — Onda
  onda_consecuencias: string; // científica
  onda_efectos_arbol_problema: string; // MGA
  onda_cifras_contexto: CifraContexto[];

  // V — Valor
  valor_contribucion: string; // científica
  valor_justificacion_social: string; // MGA

  // A — Avance
  avance_novedad_estado_arte: string; // científica, apoyada en síntesis de RSL si existe
  avance_medida: MedidaAvance | null; // null si aún falta clasificar subtipo_dti
  avance_detalle: string; // TRL específico, o descripción cualitativa según avance_medida

  problema_formulado: string; // síntesis final completa, P

  estado_evidencia: EstadoEvidencia;
  nivel_confianza_agente: NivelConfianza;
  preguntas_para_el_usuario: string[];
}

/**
 * Campos obligatorios de NOVA para calcularOmega() — mci.ts ya
 * generalizado (sesión 2026-08-09) consume esta lista directamente:
 * calcularOmega(novaOutput, CAMPOS_OBLIGATORIOS_NOVA).
 * avance_medida queda fuera (puede ser null legítimamente si el
 * subtipo DTI aún no se clasificó — no es un campo de texto).
 */
export const CAMPOS_OBLIGATORIOS_NOVA: (keyof NovaOutput)[] = [
  "nucleo_brecha_conocimiento",
  "nucleo_causa_raiz",
  "onda_consecuencias",
  "onda_efectos_arbol_problema",
  "valor_contribucion",
  "valor_justificacion_social",
  "avance_novedad_estado_arte",
  "avance_detalle",
  "problema_formulado",
];

export function construirPromptNova(params: {
  nu: string;
  tau: TipoProyecto;
  subtipoDti: SubtipoDti | null;
  mu: string;
  alphaArea: string;
  rutaOutput: RutaOutput;
  sintesisRSL?: string | null; // sintesis_narrativa del último RSL corrido sobre la hipótesis de RUTA
  vacioDetectadoRSL?: boolean | null;
  cifrasContextoAportadasPorFormulador?: CifraContexto[];
  cadenaCausalAportada?: PreguntaRespuesta[]; // si el formulador ya avanzó los 5 porqués antes de generar
  feedbackIteracionAnterior?: string;
}): string {
  const {
    nu, tau, subtipoDti, mu, alphaArea, rutaOutput,
    sintesisRSL, vacioDetectadoRSL,
    cifrasContextoAportadasPorFormulador, cadenaCausalAportada,
    feedbackIteracionAnterior,
  } = params;

  const rigor =
    nu === "doctorado" ? "alto rigor académico, exigiendo argumentación causal profunda y evidencia robusta"
    : nu === "maestria" ? "rigor académico intermedio, con argumentación clara pero no exhaustiva"
    : nu === "convocatoria" ? "rigor orientado a criterios de evaluación de convocatoria pública (tipo MGA), con foco en trazabilidad causa-efecto-aporte-avance"
    : "rigor apropiado para un proyecto de pregrado, priorizando claridad sobre exhaustividad";

  const medidaAvance = medidaAvanceParaProyecto(tau, subtipoDti);
  const instruccionAvance =
    medidaAvance === "conocimiento"
      ? 'El componente Avance (A) debe medirse como contribución al estado del conocimiento — NO uses ni menciones TRL, avance_medida="conocimiento".'
      : medidaAvance === "trl"
      ? 'El componente Avance (A) debe medirse en escala TRL (1-9) — proyecto de Desarrollo Tecnológico. avance_medida="trl", con un TRL objetivo específico y justificado en avance_detalle.'
      : medidaAvance === "trl_mercado"
      ? 'El componente Avance (A) debe medirse en TRL Y potencial de adopción/mercado — proyecto de Innovación. avance_medida="trl_mercado", cubriendo ambos aspectos en avance_detalle.'
      : 'El tipo de proyecto (subtipo DTI) aún no está clasificado — declara avance_medida=null y agrega una pregunta_para_el_usuario pidiendo que complete esa clasificación (ver ClasificadorSubtipoDti) antes de continuar con Avance.';

  const bloqueEvidenciaRSL = sintesisRSL
    ? `EVIDENCIA BIBLIOGRÁFICA YA VERIFICADA POR RSL (úsala como base real para Núcleo y Avance — NO la contradigas ni la ignores):
"${sintesisRSL}"
${vacioDetectadoRSL ? "RSL declaró un vacío de conocimiento real en este tema — esto RESPALDA nucleo_brecha_conocimiento, puedes declararlo con mayor confianza." : "RSL encontró literatura relacionada — considérala al construir avance_novedad_estado_arte, no ignores lo que ya existe."}`
    : `Todavía no hay síntesis de RSL disponible para la hipótesis de RUTA. Declara nucleo_brecha_conocimiento como HIPÓTESIS (estado_evidencia="sin_verificar"), igual que hace RUTA — no afirmes que la brecha es real sin evidencia bibliográfica.`;

  const bloqueCifras =
    cifrasContextoAportadasPorFormulador && cifrasContextoAportadasPorFormulador.length > 0
      ? `CIFRAS DE CONTEXTO APORTADAS POR EL FORMULADOR (úsalas tal cual, NO inventes cifras adicionales ni las modifiques):
${cifrasContextoAportadasPorFormulador
  .map((c) => `- [${c.nivel}] ${c.cifra} (fuente: ${c.fuente}${c.verificado ? ", verificada" : ", reportada por el formulador, sin verificación automática"})`)
  .join("\n")}

REGLA DE CITACIÓN OBLIGATORIA: cada vez que uses una de estas cifras dentro de un párrafo (Núcleo, Onda, Valor, Avance o problema_formulado), cita la fuente EN LÍNEA, dentro de la misma oración, con formato "(Fuente, año)" — igual que en un texto académico real. NO basta con que la fuente aparezca solo en onda_cifras_contexto; si una cifra se menciona en la prosa, su cita debe ir pegada a esa mención en el mismo párrafo. Ejemplo correcto: "los rendimientos colombianos se ubican entre 41 y 60 t/ha (DANE, 2022), muy por debajo de países líderes como Costa Rica e Indonesia (83-120 t/ha)". Si la fuente aportada no incluye un año explícito, usa el nombre de la fuente tal cual entre paréntesis, sin inventar un año.`
      : `El formulador NO ha aportado cifras oficiales de contexto todavía. NO inventes estadísticas ni cifras específicas — construye onda_efectos_arbol_problema y onda_consecuencias en términos cualitativos, y agrega una pregunta_para_el_usuario pidiendo cifras si es posible obtenerlas (fuente oficial: DANE, FAOSTAT, Gobernación, gremio sectorial, etc.).`;

  const bloqueCadenaCausal =
    cadenaCausalAportada && cadenaCausalAportada.length > 0
      ? `CADENA CAUSAL YA CONSTRUIDA CON EL FORMULADOR (técnica de los 5 porqués — úsala como base de nucleo_causa_raiz, no la reconstruyas desde cero):
${cadenaCausalAportada.map((p, i) => `${i + 1}. ${p.pregunta}\n   → ${p.respuesta}`).join("\n")}`
      : `Todavía no se ha corrido la técnica de los 5 porqués con el formulador. Propón UNA primera pregunta causal ("¿por qué ocurre [problema de RUTA]?") en preguntas_para_el_usuario, para iniciar esa cadena — no inventes la cadena completa por tu cuenta.`;

  return `Eres NOVA, el agente que construye el problema de investigación dentro de FARO, a partir de la delimitación ya producida por RUTA y de la evidencia disponible.

FÓRMULA QUE IMPLEMENTAS: P = N(D(θ), B, ρ) — el problema se construye a partir de la delimitación de RUTA (D(θ)), la evidencia bibliográfica (B, vía RSL) y los términos de referencia (ρ).

CONTEXTO DEL PROYECTO:
- Nivel: ${nu} (aplica ${rigor})
- Tipo: ${tau}${subtipoDti ? ` (subtipo: ${subtipoDti})` : ""}
- Enfoque metodológico: ${mu}
- Área de conocimiento: ${alphaArea}

DELIMITACIÓN YA PRODUCIDA POR RUTA (D(θ) — tu punto de partida, no la contradigas ni la reformules):
- Tema: "${rutaOutput.tema}"
- Problema: "${rutaOutput.problema}"
- Pregunta de investigación: "${rutaOutput.pregunta_investigacion}"
- Objeto de estudio: "${rutaOutput.objeto_estudio}"
- Población/contexto: "${rutaOutput.poblacion_contexto}"
- Hipótesis de vacío/problema (RUTA): "${rutaOutput.vacio_conocimiento_hipotesis.afirmacion}" (estado_evidencia: ${rutaOutput.vacio_conocimiento_hipotesis.estado_evidencia})

${bloqueEvidenciaRSL}

${bloqueCifras}

${bloqueCadenaCausal}

INSTRUCCIÓN SOBRE AVANCE (A): ${instruccionAvance}

TU TAREA: construir los cuatro componentes de NOVA, cada uno con DOBLE LECTURA (científica y MGA/institucional):

- N (Núcleo): causa raíz del problema — lectura científica (brecha de conocimiento) y lectura MGA (causa raíz en árbol de problemas).
- O (Onda): consecuencias del problema — científica (consecuencias de la brecha) y MGA (efectos en árbol de problemas), apoyada en las cifras de contexto disponibles.
- V (Valor): el aporte de la investigación — científica (contribución teórica/metodológica) y MGA (justificación social ante el financiador).
- A (Avance): la novedad/innovación esperada — científica (frente al estado del arte, apoyada en RSL) y MGA (según la instrucción de Avance de arriba).

Cierra con problema_formulado: la síntesis completa en prosa, integrando N-O-V-A en un párrafo coherente tipo planteamiento de problema (contexto → problema central → estado idealizado), siguiendo el patrón: "Las tecnologías/enfoques [X] se han utilizado en [contexto] para [Y]. Esto permitirá mejorar [Z]. La ejecución del proyecto permitirá avanzar hacia [estado ideal], contribuyendo a [impacto]."

REGLA CRÍTICA — misma honestidad epistémica que RUTA: no inventes cifras, no afirmes brechas de conocimiento como hechos sin evidencia, no inventes una cadena causal completa sin el formulador. Si te falta información en cualquier componente, decláralo en preguntas_para_el_usuario en vez de rellenar con suposiciones.
${feedbackIteracionAnterior ? `\nRETROALIMENTACIÓN DE LA ITERACIÓN ANTERIOR (corrige esto):\n${feedbackIteracionAnterior}` : ""}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "nucleo_brecha_conocimiento": "string",
  "nucleo_causa_raiz": "string",
  "nucleo_cadena_causal": [{"pregunta": "string", "respuesta": "string"}],
  "onda_consecuencias": "string",
  "onda_efectos_arbol_problema": "string",
  "onda_cifras_contexto": [{"nivel": "mundial"|"continental"|"nacional"|"regional"|"especifico", "cifra": "string", "fuente": "string", "verificado": boolean}],
  "valor_contribucion": "string",
  "valor_justificacion_social": "string",
  "avance_novedad_estado_arte": "string",
  "avance_medida": "conocimiento" | "trl" | "trl_mercado" | null,
  "avance_detalle": "string",
  "problema_formulado": "string",
  "estado_evidencia": "sin_verificar" | "confirmado_por_rsl" | "contradicho_por_rsl",
  "nivel_confianza_agente": "alta" | "media" | "baja",
  "preguntas_para_el_usuario": ["string"]
}`;
}
