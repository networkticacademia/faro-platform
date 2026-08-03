"use client";

import { useMemo, useState } from "react";
import {
  INSTRUMENTO_M0,
  OPCIONES_CERTEZA,
  OPCIONES_NIVEL,
  OPCIONES_TIPO,
  OPCIONES_ENFOQUE,
  OPCIONES_INSUMOS_SIGMA,
  OPCIONES_TRL,
  OPCIONES_CONVOCATORIA_RHO,
  pesosU0ParaTau,
  type OpcionCerteza,
} from "@/lib/faro/instrumento";
import { calcularVectorIncertidumbre, calcularU0, clasificarRuta, INTERPRETACION_U0, type RespuestasInstrumento } from "@/lib/faro/u0";
import type { Nivel, TipoProyecto, Enfoque } from "@/lib/faro/types";

type Paso = "contexto" | "diagnostico" | "resultado";

function SelectorCerteza({ valor, onChange }: { valor: OpcionCerteza; onChange: (v: OpcionCerteza) => void }) {
  return (
    <div className="flex gap-1.5 mt-1.5">
      {OPCIONES_CERTEZA.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          className={`text-[11px] px-2 py-1 rounded-full border ${
            valor === o.valor ? "bg-faro-navy text-white border-faro-navy" : "border-gray-300 text-gray-500"
          }`}
        >
          {o.etiqueta.split(" — ")[0]}
        </button>
      ))}
    </div>
  );
}

const DIMENSIONES: { key: "u1" | "u2" | "u3" | "u4"; titulo: string }[] = [
  { key: "u1", titulo: "Claridad conceptual" },
  { key: "u2", titulo: "Competencia metodológica" },
  { key: "u3", titulo: "Viabilidad contextual" },
  { key: "u4", titulo: "Encaje estructural" },
];

