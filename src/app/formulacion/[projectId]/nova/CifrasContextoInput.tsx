// ============================================================
// FARO — Captura estructurada de cifras de contexto oficial
// Primera pieza construida del Componente Contexto (embudo SM/SC/SN/
// SL/SE) — solo la parte de captura manual por ahora; la
// automatización vía FAOSTAT/World Bank/DANE sigue pendiente, con su
// propia ficha de diseño.
//
// v2 (2026-08-09): agrega bloque de "pegar en lote" — el prompt de
// construirPromptCifrasContexto() pide un formato fijo a Perplexity;
// cargar el resultado de a una cifra por vez no era viable con
// respuestas reales de 10+ cifras. parsearCifrasContexto() interpreta
// ese formato de forma determinística, sin llamada a LLM.
//
// Se muestra en la pantalla de NOVA, antes de generar — las cifras
// quedan guardadas a nivel de proyecto (persisten entre iteraciones).
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

"use client";

import { useState } from "react";
import { construirPromptCifrasContexto } from "@/lib/faro/nova";
import type { RutaOutput } from "@/lib/faro/ruta";
import { parsearCifrasContexto } from "./parsearCifrasContexto";

export interface CifraContexto {
  nivel: "mundial" | "continental" | "nacional" | "regional" | "especifico";
  cifra: string;
  fuente: string;
  url?: string;
  verificado: boolean;
}

const NIVELES: { valor: CifraContexto["nivel"]; etiqueta: string }[] = [
  { valor: "mundial", etiqueta: "Mundial" },
  { valor: "continental", etiqueta: "Continental" },
  { valor: "nacional", etiqueta: "Nacional" },
  { valor: "regional", etiqueta: "Regional/Local" },
  { valor: "especifico", etiqueta: "Específico (dato propio)" },
];

