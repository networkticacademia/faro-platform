"use client";

import { useState } from "react";
import type { RutaOutput } from "@/lib/faro/ruta";

interface NodoGrafo {
  id: string;
  project_id: string;
  tipo: string;
  iteracion: number;
  contenido: RutaOutput;
  confianza_agente: string | null;
  preguntas_pendientes: string[];
  confirmado_humano: boolean;
  editado_humano: boolean;
  delta_nodal: number | null;
  created_at: string;
}

interface Metrica {
  deltaI: number;
  omega: number;
  deltaModulada: number;
  lFaro: number;
  seTau: number;
  tauC: number;
  convergio: boolean;
  contradicciones: { codigo: string; nivel: string; mensaje: string; phi: number }[];
}

interface PropuestaCadenaBusqueda {
  terminos_base: string[];
  terminos_sugeridos: string[];
  cadena_booleana: string;
  paquete_manual: string;
}

interface CitaRSL {
  titulo: string;
  doi: string | null;
  anio: number | null;
  relevancia: "alta" | "media" | "baja";
}

interface ResultadoRSL {
  estado_evidencia: "sin_verificar" | "confirmado_por_rsl" | "contradicho_por_rsl";
  citas: CitaRSL[];
  contradiccion: { codigo: string; nivel: string; mensaje: string; phi: number } | null;
  modo: "reactivo" | "formal";
}

interface ProjectRow {
  id: string;
  titulo_provisional: string | null;
  nu: string;
  tau: string;
  mu: string;
  alpha_area: string;
  u0_initial: number;
  estado: string;
}

const CAMPOS_EDITABLES: { key: keyof RutaOutput; etiqueta: string; multilinea?: boolean }[] = [
  { key: "tema", etiqueta: "Tema" },
  { key: "problema", etiqueta: "Problema", multilinea: true },
  { key: "pregunta_investigacion", etiqueta: "Pregunta de investigación", multilinea: true },
  { key: "objeto_estudio", etiqueta: "Objeto de estudio" },
  { key: "poblacion_contexto", etiqueta: "Población / contexto" },
  { key: "alcance_temporal", etiqueta: "Alcance temporal" },
  { key: "alcance_espacial", etiqueta: "Alcance espacial" },
  { key: "justificacion_breve", etiqueta: "Justificación breve", multilinea: true },
];

