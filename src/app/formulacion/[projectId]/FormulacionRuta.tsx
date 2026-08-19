"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import NavegacionNodos from "@/components/faro/NavegacionNodos";
import { IndicadorGenerando } from "@/components/faro/IndicadorGenerando";
import { PreguntasPendientes, ensamblarFeedbackDesdeRespuestas } from "@/components/faro/PreguntasPendientes";
import { RutaInfoPanel } from "./RutaInfoPanel";
import type { RutaOutput } from "@/lib/faro/ruta";
import {
  construirCadenaNucleo,
  construirCadenaAmpliada,
  type TerminoConPeso,
  type NivelTermino,
} from "@/lib/faro/rsl/cadenaBusqueda";
import { ParserAsistido } from "./ParserAsistido";
import { ClasificadorSubtipoDti } from "./ClasificadorTipoProyecto";
import PanelHerramientasReferencia from "@/components/faro/PanelHerramientasReferencia";
import type { SubtipoDti } from "@/lib/faro/tipologiaProyecto";
import type { TipoProyecto } from "@/lib/faro/types";
import { CargaRubrica } from "./CargaRubrica";
import type { RubricaProyecto } from "@/lib/faro/rubrica";
import { duracionDefaultMeses } from "@/lib/faro/impactosDelimitacion";

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
  terminos_clasificados: TerminoConPeso[];
  cadena_nucleo: string;
  cadena_ampliada: string;
  paquete_manual: string;
  paquete_manual_filtrado: string;
}

interface CitaRSL {
  titulo: string;
  doi: string | null;
  anio: number | null;
  relevancia: "alta" | "media" | "baja";
  resumen_hallazgo: string;
  fuente: "openalex" | "crossref" | "semantic_scholar";
}

interface ResultadoRSL {
  estado_evidencia: "sin_verificar" | "confirmado_por_rsl" | "contradicho_por_rsl";
  sintesis_narrativa: string;
  vacio_detectado: boolean;
  citas: CitaRSL[];
  citas_descartadas_no_verificadas: number;
  contradiccion: { codigo: string; nivel: string; mensaje: string; phi: number } | null;
  modo: "reactivo" | "formal";
  fuentes_consultadas: { fuente: string; candidatos_encontrados: number; fallo: string | null }[];
}

