/**
 * lib/faro/latex/escaparProsa.ts
 *
 * La prosa que devuelve el LLM (generarIntroduccion/generarResumen, en
 * formato='latex') es texto libre en español — puede contener "%" (ej.
 * "39,4%"), "&", "_", etc., que en LaTeX son caracteres especiales. Si se
 * insertan sin escapar en el .tex final, "%" trunca la línea como
 * comentario de forma silenciosa — el documento queda inválido sin ningún
 * error visible. Al mismo tiempo, los comandos \citep{clave}/\citet{clave}
 * que el propio LLM insertó NO deben tocarse: se protegen antes de escapar
 * y se restauran después.
 */

import { escaparLatex } from "../corpus/exportarBib";
import { protegerCitasParaEscape, restaurarCitas } from "./citas";

export function escaparProsaLatexPreservandoCitas(texto: string): string {
  const { protegido, mapa } = protegerCitasParaEscape(texto);
  const escapado = escaparLatex(protegido);
  return restaurarCitas(escapado, mapa);
}