export default function DiagnosticoForm({ autenticado }: { autenticado: boolean }) {
  const [paso, setPaso] = useState<Paso>("contexto");

  // ---- z0* (sin u0, eso se calcula en el paso de diagnóstico) ----
  const [nu, setNu] = useState<Nivel>("pregrado");
  const [tau, setTau] = useState<TipoProyecto>("aplicada");
  const [mu, setMu] = useState<Enfoque>("mixto");
  const [alphaArea, setAlphaArea] = useState("");
  const [lambdaTrl, setLambdaTrl] = useState<number>(3);
  const [sigma, setSigma] = useState<string>("");
  const [rho, setRho] = useState<string>("");

  // Psi: certeza declarada por el usuario para nu, tau, mu, lambda_trl
  const [psiNu, setPsiNu] = useState<OpcionCerteza>("confirmado");
  const [psiTau, setPsiTau] = useState<OpcionCerteza>("confirmado");
  const [psiMu, setPsiMu] = useState<OpcionCerteza>("confirmado");
  const [psiTrl, setPsiTrl] = useState<OpcionCerteza>("confirmado");

  // ---- Respuestas del instrumento ----
  const [respuestas, setRespuestas] = useState<RespuestasInstrumento>({});
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [projectIdGuardado, setProjectIdGuardado] = useState<string | null>(null);

  const vectorU = useMemo(() => calcularVectorIncertidumbre(respuestas), [respuestas]);
  const pesos = useMemo(() => pesosU0ParaTau(tau), [tau]);
  const u0 = useMemo(() => calcularU0(vectorU, pesos), [vectorU, pesos]);
  const ruta = useMemo(() => clasificarRuta(u0), [u0]);

  const totalItems = INSTRUMENTO_M0.length;
  const respondidos = Object.keys(respuestas).length;

  function responder(itemId: string, valor: number | null) {
    setRespuestas((prev) => ({ ...prev, [itemId]: valor }));
  }

  async function guardarDiagnostico() {
    setGuardando(true);
    setErrorGuardado(null);
    try {
      const res = await fetch("/api/diagnostico/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nu, tau, mu,
          alpha_area: alphaArea,
          lambda_trl: lambdaTrl === 0 ? null : lambdaTrl,
          sigma,
          rho: { convocatoria: rho },
          psi: { nu: psiNu, tau: psiTau, mu: psiMu, lambda_trl: psiTrl },
          alpha_pesos: pesos,
          ...vectorU,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo guardar el diagnóstico.");
      }
      const data = await res.json();
      setProjectIdGuardado(data.project?.id ?? null);
      setGuardadoOk(true);
    } catch (e) {
      setErrorGuardado(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setGuardando(false);
    }
  }

  // ============================================================
  // PASO 1 — Contexto (z0* sin u0)
  // ============================================================
  if (paso === "contexto") {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-faro-navy">Contexto de su proyecto</h1>
        <p className="text-sm text-gray-600">
          Antes del diagnóstico de incertidumbre, cuéntenos brevemente sobre su proyecto.
        </p>

        <label className="block">
          <span className="text-sm font-medium">¿En qué nivel se inscribe su proyecto de investigación?</span>
          <select className="mt-1 w-full border rounded-md p-2" value={nu} onChange={(e) => setNu(e.target.value as Nivel)}>
            {OPCIONES_NIVEL.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
          </select>
          <SelectorCerteza valor={psiNu} onChange={setPsiNu} />
        </label>

        <label className="block">
          <span className="text-sm font-medium">¿Qué tipo de investigación describe mejor su proyecto?</span>
          <select className="mt-1 w-full border rounded-md p-2" value={tau} onChange={(e) => setTau(e.target.value as TipoProyecto)}>
            {OPCIONES_TIPO.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
          </select>
          <SelectorCerteza valor={psiTau} onChange={setPsiTau} />
        </label>

        <label className="block">
          <span className="text-sm font-medium">¿Cuál es el enfoque metodológico de su proyecto?</span>
          <select className="mt-1 w-full border rounded-md p-2" value={mu} onChange={(e) => setMu(e.target.value as Enfoque)}>
            {OPCIONES_ENFOQUE.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
          </select>
          <SelectorCerteza valor={psiMu} onChange={setPsiMu} />
        </label>

        <label className="block">
          <span className="text-sm font-medium">¿En qué área de conocimiento se ubica principalmente su proyecto?</span>
          <input
            className="mt-1 w-full border rounded-md p-2"
            placeholder="Ej. Ingeniería de Sistemas, Ciencias de la Salud..."
            value={alphaArea}
            onChange={(e) => setAlphaArea(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">¿Qué nivel de madurez tecnológica (TRL) espera alcanzar con su proyecto?</span>
          <select className="mt-1 w-full border rounded-md p-2" value={lambdaTrl} onChange={(e) => setLambdaTrl(Number(e.target.value))}>
            {OPCIONES_TRL.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
          </select>
          <SelectorCerteza valor={psiTrl} onChange={setPsiTrl} />
        </label>

        <label className="block">
          <span className="text-sm font-medium">¿Con qué insumos cuenta para iniciar la búsqueda bibliográfica de su proyecto?</span>
          <select className="mt-1 w-full border rounded-md p-2" value={sigma} onChange={(e) => setSigma(e.target.value)}>
            <option value="">Seleccione...</option>
            {OPCIONES_INSUMOS_SIGMA.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">¿Su proyecto responde a una convocatoria o términos de referencia específicos?</span>
          <select className="mt-1 w-full border rounded-md p-2" value={rho} onChange={(e) => setRho(e.target.value)}>
            <option value="">Seleccione...</option>
            {OPCIONES_CONVOCATORIA_RHO.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
          </select>
        </label>

        <button
          className="w-full bg-faro-navy text-white rounded-md py-3 font-medium disabled:opacity-40"
          disabled={!alphaArea.trim() || !sigma || !rho}
          onClick={() => setPaso("diagnostico")}
        >
          Continuar al diagnóstico →
        </button>
      </div>
    );
  }

  // ============================================================
  // PASO 2 — Instrumento (20 ítems, 4 dimensiones)
  // ============================================================
  if (paso === "diagnostico") {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-faro-navy">Diagnóstico de incertidumbre inicial</h1>
          <p className="text-sm text-gray-600 mt-1">
            Responda con honestidad — puede marcar &quot;No sé&quot; cuando corresponda. No hay respuestas incorrectas.
          </p>
          <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-faro-blue transition-all"
              style={{ width: `${(respondidos / totalItems) * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">{respondidos} / {totalItems} respondidas</p>
        </div>

        {DIMENSIONES.map((dim) => (
          <div key={dim.key} className="space-y-4">
            <h2 className="text-lg font-medium text-faro-navy border-b pb-1">{dim.titulo}</h2>
            {INSTRUMENTO_M0.filter((i) => i.dimension === dim.key).map((item) => (
              <div key={item.id} className="space-y-2">
                <p className="text-sm font-medium">{item.texto}</p>
                <div className="flex flex-wrap gap-2">
                  {item.opciones.map((op) => (
                    <button
                      key={op.valor}
                      onClick={() => responder(item.id, op.valor)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        respuestas[item.id] === op.valor
                          ? "bg-faro-blue text-white border-faro-blue"
                          : "border-gray-300 hover:border-faro-blue"
                      }`}
                    >
                      {op.etiqueta}
                    </button>
                  ))}
                  {item.permiteNoSabe && (
                    <button
                      onClick={() => responder(item.id, 0)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        respuestas[item.id] === 0
                          ? "bg-gray-500 text-white border-gray-500"
                          : "border-gray-300 text-gray-500 hover:border-gray-500"
                      }`}
                    >
                      No sé
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}

        <button
          className="w-full bg-faro-navy text-white rounded-md py-3 font-medium disabled:opacity-40"
          disabled={respondidos < totalItems}
          onClick={() => setPaso("resultado")}
        >
          Ver mi resultado →
        </button>
      </div>
    );
  }

  // ============================================================
  // PASO 3 — Resultado + guardar (requiere cuenta)
  // ============================================================
  return (
    <div className="max-w-xl mx-auto space-y-6 text-center">
      <h1 className="text-2xl font-semibold text-faro-navy">Su índice de incertidumbre inicial</h1>

      <div className="text-6xl font-bold text-faro-blue">{u0.toFixed(3)}</div>

      <p className="text-faro-navy font-medium">{INTERPRETACION_U0[ruta]}</p>
      <p className="text-xs text-gray-400">
        Pesos aplicados (según tipo de proyecto): U₁={pesos.u1} · U₂={pesos.u2} · U₃={pesos.u3} · U₄={pesos.u4}
      </p>

      <div className="grid grid-cols-2 gap-3 text-left text-sm">
        <div className="border rounded-md p-3">
          <p className="text-gray-500">U₁ Claridad conceptual</p>
          <p className="font-semibold">{vectorU.u1_claridad_conceptual.toFixed(3)}</p>
        </div>
        <div className="border rounded-md p-3">
          <p className="text-gray-500">U₂ Competencia metodológica</p>
          <p className="font-semibold">{vectorU.u2_competencia_metodologica.toFixed(3)}</p>
        </div>
        <div className="border rounded-md p-3">
          <p className="text-gray-500">U₃ Viabilidad contextual</p>
          <p className="font-semibold">{vectorU.u3_viabilidad_contextual.toFixed(3)}</p>
        </div>
        <div className="border rounded-md p-3">
          <p className="text-gray-500">U₄ Encaje estructural</p>
          <p className="font-semibold">{vectorU.u4_encaje_estructural.toFixed(3)}</p>
        </div>
      </div>

      {guardadoOk ? (
        <div className="space-y-3">
          <p className="text-green-600 font-medium">Diagnóstico guardado correctamente.</p>
          {projectIdGuardado && (
            <a
              href={`/formulacion/${projectIdGuardado}`}
              className="block w-full bg-faro-navy text-white rounded-md py-3 font-medium"
            >
              Continuar a la formulación (RUTA) →
            </a>
          )}
        </div>
      ) : autenticado ? (
        <button
          className="w-full bg-faro-navy text-white rounded-md py-3 font-medium disabled:opacity-40"
          onClick={guardarDiagnostico}
          disabled={guardando}
        >
          {guardando ? "Guardando..." : "Guardar mi diagnóstico"}
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Cree una cuenta gratuita para guardar este resultado y continuar la formulación de su proyecto.</p>
          <a
            href={`/login?redirect=/diagnostico`}
            className="block w-full bg-faro-navy text-white rounded-md py-3 font-medium"
          >
            Crear cuenta / Iniciar sesión para guardar
          </a>
        </div>
      )}

      {errorGuardado && <p className="text-red-600 text-sm">{errorGuardado}</p>}
    </div>
  );
}
