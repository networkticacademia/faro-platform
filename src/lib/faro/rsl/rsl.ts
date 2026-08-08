// ============================================================
// FARO — RSL, modo reactivo: verificarHipotesis()
// Pipeline: S(hi) → D → filtro barato → D' → síntesis → {estado_evidencia, citas}
// Alimenta Δ(z0*,B,G) — no reemplaza detectar_contradicciones (SQL),
// la complementa con evidencia bibliográfica real.
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================
//
// ⚠️ Simplificación explícita (documentar igual que en mci.ts): la ficha
// de RSL preveía un "modelo económico tipo DeepSeek" para el cribado
// barato (nivel 1 de la arquitectura de 2 niveles). Ese cliente no existe
// todavía — lib/openrouter/client.ts solo expone llamarOrquestador(), sin
// selección de modelo. Se reemplaza el cribado por una heurística léxica
// local (sin costo de LLM), que cumple la misma función de reducir D a un
// subconjunto D' antes de la síntesis cara. Reemplazar cuando exista un
// cliente de modelo económico real — no antes, para no acoplar a una
// interfaz que aún no está definida.

import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import { buscarCandidatosOpenAlex, type CandidatoOpenAlex } from "./openalex";
import type { EstadoEvidencia, VacioConocimientoHipotesis } from "@/lib/faro/ruta";

export interface CitaRSL {
  titulo: string;
  doi: string | null;
  anio: number | null;
  relevancia: "alta" | "media" | "baja";
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
  citas: CitaRSL[];
  contradiccion: ContradiccionRSL | null;
  modo: "reactivo";
}

/**
 * φ de la contradicción xi_rsl (RSL refuta una hipótesis declarada).
 * PENDIENTE DE CALIBRACIÓN EMPÍRICA — mismo estado que
 * LAMBDA_MU_PENDIENTE_CALIBRACION en mci.ts. No se inventa un valor
 * definitivo; se documenta como placeholder explícito.
 */
const PHI_XI_RSL_PENDIENTE_CALIBRACION = 0.5;

// ------------------------------------------------------------
// Nivel 1 (reemplazo local, sin LLM): cribado léxico D → D'
// ------------------------------------------------------------

function normalizarTexto(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((palabra) => palabra.length > 3); // descarta artículos/conectores cortos
}

function puntuarCandidato(
  candidato: CandidatoOpenAlex,
  palabrasHipotesis: string[]
): number {
  const textoCandidato = `${candidato.titulo} ${candidato.resumen ?? ""}`;
  const palabrasCandidato = new Set(normalizarTexto(textoCandidato));

  let coincidencias = 0;
  for (const palabra of palabrasHipotesis) {
    if (palabrasCandidato.has(palabra)) coincidencias++;
  }
  const solapamiento = palabrasHipotesis.length > 0 ? coincidencias / palabrasHipotesis.length : 0;

  // Señales secundarias: citas (normalizado, saturado en 100) y recencia (últimos 10 años)
  const senalCitas = Math.min(candidato.citado_por_count / 100, 1);
  const anioActual = new Date().getFullYear();
  const senalRecencia = candidato.anio
    ? Math.max(0, 1 - (anioActual - candidato.anio) / 10)
    : 0;

  // Solapamiento léxico pesa más — es la señal directa de relevancia temática
  return solapamiento * 0.7 + senalCitas * 0.15 + senalRecencia * 0.15;
}

/** Cribado barato: de D (candidatos crudos de OpenAlex) a D' (subconjunto relevante). */
function cribarCandidatos(
  candidatos: CandidatoOpenAlex[],
  afirmacionHipotesis: string,
  maxResultados = 5
): CandidatoOpenAlex[] {
  const palabrasHipotesis = normalizarTexto(afirmacionHipotesis);

  return candidatos
    .map((c) => ({ candidato: c, puntaje: puntuarCandidato(c, palabrasHipotesis) }))
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, maxResultados)
    .map((x) => x.candidato);
}

// ------------------------------------------------------------
// Nivel 2: síntesis final vía llamarOrquestador (Claude)
// ------------------------------------------------------------

interface SalidaSintesisRSL {
  estado_evidencia: EstadoEvidencia;
  justificacion: string;
  citas_usadas: { doi: string | null; titulo: string; anio: number | null; relevancia: "alta" | "media" | "baja" }[];
  contradiccion_mensaje: string | null;
}

function construirPromptSintesisRSL(
  afirmacionHipotesis: string,
  candidatosCribados: CandidatoOpenAlex[]
): string {
  const listaCandidatos = candidatosCribados
    .map(
      (c, i) =>
        `[${i + 1}] "${c.titulo}" (${c.anio ?? "s.f."}) — ${c.revista ?? "revista no identificada"}${
          c.doi ? ` — DOI: ${c.doi}` : ""
        }\nResumen: ${c.resumen ?? "(no disponible)"}`
    )
    .join("\n\n");

  return `Eres RSL, el mecanismo de verificación bibliográfica dentro del framework FARO. No produces contenido nuevo — contrastas una hipótesis declarada contra evidencia científica real.

HIPÓTESIS A VERIFICAR:
"${afirmacionHipotesis}"

CANDIDATOS RECUPERADOS (ya cribados por relevancia léxica y citación):
${listaCandidatos || "(ningún candidato recuperado — no hay evidencia disponible)"}

TU TAREA: determina si la evidencia de estos candidatos CONFIRMA, CONTRADICE, o es INSUFICIENTE para pronunciarse sobre la hipótesis.

REGLA CRÍTICA — anclaje obligatorio: solo puedes citar candidatos de la lista anterior. Si ningún candidato es realmente relevante (aunque haya sido recuperado), decláralo como estado_evidencia="sin_verificar" — nunca inventes literatura ni fuerces una conclusión que la evidencia no sostiene.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional:
{
  "estado_evidencia": "confirmado_por_rsl" | "contradicho_por_rsl" | "sin_verificar",
  "justificacion": "string, 1-3 frases explicando el veredicto",
  "citas_usadas": [
    { "doi": "string o null", "titulo": "string", "anio": number o null, "relevancia": "alta"|"media"|"baja" }
  ],
  "contradiccion_mensaje": "string explicando la contradicción, o null si estado_evidencia no es contradicho_por_rsl"
}`;
}

