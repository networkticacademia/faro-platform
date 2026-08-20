"use client";

import { useState, useEffect } from "react";
import NavegacionNodos from "@/components/faro/NavegacionNodos";
import { IndicadorGenerando } from "@/components/faro/IndicadorGenerando";

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

export default function FormulacionPropuesta({ project }: { project: ProjectRow }) {
  const [documento, setDocumento] = useState<{ markdown: string; editado: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cargandoAsesor, setCargandoAsesor] = useState(false);
  const [cargandoExport, setCargandoExport] = useState(false);
  const [cargandoSave, setCargandoSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [editando, setEditando] = useState(false);
  const [textoEditado, setTextoEditado] = useState("");
  
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarDocumento();
  }, [project.id]);

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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar la propuesta.");
      setDocumento({
        markdown: textoEditado,
        editado: true,
      });
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setCargandoSave(false);
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
      const res = await fetch(`/api/mci/proyecto/exportar?project_id=${project.id}&formato=${formato}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al exportar.");

      if (formato === "md") {
        descargarArchivo(data.filename, data.content);
      } else {
        // Descargar el archivo LaTeX principal (.tex) y el archivo de bibliografía (.bib) por separado
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-faro-navy">
            Propuesta de Investigación Consolidada
          </h1>
          <p className="text-sm text-gray-600">
            {project.tau} · {project.nu} · {project.alpha_area}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExportar("md")}
            disabled={cargandoExport || loading}
            className="text-xs bg-white text-faro-navy border border-faro-navy px-3 py-1.5 rounded-md font-medium hover:bg-faro-navy hover:text-white transition-colors"
          >
            Descargar Markdown (.md)
          </button>
          <button
            onClick={() => handleExportar("tex")}
            disabled={cargandoExport || loading}
            className="text-xs bg-white text-faro-navy border border-faro-navy px-3 py-1.5 rounded-md font-medium hover:bg-faro-navy hover:text-white transition-colors"
          >
            Descargar LaTeX (.tex + .bib)
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-20">
          <IndicadorGenerando mensaje="Compilando y humanizando propuesta científica (eliminando rastros de IA, esto puede tardar unos segundos)..." />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor/Visualizador de la Propuesta */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-lg border p-6 shadow-sm min-h-[600px] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b pb-3 mb-4">
                  <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    {documento?.editado ? "Propuesta Guardada (Editada)" : "Borrador de Propuesta Compilado"}
                  </span>
                  <div className="flex gap-2">
                    {!editando ? (
                      <>
                        <button
                          onClick={() => setEditando(true)}
                          className="text-xs bg-faro-navy text-white px-3 py-1.5 rounded font-medium"
                        >
                          Editar Propuesta
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("¿Seguro que deseas regenerar el borrador? Se perderán todas tus ediciones manuales y se compilará fresco desde los nodos.")) {
                              cargarDocumento(true);
                            }
                          }}
                          className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded font-medium hover:bg-gray-50"
                        >
                          Regenerar Borrador
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={handleGuardar}
                          disabled={cargandoSave}
                          className="text-xs bg-green-600 text-white px-3 py-1.5 rounded font-medium disabled:opacity-40"
                        >
                          {cargandoSave ? "Guardando..." : "Guardar Cambios"}
                        </button>
                        <button
                          onClick={() => {
                            setTextoEditado(documento?.markdown ?? "");
                            setEditando(false);
                          }}
                          className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded font-medium"
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editando ? (
                  <textarea
                    value={textoEditado}
                    onChange={(e) => setTextoEditado(e.target.value)}
                    className="w-full min-h-[500px] p-3 font-mono text-sm border rounded bg-gray-50 text-gray-800"
                  />
                ) : (
                  <div className="prose max-w-none text-sm text-gray-800 space-y-4 whitespace-pre-wrap font-sans">
                    {documento?.markdown}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Asesor "Llamada a un Amigo" */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg border p-4 shadow-sm flex flex-col justify-between h-[600px]">
              <div>
                <h3 className="text-sm font-semibold text-faro-navy border-b pb-2 mb-3">
                  💬 Llamada a un amigo (Asesor)
                </h3>
                <div className="space-y-3 overflow-y-auto max-h-[440px] pr-1">
                  {chatHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg text-xs leading-relaxed ${
                        msg.sender === "user"
                          ? "bg-faro-navy/10 text-faro-navy ml-8 align-right"
                          : "bg-amber-50 text-amber-900 mr-8"
                      }`}
                    >
                      <p className="font-semibold mb-1">
                        {msg.sender === "user" ? "Investigador" : "Asesor FARO"}
                      </p>
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  ))}
                  {cargandoAsesor && (
                    <div className="text-center py-2">
                      <span className="text-xs text-gray-400">Pensando consejo metodológico... ⌛</span>
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={enviarMensajeAsesor} className="border-t pt-3 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Escribe tu consulta metodológica..."
                  disabled={cargandoAsesor}
                  className="flex-1 border rounded px-3 py-2 text-xs text-gray-900 bg-white"
                />
                <button
                  type="submit"
                  disabled={cargandoAsesor}
                  className="bg-faro-navy text-white rounded px-4 py-2 text-xs font-medium disabled:opacity-40"
                >
                  Consultar
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
