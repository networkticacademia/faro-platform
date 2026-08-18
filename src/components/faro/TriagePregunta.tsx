"use client";

/**
 * TriagePregunta.tsx
 *
 * Flujo de 3 caminos (Sí tengo esta información + procedencia,
 * No sé dónde conseguirla, No entiendo la pregunta) con previsualización
 * y confirmación de nodos afectados.
 *
 * "No entiendo la pregunta" abre un MODAL por encima de la tarjeta —no
 * reemplaza su contenido— para que cualquier estado en curso (borrador de
 * respuesta, procedencia elegida, previsualización de nodos afectados)
 * quede intacto debajo mientras el modal está abierto.
 *
 * "No sé dónde conseguirla" YA NO es un callejón sin salida: bajo los dos
 * prompts hay un textarea para pegar lo que se consiguió afuera. Si es JSON
 * con un campo de dato reconocible, se extrae y se preselecciona (nunca se
 * fuerza) la procedencia según nivel_confianza; si no es JSON válido, se
 * trata como texto libre — en ambos casos pasa al mismo camino
 * "tengo_dato" ya existente (mismo componente, sin navegar a otro lado).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ETIQUETAS_PROCEDENCIA, type Procedencia } from "@/lib/faro/procedencia";
import type { DetalleLFaroNodoResumen } from "@/lib/faro/circuitoConvergencia";
import { IndicadorGenerando } from "./IndicadorGenerando";

type Camino = "inicial" | "tengo_dato" | "no_se_donde";

interface NodoAfectado {
  nodo_ids: string[];
  nodo_tipo: string;
  preguntas_que_resuelve: string[];
}

const NODO_LABEL_MAP: Record<string, string> = {
  RUTA: "RUTA",
  NOVA: "NOVA",
  OBJETIVOS: "Objetivos",
  MARCO_REFERENCIAL: "Marco Referencial",
  METODOLOGIA: "Metodología",
  IMPACTOS_DELIMITACION: "Impactos y Delimitación",
  IMPACTOS: "Impactos y Delimitación",
};

interface Props {
  preguntaId: string;
  projectId: string;
  textoPregunta: string;
  onResuelta: () => void;
}

/** Búsqueda de campo case/formato-insensible — el nombre exacto de las
 * claves en el JSON pegado depende de cómo el modelo redactó prompt_retorno
 * (texto libre pidiéndole a OTRA herramienta ese formato), no es un
 * contrato fijo. */
function obtenerCampoJSON(obj: Record<string, unknown>, claves: string[]): unknown {
  const normalizar = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
  const entradas = Object.entries(obj);

  // 1) match exacto normalizado (ignora espacios/guiones/guion_bajo)
  for (const clave of claves) {
    const claveNorm = normalizar(clave);
    const encontrada = entradas.find(([k]) => normalizar(k) === claveNorm);
    if (encontrada) return encontrada[1];
  }

  // 2) fallback por contención de palabras — tolera conectores intercalados
  // como "nivel_DE_confianza" en vez de "nivel_confianza" (variación real
  // observada: el nombre de campo lo redacta el LLM en prompt_retorno,
  // no es un contrato fijo).
  for (const clave of claves) {
    const palabras = clave.toLowerCase().split(/[\s_-]+/).filter(Boolean);
    if (palabras.length === 0) continue;
    const encontrada = entradas.find(([k]) => {
      const kLower = k.toLowerCase();
      return palabras.every((p) => kLower.includes(p));
    });
    if (encontrada) return encontrada[1];
  }

  return undefined;
}

/**
 * alto→fuente_oficial, medio→estimacion, bajo→supuesto — PRESELECCIÓN, no
 * forzada. El valor real casi nunca es un enum limpio: el propio
 * prompt_retorno le pide a la herramienta externa "alto/medio/bajo,
 * especificando si es oficial", así que llega como frase ("alto, dato
 * oficial del DANE"). Se busca la palabra de nivel al INICIO del valor,
 * no igualdad exacta — variación real observada en prueba, no hipotética.
 */