// ------------------------------------------------------------
// Función pública: pipeline completo
// ------------------------------------------------------------

/**
 * Operador reactivo de RSL. Recibe una hipótesis declarada por RUTA (o
 * NOVA, cuando exista), la contrasta contra literatura real, y devuelve
 * el veredicto que alimenta Δ(z0*,B,G).
 *
 * NO persiste nada — la persistencia en `verificaciones_rsl` y la
 * actualización de `estado_evidencia` en el nodo de origen es
 * responsabilidad del route.ts que invoque esta función (mismo patrón
 * de separación de responsabilidades que ya usa mci.ts).
 */
export async function verificarHipotesis(
  hipotesis: VacioConocimientoHipotesis,
  opciones: {
    maxCandidatosOpenAlex?: number;
    maxCandidatosCribados?: number;
    /**
     * Cadena de búsqueda ya confirmada (o editada) por el formulador en
     * la pantalla de confirmación de palabras clave. Si se provee, se usa
     * en vez de hipotesis.afirmacion como consulta a OpenAlex — resuelve
     * el problema detectado en producción el 2026-08-06: mandar la
     * afirmación completa en prosa (40+ palabras) como consulta producía
     * sistemáticamente cero candidatos.
     */
    cadenaBusquedaConfirmada?: string;
  } = {}
): Promise<ResultadoVerificacionRSL> {
  const { maxCandidatosOpenAlex = 15, maxCandidatosCribados = 5, cadenaBusquedaConfirmada } = opciones;

  // Fallback de seguridad a la afirmación completa si no se provee cadena
  // confirmada — para no romper llamadas existentes durante la transición,
  // pero el flujo correcto en adelante SIEMPRE debe pasar cadenaBusquedaConfirmada.
  const consultaOpenAlex = cadenaBusquedaConfirmada ?? hipotesis.afirmacion;

  // 1. S(hi) → D
  let candidatos: CandidatoOpenAlex[];
  try {
    candidatos = await buscarCandidatosOpenAlex(consultaOpenAlex, {
      limite: maxCandidatosOpenAlex,
    });
  } catch (err) {
    // Fallo de OpenAlex no debe tumbar el flujo de RUTA/NOVA que invoca esto —
    // se degrada a sin_verificar, PERO se deja rastro explícito en logs.
    // Sin este log, un fallo real de red es indistinguible de "no se
    // encontró literatura relevante" — ambos casos producen la misma
    // salida (sin_verificar, citas:[]), y esa ambigüedad es inaceptable.
    console.error(
      "[rsl] Fallo al consultar OpenAlex — se degrada a sin_verificar:",
      err instanceof Error ? err.message : String(err)
    );
    return {
      estado_evidencia: "sin_verificar",
      citas: [],
      contradiccion: null,
      modo: "reactivo",
    };
  }

  if (candidatos.length === 0) {
    // Caso DISTINTO del catch de arriba: aquí OpenAlex respondió correctamente,
    // solo que no hay ningún documento indexado para esta búsqueda. Es una
    // señal legítima de vacío bibliográfico real, no un fallo técnico.
    console.info(
      `[rsl] OpenAlex respondió sin candidatos para: "${hipotesis.afirmacion.slice(0, 80)}..."`
    );
    return { estado_evidencia: "sin_verificar", citas: [], contradiccion: null, modo: "reactivo" };
  }

  // 2. filtro(D, hi) → D'
  const candidatosCribados = cribarCandidatos(candidatos, consultaOpenAlex, maxCandidatosCribados);

  // 3. síntesis(D', hi) → {estado_evidencia, citas}
  const prompt = construirPromptSintesisRSL(hipotesis.afirmacion, candidatosCribados);
  const respuestaCruda = await llamarOrquestador(prompt);
  const sintesis = parsearJsonRespuesta<SalidaSintesisRSL>(respuestaCruda);

  const contradiccion: ContradiccionRSL | null =
    sintesis.estado_evidencia === "contradicho_por_rsl"
      ? {
          codigo: "xi_rsl_contradiccion",
          nivel: "L2", // protocolo canónico: doble validación + justificación escrita
          mensaje: sintesis.contradiccion_mensaje ?? "RSL refuta la hipótesis declarada, sin mensaje adicional.",
          phi: PHI_XI_RSL_PENDIENTE_CALIBRACION,
        }
      : null;

  return {
    estado_evidencia: sintesis.estado_evidencia,
    citas: sintesis.citas_usadas.map((c) => ({
      titulo: c.titulo,
      doi: c.doi,
      anio: c.anio,
      relevancia: c.relevancia,
    })),
    contradiccion,
    modo: "reactivo",
  };
}
