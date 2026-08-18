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
import { ETIQUETAS_PROCEDENCIA, type Procedencia } from "@/lib/faro/procedencia";
import { IndicadorGenerando } from "./IndicadorGenerando";

type Camino = "inicial" | "tengo_dato" | "no_se_donde";

interface NodoAfectado {
  nodo_ids: string[];
  nodo_tipo: string;
  preguntas_que_resuelve: string[];
}

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
  const [cargando, setCargando] = useState(false);

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

  async function ejecutar() {
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
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.circuito_detenido) {
        // No se regeneró ni se marcó nada como resuelto (ejecutarPropagacion
        // corta antes de tocar la BD) — no llamar onResuelta(), la pregunta
        // sigue exactamente como estaba.
        setCircuitoDetenido(
          data.motivo_circuito ??
            "Convergencia automática detenida — revise manualmente las preguntas críticas restantes antes de continuar."
        );
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
          <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs sm:text-sm">
            <p className="font-semibold text-red-900">Regeneración automática detenida</p>
            <p className="text-red-800">{circuitoDetenido}</p>
            <button
              className="rounded border bg-white px-3 py-1.5 text-xs sm:text-sm text-gray-700"
              onClick={() => {
                setCircuitoDetenido(null);
                setNodosAfectados(null);
              }}
            >
              Volver
            </button>
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
                onClick={ejecutar}
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