export default function FormulacionRuta({
  project,
  nodosIniciales,
}: {
  project: ProjectRow;
  nodosIniciales: NodoGrafo[];
}) {
  const [nodos, setNodos] = useState<NodoGrafo[]>(nodosIniciales);
  const [metrica, setMetrica] = useState<Metrica | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [editando, setEditando] = useState(false);
  const [contenidoEditado, setContenidoEditado] = useState<RutaOutput | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  // Pantalla de confirmación de búsqueda (RSL) — nuevo
  const [propuestaBusqueda, setPropuestaBusqueda] = useState<PropuestaCadenaBusqueda | null>(null);
  const [cadenaEditada, setCadenaEditada] = useState("");
  const [mostrarPaqueteManual, setMostrarPaqueteManual] = useState(false);
  const [verificandoRSL, setVerificandoRSL] = useState(false);
  const [resultadoRSL, setResultadoRSL] = useState<ResultadoRSL | null>(null);
  const [copiado, setCopiado] = useState(false);

  const nodoActual = nodos[0] ?? null;

  async function generar(conFeedback?: string) {
    setGenerando(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/ruta/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id, feedback: conFeedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error generando la propuesta.");
      setNodos((prev) => [data.nodo, ...prev]);
      setMetrica(data.metrica);
      setFeedback("");
      setEditando(false);
      // Nueva iteración → nueva propuesta de búsqueda, se descarta cualquier
      // verificación RSL previa (correspondía a la iteración anterior).
      setPropuestaBusqueda(data.propuesta_busqueda ?? null);
      setCadenaEditada(data.propuesta_busqueda?.cadena_booleana ?? "");
      setResultadoRSL(null);
      setMostrarPaqueteManual(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setGenerando(false);
    }
  }

  async function confirmar(editado: boolean) {
    if (!nodoActual) return;
    setConfirmando(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/ruta/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodo_id: nodoActual.id,
          contenido_editado: editado ? contenidoEditado : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al confirmar.");
      setNodos((prev) => [data.nodo, ...prev.slice(1)]);
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setConfirmando(false);
    }
  }

  function iniciarEdicion() {
    if (!nodoActual) return;
    setContenidoEditado({ ...nodoActual.contenido });
    setEditando(true);
  }

  async function verificarBusqueda() {
    if (!nodoActual || !cadenaEditada.trim()) return;
    setVerificandoRSL(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/rsl/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          nodo_id: nodoActual.id,
          cadena_confirmada: cadenaEditada,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al verificar contra literatura.");
      setResultadoRSL(data.rsl);
      setMetrica(data.metrica);
      // Actualiza el nodo actual en la lista con el estado_evidencia ya real
      setNodos((prev) => prev.map((n) => (n.id === data.nodo.id ? data.nodo : n)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido al verificar.");
    } finally {
      setVerificandoRSL(false);
    }
  }

  function copiarPaqueteManual() {
    if (!propuestaBusqueda) return;
    navigator.clipboard.writeText(propuestaBusqueda.paquete_manual);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-faro-navy">
            Formulación — RUTA {nodoActual ? `(iteración ${nodoActual.iteracion})` : ""}
          </h1>
          <p className="text-sm text-gray-600">
            {project.tau} · {project.nu} · {project.alpha_area} · U₀={project.u0_initial?.toFixed(3)}
          </p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full ${
          project.estado === "en_formulacion" ? "bg-faro-blue/10 text-faro-blue" : "bg-gray-100 text-gray-500"
        }`}>
          {project.estado}
        </span>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

      {!nodoActual && (
        <div className="text-center py-12 space-y-4">
          <p className="text-gray-600">Todavía no hay una propuesta de delimitación (RUTA) para este proyecto.</p>
          <button
            onClick={() => generar()}
            disabled={generando}
            className="bg-faro-navy text-white rounded-md px-6 py-3 font-medium disabled:opacity-40"
          >
            {generando ? "Generando..." : "Generar propuesta RUTA →"}
          </button>
        </div>
      )}

      {nodoActual && !editando && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-5 space-y-3">
            {CAMPOS_EDITABLES.map(({ key, etiqueta }) => (
              <div key={key}>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{etiqueta}</p>
                <p className="text-sm">{String(nodoActual.contenido[key] ?? "")}</p>
              </div>
            ))}

            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Hipótesis de vacío / problema</p>
              <p className="text-sm">{nodoActual.contenido.vacio_conocimiento_hipotesis?.afirmacion}</p>
              <p className={`text-xs mt-1 ${
                nodoActual.contenido.vacio_conocimiento_hipotesis?.estado_evidencia === "confirmado_por_rsl"
                  ? "text-green-700"
                  : nodoActual.contenido.vacio_conocimiento_hipotesis?.estado_evidencia === "contradicho_por_rsl"
                  ? "text-red-700"
                  : "text-amber-600"
              }`}>
                Estado de evidencia: {nodoActual.contenido.vacio_conocimiento_hipotesis?.estado_evidencia === "confirmado_por_rsl"
                  ? "confirmado por RSL"
                  : nodoActual.contenido.vacio_conocimiento_hipotesis?.estado_evidencia === "contradicho_por_rsl"
                  ? "contradicho por RSL"
                  : "sin verificar contra literatura — confirme la búsqueda abajo"}
              </p>
            </div>

            {nodoActual.preguntas_pendientes?.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">El agente necesita que usted aclare</p>
                <ul className="list-disc list-inside text-sm text-amber-700">
                  {nodoActual.preguntas_pendientes.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}

            <p className="text-xs text-gray-400">Confianza del agente: {nodoActual.confianza_agente}</p>
          </div>

          {propuestaBusqueda && !resultadoRSL && (
            <div className="bg-white rounded-lg border border-faro-blue/30 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-faro-navy">Confirmar búsqueda de literatura</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Revise o edite los términos antes de buscar — esto determina qué tan útil es la
                  evidencia que RSL va a encontrar. Términos sugeridos, combinando sus palabras
                  clave con lo que generó RUTA: {propuestaBusqueda.terminos_sugeridos.join(", ")}
                </p>
              </div>

              <label className="block">
                <span className="text-sm font-medium">Cadena de búsqueda</span>
                <textarea
                  className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm font-mono"
                  rows={2}
                  value={cadenaEditada}
                  onChange={(e) => setCadenaEditada(e.target.value)}
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={verificarBusqueda}
                  disabled={verificandoRSL || !cadenaEditada.trim()}
                  className="bg-faro-navy text-white rounded-md px-5 py-2.5 font-medium disabled:opacity-40"
                >
                  {verificandoRSL ? "Buscando en OpenAlex..." : "Confirmar y buscar literatura →"}
                </button>
                <button
                  onClick={() => setMostrarPaqueteManual((v) => !v)}
                  className="text-sm text-faro-blue underline"
                >
                  {mostrarPaqueteManual ? "Ocultar" : "Ver"} instrucciones para búsqueda manual
                </button>
              </div>

              {mostrarPaqueteManual && (
                <div className="bg-gray-50 rounded-md p-3 space-y-2">
                  <p className="text-xs text-gray-500">
                    Copie esto en NotebookLM, Consensus, Elicit o Google Scholar para revisar
                    literatura usted mismo, en paralelo a la búsqueda automática.
                  </p>
                  <pre className="text-xs whitespace-pre-wrap text-gray-800">{propuestaBusqueda.paquete_manual}</pre>
                  <button onClick={copiarPaqueteManual} className="text-xs text-faro-blue underline">
                    {copiado ? "Copiado ✓" : "Copiar instrucciones"}
                  </button>
                </div>
              )}
            </div>
          )}

          {resultadoRSL && (
            <div className={`rounded-lg border p-5 space-y-2 ${
              resultadoRSL.estado_evidencia === "confirmado_por_rsl" ? "bg-green-50 border-green-200" :
              resultadoRSL.estado_evidencia === "contradicho_por_rsl" ? "bg-red-50 border-red-200" :
              "bg-amber-50 border-amber-200"
            }`}>
              <h3 className="text-sm font-semibold text-faro-navy">Resultado de la verificación bibliográfica</h3>
              <p className="text-sm">
                {resultadoRSL.estado_evidencia === "confirmado_por_rsl" && "La literatura encontrada respalda esta hipótesis."}
                {resultadoRSL.estado_evidencia === "contradicho_por_rsl" && "La literatura encontrada contradice esta hipótesis — revise la contradicción abajo."}
                {resultadoRSL.estado_evidencia === "sin_verificar" && "No se encontró evidencia concluyente — ni a favor ni en contra. Considere ajustar los términos y volver a intentar, o proceder con la revisión manual."}
              </p>
              {resultadoRSL.citas.length > 0 && (
                <ul className="text-xs text-gray-700 list-disc list-inside">
                  {resultadoRSL.citas.map((c, i) => (
                    <li key={i}>
                      {c.titulo} {c.anio ? `(${c.anio})` : ""} {c.doi ? `— DOI: ${c.doi}` : ""} — relevancia {c.relevancia}
                    </li>
                  ))}
                </ul>
              )}
              {resultadoRSL.contradiccion && (
                <p className="text-xs text-red-700">[{resultadoRSL.contradiccion.nivel}] {resultadoRSL.contradiccion.mensaje}</p>
              )}
            </div>
          )}

          {metrica && (
            <div className="bg-white rounded-lg border p-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-gray-500 text-xs">δ_RUTA</p><p className="font-semibold">{metrica.deltaI}</p></div>
              <div><p className="text-gray-500 text-xs">Ω</p><p className="font-semibold">{metrica.omega}</p></div>
              <div><p className="text-gray-500 text-xs">L_FARO</p><p className="font-semibold">{metrica.lFaro}</p></div>
              <div><p className="text-gray-500 text-xs">τc</p><p className="font-semibold">{metrica.tauC}</p></div>
              <div className="col-span-2 md:col-span-4 pt-2 border-t">
                <span className={`text-xs px-2 py-1 rounded-full ${metrica.convergio ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                  {metrica.convergio ? "Convergió (L_FARO ≤ τc, sin contradicciones abiertas)" : "Aún no converge"}
                </span>
              </div>
              {metrica.contradicciones.length > 0 && (
                <div className="col-span-2 md:col-span-4 text-xs text-red-600">
                  {metrica.contradicciones.map((c, i) => (
                    <p key={i}>[{c.nivel}] {c.mensaje}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {!nodoActual.confirmado_humano && (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => confirmar(false)}
                disabled={confirmando}
                className="bg-faro-navy text-white rounded-md px-5 py-2.5 font-medium disabled:opacity-40"
              >
                {confirmando ? "Guardando..." : "Aceptar esta versión"}
              </button>
              <button
                onClick={iniciarEdicion}
                className="border border-faro-navy text-faro-navy rounded-md px-5 py-2.5 font-medium"
              >
                Editar antes de aceptar
              </button>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <label className="text-sm font-medium">¿Qué debería corregir el agente? (opcional, para regenerar)</label>
            <textarea
              className="w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
              rows={2}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Ej. El alcance espacial no corresponde a la región real del proyecto..."
            />
            <button
              onClick={() => generar(feedback || undefined)}
              disabled={generando}
              className="text-sm text-faro-blue underline disabled:opacity-40"
            >
              {generando ? "Generando nueva iteración..." : "Regenerar propuesta →"}
            </button>
          </div>
        </div>
      )}

      {editando && contenidoEditado && (
        <div className="bg-white rounded-lg border p-5 space-y-4">
          {CAMPOS_EDITABLES.map(({ key, etiqueta, multilinea }) => (
            <label key={key} className="block">
              <span className="text-sm font-medium">{etiqueta}</span>
              {multilinea ? (
                <textarea
                  className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
                  rows={3}
                  value={String(contenidoEditado[key] ?? "")}
                  onChange={(e) => setContenidoEditado({ ...contenidoEditado, [key]: e.target.value })}
                />
              ) : (
                <input
                  className="mt-1 w-full border rounded-md p-2 text-gray-900 bg-white text-sm"
                  value={String(contenidoEditado[key] ?? "")}
                  onChange={(e) => setContenidoEditado({ ...contenidoEditado, [key]: e.target.value })}
                />
              )}
            </label>
          ))}
          <div className="flex gap-3">
            <button
              onClick={() => confirmar(true)}
              disabled={confirmando}
              className="bg-faro-navy text-white rounded-md px-5 py-2.5 font-medium disabled:opacity-40"
            >
              {confirmando ? "Guardando..." : "Guardar edición y aceptar"}
            </button>
            <button
              onClick={() => setEditando(false)}
              className="text-sm text-gray-500"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {nodos.length > 1 && (
        <details className="text-sm text-gray-500">
          <summary className="cursor-pointer">Historial de iteraciones ({nodos.length})</summary>
          <ul className="mt-2 space-y-1">
            {nodos.map((n) => (
              <li key={n.id}>
                Iteración {n.iteracion} — δ={n.delta_nodal} — {n.confirmado_humano ? "confirmada" : "pendiente"}
                {n.editado_humano ? " (editada)" : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
