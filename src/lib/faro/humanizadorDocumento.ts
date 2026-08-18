/**
 * lib/faro/humanizadorDocumento.ts
 *
 * Fase 4 — Integrar Humanizador. Corre UNA sola vez sobre el documento
 * consolidado completo (todas las secciones ya ensambladas), nunca nodo
 * por nodo — decisión explícita de Jorge. Reutiliza las reglas de la
 * skill humanizador-cientifico-q1 (cargada por separado, no un archivo
 * local — ver comentario en sintesisFinal.ts sobre cómo se sirven las
 * skills en este entorno).
 *
 * DEFAULT DE NIVEL: la skill humanizador-cientifico-q1 define su propio
 * default como Nivel 2 ("Humanización estándar"), no Nivel 3 ("Elevación
 * Q1") — "Si el usuario no especifica nivel, aplicar Nivel 2 por
 * defecto." Por eso NIVEL_DEFAULT aquí es "estandar", NO "elevacion_q1"
 * como se asumió al pedir esta pieza. Pendiente de confirmar con Jorge
 * cuál quiere como default de producción antes de wire-earlo a cualquier
 * flujo automático.
 *
 * RESTRICCIÓN CRÍTICA (formato='latex') — CÓMO SE GARANTIZA, NO SOLO SE
 * PIDE: probado en vivo contra el proyecto piña (ago-2026) que pedirle al
 * LLM por instrucción que preserve \citep{}/\citet{} y no formalice
 * menciones de autor/año en texto plano NO ES SUFICIENTE — dos corridas
 * reales mostraron que igual movía/inventaba comandos de cita a pesar de
 * prohibiciones explícitas (mismo patrón que la fabricación de la cifra
 * de Casanare en esta sesión: instrucción de texto sola no alcanza).
 * Por eso, en formato='latex', ANTES de construir el prompt se reemplaza
 * cada \citep{}/\citet{} real Y cada mención de autor/año en texto plano
 * por un token opaco @@CITAFARO<n>@@ (protegerTextoCitableParaHumanizador,
 * lib/faro/latex/citas.ts) — el LLM nunca ve la sintaxis de cita real, así
 * que no puede alterarla ni inventar una nueva a partir de ella; solo ve
 * un marcador que debe reproducir tal cual. Los tokens se restauran
 * después de recibir la respuesta. Como verificación adicional (evidencia
 * dura, no solo confianza en el mecanismo de placeholder), se comparan los
 * comandos \cite reales extraídos del texto ANTES de proteger contra los
 * extraídos del texto YA RESTAURADO — si difieren en cantidad o
 * contenido, se descarta el resultado con un error explícito.
 *
 * En formato='md' no existe ninguna de estas restricciones — las citas en
 * prosa "(Autor, Año)" se pueden reescribir con libertad, como cualquier
 * otro texto.
 */

import { llamarOrquestador } from "@/lib/openrouter/client";
import { extraerComandosCita, protegerTextoCitableParaHumanizador, restaurarCitas } from "./latex/citas";

export type NivelHumanizacion = "pulido" | "estandar" | "elevacion_q1";
export const NIVEL_DEFAULT: NivelHumanizacion = "estandar";

export interface SeccionParaHumanizar {
  id: string;
  texto: string;
}

export interface OpcionesHumanizacion {
  formato: "md" | "latex";
  nivel?: NivelHumanizacion;
}

export interface ResultadoHumanizacion {
  secciones: SeccionParaHumanizar[];
  citasPreservadas: boolean;
  citasAntes: string[];
  citasDespues: string[];
}

