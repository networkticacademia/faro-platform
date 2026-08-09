// ============================================================
// FARO — Parser determinístico de cifras de contexto
// Interpreta la salida de construirPromptCifrasContexto() (Perplexity
// u otro asistente) — formato fijo "### CIFRA N / Nivel / Cifra /
// Fuente / URL", definido por nosotros mismos en el prompt. Por eso
// NO requiere llamada a LLM: es texto que nuestra propia plantilla
// pidió en un formato exacto, análisis por expresiones regulares es
// suficiente y más rápido/barato que una llamada al orquestador.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import type { CifraContexto } from "@/lib/faro/nova";

const NIVELES_VALIDOS = new Set(["mundial", "continental", "nacional", "regional", "especifico"]);

function normalizarNivel(texto: string): CifraContexto["nivel"] | null {
  const limpio = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // quita tildes: "específico" → "especifico"
  return NIVELES_VALIDOS.has(limpio) ? (limpio as CifraContexto["nivel"]) : null;
}

export interface ResultadoParseoCifras {
  cifras: CifraContexto[];
  bloquesNoReconocidos: number;
}

export function parsearCifrasContexto(textoPegado: string): ResultadoParseoCifras {
  const bloques = textoPegado.split(/#{1,3}\s*CIFRA\s+\d+/i).slice(1); // el primer trozo, antes de "CIFRA 1", se descarta
  const cifras: CifraContexto[] = [];
  let bloquesNoReconocidos = 0;

  for (const bloque of bloques) {
    const nivelMatch = bloque.match(/Nivel:\s*(.+)/i);
    const cifraMatch = bloque.match(/Cifra:\s*([\s\S]+?)(?=\n(?:Fuente|URL):|$)/i);
    const fuenteMatch = bloque.match(/Fuente:\s*([\s\S]+?)(?=\nURL:|$)/i);
    const urlMatch = bloque.match(/URL:\s*(.+)/i);

    const nivel = nivelMatch ? normalizarNivel(nivelMatch[1]) : null;
    const cifraTexto = cifraMatch?.[1]?.trim();
    const fuenteTexto = fuenteMatch?.[1]?.trim();
    const urlTexto = urlMatch?.[1]?.trim();

    if (!nivel || !cifraTexto || !fuenteTexto) {
      bloquesNoReconocidos++;
      continue;
    }

    cifras.push({
      nivel,
      cifra: cifraTexto,
      fuente: fuenteTexto,
      url: urlTexto && urlTexto !== "no disponible" ? urlTexto : undefined,
      verificado: false, // siempre — es texto traído por una herramienta externa, sin verificación automática nuestra
    });
  }

  return { cifras, bloquesNoReconocidos };
}