function mapearNivelConfianza(valor: unknown): Procedencia | "" {
  if (typeof valor !== "string") return "";
  const v = valor.trim().toLowerCase();
  if (/^(alto|alta|high)\b/.test(v)) return "fuente_oficial";
  if (/^(medio|media|medium)\b/.test(v)) return "estimacion";
  if (/^(bajo|baja|low)\b/.test(v)) return "supuesto";
  return "";
}

export default function TriagePregunta({ preguntaId, projectId, textoPregunta, onResuelta }: Props) {
  const [camino, setCamino] = useState<Camino>("inicial");
  const [respuestaTexto, setRespuestaTexto] = useState("");
  const [procedencia, setProcedencia] = useState<Procedencia | "">("");
  const [derivacion, setDerivacion] = useState<{
    orientacion: string;
    prompt_busqueda: string;
    prompt_retorno: string;
  } | null>(null);
  const [nodosAfectados, setNodosAfectados] = useState<NodoAfectado[] | null>(null);
  const [circuitoDetenido, setCircuitoDetenido] = useState<string | null>(null);
  // Diagnóstico mostrado junto al bloqueo — reutiliza datos ya calculados,
  // sin ninguna llamada LLM (ver detalle en el bloque de render de abajo).
  const [detalleLFaroPorNodo, setDetalleLFaroPorNodo] = useState<DetalleLFaroNodoResumen[] | null>(null);
  const [preguntasP1PorNodo, setPreguntasP1PorNodo] = useState<Record<string, number> | null>(null);
  const [confirmoRevision, setConfirmoRevision] = useState(false);
  const [cargando, setCargando] = useState(false);

  // Cuando aparece el bloqueo, trae el desglose de P1 por nodo del mismo
  // endpoint que ya usa ContadorPreguntasPrioridad (GET, sin LLM) — el
  // detalle de L_FARO por nodo ya viene en la respuesta de /propagar
  // (ejecutarPropagacion reutiliza la última fila de convergencia_proyecto),
  // así que no hace falta pedirlo aparte.
  useEffect(() => {
    if (!circuitoDetenido) {
      setPreguntasP1PorNodo(null);
      return;
    }
    let cancelado = false;
    fetch(`/api/mci/preguntas/pendientes?project_id=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelado) return;
        const preguntas = (data.preguntas ?? []) as { prioridad: string; nodo_tipo: string }[];
        const conteo: Record<string, number> = {};
        for (const p of preguntas) {
          if (p.prioridad !== "P1") continue;
          conteo[p.nodo_tipo] = (conteo[p.nodo_tipo] ?? 0) + 1;
        }
        setPreguntasP1PorNodo(conteo);
      })
      .catch(() => {
        if (!cancelado) setPreguntasP1PorNodo(null);
      });
    return () => {
      cancelado = true;
    };
  }, [circuitoDetenido, projectId]);

  // "No sé dónde conseguirla" — pegar la respuesta obtenida afuera, sin salir de esta tarjeta.
  const [pegadoTexto, setPegadoTexto] = useState("");
  const [intentoRegistrado, setIntentoRegistrado] = useState(false);

  // Modal "No entiendo la pregunta" — independiente de `camino`, para que
  // abrirlo/cerrarlo nunca desmonte ni reinicie el resto de la tarjeta.
  const [modalExplicacionAbierto, setModalExplicacionAbierto] = useState(false);
  const [explicacion, setExplicacion] = useState<string | null>(null);
  const [cargandoExplicacion, setCargandoExplicacion] = useState(false);

  async function pedirExplicacion() {
    setModalExplicacionAbierto(true);
    if (explicacion) return; // ya se consultó antes — no repetir la llamada al modelo
    setCargandoExplicacion(true);
    try {
      const res = await fetch("/api/mci/preguntas/explicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta_id: preguntaId }),
      });
      const data = await res.json();
      setExplicacion(data.explicacion);
    } finally {
      setCargandoExplicacion(false);
    }
  }

  function cerrarModalExplicacion() {
    setModalExplicacionAbierto(false);
  }

  useEffect(() => {
    if (!modalExplicacionAbierto) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") cerrarModalExplicacion();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalExplicacionAbierto]);

  async function pedirDerivacion() {
    setCamino("no_se_donde");
    setCargando(true);
    try {
      const res = await fetch("/api/mci/preguntas/derivar-busqueda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta_id: preguntaId }),
      });
      const data = await res.json();
      setDerivacion(data);
    } finally {
      setCargando(false);
    }
  }

  /** Procesa lo pegado en el textarea de "No sé dónde conseguirla". */
  async function procesarRespuestaPegada() {
    const texto = pegadoTexto.trim();
    if (!texto) return;

    let json: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(texto);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        json = parsed as Record<string, unknown>;
      }
    } catch {
      json = null;
    }

    if (json) {
      const dato = obtenerCampoJSON(json, ["dato", "valor", "respuesta"]);
      if (typeof dato === "string" && dato.trim()) {
        const datoTexto = dato.trim();
        if (datoTexto.toLowerCase().replace(/[\s_]/g, "_") === "no_encontrado") {
          await registrarIntentoSinResultado();
          return;
        }
        const nivelConfianza = obtenerCampoJSON(json, ["nivel_confianza", "confianza", "nivel de confianza"]);
        setRespuestaTexto(datoTexto);
        setProcedencia(mapearNivelConfianza(nivelConfianza));
        setCamino("tengo_dato");
        return;
      }
    }

    // No es JSON con 'dato' reconocible — texto libre, mismo flujo que
    // "Sí tengo esta información", procedencia queda para elegir a mano.
    setRespuestaTexto(texto);
    setProcedencia("");
    setCamino("tengo_dato");
  }

  async function registrarIntentoSinResultado() {
    setCargando(true);
    try {
      await fetch("/api/mci/preguntas/registrar-intento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta_id: preguntaId }),
      });
      setIntentoRegistrado(true);
      setPegadoTexto("");
    } finally {
      setCargando(false);
    }
  }

  async function previsualizarYConfirmar() {
    if (!respuestaTexto.trim() || !procedencia) return;
    setCargando(true);
    try {
      const res = await fetch("/api/mci/preguntas/propagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo: "previsualizar", pregunta_raiz_id: preguntaId }),
      });
      const data = await res.json();
      setNodosAfectados(data.nodos_afectados ?? []);
    } finally {
      setCargando(false);
    }
  }

  async function ejecutar(bypassCircuito = false) {
    if (!nodosAfectados || !procedencia) return;
    setCargando(true);
    try {
      const res = await fetch("/api/mci/preguntas/propagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: "ejecutar",
          project_id: projectId,
          pregunta_raiz_id: preguntaId,
          respuesta: respuestaTexto,
          procedencia,
          nodos_confirmados: nodosAfectados,
          bypass_circuito: bypassCircuito,
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.circuito_detenido) {
        // No se regeneró ni se marcó nada como resuelto (ejecutarPropagacion
        // corta antes de tocar la BD) — no llamar onResuelta(), la pregunta
        // sigue exactamente como estaba. respuestaTexto/procedencia quedan
        // intactos en el estado del componente para el reintento con bypass.
        setCircuitoDetenido(
          data.motivo_circuito ??
            "Convergencia automática detenida — revise manualmente las preguntas críticas restantes antes de continuar."
        );
        setDetalleLFaroPorNodo(data.detalle_l_faro_por_nodo ?? null);
        return;
      }
      if (res.ok) onResuelta();
    } finally {
      setCargando(false);
    }
  }

  let contenidoCamino: React.ReactNode;

  if (camino === "inicial") {
    contenidoCamino = (
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded bg-faro-navy px-3 py-1.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-faro-navy/90"
          onClick={() => setCamino("tengo_dato")}
        >
          Sí tengo esta información
        </button>
        <button
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50"
          disabled={cargando}
          onClick={pedirDerivacion}
        >
          No sé dónde conseguirla
        </button>
        <button
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={pedirExplicacion}
        >
          No entiendo la pregunta
        </button>
      </div>
    );
  } else if (camino === "no_se_donde") {
    contenidoCamino = (
      <div className="space-y-3">
        {cargando && !derivacion && <p className="text-xs text-gray-500">Preparando orientación de búsqueda...</p>}
        {derivacion && (
          <div className="space-y-2 rounded-lg border bg-white p-3 text-xs sm:text-sm">
            <p className="text-gray-700 font-medium">{derivacion.orientacion}</p>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Prompt para buscar (copie en Perplexity / NotebookLM / buscador):
              </p>
              <textarea
                readOnly
                className="w-full rounded border bg-gray-50 p-2 text-xs font-mono text-gray-700"
                rows={3}
                value={derivacion.prompt_busqueda}
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Prompt para traer el resultado en formato estructurado usable:
              </p>
              <textarea
                readOnly
                className="w-full rounded border bg-gray-50 p-2 text-xs font-mono text-gray-700"
                rows={3}
                value={derivacion.prompt_retorno}
              />
            </div>
          </div>
        )}

        {derivacion && (
          <div className="space-y-2 rounded-lg border border-faro-blue/30 bg-faro-blue/5 p-3">
            <p className="text-[11px] font-semibold text-faro-navy uppercase tracking-wide">
              ¿Ya consiguió el dato afuera? Péguelo aquí, sin salir de esta pregunta:
            </p>
            <textarea
              className="w-full rounded-lg border p-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-faro-navy/20"
              rows={4}
              value={pegadoTexto}
              onChange={(e) => {
                setPegadoTexto(e.target.value);
                setIntentoRegistrado(false);
              }}
              placeholder="Pegue aquí la respuesta que obtuvo (JSON estructurado o texto libre)"
            />
            <button
              className="rounded bg-faro-navy px-3 py-1.5 text-xs sm:text-sm font-medium text-white disabled:opacity-50 shadow-sm"
              disabled={!pegadoTexto.trim() || cargando}
              onClick={procesarRespuestaPegada}
            >
              {cargando ? "Procesando..." : "Ya tengo la respuesta, continuar"}
            </button>
            {intentoRegistrado && (
              <p className="text-[11px] text-emerald-700">
                Quedó registrado que intentó buscar esto sin encontrar un dato concreto — la
                pregunta sigue en espera, puede volver a intentarlo cuando tenga más pistas.
              </p>
            )}
          </div>
        )}

        <button
          className="text-[11px] font-normal text-gray-400 hover:text-gray-600 hover:underline"
          onClick={() => setCamino("inicial")}
        >
          ← Volver a las opciones (abandonar por ahora)
        </button>
      </div>
    );
  } else {
    contenidoCamino = (
      <div className="space-y-3">
        <textarea
          className="w-full rounded-lg border p-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-faro-navy/20"
          rows={3}
          value={respuestaTexto}
          onChange={(e) => setRespuestaTexto(e.target.value)}
          placeholder="Escriba su respuesta o dato aportado..."
        />

        <select
          className="w-full rounded-lg border bg-white p-2 text-xs sm:text-sm text-gray-700"
          value={procedencia}
          onChange={(e) => setProcedencia(e.target.value as Procedencia)}
        >
          <option value="">¿De dónde proviene este dato? (Seleccionar procedencia)</option>
          {Object.entries(ETIQUETAS_PROCEDENCIA).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>

        {circuitoDetenido ? (
          <div className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-3 text-xs sm:text-sm">
            <div>
              <p className="font-semibold text-red-900">Regeneración automática detenida</p>
              <p className="text-red-800">{circuitoDetenido}</p>
            </div>

            {/* Diagnóstico — mismos datos ya calculados que TarjetaConvergencia
                y ContadorPreguntasPrioridad, sin ninguna llamada LLM nueva. */}
            <div className="rounded-md border border-red-200 bg-white/70 p-2.5 space-y-2">
              {detalleLFaroPorNodo && detalleLFaroPorNodo.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-red-900 mb-1">
                    Desglose de L_FARO por nodo (mayor a menor incertidumbre):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[...detalleLFaroPorNodo]
                      .sort((a, b) => b.l_faro - a.l_faro)
                      .map((d) => (
                        <span
                          key={d.nodo}
                          className="font-mono text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded border border-red-200"
                        >
                          {NODO_LABEL_MAP[d.nodo] ?? d.nodo}: {d.l_faro.toFixed(3)}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {preguntasP1PorNodo && Object.keys(preguntasP1PorNodo).length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-red-900 mb-1">Preguntas críticas (P1) abiertas por nodo:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(preguntasP1PorNodo).map(([nodo, n]) => (
                      <span
                        key={nodo}
                        className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded border border-red-200"
                      >
                        🔴 {NODO_LABEL_MAP[nodo] ?? nodo}: {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <Link
                href={`/formulacion/${projectId}/dashboard#tarjeta-convergencia`}
                className="inline-block text-[11px] font-semibold text-faro-navy hover:underline"
              >
                Ver diagnóstico completo en el Dashboard →
              </Link>
            </div>

            <label className="flex items-start gap-2 text-[11px] text-red-900">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmoRevision}
                onChange={(e) => setConfirmoRevision(e.target.checked)}
              />
              <span>Confirmo que revisé el diagnóstico de arriba y quiero continuar de todas formas.</span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                className="rounded border bg-white px-3 py-1.5 text-xs sm:text-sm text-gray-700"
                onClick={() => {
                  setCircuitoDetenido(null);
                  setDetalleLFaroPorNodo(null);
                  setConfirmoRevision(false);
                  setNodosAfectados(null);
                }}
              >
                Volver
              </button>
              <button
                className="rounded border border-red-400 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-red-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-50"
                disabled={!confirmoRevision || cargando}
                onClick={() => ejecutar(true)}
              >
                {cargando ? "Regenerando..." : "Ya revisé, continuar de todas formas"}
              </button>
            </div>
          </div>
        ) : !nodosAfectados ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded bg-faro-navy px-3 py-1.5 text-xs sm:text-sm font-medium text-white disabled:opacity-50 shadow-sm"
              disabled={!respuestaTexto.trim() || !procedencia || cargando}
              onClick={previsualizarYConfirmar}
            >
              {cargando ? "Analizando impacto..." : "Continuar"}
            </button>
            <button className="rounded border px-3 py-1.5 text-xs sm:text-sm text-gray-600 hover:bg-gray-50" onClick={() => setCamino("inicial")}>
              Cancelar
            </button>
            <button
              className="text-xs font-medium text-faro-navy hover:underline"
              onClick={pedirExplicacion}
            >
              No entiendo la pregunta
            </button>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs sm:text-sm">
            <p className="text-amber-900 font-medium">
              Esta respuesta actualizará:{" "}
              <strong>{nodosAfectados.map((n) => n.nodo_tipo).join(", ")}</strong>
              {nodosAfectados.length > 1 ? " — ¿desea regenerar estos nodos en cascada con este dato?" : ""}
            </p>
            <div className="flex gap-2">
              <button
                className="rounded bg-faro-navy px-3 py-1.5 text-xs sm:text-sm font-medium text-white disabled:opacity-50 shadow-sm"
                disabled={cargando}
                onClick={() => ejecutar()}
              >
                {cargando ? "Regenerando en cascada..." : "Confirmar y regenerar"}
              </button>
              <button className="rounded border bg-white px-3 py-1.5 text-xs sm:text-sm text-gray-700" onClick={() => setNodosAfectados(null)}>
                Volver
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {contenidoCamino}

      {modalExplicacionAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarModalExplicacion();
          }}
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-faro-navy">¿Qué significa esta pregunta?</h3>
                <p className="mt-1 text-xs text-gray-500">&quot;{textoPregunta}&quot;</p>
              </div>
            </div>

            {cargandoExplicacion && (
              <IndicadorGenerando mensaje="Consultando con contexto, espere un momento..." />
            )}

            {!cargandoExplicacion && explicacion && (
              <div className="whitespace-pre-wrap rounded-lg border bg-gray-50 p-3 text-xs sm:text-sm text-gray-700">
                {explicacion}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                className="rounded bg-faro-navy px-4 py-1.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-faro-navy/90"
                onClick={cerrarModalExplicacion}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