const INSTRUCCION_NIVEL: Record<NivelHumanizacion, string> = {
  pulido: `NIVEL 1 — Pulido fino: el texto ya es académicamente sólido. Elimina
marcadores de IA, ajusta léxico, refina variabilidad sintáctica. Cambios
estructurales mínimos.`,
  estandar: `NIVEL 2 — Humanización estándar: reescritura activa aplicando todas las
reglas siguientes. Reestructura oraciones, sustituye el léxico "AI-speak",
activa voz y agencia (primera persona del plural para decisiones propias).`,
  elevacion_q1: `NIVEL 3 — Elevación Q1: además de humanizar, eleva la densidad
argumentativa, añade matiz interpretativo, fortalece los conectores
lógicos y asegura que cada afirmación tenga el peso evidencial que
exigiría un revisor de Nature, Elsevier o Springer.`,
};

const REGLAS_BASE = `Eres un Editor Científico Senior de nivel doctoral. Transforma el texto
recibido en prosa científica de nivel humano experto, preservando
íntegramente el contenido técnico y la precisión de las afirmaciones,
eliminando los patrones que delatan texto generado por IA.

PROHIBIDO sin excepción: negritas en el cuerpo del texto; viñetas o listas
para ideas que pertenecen a un argumento continuo; el patrón
"Encabezado: explicación" dentro de párrafos; guiones largos (—) usados
de forma sistemática para aclaraciones; meta-discurso vacío ("en esta
sección discutiremos...", "cabe destacar que...", "es importante señalar
que...", "en conclusión, podemos afirmar que...").

Vocabulario prohibido (reemplázalo por alternativas naturales): adentrarnos,
apalancar, utilizar (usa "usar"/"emplear"), facilitar, optimizar, crucial,
pivotal, robusto, innovador, panorama, ámbito, sinergia, "es importante
destacar", "en conclusión", "sin duda alguna", "se puede observar que",
"cabe mencionar", "a nivel de".

Voz activa: convierte pasivas impersonales en primera persona del plural
para decisiones metodológicas e interpretaciones propias del proyecto
("se utilizó" → "optamos por"; "se puede concluir que" → "nuestros datos
sugieren que"). La pasiva puede usarse para describir procesos estándar
del campo, no las decisiones propias.

Variabilidad sintáctica real: alterna oraciones largas con cláusulas
subordinadas y oraciones muy breves que resumen un hallazgo — evita el
ritmo monótono y lineal típico de texto generado por máquina.

PRESERVACIÓN OBLIGATORIA, sin importar el nivel: datos cuantitativos y
valores numéricos; términos técnicos de la disciplina; nombres de
organizaciones, instituciones y lugares; hipótesis, preguntas de
investigación y objetivos específicos del proyecto; el contenido factual
de cada afirmación tal como está en el original (no agregues datos
nuevos, esto no es una tarea de redacción desde cero, es de reescritura
estilística).`;

const RESTRICCION_MARCADORES_OPACOS = `RESTRICCIÓN CRÍTICA ADICIONAL — el texto contiene marcadores internos con
el formato exacto @@CITAFARO<número>@@ (ej. @@CITAFARO0@@, @@CITAFARO12@@).
Son bloques OPACOS e INTOCABLES: reprodúcelos EXACTAMENTE igual, carácter
por carácter, en la MISMA posición relativa dentro de su oración. Puedes
reescribir con total libertad la prosa que los RODEA (antes y después),
pero el marcador en sí no se toca: no lo dupliques, no lo elimines, no lo
muevas a otra oración, no le cambies el número, no inventes un marcador
nuevo con otro número que no estuviera en el original, y no le agregues
espacios ni caracteres dentro. No necesitas saber qué representa cada
marcador — trátalo igual que trataste cualquier otro cuando aparezca.`;

const MARCADOR_SECCION = (id: string) => `=== SECCION: ${id} ===`;

