/**
 * lib/faro/latex/citas.ts
 *
 * Utilidades sobre comandos \citep{}/\citet{} — usadas en dos lugares que
 * deben coincidir exactamente: (1) escaparProsa.ts, para no romper los
 * comandos de cita al escapar caracteres especiales de LaTeX en la prosa
 * generada por el LLM; (2) humanizadorDocumento.ts (Fase 4), para probar
 * que el Humanizador no pierde, corrompe ni deforma ningún \cite al pasar
 * por encima de un documento ya en formato LaTeX.
 */

const REGEX_CITA = /\\cite[pt]\{[^}]*\}/g;

/**
 * Menciones de autor/año en TEXTO PLANO, ej. "(Liang et al., 2022; Yao et
 * al., 2024)" — legítimas cuando vienen de datos ya confirmados (NOVA
 * onda_cifras_contexto) pero SIN clave BibTeX real en corpus_fuentes, por
 * lo que sintesisFinal.ts (formato='latex') las deja deliberadamente como
 * texto plano en vez de \citep{}/\citet{}. Probado en vivo (ago-2026):
 * pedirle al Humanizador por instrucción que NO las convierta en \cite{}
 * no fue suficiente — dos corridas reales contra el proyecto piña
 * mostraron que igual las formaliza en comandos inválidos (claves con
 * espacios/comas rompen la compilación). Por eso se protegen con el MISMO
 * mecanismo de placeholder que los \cite reales — igual que el problema
 * de fabricación de Casanare en la sesión: instrucción de texto sola no
 * alcanza, hace falta blindaje estructural.
 */
const REGEX_CITA_PLANA_PARENTESIS = /\([^()]*?(?:19|20)\d{2}[a-z]?[^()]*?\)/g;

export function extraerComandosCita(texto: string): string[] {
  return texto.match(REGEX_CITA) ?? [];
}

export function protegerCitasParaEscape(texto: string): { protegido: string; mapa: string[] } {
  const mapa: string[] = [];
  const protegido = texto.replace(REGEX_CITA, (match) => {
    mapa.push(match);
    return `@@CITAFARO${mapa.length - 1}@@`;
  });
  return { protegido, mapa };
}

/**
 * Igual que protegerCitasParaEscape, pero además protege menciones de
 * autor/año en texto plano — pensado para el Humanizador (formato
 * 'latex'), no para el escape de caracteres LaTeX (donde el texto plano
 * de cita no necesita protección especial, solo los \cite reales).
 */
export function protegerTextoCitableParaHumanizador(texto: string): { protegido: string; mapa: string[] } {
  const mapa: string[] = [];
  const protegidoCites = texto.replace(REGEX_CITA, (match) => {
    mapa.push(match);
    return `@@CITAFARO${mapa.length - 1}@@`;
  });
  const protegido = protegidoCites.replace(REGEX_CITA_PLANA_PARENTESIS, (match) => {
    mapa.push(match);
    return `@@CITAFARO${mapa.length - 1}@@`;
  });
  return { protegido, mapa };
}

export function restaurarCitas(textoProtegido: string, mapa: string[]): string {
  return textoProtegido.replace(/@@CITAFARO(\d+)@@/g, (_, i) => mapa[Number(i)] ?? "");
}
