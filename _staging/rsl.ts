// ============================================================
// FARO — RSL, modo reactivo (versión profunda): verificarHipotesis()
// Pipeline: S(hi) → D (multi-fuente, en paralelo) → dedup → filtro barato
//           → D' → síntesis enriquecida → {estado_evidencia, síntesis, citas}
// Alimenta Δ(z0*,B,G) — no reemplaza detectar_contradicciones (SQL),
// la complementa con evidencia bibliográfica real.
//
// Decisión de sesión 2026-08-07: la síntesis debe replicar aquí mismo
// lo que antes solo hacía el paquete manual en NotebookLM (título,
// autores, año, DOI, resumen del hallazgo por artículo relevante, y
// señalar explícitamente si NO hay literatura que combine los conceptos
// — posible vacío real). El paquete manual queda como ÚLTIMO RECURSO,
// no como camino principal.
//
// v2 (2026-08-09): prueba real end-to-end confirmó que la cadena de
// búsqueda confirmada por el usuario llega en español a las APIs, que
// indexan mayoritariamente en inglés (ver cadenaBusqueda.ts v5/v6 y
// diagnóstico de sesión). Se agrega traducirCadenaParaBusqueda() —
// UNA sola llamada LLM, del lado del servidor, justo antes de
// consultar las fuentes — para no afectar el idioma en que el
// formulador ve y edita la cadena (eso sigue en español en la UI).
// Si la traducción falla, se usa la cadena original en español; nunca
// bloquea la búsqueda.
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================
//
// ⚠️ Simplificación explícita (documentada igual que en mci.ts): el
// cribado de nivel 1 sigue siendo heurística léxica local, no un
// "modelo económico" separado — lib/openrouter/client.ts solo expone
// llamarOrquestador(), sin selección de modelo. Reemplazar cuando
// exista un cliente de modelo económico real.

import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import { buscarCandidatosOpenAlex } from "./openalex";
import { buscarCandidatosCrossref } from "./crossref";
import { buscarCandidatosSemanticScholar } from "./semanticScholar";
import type { CandidatoFuente, FuenteBibliografica } from "./tipos";
import type { EstadoEvidencia, VacioConocimientoHipotesis } from "@/lib/faro/ruta";

export interface CitaRSL {
  titulo: string;
  doi: string | null;
  anio: number | null;
  relevancia: "alta" | "media" | "baja";
  resumen_hallazgo: string; // 2-3 líneas — lo que antes solo traía NotebookLM
  fuente: FuenteBibliografica;
}

/** Mismo shape que Contradiccion (types.ts) / ContradiccionDetectada (mci.ts) — compatible por estructura. */
export interface ContradiccionRSL {
  codigo: string;
  nivel: "L1" | "L2" | "L3";
  mensaje: string;
  phi: number;
}

export interface ResultadoVerificacionRSL {
  estado_evidencia: EstadoEvidencia;
  sintesis_narrativa: string; // párrafo — qué dice la literatura combinada
  vacio_detectado: boolean; // true si NINGÚN candidato combina los conceptos realmente
  citas: CitaRSL[];
  citas_descartadas_no_verificadas: number; // citas que Claude reportó pero NO corresponden a un candidato real
  contradiccion: ContradiccionRSL | null;
  modo: "reactivo";
  fuentes_consultadas: { fuente: FuenteBibliografica; candidatos_encontrados: number; fallo: string | null }[];
  cadena_traducida?: string; // NUEVO v2 — para depuración: qué se envió realmente a las APIs
}

const PHI_XI_RSL_PENDIENTE_CALIBRACION = 0.5;

// ------------------------------------------------------------
// NUEVO v2: traducción de la cadena confirmada, una sola vez, antes
// de consultar cualquier fuente. La UI sigue mostrando y editando la
// cadena en español (cadenaBusqueda.ts no cambia) — esto solo afecta
// lo que se envía a las APIs.
// ------------------------------------------------------------