function construirPrompt(secciones: SeccionParaHumanizar[], opciones: OpcionesHumanizacion): string {
  const nivel = opciones.nivel ?? NIVEL_DEFAULT;
  const bloqueSecciones = secciones.map((s) => `${MARCADOR_SECCION(s.id)}\n${s.texto}`).join("\n\n");

  return `${REGLAS_BASE}

${INSTRUCCION_NIVEL[nivel]}

${opciones.formato === "latex" ? RESTRICCION_MARCADORES_OPACOS : ""}

El documento tiene varias secciones, delimitadas por marcadores
"=== SECCION: <id> ===". Humaniza CADA sección teniendo en cuenta el
documento completo como contexto (coherencia entre secciones), pero sin
fusionarlas ni reordenarlas. Devuelve EXACTAMENTE los mismos marcadores,
en el mismo orden, cada uno seguido del texto humanizado de esa sección
— sin agregar secciones nuevas, sin quitar ninguna, sin texto fuera de
los marcadores, sin comentarios sobre lo que hiciste.

${bloqueSecciones}`;
}

function parsearRespuesta(respuesta: string, idsEsperados: string[]): SeccionParaHumanizar[] {
  const resultado: SeccionParaHumanizar[] = [];
  for (let i = 0; i < idsEsperados.length; i++) {
    const id = idsEsperados[i];
    const marcadorActual = MARCADOR_SECCION(id);
    const inicio = respuesta.indexOf(marcadorActual);
    if (inicio === -1) {
      throw new Error(`El Humanizador no devolvió la sección "${id}" (marcador "${marcadorActual}" ausente en la respuesta).`);
    }
    const desdeTexto = inicio + marcadorActual.length;
    const siguienteId = idsEsperados[i + 1];
    const fin = siguienteId ? respuesta.indexOf(MARCADOR_SECCION(siguienteId), desdeTexto) : respuesta.length;
    const texto = respuesta.slice(desdeTexto, fin === -1 ? respuesta.length : fin).trim();
    resultado.push({ id, texto });
  }
  return resultado;
}

export async function humanizarDocumento(
  secciones: SeccionParaHumanizar[],
  opciones: OpcionesHumanizacion
): Promise<ResultadoHumanizacion> {
  const idsEsperados = secciones.map((s) => s.id);

  if (opciones.formato !== "latex") {
    const prompt = construirPrompt(secciones, opciones);
    const respuesta = await llamarOrquestador(prompt);
    const seccionesHumanizadas = parsearRespuesta(respuesta, idsEsperados);
    return { secciones: seccionesHumanizadas, citasPreservadas: true, citasAntes: [], citasDespues: [] };
  }

  const citasAntes = secciones.flatMap((s) => extraerComandosCita(s.texto));

  const mapasPorSeccion = new Map<string, string[]>();
  const seccionesProtegidas: SeccionParaHumanizar[] = secciones.map((s) => {
    const { protegido, mapa } = protegerTextoCitableParaHumanizador(s.texto);
    mapasPorSeccion.set(s.id, mapa);
    return { id: s.id, texto: protegido };
  });

  const prompt = construirPrompt(seccionesProtegidas, opciones);
  const respuesta = await llamarOrquestador(prompt);
  const seccionesHumanizadasProtegidas = parsearRespuesta(respuesta, idsEsperados);

  const seccionesHumanizadas = seccionesHumanizadasProtegidas.map((s) => ({
    id: s.id,
    texto: restaurarCitas(s.texto, mapasPorSeccion.get(s.id) ?? []),
  }));

  const citasDespues = seccionesHumanizadas.flatMap((s) => extraerComandosCita(s.texto));
  const coinciden = citasAntes.length === citasDespues.length && citasAntes.every((c, i) => c === citasDespues[i]);

  if (!coinciden) {
    throw new Error(
      `El Humanizador alteró los comandos \\cite — se descarta el resultado.\n` +
        `Antes (${citasAntes.length}): ${JSON.stringify(citasAntes)}\n` +
        `Después (${citasDespues.length}): ${JSON.stringify(citasDespues)}`
    );
  }

  return { secciones: seccionesHumanizadas, citasPreservadas: true, citasAntes, citasDespues };
}