interface ProjectRow {
  id: string;
  titulo_provisional: string | null;
  nu: string;
  tau: TipoProyecto;
  subtipo_dti?: SubtipoDti | null;
  rubrica_evaluacion?: RubricaProyecto | null;
  mu: string;
  alpha_area: string;
  u0_initial: number;
  estado: string;
  duracion_meses_proyecto?: number | null;
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
  const defDuracion = duracionDefaultMeses(project.nu);
  const [duracionMeses, setDuracionMeses] = useState<number | null>(project.duracion_meses_proyecto ?? null);
  const [inputDuracion, setInputDuracion] = useState<string>(
    project.duracion_meses_proyecto?.toString() ?? defDuracion.meses?.toString() ?? ""
  );
  const [guardandoDuracion, setGuardandoDuracion] = useState(false);
  const [errorDuracion, setErrorDuracion] = useState<string | null>(null);
  const [panelDuracionAbierto, setPanelDuracionAbierto] = useState(true);
  const [metrica, setMetrica] = useState<Metrica | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [editando, setEditando] = useState(false);
  const [contenidoEditado, setContenidoEditado] = useState<RutaOutput | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);
  const [respuestasPreguntas, setRespuestasPreguntas] = useState<Record<number, string>>({});

  // Pantalla de confirmación de búsqueda (RSL)
  const [propuestaBusqueda, setPropuestaBusqueda] = useState<PropuestaCadenaBusqueda | null>(null);
  const [terminosEditables, setTerminosEditables] = useState<TerminoConPeso[]>([]);
  const [usarAmpliada, setUsarAmpliada] = useState(false);
  const [cadenaEditada, setCadenaEditada] = useState("");
  const [mostrarPaqueteManual, setMostrarPaqueteManual] = useState(false);
  const [tabPaqueteManual, setTabPaqueteManual] = useState<"buscar" | "filtrar">("buscar");
  const [verificandoRSL, setVerificandoRSL] = useState(false);
  const [resultadoRSL, setResultadoRSL] = useState<ResultadoRSL | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [copiadoFiltrado, setCopiadoFiltrado] = useState(false);

  const editorCadenaRef = useRef<HTMLDivElement>(null);

  function irAEditorCadena() {
    editorCadenaRef.current?.scrollIntoView({ behavior: "smooth" });
  }

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
      setRespuestasPreguntas({});
      setEditando(false);
      // Nueva iteración → nueva propuesta de búsqueda, se descarta cualquier
      // verificación RSL previa (correspondía a la iteración anterior).
      const propuesta: PropuestaCadenaBusqueda | null = data.propuesta_busqueda ?? null;
      setPropuestaBusqueda(propuesta);
      setTerminosEditables(propuesta?.terminos_clasificados ?? []);
      setUsarAmpliada(false);
      setCadenaEditada(propuesta?.cadena_nucleo ?? "");
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
    const hayRespuestasSinGuardar = Object.values(respuestasPreguntas).some((v) => v.trim().length > 0);
    if (hayRespuestasSinGuardar) {
      const continuar = window.confirm(
        "Tiene respuestas sin guardar en las preguntas de arriba — se perderán si continúa. ¿Confirma?"
      );
      if (!continuar) return;
    }
    setConfirmando(true);
    setError(null);
    try {
      // 1. Consultar preguntas abiertas de este nodo para el modal de sellado
      const qRes = await fetch(`/api/mci/preguntas/pendientes?project_id=${project.id}`);
      const qData = await qRes.json();
      const openQuestions = (qData.preguntas ?? []).filter(
        (q: any) => q.nodo_id === nodoActual.id
      );

      if (openQuestions.length > 0) {
        const listText = openQuestions.map((q: any, i: number) => `${i + 1}. ${q.texto_pregunta}`).join("\n");
        const userConfirmed = window.confirm(
          `Este nodo tiene ${openQuestions.length} preguntas abiertas:\n\n${listText}\n\nAl sellarlo, pasarán al mapa de riesgos y el nodo quedará protegido contra reapertura. ¿Confirmar?`
        );
        if (!userConfirmed) {
          setConfirmando(false);
          return;
        }
      }

      const res = await fetch("/api/mci/ruta/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodo_id: nodoActual.id,
          contenido_editado: editado ? contenidoEditado : undefined,
          sellar: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al confirmar.");
      setNodos((prev) => [data.nodo, ...prev.slice(1)]);
      setEditando(false);
      setRespuestasPreguntas({});
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

  async function reabrirParaEditar() {
    if (!nodoActual) return;
    setReabriendo(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/nodo/reabrir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodo_id: nodoActual.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al reabrir el nodo.");
      setNodos((prev) => [data.nodo, ...prev.slice(1)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setReabriendo(false);
    }
  }

  // Reclasifica un término (núcleo↔contexto) y recalcula de inmediato
  // la cadena que se va a enviar — reutiliza los mismos constructores
  // que usa el backend, para que no exista divergencia entre lo que
  // el formulador ve y lo que efectivamente se ejecuta.
  function alternarNivelTermino(indice: number) {
    const actualizado = terminosEditables.map((t, i): TerminoConPeso =>
      i === indice
        ? { ...t, nivel: (t.nivel === "nucleo" ? "contexto" : "nucleo") as NivelTermino }
        : t
    );
    setTerminosEditables(actualizado);
    setCadenaEditada(
      usarAmpliada ? construirCadenaAmpliada(actualizado) : construirCadenaNucleo(actualizado)
    );
  }

  function alternarAmpliada() {
    const nuevoValor = !usarAmpliada;
    setUsarAmpliada(nuevoValor);
    setCadenaEditada(
      nuevoValor ? construirCadenaAmpliada(terminosEditables) : construirCadenaNucleo(terminosEditables)
    );
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

  function copiarPaqueteManualFiltrado() {
    if (!propuestaBusqueda) return;
    navigator.clipboard.writeText(propuestaBusqueda.paquete_manual_filtrado);
    setCopiadoFiltrado(true);
    setTimeout(() => setCopiadoFiltrado(false), 2000);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <NavegacionNodos projectId={project.id} />
      <RutaInfoPanel />
      <CargaRubrica projectId={project.id} rubricaInicial={project.rubrica_evaluacion ?? null} />

      {/* Panel de Duración del Proyecto */}
      <div className="rounded-xl border border-gray-200 bg-white mb-4">
        <button
          type="button"
          onClick={() => setPanelDuracionAbierto((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">{panelDuracionAbierto ? "▾" : "▸"}</span>
            <span className="text-sm font-medium text-faro-navy">Duración del Proyecto</span>
          </span>
          {duracionMeses !== null && (
            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              Confirmada: {duracionMeses} meses
            </span>
          )}
        </button>

        {panelDuracionAbierto && (
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs text-gray-600">
              La duración confirmada es una restricción dura del Triángulo de Hierro. Determina la viabilidad temporal del alcance, los recursos y los riesgos del proyecto.
            </p>

            {duracionMeses !== null ? (
              <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-800 flex items-center justify-between">
                <span>
                  ✓ Duración confirmada del proyecto: <strong>{duracionMeses} meses</strong>.
                </span>
                <button
                  type="button"
                  onClick={() => setDuracionMeses(null)}
                  className="text-xs text-green-700 underline font-medium hover:text-green-900"
                >
                  Modificar
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  {defDuracion.meses
                    ? `Sugerido por defecto para nivel ${project.nu}: ${defDuracion.meses} meses (${defDuracion.fuente}).`
                    : `No hay duración por defecto para nivel ${project.nu} (${defDuracion.fuente}).`}
                </p>
                {errorDuracion && <div className="text-xs text-red-600">{errorDuracion}</div>}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    className="w-24 text-sm border rounded px-2.5 py-1.5 bg-white text-gray-900"
                    placeholder="Meses"
                    value={inputDuracion}
                    onChange={(e) => setInputDuracion(e.target.value)}
                  />
                  <button
                    onClick={async () => {
                      const valor = parseInt(inputDuracion, 10);
                      if (isNaN(valor) || valor <= 0) {
                        setErrorDuracion("Debe introducir un número de meses válido y positivo");
                        return;
                      }
                      setGuardandoDuracion(true);
                      setErrorDuracion(null);
                      try {
                        const res = await fetch("/api/mci/proyecto/duracion", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            project_id: project.id,
                            duracion_meses_proyecto: valor,
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error ?? "Error al guardar la duración.");
                        setDuracionMeses(data.duracion_meses_proyecto);
                      } catch (err) {
                        setErrorDuracion(err instanceof Error ? err.message : "Error desconocido");
                      } finally {
                        setGuardandoDuracion(false);
                      }
                    }}
                    disabled={guardandoDuracion || !inputDuracion}
                    className="bg-faro-navy text-white text-sm font-medium rounded-md px-4 py-1.5 disabled:opacity-40"
                  >
                    {guardandoDuracion ? "Confirmando..." : "Confirmar duración"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-faro-navy">
            Formulación — RUTA {nodoActual ? `(iteración ${nodoActual.iteracion})` : ""}
          </h1>
          <p className="text-sm text-gray-600">
            {project.tau} · {project.nu} · {project.alpha_area} · U₀={project.u0_initial?.toFixed(3)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {nodoActual?.confirmado_humano && (
            <Link
              href={`/formulacion/${project.id}/nova`}
              className="text-xs px-3 py-1.5 rounded-md border border-faro-navy text-faro-navy hover:bg-faro-navy hover:text-white transition-colors font-medium flex items-center gap-1"
            >
              NOVA →
            </Link>
          )}
          <Link
            href={`/formulacion/${project.id}/fuentes`}
            className="text-xs px-3 py-1.5 rounded-md border border-faro-navy text-faro-navy hover:bg-faro-navy hover:text-white transition-colors font-medium flex items-center gap-1"
          >
            📚 Fuentes
          </Link>
          <span className={`text-xs px-3 py-1 rounded-full ${
            project.estado === "en_formulacion" ? "bg-faro-blue/10 text-faro-blue" : "bg-gray-100 text-gray-500"
          }`}>
            {project.estado}
          </span>
        </div>
      </div>

      <ClasificadorSubtipoDti
        projectId={project.id}
        tau={project.tau}
        subtipoDtiActual={project.subtipo_dti ?? null}
      />

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
          {generando && <IndicadorGenerando />}
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
                <PreguntasPendientes
                  preguntas={nodoActual.preguntas_pendientes}
                  respuestas={respuestasPreguntas}
                  onCambiarRespuesta={(i, v) => setRespuestasPreguntas((prev) => ({ ...prev, [i]: v }))}
                />
              </div>
            )}

            <p className="text-xs text-gray-400">Confianza del agente: {nodoActual.confianza_agente}</p>
          </div>

          {propuestaBusqueda && (
            <div ref={editorCadenaRef} className="bg-white rounded-lg border border-faro-blue/30 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-faro-navy">Confirmar búsqueda de literatura</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Cada término se propuso como <span className="text-faro-blue font-medium">núcleo</span> (entra
                  siempre a la búsqueda) o <span className="text-amber-700 font-medium">contexto</span> (solo
                  ayuda a evaluar relevancia, no restringe la recuperación). Haga clic en cualquiera para
                  cambiarlo antes de buscar.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {terminosEditables.map((t, i) => (
                  <button
                    key={`${t.texto}-${i}`}
                    onClick={() => alternarNivelTermino(i)}
                    title="Clic para cambiar entre núcleo y contexto"
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      t.nivel === "nucleo"
                        ? "bg-faro-blue/10 border-faro-blue text-faro-blue"
                        : "bg-amber-50 border-amber-300 text-amber-700"
                    }`}
                  >
                    {t.texto} · {t.nivel === "nucleo" ? "núcleo" : "contexto"}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="text-sm font-medium">Cadena de búsqueda</span>
                <p className="text-xs text-gray-400">
                  Se recalcula automáticamente al reclasificar términos arriba — también puede editarla
                  directamente aquí.
                </p>
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
                  {verificandoRSL ? "Buscando en OpenAlex, Crossref y Semantic Scholar..." : "Confirmar y buscar literatura →"}
                </button>
                <button
                  onClick={alternarAmpliada}
                  className={`text-sm rounded-md px-4 py-2.5 border font-medium ${
                    usarAmpliada
                      ? "bg-faro-navy text-white border-faro-navy"
                      : "border-faro-navy text-faro-navy"
                  }`}
                >
                  {usarAmpliada ? "Búsqueda ampliada activa ✓" : "Ampliar búsqueda con contexto →"}
                </button>
                <button
                  onClick={irAEditorCadena}
                  className="text-sm rounded-md px-4 py-2.5 border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
                >
                  Ajustar términos y reintentar ↑
                </button>
                <button
                  onClick={() => setMostrarPaqueteManual((v) => !v)}
                  className="text-sm text-faro-blue underline"
                >
                  {mostrarPaqueteManual ? "Ocultar" : "Trabajar en paralelo con"} NotebookLM / Consensus →
                </button>
              </div>

              {mostrarPaqueteManual && propuestaBusqueda && (
                <div className="bg-gray-50 rounded-md p-3 space-y-3">
                  <div className="flex items-center gap-2 border-b pb-2">
                    <button
                      onClick={() => setTabPaqueteManual("buscar")}
                      className={`text-xs px-3 py-1 rounded font-medium ${
                        tabPaqueteManual === "buscar"
                          ? "bg-faro-navy text-white"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }`}
                    >
                      Buscar desde cero
                    </button>
                    <button
                      onClick={() => setTabPaqueteManual("filtrar")}
                      className={`text-xs px-3 py-1 rounded font-medium ${
                        tabPaqueteManual === "filtrar"
                          ? "bg-faro-navy text-white"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }`}
                    >
                      Filtrar lo ya cargado
                    </button>
                  </div>

                  {tabPaqueteManual === "buscar" ? (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">
                        Copie esto y revise literatura usted mismo, en paralelo a la búsqueda automática —
                        ambos caminos son válidos y se complementan.
                      </p>
                      <pre className="text-xs whitespace-pre-wrap text-gray-800">{propuestaBusqueda.paquete_manual}</pre>
                      <button onClick={copiarPaqueteManual} className="text-xs text-faro-blue underline">
                        {copiado ? "Copiado ✓" : "Copiar instrucciones"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-faro-navy">
                        Filtrar fuentes ya cargadas (prioriza DOI verificable)
                      </p>
                      <p className="text-xs text-gray-500">
                        Copie estas instrucciones en su cuaderno o asistente si ya tiene decenas de fuentes cargadas.
                        Le devolverá el formato listo para pegar en el parser asistido.
                      </p>
                      <pre className="text-xs whitespace-pre-wrap text-gray-800">{propuestaBusqueda.paquete_manual_filtrado}</pre>
                      <button onClick={copiarPaqueteManualFiltrado} className="text-xs text-faro-blue underline">
                        {copiadoFiltrado ? "Copiado ✓" : "Copiar instrucciones"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {resultadoRSL && (
            <div className={`rounded-lg border p-5 space-y-3 ${
              resultadoRSL.estado_evidencia === "confirmado_por_rsl" ? "bg-green-50 border-green-200" :
              resultadoRSL.estado_evidencia === "contradicho_por_rsl" ? "bg-red-50 border-red-200" :
              "bg-amber-50 border-amber-200"
            }`}>
              <h3 className="text-sm font-semibold text-faro-navy">Resultado de la verificación bibliográfica</h3>

              {resultadoRSL.sintesis_narrativa && (
                <p className="text-sm text-gray-800">{resultadoRSL.sintesis_narrativa}</p>
              )}

              {!resultadoRSL.vacio_detectado && resultadoRSL.citas.length > 0 && (
                <ul className="text-xs text-gray-700 space-y-2">
                  {resultadoRSL.citas.map((c, i) => (
                    <li key={i} className="border-t pt-2 first:border-t-0 first:pt-0">
                      <p className="font-medium">
                        {c.titulo} {c.anio ? `(${c.anio})` : ""} — <span className="uppercase text-[10px] text-gray-400">{c.fuente}</span>
                      </p>
                      {c.doi && <p className="text-gray-500">DOI: {c.doi}</p>}
                      <p className="mt-0.5">{c.resumen_hallazgo}</p>
                      <p className="text-gray-400 text-[10px]">relevancia: {c.relevancia}</p>
                    </li>
                  ))}
                </ul>
              )}

              {resultadoRSL.contradiccion && (
                <p className="text-xs text-red-700">[{resultadoRSL.contradiccion.nivel}] {resultadoRSL.contradiccion.mensaje}</p>
              )}

              <p className="text-[10px] text-gray-400">
                Fuentes consultadas: {resultadoRSL.fuentes_consultadas.map((f) =>
                  `${f.fuente} (${f.fallo ? "falló" : `${f.candidatos_encontrados} resultados`})`
                ).join(" · ")}
                {resultadoRSL.citas_descartadas_no_verificadas > 0 && (
                  <> · {resultadoRSL.citas_descartadas_no_verificadas} cita(s) descartada(s) por no coincidir con ningún candidato real (verificación automática)</>
                )}
              </p>

              {resultadoRSL.vacio_detectado && (
                <div className="bg-white/60 rounded-md p-3 mt-2 border border-amber-300 space-y-2">
                  <p className="text-xs font-medium text-amber-800">
                    Ninguna fuente automática encontró literatura que combine estos conceptos directamente —
                    esto puede ser un vacío de conocimiento real, o los términos necesitan ajuste.
                  </p>
                  <p className="text-xs text-amber-900 bg-amber-100/60 p-2.5 rounded border border-amber-200/60 leading-relaxed">
                    Puede ajustar los términos arriba: combínelos con <strong>AND</strong> (todas las palabras deben aparecer — más preciso, menos resultados) o con <strong>OR</strong> (basta que aparezca una — más resultados, menos preciso). Mantenga cada término entre comillas dobles, por ejemplo: <code className="bg-white px-1 py-0.5 rounded text-amber-950 font-mono text-[11px]">&quot;sensores&quot; OR &quot;drones&quot;</code>. Para combinar ambos operadores, use paréntesis que indiquen el orden, por ejemplo: <code className="bg-white px-1 py-0.5 rounded text-amber-950 font-mono text-[11px]">(&quot;piña&quot;) AND (&quot;sensores&quot; OR &quot;drones&quot;)</code>.
                  </p>
                  {!usarAmpliada && (
                    <p className="text-xs text-gray-600">
                      Pruebe también con &quot;Ampliar búsqueda con contexto&quot; arriba, o edite qué términos son
                      núcleo antes de reintentar.
                    </p>
                  )}
                  <button
                    onClick={irAEditorCadena}
                    className="text-xs font-semibold text-faro-blue underline block"
                  >
                    Ajustar términos y reintentar ↑
                  </button>
                  <p className="text-xs text-gray-600 pt-1">
                    Como último recurso, puede intentar la búsqueda manual asistida con el botón de instrucciones arriba.
                  </p>
                </div>
              )}
            </div>
          )}

          <PanelHerramientasReferencia faseId="antecedentes_estado_arte" />

          {propuestaBusqueda && (
            <ParserAsistido projectId={project.id} nodoOrigenId={nodoActual?.id} />
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

          {nodoActual.confirmado_humano && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-amber-800">
                Este nodo ya está confirmado. Si necesita ajustar algo, reábralo para
                editar — el contenido actual no se pierde.
              </p>
              <button
                onClick={reabrirParaEditar}
                disabled={reabriendo}
                className="text-xs bg-amber-600 text-white rounded-md px-4 py-2 font-medium disabled:opacity-40 whitespace-nowrap"
              >
                {reabriendo ? "Reabriendo..." : "Reabrir para editar"}
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
              onClick={() => {
                const feedbackPreguntas = ensamblarFeedbackDesdeRespuestas(
                  nodoActual.preguntas_pendientes ?? [],
                  respuestasPreguntas
                );
                const feedbackLibre = feedback.trim();
                const partes = [feedbackPreguntas, feedbackLibre].filter(Boolean);
                const feedbackCompleto = partes.join("\n\n");
                generar(feedbackCompleto || undefined);
              }}
              disabled={generando}
              className="border border-faro-navy text-faro-navy rounded-md px-5 py-2.5 font-medium hover:bg-faro-navy hover:text-white transition-colors disabled:opacity-40"
            >
              {generando ? "Generando nueva iteración..." : "Regenerar propuesta →"}
            </button>
            {generando && <IndicadorGenerando mensaje="Regenerando propuesta con el agente de IA..." />}
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
