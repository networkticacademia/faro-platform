"use client";

import { useState, useEffect } from "react";
import NavegacionNodos from "@/components/faro/NavegacionNodos";
import { IndicadorGenerando } from "@/components/faro/IndicadorGenerando";
import { LaTeXPreview } from "@/components/faro/LaTeXPreview";

interface ProjectRow {
  id: string;
  titulo_provisional: string | null;
  tau: string;
  nu: string;
  alpha_area: string;
  estado: string;
}

interface ChatMessage {
  sender: "user" | "advisor";
  text: string;
}

interface AutorMetadata {
  nombre: string;
  institucion: string;
  facultad: string;
  programa: string;
  rol: string;
}

interface TituloOpciones {
  opcionA: string;
  explicacionA: string;
  opcionB: string;
  explicacionB: string;
  palabrasClave: string[];
}

export default function FormulacionPropuesta({ project }: { project: ProjectRow }) {
  const [documento, setDocumento] = useState<{ markdown: string; editado: boolean; autor?: AutorMetadata | null; estiloCita?: "apa" | "ieee" | "vancouver" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cargandoAsesor, setCargandoAsesor] = useState(false);
  const [cargandoExport, setCargandoExport] = useState(false);
  const [cargandoSave, setCargandoSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Step navigation states
  const [step, setStep] = useState<"autor" | "titulo" | "editor">("editor");
  
  // Autor form states
  const [autorForm, setAutorForm] = useState<AutorMetadata>({
    nombre: "",
    institucion: "Universidad de Nariño",
    facultad: "Facultad de Ingeniería",
    programa: "Ingeniería de Sistemas",
    rol: "Investigador Principal"
  });

  // Title generation states
  const [tituloOpciones, setTituloOpciones] = useState<TituloOpciones | null>(null);
  const [cargandoTitulos, setCargandoTitulos] = useState(false);
  const [tituloSeleccionado, setTituloSeleccionado] = useState("");
  const [customTitulo, setCustomTitulo] = useState("");
  const [palabrasClaveInput, setPalabrasClaveInput] = useState("");
  
  // Editor/Humanizer/Preview states
  const [editando, setEditando] = useState(false);
  const [textoEditado, setTextoEditado] = useState("");
  const [humanizando, setHumanizando] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [documentoHumanizado, setDocumentoHumanizado] = useState<string | null>(null);
  const [estiloCita, setEstiloCita] = useState<"apa" | "ieee" | "vancouver">("apa");
  
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { sender: "advisor", text: "¡Hola! Soy tu asesor metodológico FARO. Estoy aquí para aconsejarte sobre la propuesta, estructurar tus ideas o ayudarte a decidir si resolver algo como un riesgo en la matriz o mediante feedback al agente." }
  ]);

  async function cargarDocumento(forceRegenerate = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mci/proyecto/documento?project_id=${project.id}${forceRegenerate ? "&force_regenerate=true" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el documento.");
      
      setDocumento(data.documento);
      setTextoEditado(data.documento.markdown);
      
      if (data.documento.autor) {
        setAutorForm(data.documento.autor);
      }
      if (data.documento.estiloCita) {
        setEstiloCita(data.documento.estiloCita);
      }

      if (data.palabras_clave && data.palabras_clave.length > 0) {
        setPalabrasClaveInput(data.palabras_clave.join(", "));
      }
      
      // If author name is not set or project title is empty, guide user to configure them first
      if (!data.documento.autor?.nombre) {
        setStep("autor");
      } else if (!project.titulo_provisional && !tituloSeleccionado) {
        setStep("titulo");
        generarOpcionesTitulo();
      } else {
        setStep("editor");
        if (project.titulo_provisional) {
          setTituloSeleccionado(project.titulo_provisional);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarDocumento();
  }, [project.id]);

  async function generarOpcionesTitulo() {
    setCargandoTitulos(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/proyecto/titulo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al proponer títulos.");
      setTituloOpciones(data.titulos);
      if (data.titulos.palabrasClave && data.titulos.palabrasClave.length > 0) {
        setPalabrasClaveInput(data.titulos.palabrasClave.join(", "));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al proponer títulos.");
    } finally {
      setCargandoTitulos(false);
    }
  }

  async function guardarAutorYTitulo(nuevoTitulo: string) {
    setCargandoSave(true);
    setError(null);
    try {
      const keywordsArray = palabrasClaveInput
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      // First save title and keywords in project record if it changed
      await fetch("/api/mci/proyecto/titulo/guardar-titulo-provisional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          project_id: project.id, 
          titulo: nuevoTitulo,
          palabras_clave: keywordsArray
        })
      });
      project.titulo_provisional = nuevoTitulo;

      // Then save the document, author metadata, and citation style
      const res = await fetch("/api/mci/proyecto/documento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          markdown: textoEditado,
          autor: autorForm,
          estiloCita: estiloCita
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar la propuesta.");
      
      setDocumento({
        markdown: textoEditado,
        editado: true,
        autor: autorForm,
        estiloCita: estiloCita
      });
      
      setStep("editor");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar metadatos.");
    } finally {
      setCargandoSave(false);
    }
  }

  async function handleGuardar() {
    setCargandoSave(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/proyecto/documento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          markdown: textoEditado,
          autor: autorForm,
          estiloCita: estiloCita
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar la propuesta.");
      
      setDocumento({
        markdown: textoEditado,
        editado: true,
        autor: autorForm,
        estiloCita: estiloCita
      });
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setCargandoSave(false);
    }
  }

  async function handleHumanizar() {
    setHumanizando(true);
    setError(null);
    try {
      const res = await fetch("/api/mci/proyecto/humanizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          markdown: textoEditado
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo humanizar el borrador.");
      
      setDocumentoHumanizado(data.humanized);
      setPreviewActive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de humanización.");
    } finally {
      setHumanizando(false);
    }
  }

  function descargarArchivo(filename: string, text: string) {
    const element = document.createElement("a");
    const file = new Blob([text], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

  async function handleExportar(formato: "md" | "tex") {
    setCargandoExport(true);
    setError(null);
    try {
      // If we have a humanized version active, export that, otherwise use the saved draft
      const currentText = previewActive && documentoHumanizado ? documentoHumanizado : textoEditado;
      
      // Save it first to make sure database has the current text before export queries it
      await fetch("/api/mci/proyecto/documento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          markdown: currentText,
          autor: autorForm
        }),
      });

      const res = await fetch(`/api/mci/proyecto/exportar?project_id=${project.id}&formato=${formato}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al exportar.");

      if (formato === "md") {
        descargarArchivo(data.filename, data.content);
      } else {
        descargarArchivo(data.texFilename, data.tex);
        setTimeout(() => {
          descargarArchivo(data.bibFilename, data.bibtex);
        }, 500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al exportar.");
    } finally {
      setCargandoExport(false);
    }
  }

  async function enviarMensajeAsesor(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatHistory((prev) => [...prev, { sender: "user", text: userMsg }]);
    setCargandoAsesor(true);
    
    try {
      const res = await fetch("/api/mci/proyecto/chat-advisory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          mensaje: userMsg,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo obtener consejo.");
      setChatHistory((prev) => [...prev, { sender: "advisor", text: data.respuesta }]);
    } catch (err) {
      setChatHistory((prev) => [...prev, { sender: "advisor", text: "Disculpa, ocurrió un error al intentar consultar al asesor." }]);
    } finally {
      setCargandoAsesor(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <NavegacionNodos projectId={project.id} />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-faro-navy flex items-center gap-2">
            <span>📄</span> Propuesta de Investigación Consolidada
          </h1>
          <p className="text-sm text-gray-600">
            {project.tau} · {project.nu} · {project.alpha_area}
            {tituloSeleccionado && ` — ${tituloSeleccionado}`}
          </p>
        </div>
        {step === "editor" && (
          <div className="flex gap-2">
            {previewActive && (
              <>
                <button
                  onClick={() => window.print()}
                  className="text-xs bg-emerald-600 text-white border border-emerald-700 px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1 shadow-sm"
                >
                  <span>🖨️</span> Guardar / Imprimir PDF
                </button>
                <button
                  onClick={() => handleExportar("md")}
                  disabled={cargandoExport || loading}
                  className="text-xs bg-white text-faro-navy border border-faro-navy/30 px-3 py-1.5 rounded-lg font-medium hover:bg-faro-navy/5 transition-colors"
                >
                  Descargar Markdown (.md)
                </button>
                <button
                  onClick={() => handleExportar("tex")}
                  disabled={cargandoExport || loading}
                  className="text-xs bg-white text-faro-navy border border-faro-navy/30 px-3 py-1.5 rounded-lg font-medium hover:bg-faro-navy/5 transition-colors"
                >
                  Descargar LaTeX (.tex + .bib)
                </button>
              </>
            )}
            <button
              onClick={() => {
                setStep("autor");
              }}
              className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-50"
            >
              ⚙️ Metadatos
            </button>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-20">
          <IndicadorGenerando mensaje="Compilando propuesta científica..." />
        </div>
      ) : step === "autor" ? (
        /* STEP 1: AUTOR METADATA FORM */
        <div className="max-w-2xl mx-auto bg-white border rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-bold text-faro-navy">Datos del Autor de la Propuesta</h2>
            <p className="text-xs text-gray-500">
              Registra los datos reales del investigador responsable para incluirlos en el encabezado oficial de la propuesta.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-gray-700">Nombre Completo del Investigador</label>
              <input
                type="text"
                value={autorForm.nombre}
                onChange={(e) => setAutorForm({ ...autorForm, nombre: e.target.value })}
                placeholder="Ej. Dr. Jorge Pasto"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-faro-navy"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700">Institución / Universidad</label>
              <input
                type="text"
                value={autorForm.institucion}
                onChange={(e) => setAutorForm({ ...autorForm, institucion: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-faro-navy"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700">Facultad / Centro</label>
              <input
                type="text"
                value={autorForm.facultad}
                onChange={(e) => setAutorForm({ ...autorForm, facultad: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-faro-navy"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700">Programa Académico / Departamento</label>
              <input
                type="text"
                value={autorForm.programa}
                onChange={(e) => setAutorForm({ ...autorForm, programa: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-faro-navy"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700">Rol en el proyecto</label>
              <select
                value={autorForm.rol}
                onChange={(e) => setAutorForm({ ...autorForm, rol: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-faro-navy"
              >
                <option value="Investigador Principal">Investigador Principal</option>
                <option value="Co-investigador">Co-investigador</option>
                <option value="Asesor Temático">Asesor Temático</option>
                <option value="Estudiante de Pregrado">Estudiante de Pregrado</option>
                <option value="Estudiante de Posgrado">Estudiante de Posgrado</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700">Estilo de Citación Bibliográfica</label>
              <select
                value={estiloCita}
                onChange={(e) => setEstiloCita(e.target.value as "apa" | "ieee" | "vancouver")}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-faro-navy bg-white font-medium"
              >
                <option value="apa">APA 7.ª Edición — (Autor, Año)</option>
                <option value="ieee">IEEE — Numérico [1]</option>
                <option value="vancouver">Vancouver — Numérico [1]</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            {documento?.autor?.nombre && (
              <button
                onClick={() => setStep("editor")}
                className="text-xs border px-4 py-2 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={() => {
                if (!autorForm.nombre.trim()) {
                  alert("Por favor ingresa tu nombre completo.");
                  return;
                }
                setStep("titulo");
                generarOpcionesTitulo();
              }}
              className="text-xs bg-faro-navy text-white px-5 py-2 rounded-lg font-semibold hover:bg-faro-navy/90"
            >
              Siguiente: Elegir Título →
            </button>
          </div>
        </div>
      ) : step === "titulo" ? (
        /* STEP 2: SCIENTIFIC TITLE GENERATOR & SELECTOR */
        <div className="max-w-3xl mx-auto bg-white border rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-bold text-faro-navy">Asistente de Título Científico</h2>
            <p className="text-xs text-gray-500">
              Genera propuestas estructuradas basadas en las recetas de simetría y publicación académica de FARO.
            </p>
          </div>

          {cargandoTitulos ? (
            <div className="flex flex-col items-center py-10 space-y-2">
              <svg className="animate-spin h-6 w-6 text-faro-navy" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span className="text-xs text-gray-500">Formulando títulos ideales a partir del Objetivo General...</span>
            </div>
          ) : tituloOpciones ? (
            <div className="space-y-4">
              {/* Option A Card */}
              <label
                onClick={() => {
                  setTituloSeleccionado(tituloOpciones.opcionA);
                  setCustomTitulo("");
                }}
                className={`block border p-4 rounded-xl cursor-pointer transition-all ${
                  tituloSeleccionado === tituloOpciones.opcionA && !customTitulo
                    ? "border-faro-navy bg-faro-navy/5 ring-1 ring-faro-navy"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="titulo"
                    checked={tituloSeleccionado === tituloOpciones.opcionA && !customTitulo}
                    readOnly
                    className="mt-1 text-faro-navy"
                  />
                  <div>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold uppercase">
                      Opción A: Simetría Absoluta (Hilo Dorado)
                    </span>
                    <h3 className="text-sm font-bold text-gray-900 mt-1">{tituloOpciones.opcionA}</h3>
                    <p className="text-xs text-gray-500 mt-1">{tituloOpciones.explicacionA}</p>
                  </div>
                </div>
              </label>

              {/* Option B Card */}
              <label
                onClick={() => {
                  setTituloSeleccionado(tituloOpciones.opcionB);
                  setCustomTitulo("");
                }}
                className={`block border p-4 rounded-xl cursor-pointer transition-all ${
                  tituloSeleccionado === tituloOpciones.opcionB && !customTitulo
                    ? "border-faro-navy bg-faro-navy/5 ring-1 ring-faro-navy"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="titulo"
                    checked={tituloSeleccionado === tituloOpciones.opcionB && !customTitulo}
                    readOnly
                    className="mt-1 text-faro-navy"
                  />
                  <div>
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold uppercase">
                      Opción B: Impacto Comercial / Baena Paz
                    </span>
                    <h3 className="text-sm font-bold text-gray-900 mt-1">{tituloOpciones.opcionB}</h3>
                    <p className="text-xs text-gray-500 mt-1">{tituloOpciones.explicacionB}</p>
                  </div>
                </div>
              </label>

              {/* Custom Title Input */}
              <div className="border p-4 rounded-xl space-y-2 bg-slate-50">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="titulo"
                    checked={!!customTitulo}
                    onChange={() => {
                      setTituloSeleccionado(customTitulo || "Nuevo Título Personalizado");
                    }}
                    className="text-faro-navy"
                  />
                  <span className="text-xs font-semibold text-gray-700">Establecer otro título personalizado:</span>
                </div>
                <input
                  type="text"
                  value={customTitulo}
                  onChange={(e) => {
                    setCustomTitulo(e.target.value);
                    setTituloSeleccionado(e.target.value);
                  }}
                  placeholder="Escribe tu propio título..."
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none bg-white"
                />
              </div>

              {/* Palabras Clave */}
              <div className="space-y-2 mt-4 pt-4 border-t">
                <h4 className="text-sm font-semibold text-gray-700">Palabras clave del Proyecto (Indexación)</h4>
                <p className="text-[11px] text-gray-500 font-normal">
                  FARO ha formulado 5 palabras clave sugeridas usando la regla 2-2-1 y exclusión del título. Edítalas o agrégalas separándolas por comas:
                </p>
                <input
                  type="text"
                  value={palabrasClaveInput}
                  onChange={(e) => setPalabrasClaveInput(e.target.value)}
                  placeholder="Ej. visión artificial, gemelos digitales, Ananas comosus, monitoreo hídrico"
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-faro-navy bg-white"
                />
              </div>

            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-6">No se pudieron recuperar las sugerencias de títulos.</p>
          )}

          <div className="flex justify-between gap-2 pt-2 border-t">
            <button
              onClick={() => setStep("autor")}
              className="text-xs border px-4 py-2 rounded-lg font-medium hover:bg-gray-50"
            >
              ← Volver a Autor
            </button>
            <button
              onClick={() => {
                if (!tituloSeleccionado.trim()) {
                  alert("Por favor selecciona o escribe un título científico.");
                  return;
                }
                guardarAutorYTitulo(tituloSeleccionado);
              }}
              disabled={cargandoSave}
              className="text-xs bg-faro-navy text-white px-5 py-2 rounded-lg font-semibold hover:bg-faro-navy/90 disabled:opacity-50"
            >
              {cargandoSave ? "Guardando..." : "Confirmar y Continuar al Borrador →"}
            </button>
          </div>
        </div>
      ) : (
        /* STEP 3: WORKSPACE DRAFT EDITOR & PREVIEW */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Document Panel */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Action Bar */}
            <div className="flex items-center justify-between bg-white border rounded-xl p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase text-gray-400 tracking-wider">
                  {previewActive ? "Vista LaTeX Impresión" : editando ? "Editando Borrador" : "Borrador de Propuesta (En Bruto)"}
                </span>
                {previewActive && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                    Humanizado Q1
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {previewActive ? (
                  <button
                    onClick={() => {
                      setPreviewActive(false);
                    }}
                    className="text-xs border border-faro-navy text-faro-navy px-3 py-1.5 rounded-lg font-medium hover:bg-faro-navy/5"
                  >
                    ← Volver al Borrador
                  </button>
                ) : !editando ? (
                  <>
                    <a
                      href={`/api/mci/proyecto/presupuesto-excel?project_id=${project.id}`}
                      download
                      className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-100 transition-colors flex items-center gap-1"
                      title="Descargar presupuesto detallado en archivo CSV compatible con Excel"
                    >
                      <span>📊</span> Presupuesto (Excel)
                    </a>
                    <button
                      onClick={() => setEditando(true)}
                      className="text-xs bg-faro-navy text-white px-4 py-1.5 rounded-lg font-semibold shadow hover:bg-faro-navy/90"
                    >
                      Editar Borrador
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm("¿Seguro que deseas regenerar el borrador? Se perderán todas tus ediciones manuales y se compilará fresco desde los nodos.")) {
                          cargarDocumento(true);
                        }
                      }}
                      className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-50"
                    >
                      Regenerar de Cero
                    </button>
                    <button
                      onClick={handleHumanizar}
                      disabled={humanizando}
                      className="text-xs bg-emerald-600 text-white px-4 py-1.5 rounded-lg font-semibold shadow hover:bg-emerald-700 flex items-center gap-1.5"
                    >
                      {humanizando ? (
                        <>
                          <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                          Aplicando Redacción...
                        </>
                      ) : (
                        "Generar para Impresión (LaTeX)"
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleGuardar}
                      disabled={cargandoSave}
                      className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-emerald-700"
                    >
                      {cargandoSave ? "Guardando..." : "Guardar Cambios"}
                    </button>
                    <button
                      onClick={() => {
                        setTextoEditado(documento?.markdown || "");
                        setEditando(false);
                      }}
                      className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* LaTeX A4 Live Sheet Render or Text Editor */}
            {previewActive && documentoHumanizado ? (
              <LaTeXPreview
                titulo={tituloSeleccionado}
                autor={autorForm}
                markdown={documentoHumanizado}
              />
            ) : (
              <div className="bg-white rounded-2xl border p-6 shadow-sm min-h-[600px] flex flex-col">
                {editando ? (
                  <textarea
                    value={textoEditado}
                    onChange={(e) => setTextoEditado(e.target.value)}
                    className="w-full flex-grow min-h-[500px] border rounded-xl p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-faro-navy leading-relaxed"
                  />
                ) : (
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap font-sans text-gray-800 leading-relaxed text-justify">
                    {textoEditado || "Cargando borrador..."}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar Advisory Chat */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border p-4 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-faro-navy border-b pb-2 flex items-center gap-2">
                <span>💬</span> Asesor Metodológico
              </h3>
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 text-xs">
                {chatHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl leading-relaxed ${
                      msg.sender === "user"
                        ? "bg-faro-navy/5 text-faro-navy ml-6 text-right"
                        : "bg-slate-50 text-gray-700 mr-6 text-left border"
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
              </div>

              <form onSubmit={enviarMensajeAsesor} className="flex gap-2 border-t pt-3">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Haz una pregunta o pide ayuda..."
                  disabled={cargandoAsesor}
                  className="flex-grow px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-faro-navy"
                />
                <button
                  type="submit"
                  disabled={cargandoAsesor || !chatInput.trim()}
                  className="bg-faro-navy text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-faro-navy/90 disabled:opacity-50"
                >
                  {cargandoAsesor ? "..." : "Enviar"}
                </button>
              </form>
            </div>
            
            <div className="bg-slate-50 rounded-2xl border p-4 text-xs text-gray-600 space-y-2">
              <h4 className="font-semibold text-faro-navy">Notas de Auditoría Metodológica:</h4>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>El borrador en bruto mantiene los marcadores y referencias cruzadas directas con el grafo de nodos.</li>
                <li>Las ediciones manuales respetan la frontera unidireccional y no reescriben los nodos base.</li>
                <li>La humanización se aplica sobre el borrador actual al generar el archivo para impresión o descarga.</li>
              </ul>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