async function traducirCadenaParaBusqueda(cadenaEs: string): Promise<string> {
  try {
    const prompt = `Traduce al inglés los términos entre comillas de esta cadena de búsqueda booleana, conservando EXACTAMENTE la estructura AND/OR/paréntesis y las comillas dobles. No traduzcas los operadores AND/OR ni los paréntesis, solo el contenido entre comillas. Responde ÚNICAMENTE con la cadena traducida, sin explicación, sin markdown:

${cadenaEs}`;

    const respuesta = await llamarOrquestador(prompt);
    const traducida = respuesta.trim();

    // Salvaguarda mínima: si la respuesta no conserva al menos un AND/OR
    // o quedó vacía, algo salió mal en el LLM — mejor usar el original
    // que arriesgarse a mandar basura a las APIs.
    if (!traducida || (!traducida.includes("AND") && !traducida.includes("OR") && cadenaEs.includes("AND"))) {
      console.warn("[rsl] Traducción sospechosa, se descarta y se usa cadena original ES:", traducida);
      return cadenaEs;
    }

    console.info(`[rsl] Cadena traducida para búsqueda: "${cadenaEs}" → "${traducida}"`);
    return traducida;
  } catch (error) {
    console.warn("[rsl] Fallo traducción de cadena, se usa original ES:", error);
    return cadenaEs; // nunca bloquea la búsqueda por fallo de traducción
  }
}

// ------------------------------------------------------------
// Nivel 0: búsqueda en paralelo sobre todas las fuentes conectadas
// ------------------------------------------------------------

function normalizarParaComparar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * Consulta OpenAlex, Crossref y Semantic Scholar EN PARALELO (no en
 * secuencia) con la misma cadena confirmada. Si una fuente falla, no
 * tumba a las demás — se registra el fallo y se sigue con lo que sí
 * respondió. Deduplica por DOI cuando existe, o por título normalizado
 * cuando no.
 */
async function buscarEnTodasLasFuentes(
  consulta: string,
  limitePorFuente: number
): Promise<{ candidatos: CandidatoFuente[]; reporte: ResultadoVerificacionRSL["fuentes_consultadas"] }> {
  const resultados = await Promise.allSettled([
    buscarCandidatosOpenAlex(consulta, { limite: limitePorFuente }),
    buscarCandidatosCrossref(consulta, { limite: limitePorFuente }),
    buscarCandidatosSemanticScholar(consulta, { limite: limitePorFuente }),
  ]);

  const nombresFuente: FuenteBibliografica[] = ["openalex", "crossref", "semantic_scholar"];
  const reporte: ResultadoVerificacionRSL["fuentes_consultadas"] = [];
  const todosLosCandidatos: CandidatoFuente[] = [];

  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") {
      todosLosCandidatos.push(...r.value);
      reporte.push({ fuente: nombresFuente[i], candidatos_encontrados: r.value.length, fallo: null });
    } else {
      const mensaje = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`[rsl] Fuente ${nombresFuente[i]} falló:`, mensaje);
      reporte.push({ fuente: nombresFuente[i], candidatos_encontrados: 0, fallo: mensaje });
    }
  });

  const vistos = new Set<string>();
  const candidatosUnicos: CandidatoFuente[] = [];
  for (const c of todosLosCandidatos) {
    const clave = c.doi ? `doi:${c.doi.toLowerCase()}` : `titulo:${normalizarParaComparar(c.titulo)}`;
    if (!vistos.has(clave)) {
      vistos.add(clave);
      candidatosUnicos.push(c);
    }
  }

  return { candidatos: candidatosUnicos, reporte };
}

// ------------------------------------------------------------
// Nivel 1 (local, sin LLM): cribado léxico D → D'
// ------------------------------------------------------------

function normalizarTexto(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((palabra) => palabra.length > 3);
}

function puntuarCandidato(candidato: CandidatoFuente, palabrasConsulta: string[]): number {
  const textoCandidato = `${candidato.titulo} ${candidato.resumen ?? ""}`;
  const palabrasCandidato = new Set(normalizarTexto(textoCandidato));

  let coincidencias = 0;
  for (const palabra of palabrasConsulta) {
    if (palabrasCandidato.has(palabra)) coincidencias++;
  }
  const solapamiento = palabrasConsulta.length > 0 ? coincidencias / palabrasConsulta.length : 0;

  const senalCitas = Math.min(candidato.citado_por_count / 100, 1);
  const anioActual = new Date().getFullYear();
  const senalRecencia = candidato.anio ? Math.max(0, 1 - (anioActual - candidato.anio) / 10) : 0;

  return solapamiento * 0.7 + senalCitas * 0.15 + senalRecencia * 0.15;
}

function cribarCandidatos(
  candidatos: CandidatoFuente[],
  consulta: string,
  maxResultados = 8
): CandidatoFuente[] {
  const palabrasConsulta = normalizarTexto(consulta);
  return candidatos
    .map((c) => ({ candidato: c, puntaje: puntuarCandidato(c, palabrasConsulta) }))
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, maxResultados)
    .map((x) => x.candidato);
}

// ------------------------------------------------------------
// Verificación cruzada determinística — "el agente que revisa que las
// fuentes existan", pero como comparación exacta contra datos reales de
// las APIs, no como otra pregunta a un LLM (que podría fallar de la
// misma forma). Decisión de sesión 2026-08-07, a pedido de Jorge.
// ------------------------------------------------------------