export function CifrasContextoInput({
  projectId,
  cifrasIniciales,
  rutaOutput,
}: {
  projectId: string;
  cifrasIniciales: CifraContexto[];
  rutaOutput: RutaOutput | null;
}) {
  const [cifras, setCifras] = useState<CifraContexto[]>(cifrasIniciales);
  const [nivel, setNivel] = useState<CifraContexto["nivel"]>("regional");
  const [cifra, setCifra] = useState("");
  const [fuente, setFuente] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const [textoLote, setTextoLote] = useState("");
  const [procesandoLote, setProcesandoLote] = useState(false);
  const [resultadoLote, setResultadoLote] = useState<{ agregadas: number; noReconocidas: number } | null>(null);

  const promptCifras = rutaOutput ? construirPromptCifrasContexto(rutaOutput) : null;

  function copiarPrompt() {
    if (!promptCifras) return;
    navigator.clipboard.writeText(promptCifras);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function guardar(nuevaLista: CifraContexto[]) {
    setGuardando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/mci/proyecto/cifras-contexto", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, cifras_contexto: nuevaLista }),
      });
      if (!respuesta.ok) throw new Error("No se pudo guardar la cifra");
      const data = await respuesta.json();
      setCifras(data.cifras_contexto);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setGuardando(false);
    }
  }

  function agregar() {
    if (!cifra.trim() || !fuente.trim()) return;
    const nuevaLista = [...cifras, { nivel, cifra: cifra.trim(), fuente: fuente.trim(), verificado: false }];
    guardar(nuevaLista);
    setCifra("");
    setFuente("");
  }

  function procesarLote() {
    if (!textoLote.trim()) return;
    setProcesandoLote(true);
    setResultadoLote(null);
    try {
      const { cifras: cifrasNuevas, bloquesNoReconocidos } = parsearCifrasContexto(textoLote);
      if (cifrasNuevas.length > 0) {
        guardar([...cifras, ...cifrasNuevas]);
      }
      setResultadoLote({ agregadas: cifrasNuevas.length, noReconocidas: bloquesNoReconocidos });
      setTextoLote("");
    } finally {
      setProcesandoLote(false);
    }
  }

  function eliminar(indice: number) {
    guardar(cifras.filter((_, i) => i !== indice));
  }

  return (
    <details className="bg-white rounded-lg border p-4" open={cifras.length === 0}>
      <summary className="cursor-pointer text-sm font-medium text-faro-navy">
        Cifras de contexto oficial ({cifras.length})
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-gray-500">
          Cifras que usted ya conoce, con su fuente — nivel mundial, nacional, regional o un dato propio
          (por ejemplo, cifras institucionales no publicadas). NOVA las usa tal cual, sin reinterpretarlas.
        </p>

        {promptCifras && (
          <div className="bg-gray-50 rounded-md p-3 space-y-2">
            <p className="text-xs font-semibold text-faro-navy">
              ¿No tiene las cifras a mano? Búsquelas con Perplexity u otro asistente con navegación web
            </p>
            <p className="text-xs text-gray-500">
              Este prompt ya viene armado con la pregunta de investigación y el alcance de este proyecto —
              cópielo, péguelo en Perplexity, y pegue la respuesta completa abajo para cargarla en un solo paso.
            </p>
            <details>
              <summary className="cursor-pointer text-xs text-faro-blue underline">Ver prompt</summary>
              <pre className="text-xs whitespace-pre-wrap text-gray-800 mt-2 bg-white rounded p-2 border">
                {promptCifras}
              </pre>
            </details>
            <button onClick={copiarPrompt} className="text-xs text-faro-blue underline block">
              {copiado ? "Copiado ✓" : "Copiar instrucciones"}
            </button>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800">
            Pegar respuesta completa de Perplexity (carga todas las cifras de una vez)
          </p>
          <textarea
            value={textoLote}
            onChange={(e) => setTextoLote(e.target.value)}
            rows={5}
            placeholder="Pegue aquí la respuesta completa, tal como se la devolvió Perplexity..."
            className="w-full border rounded-md p-2 text-sm"
          />
          <button
            onClick={procesarLote}
            disabled={procesandoLote || !textoLote.trim()}
            className="text-sm bg-amber-700 text-white rounded-md px-4 py-1.5 disabled:opacity-40"
          >
            {procesandoLote ? "Procesando..." : "Procesar y agregar todas"}
          </button>
          {resultadoLote && (
            <p className="text-xs text-amber-800">
              {resultadoLote.agregadas} cifra(s) agregada(s)
              {resultadoLote.noReconocidas > 0 && ` · ${resultadoLote.noReconocidas} bloque(s) no reconocido(s) — revise que sigan el formato del prompt`}
            </p>
          )}
        </div>

        {cifras.length > 0 && (
          <ul className="space-y-2">
            {cifras.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-sm bg-gray-50 rounded-md p-2">
                <div>
                  <span className="text-xs font-medium text-faro-blue uppercase">{c.nivel}</span>
                  <p>{c.cifra}</p>
                  <p className="text-xs text-gray-500">
                    Fuente: {c.fuente}
                    {c.url && (
                      <>
                        {" — "}
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-faro-blue underline">
                          enlace
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => eliminar(i)}
                  disabled={guardando}
                  className="text-xs text-red-500 hover:underline disabled:opacity-40"
                >
                  quitar
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <label className="block">
            <span className="text-xs font-medium">Nivel</span>
            <select
              value={nivel}
              onChange={(e) => setNivel(e.target.value as CifraContexto["nivel"])}
              className="mt-1 w-full border rounded-md p-1.5 text-sm"
            >
              {NIVELES.map((n) => (
                <option key={n.valor} value={n.valor}>{n.etiqueta}</option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-medium">Cifra</span>
            <input
              value={cifra}
              onChange={(e) => setCifra(e.target.value)}
              placeholder="Ej. Rendimiento de 60 Ton/Ha en piña MD2 en Casanare"
              className="mt-1 w-full border rounded-md p-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium">Fuente</span>
            <input
              value={fuente}
              onChange={(e) => setFuente(e.target.value)}
              placeholder="Ej. DANE 2023, Gobernación de Casanare"
              className="mt-1 w-full border rounded-md p-1.5 text-sm"
            />
          </label>
        </div>
        <button
          onClick={agregar}
          disabled={guardando || !cifra.trim() || !fuente.trim()}
          className="text-sm bg-faro-navy text-white rounded-md px-4 py-1.5 disabled:opacity-40"
        >
          {guardando ? "Guardando..." : "Agregar cifra"}
        </button>

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </details>
  );
}
