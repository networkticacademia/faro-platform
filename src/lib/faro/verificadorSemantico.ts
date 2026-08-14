// ============================================================
// FARO — Verificador semántico entre nodos (δᵢⱼ)
//
// Complementa a verificadorEstructural.ts: ese confirma que un ID
// REFERENCIADO EXISTE (integridad referencial, determinístico). Este
// confirma que la referencia TIENE SENTIDO SUSTANTIVO — que Objetivos
// realmente invierte la causa que dice invertir, no solo que el ID
// coincide. Requiere LLM, con evidencia citada obligatoria (mismo
// principio anti-alucinación que RSL: nunca "parece incoherente" sin
// citar el texto exacto de origen y destino).
//
// Solo se evalúan los PARES que la arquitectura declara como
// dependientes (matriz fija) — no todos los nodos contra todos, que no
// tendría sentido (comparar RUTA contra Impactos directamente no aporta).
// ============================================================

import type { NodoFaro } from "./rubrica";

export interface ParDependencia {
  nodoOrigen: NodoFaro;
  nodoDestino: NodoFaro;
  descripcionRelacion: string;
}

export const MATRIZ_DEPENDENCIA: ParDependencia[] = [
  {
    nodoOrigen: "RUTA",
    nodoDestino: "NOVA",
    descripcionRelacion:
      "NOVA construye el problema (P = N(D(θ),B,ρ)) a partir de la delimitación de RUTA. Verificar: ¿el problema formulado en NOVA es coherente con el objeto de estudio, población y alcance ya delimitados en RUTA, sin reformular ni contradecir esa delimitación?",
  },
  {
    nodoOrigen: "NOVA",
    nodoDestino: "OBJETIVOS",
    descripcionRelacion:
      "Cada objetivo específico declara invertir una causa de NOVA (por causa_id). Verificar: ¿el objetivo realmente invierte esa causa específica de forma lógica y sustantiva — no una causa distinta, no una versión debilitada o genérica de ella?",
  },
  {
    nodoOrigen: "OBJETIVOS",
    nodoDestino: "METODOLOGIA",
    descripcionRelacion:
      "Cada plan de productos/actividades declara ejecutar un objetivo específico (por objetivo_id). Verificar: ¿los productos y actividades propuestos son suficientes y pertinentes para alcanzar ESE objetivo específico, no uno genérico o distinto?",
  },
  {
    nodoOrigen: "OBJETIVOS",
    nodoDestino: "MARCO_REFERENCIAL",
    descripcionRelacion:
      "El Marco Conceptual declara operacionalizar las variables/categorías de Objetivos (por variable_o_categoria_id). Verificar: ¿las definiciones conceptuales son coherentes con cómo esas variables se usan realmente en Objetivos (mismo tipo, mismo nivel de medición, mismo sentido)?",
  },
  {
    nodoOrigen: "METODOLOGIA",
    nodoDestino: "IMPACTOS_DELIMITACION",
    descripcionRelacion:
      "Los recursos, riesgos e impactos declarados deben derivarse de las técnicas/actividades/productos reales de Metodología. Verificar: ¿los recursos tecnológicos declarados corresponden a lo que las técnicas de Metodología realmente requieren, y los riesgos son específicos a esas actividades, no genéricos?",
  },
];

export interface HallazgoIncoherencia {
  severidad: "critica" | "advertencia";
  elemento: string; // qué parte específica del nodo destino tiene el problema
  evidencia_origen: string; // cita textual exacta del nodo origen
  evidencia_destino: string; // cita textual exacta del nodo destino
  explicacion: string; // por qué son incoherentes entre sí
}

export interface ResultadoCoherenciaPar {
  nodoOrigen: NodoFaro;
  nodoDestino: NodoFaro;
  delta_ij: number; // 0 = perfectamente coherente, 1 = incoherencia total
  hallazgos: HallazgoIncoherencia[];
  resumen: string; // 1-2 frases, para mostrar en el Dashboard sin abrir detalle
}

// ============================================================
// construirPromptVerificacionSemantica()
// ============================================================

export function construirPromptVerificacionSemantica(params: {
  par: ParDependencia;
  contenidoOrigenResumido: string; // extracto relevante del nodo origen, ya armado por el endpoint
  contenidoDestinoResumido: string; // extracto relevante del nodo destino
}): string {
  const { par, contenidoOrigenResumido, contenidoDestinoResumido } = params;

  return `Eres el verificador semántico de FARO. Tu única tarea es comparar dos fragmentos de un mismo proyecto de investigación y determinar si el segundo (destino) es sustantivamente coherente con el primero (origen), según esta relación específica:

"${par.descripcionRelacion}"

REGLA CRÍTICA — evidencia citada obligatoria, sin excepción: cada hallazgo de incoherencia debe citar el texto EXACTO del origen y el texto EXACTO del destino que están en conflicto. NUNCA escribas "parece incoherente" o "no está claro" sin la cita textual precisa de ambos lados. Si no encuentras una incoherencia real y citable, no la inventes — declara coherencia.

REGLA CRÍTICA — no confundas parafraseo con incoherencia: que el destino use palabras distintas al origen NO es una incoherencia por sí sola. Solo es incoherencia real cuando el SENTIDO o la SUSTANCIA cambia — una causa distinta, un objetivo que no ataca lo que dice atacar, una variable operacionalizada de forma distinta a como se declaró.

CONTENIDO DEL NODO ORIGEN (${par.nodoOrigen}):
"""
${contenidoOrigenResumido}
"""

CONTENIDO DEL NODO DESTINO (${par.nodoDestino}):
"""
${contenidoDestinoResumido}
"""

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional:
{
  "delta_ij": number entre 0 y 1 (0 = perfectamente coherente, 1 = incoherencia total; usa valores intermedios como 0.3 para incoherencias parciales/menores),
  "hallazgos": [{"severidad": "critica"|"advertencia", "elemento": "string", "evidencia_origen": "string (cita textual exacta)", "evidencia_destino": "string (cita textual exacta)", "explicacion": "string"}],
  "resumen": "string (1-2 frases para mostrar sin abrir detalle)"
}
`;
}