function citaCorrespondeAcandidatoReal(cita: SalidaSintesisRSL["citas_usadas"][number], candidatos: CandidatoFuente[]): boolean {
  if (cita.doi) {
    const doiNormalizado = cita.doi.toLowerCase().trim();
    return candidatos.some((c) => c.doi?.toLowerCase().trim() === doiNormalizado);
  }
  const tituloNormalizado = normalizarParaComparar(cita.titulo);
  return candidatos.some((c) => normalizarParaComparar(c.titulo) === tituloNormalizado);
}

/**
 * Filtra las citas que Claude reportó, quedándose SOLO con las que
 * corresponden exactamente a un candidato real recuperado de las APIs.
 * Cualquier cita que no cruce (DOI o título no coinciden con ningún
 * candidato) se descarta — es la señal más fuerte de que el modelo se
 * desvió de la instrucción de anclaje, y no debe llegar a pantalla.
 */
function verificarCitasContraCandidatosReales(
  citasReportadas: SalidaSintesisRSL["citas_usadas"],
  candidatosReales: CandidatoFuente[]
): { citasVerificadas: CitaRSL[]; descartadas: number } {
  let descartadas = 0;
  const citasVerificadas: CitaRSL[] = [];

  for (const cita of citasReportadas) {
    if (citaCorrespondeAcandidatoReal(cita, candidatosReales)) {
      citasVerificadas.push(cita);
    } else {
      descartadas++;
      console.warn(
        `[rsl] Cita descartada — no corresponde a ningún candidato real recuperado: "${cita.titulo}" (DOI reportado: ${cita.doi ?? "ninguno"})`
      );
    }
  }

  return { citasVerificadas, descartadas };
}

// ------------------------------------------------------------
// Nivel 2: síntesis enriquecida vía llamarOrquestador (Claude)
// ------------------------------------------------------------

interface SalidaSintesisRSL {
  estado_evidencia: EstadoEvidencia;
  sintesis_narrativa: string;
  vacio_detectado: boolean;
  citas_usadas: {
    doi: string | null;
    titulo: string;
    anio: number | null;
    relevancia: "alta" | "media" | "baja";
    resumen_hallazgo: string;
    fuente: FuenteBibliografica;
  }[];
  contradiccion_mensaje: string | null;
}

function construirPromptSintesisRSL(afirmacionHipotesis: string, candidatosCribados: CandidatoFuente[]): string {
  const listaCandidatos = candidatosCribados
    .map(
      (c, i) =>
        `[${i + 1}] (fuente: ${c.fuente}) "${c.titulo}" (${c.anio ?? "s.f."}) — ${c.revista ?? "revista no identificada"}${
          c.doi ? ` — DOI: ${c.doi}` : ""
        }\nResumen: ${c.resumen ?? "(no disponible)"}`
    )
    .join("\n\n");

  return `Eres RSL, el mecanismo de verificación bibliográfica dentro del framework FARO. Tu tarea ahora es más profunda que solo contrastar una hipótesis — debes producir el mismo nivel de síntesis que un asistente tipo NotebookLM le daría a un investigador, pero fundamentado únicamente en los candidatos reales que se te entregan.

HIPÓTESIS A VERIFICAR:
"${afirmacionHipotesis}"

CANDIDATOS RECUPERADOS (combinados de OpenAlex, Crossref y Semantic Scholar, ya cribados por relevancia):
${listaCandidatos || "(ningún candidato recuperado — no hay evidencia disponible en ninguna fuente)"}

TU TAREA, en este orden:
1. Determina si la evidencia CONFIRMA, CONTRADICE, o es INSUFICIENTE para pronunciarse sobre la hipótesis.
2. Escribe una síntesis narrativa breve (3-5 frases) de lo que la literatura combinada dice sobre el tema — como el resumen que un asistente de revisión de literatura le daría a un investigador.
3. Para cada candidato realmente relevante (no todos los de la lista, solo los que aportan), escribe un resumen de 2-3 líneas de su hallazgo principal en relación con la hipótesis — esto es lo que antes solo se conseguía llevando los resultados a NotebookLM manualmente.
4. Declara vacio_detectado=true si NINGÚN candidato de la lista combina realmente los conceptos centrales de la hipótesis — eso es información valiosa (posible vacío de conocimiento real), no un fallo.

REGLA CRÍTICA — anclaje obligatorio: solo puedes citar candidatos de la lista anterior, con sus datos exactos (DOI, título, año, fuente). Si ningún candidato es realmente relevante, decláralo con vacio_detectado=true y estado_evidencia="sin_verificar" — nunca inventes literatura ni fuerces una conclusión que la evidencia no sostiene.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional:
{
  "estado_evidencia": "confirmado_por_rsl" | "contradicho_por_rsl" | "sin_verificar",
  "sintesis_narrativa": "string, 3-5 frases",
  "vacio_detectado": boolean,
  "citas_usadas": [
    { "doi": "string o null", "titulo": "string", "anio": number o null, "relevancia": "alta"|"media"|"baja", "resumen_hallazgo": "string, 2-3 líneas", "fuente": "openalex"|"crossref"|"semantic_scholar" }
  ],
  "contradiccion_mensaje": "string explicando la contradicción, o null si estado_evidencia no es contradicho_por_rsl"
}`;
}

// ------------------------------------------------------------
// Función pública: pipeline completo
// ------------------------------------------------------------

export async function verificarHipotesis(
  hipotesis: VacioConocimientoHipotesis,
  opciones: {
    maxCandidatosPorFuente?: number;
    maxCandidatosCribados?: number;
    cadenaBusquedaConfirmada?: string;
  } = {}
): Promise<ResultadoVerificacionRSL> {
  const { maxCandidatosPorFuente = 10, maxCandidatosCribados = 8, cadenaBusquedaConfirmada } = opciones;

  const consultaOriginal = cadenaBusquedaConfirmada ?? hipotesis.afirmacion;

  // NUEVO v2: traducir SOLO si viene de una cadena confirmada por el
  // formulador (estructura AND/OR conocida) — no traducimos el
  // fallback de la afirmación completa en prosa, caso ya degradado
  // que no debería depender de este ajuste.
  const consulta = cadenaBusquedaConfirmada
    ? await traducirCadenaParaBusqueda(cadenaBusquedaConfirmada)
    : consultaOriginal;

  // 1. S(hi) → D, en paralelo sobre todas las fuentes
  const { candidatos, reporte } = await buscarEnTodasLasFuentes(consulta, maxCandidatosPorFuente);

  if (candidatos.length === 0) {
    console.info(
      `[rsl] Ninguna fuente devolvió candidatos para: "${consulta}"` +
        (cadenaBusquedaConfirmada ? " (cadena confirmada, traducida)" : " (⚠️ fallback a afirmación completa)")
    );
    return {
      estado_evidencia: "sin_verificar",
      sintesis_narrativa: "",
      vacio_detectado: true,
      citas: [],
      citas_descartadas_no_verificadas: 0,
      contradiccion: null,
      modo: "reactivo",
      fuentes_consultadas: reporte,
      cadena_traducida: consulta,
    };
  }

  // 2. filtro(D, hi) → D'
  const candidatosCribados = cribarCandidatos(candidatos, consulta, maxCandidatosCribados);

  // 3. síntesis(D', hi) → resultado enriquecido
  const prompt = construirPromptSintesisRSL(hipotesis.afirmacion, candidatosCribados);
  const respuestaCruda = await llamarOrquestador(prompt);
  const sintesis = parsearJsonRespuesta<SalidaSintesisRSL>(respuestaCruda);

  // Verificación cruzada determinística — ver sección arriba.
  const { citasVerificadas, descartadas } = verificarCitasContraCandidatosReales(
    sintesis.citas_usadas,
    candidatosCribados
  );
  if (descartadas > 0) {
    console.warn(`[rsl] ${descartadas} cita(s) descartada(s) por no corresponder a candidatos reales.`);
  }

  const contradiccion: ContradiccionRSL | null =
    sintesis.estado_evidencia === "contradicho_por_rsl"
      ? {
          codigo: "xi_rsl_contradiccion",
          nivel: "L2",
          mensaje: sintesis.contradiccion_mensaje ?? "RSL refuta la hipótesis declarada, sin mensaje adicional.",
          phi: PHI_XI_RSL_PENDIENTE_CALIBRACION,
        }
      : null;

  return {
    estado_evidencia: sintesis.estado_evidencia,
    sintesis_narrativa: sintesis.sintesis_narrativa,
    // Si TODAS las citas reportadas resultaron ser fantasma, el vacío es real
    // sin importar lo que Claude haya declarado — la evidencia física manda.
    vacio_detectado: sintesis.vacio_detectado || citasVerificadas.length === 0,
    citas: citasVerificadas,
    citas_descartadas_no_verificadas: descartadas,
    contradiccion,
    modo: "reactivo",
    fuentes_consultadas: reporte,
    cadena_traducida: consulta,
  };
}
