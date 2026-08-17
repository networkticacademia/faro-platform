/**
 * lib/faro/sintesisFinal.ts
 *
 * Fase 1 de exportación — "Síntesis Final": Introducción y Resumen.
 *
 * PRINCIPIO CENTRAL: Introducción y Resumen NO son nodos del grafo. No
 * tienen incertidumbre propia, no generan preguntas_para_el_usuario, no
 * agregan término a L_FARO, no participan en Gate/Checkpoints. Son
 * síntesis derivada de contenido YA CONFIRMADO — extractor determinístico
 * (código, esta capa) + LLM restringido a reescribir solo lo entregado,
 * sin autorización de afirmar nada nuevo.
 *
 * Fórmulas (sesión 13-ago):
 * - Introducción: P = N(D(θ), B, ρ) — la fórmula de NOVA, no se inventa
 *   nada nuevo. D(θ) = delimitación confirmada de RUTA, N-O-V-A = los 4
 *   componentes confirmados de NOVA, B = bibliografía verificada
 *   (corpus_fuentes), ρ = términos de referencia/convocatoria (projects.rho).
 *   Patrón de citación: afirmación→cita inmediata, tomado de la skill
 *   estado-del-arte-q1 — SOLO cuando la afirmación esté genuinamente
 *   respaldada por una entrada real de B (autor/año verbatim, nunca
 *   inventados).
 * - Resumen: estructura C-G-O-M-R-I de la skill abstract-q1, ADAPTADA:
 *   esa skill define R (Resultados) e I (Implicación) para abstracts de
 *   estudios YA EJECUTADOS, con magnitudes numéricas medidas — aquí el
 *   proyecto todavía no se ha ejecutado. R e I se redactan como
 *   PROYECCIÓN CUALITATIVA ESPERADA (igual que ya exige
 *   ImpactosDelimitacionOutput.impactos[].descripcion: "NUNCA una cifra
 *   inventada"), no como resultados medidos. Aplicar la regla literal de
 *   la skill ("Results: SIEMPRE con valores numéricos") aquí forzaría a
 *   fabricar cifras — exactamente lo que este módulo existe para evitar.
 *
 * Nombres de institución/rango de palabras: no existe un campo "plantilla
 * de exportación" en el esquema. Se usa usuarios_plataforma.institucion
 * (campo real, default 'Unitrópico') como proxy, con los dos rangos que
 * se dieron explícitamente; institución no mapeada usa un rango neutro.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { llamarOrquestador } from "@/lib/openrouter/client";
import type { RutaOutput } from "./ruta";
import type { NovaOutput } from "./nova";
import type { ObjetivosOutput } from "./objetivos";
import type { MetodologiaOutput } from "./metodologia";
import type { ImpactosDelimitacionOutput } from "./impactosDelimitacion";

export interface ResultadoSintesis {
  texto: string;
  provisional: boolean;
  motivo_provisional: string | null;
}

interface FuenteVerificada {
  titulo: string;
  autores: string | null;
  anio: number | null;
  revista: string | null;
  resumen_hallazgo: string | null;
}

const RANGOS_PALABRAS_RESUMEN: Record<string, { min: number; max: number }> = {
  "Unitrópico": { min: 200, max: 300 },
  UdeA: { min: 150, max: 250 },
};
const RANGO_PALABRAS_DEFAULT = { min: 200, max: 250 };

async function obtenerNodoConfirmado<T>(
  supabase: SupabaseClient,
  project_id: string,
  tipo: string
): Promise<T | null> {
  const { data } = await supabase
    .from("grafo_nodos")
    .select("contenido")
    .eq("project_id", project_id)
    .eq("tipo", tipo)
    .eq("confirmado_humano", true)
    .order("iteracion", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.contenido as T) ?? null;
}

/** Falla explícita nombrando el nodo faltante — nunca genera con huecos. */
function exigirNodos(faltantes: string[]): void {
  if (faltantes.length > 0) {
    throw new Error(
      `No se puede generar: falta(n) confirmar ${faltantes.join(", ")} (confirmado_humano=true) antes de sintetizar esta sección.`
    );
  }
}

/**
 * Lee el ÚLTIMO resultado de convergencia YA calculado (tabla
 * convergencia_proyecto, insert-always). Lectura barata, sin LLM — mismo
 * patrón que ya usa la tarjeta "Nodos confirmados" del Dashboard. NO
 * dispara una verificación nueva.
 */
async function obtenerProvisionalidad(
  supabase: SupabaseClient,
  project_id: string
): Promise<{ provisional: boolean; motivo: string | null }> {
  const { data } = await supabase
    .from("convergencia_proyecto")
    .select("resultado")
    .eq("project_id", project_id)
    .order("calculado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { provisional: true, motivo: "Convergencia del proyecto aún no se ha verificado ('Verificar convergencia' en el Dashboard)." };
  }

  const r = data.resultado as {
    convergio?: boolean;
    es_provisional?: boolean;
    l_faro_proyecto?: number;
    tau_c_proyecto?: number;
  };

  if (r.es_provisional) {
    return { provisional: true, motivo: "La última verificación de convergencia fue provisional (faltaban piezas por calcular: δᵢⱼ y/o Φ)." };
  }
  if (!r.convergio) {
    return {
      provisional: true,
      motivo: `El proyecto aún no converge (L_FARO_proyecto=${r.l_faro_proyecto?.toFixed(3)} > τc=${r.tau_c_proyecto?.toFixed(3)}).`,
    };
  }
  return { provisional: false, motivo: null };
}

async function obtenerBibliografiaVerificada(
  supabase: SupabaseClient,
  project_id: string
): Promise<FuenteVerificada[]> {
  const { data } = await supabase
    .from("corpus_fuentes")
    .select("titulo, autores, anio, revista, resumen_hallazgo")
    .eq("project_id", project_id)
    .eq("estado_verificacion", "verificado")
    .order("anio", { ascending: false });
  return (data ?? []) as FuenteVerificada[];
}

async function obtenerRangoPalabrasResumen(
  supabase: SupabaseClient,
  project_id: string
): Promise<{ min: number; max: number; institucion: string }> {
  const { data } = await supabase
    .from("projects")
    .select("usuario_id, usuarios_plataforma(institucion)")
    .eq("id", project_id)
    .maybeSingle();

  const institucion =
    (data?.usuarios_plataforma as unknown as { institucion: string | null } | null)?.institucion ?? "Unitrópico";
  const rango = RANGOS_PALABRAS_RESUMEN[institucion] ?? RANGO_PALABRAS_DEFAULT;
  return { ...rango, institucion };
}

function bloqueCifrasContexto(nova: NovaOutput): string {
  const cifras = nova.onda_cifras_contexto ?? [];
  if (cifras.length === 0) {
    return "No hay cifras de contexto declaradas en NOVA — no menciones ninguna cifra de magnitud/escala del problema.";
  }
  return cifras
    .map(
      (c, i) =>
        `[${i + 1}] Nivel ${c.nivel} — ${c.cifra} (Fuente: ${c.fuente}) — verificado=${c.verificado ? "sí" : "no"}`
    )
    .join("\n");
}

function bloqueBibliografia(fuentes: FuenteVerificada[]): string {
  if (fuentes.length === 0) {
    return "No hay bibliografía verificada cargada todavía para este proyecto (tabla corpus_fuentes, estado_verificacion='verificado' vacía). NO cites ninguna fuente — no inventes autor ni año bajo ninguna circunstancia.";
  }
  return fuentes
    .map(
      (f, i) =>
        `[${i + 1}] Autor(es): ${f.autores ?? "no registrado"} | Año: ${f.anio ?? "no registrado"} | Título: ${f.titulo} | Revista: ${f.revista ?? "no registrada"}${f.resumen_hallazgo ? ` | Hallazgo: ${f.resumen_hallazgo}` : ""}`
    )
    .join("\n");
}

const INSTRUCCION_HONESTIDAD = `REGLA CRÍTICA — no negociable: usa ÚNICAMENTE la información entregada abajo.
No agregues ningún dato, cifra, porcentaje, autor, año, comparación o
afirmación que no esté explícitamente en el extracto — NI SIQUIERA si te
parece un dato real o plausible que conoces de tu propio entrenamiento
sobre este tema. Está PROHIBIDO usar conocimiento externo al extracto,
aunque sea correcto: si no está aquí abajo, no existe para efectos de este
texto. Si el extracto no cubre algo que normalmente esperarías en este
tipo de texto, simplemente omítelo — no lo rellenes por inferencia. Si una
cifra del extracto viene marcada como no verificada, o el propio texto de
la cifra indica que no se encontró evidencia o que falta verificar,
repórtala con esa misma reserva explícita (ej. "según una estimación sin
verificar oficialmente..." o "no se cuenta con una cifra oficial
confirmada de...") — NUNCA la presentes como un hecho establecido. No es tu
tarea generar contenido nuevo: es reescribir/sintetizar lo ya confirmado
en prosa académica fluida.`;

const INSTRUCCION_CITACION = `Patrón de citación (cuando cites la bibliografía de abajo): afirmación
factual seguida INMEDIATAMENTE por su cita entre paréntesis, formato
"(Autor(es), Año)" — usando EXACTAMENTE el autor y año tal como aparecen en
la lista de fuentes, nunca inventados ni aproximados. Cita solo cuando una
fuente listada respalde genuinamente esa afirmación específica. Si una idea
no tiene fuente que la respalde en la lista, exprésala sin cita — no le
inventes una. Prosa continua, sin viñetas, sin negritas, sin encabezados,
sin guiones largos, sin meta-discurso ("en esta sección...", "cabe
destacar...").`;

export async function generarIntroduccion(
  supabase: SupabaseClient,
  project_id: string
): Promise<ResultadoSintesis> {
  const [ruta, nova] = await Promise.all([
    obtenerNodoConfirmado<RutaOutput>(supabase, project_id, "RUTA"),
    obtenerNodoConfirmado<NovaOutput>(supabase, project_id, "NOVA"),
  ]);

  const faltantes: string[] = [];
  if (!ruta) faltantes.push("RUTA");
  if (!nova) faltantes.push("NOVA");
  exigirNodos(faltantes);

  const [fuentes, { provisional, motivo }, { data: project }] = await Promise.all([
    obtenerBibliografiaVerificada(supabase, project_id),
    obtenerProvisionalidad(supabase, project_id),
    supabase.from("projects").select("rho").eq("id", project_id).maybeSingle(),
  ]);

  const rho = (project?.rho ?? {}) as Record<string, unknown>;
  const tieneRho = Object.keys(rho).length > 0;

  const prompt = `Eres un redactor académico ayudando a construir la sección de
INTRODUCCIÓN de un proyecto de investigación, siguiendo la fórmula ya
definida P = N(D(θ), B, ρ): la introducción es NOVA (el problema
fundamentado: núcleo, onda, valor, avance) leído a través de la
delimitación que ya fijó RUTA (D(θ)), respaldado por la bibliografía
verificada del proyecto (B), y considerando los términos de referencia si
existen (ρ).

${INSTRUCCION_HONESTIDAD}

${INSTRUCCION_CITACION}

=== D(θ) — Delimitación confirmada por RUTA ===
Tema: ${ruta!.tema}
Problema: ${ruta!.problema}
Pregunta de investigación: ${ruta!.pregunta_investigacion}
Objeto de estudio: ${ruta!.objeto_estudio}
Población/contexto: ${ruta!.poblacion_contexto}
Alcance temporal: ${ruta!.alcance_temporal}
Alcance espacial: ${ruta!.alcance_espacial}
Justificación: ${ruta!.justificacion_breve}
Vacío de conocimiento declarado (hipótesis, estado_evidencia=${ruta!.vacio_conocimiento_hipotesis.estado_evidencia}): ${ruta!.vacio_conocimiento_hipotesis.afirmacion}

=== N-O-V-A — Confirmado por NOVA ===
Núcleo — brecha de conocimiento: ${nova!.nucleo_brecha_conocimiento}
Núcleo — causa raíz: ${nova!.nucleo_causa_raiz}
Onda — consecuencias: ${nova!.onda_consecuencias}
Onda — efectos (árbol de problemas): ${nova!.onda_efectos_arbol_problema}
Valor — contribución: ${nova!.valor_contribucion}
Valor — justificación social: ${nova!.valor_justificacion_social}
Avance — novedad frente al estado del arte: ${nova!.avance_novedad_estado_arte}
Avance — detalle: ${nova!.avance_detalle}
Problema formulado (síntesis P): ${nova!.problema_formulado}

=== Onda — cifras de contexto declaradas en NOVA (con su propio estado de verificación) ===
${bloqueCifrasContexto(nova!)}
Si una cifra tiene verificado=no, o su propio texto dice que no se
encontró evidencia o que falta verificar, repórtala con esa reserva
explícita — nunca la presentes como confirmada solo porque aparece aquí.

=== B — Bibliografía verificada del proyecto ===
${bloqueBibliografia(fuentes)}

${tieneRho ? `=== ρ — Términos de referencia / convocatoria ===\n${JSON.stringify(rho, null, 2)}` : "No hay términos de referencia/convocatoria cargados para este proyecto — omite ρ."}

Redacta la Introducción como prosa académica continua (3-5 párrafos), en
español, integrando D(θ) y N-O-V-A de forma fluida (no los presentes como
lista de campos), citando B donde corresponda con el patrón indicado.
Responde ÚNICAMENTE con el texto de la introducción, sin título, sin
comentarios sobre lo que hiciste.`;

  const texto = await llamarOrquestador(prompt);
  return { texto: texto.trim(), provisional, motivo_provisional: motivo };
}

export async function generarResumen(
  supabase: SupabaseClient,
  project_id: string
): Promise<ResultadoSintesis> {
  const [ruta, nova, objetivos, metodologia, impactos] = await Promise.all([
    obtenerNodoConfirmado<RutaOutput>(supabase, project_id, "RUTA"),
    obtenerNodoConfirmado<NovaOutput>(supabase, project_id, "NOVA"),
    obtenerNodoConfirmado<ObjetivosOutput>(supabase, project_id, "OBJETIVOS"),
    obtenerNodoConfirmado<MetodologiaOutput>(supabase, project_id, "METODOLOGIA"),
    obtenerNodoConfirmado<ImpactosDelimitacionOutput>(supabase, project_id, "IMPACTOS_DELIMITACION"),
  ]);

  const faltantes: string[] = [];
  if (!ruta) faltantes.push("RUTA");
  if (!nova) faltantes.push("NOVA");
  if (!objetivos) faltantes.push("OBJETIVOS");
  if (!metodologia) faltantes.push("METODOLOGIA");
  if (!impactos) faltantes.push("IMPACTOS");
  exigirNodos(faltantes);

  const [{ provisional, motivo }, rango] = await Promise.all([
    obtenerProvisionalidad(supabase, project_id),
    obtenerRangoPalabrasResumen(supabase, project_id),
  ]);

  const impactosTexto = impactos!.impactos
    .map((i) => `- [${i.tipo}] ${i.descripcion} (verificación futura: ${i.indicador_verificacion_futura})`)
    .join("\n");

  const prompt = `Eres un redactor académico construyendo el RESUMEN EJECUTIVO de
un proyecto de investigación que TODAVÍA NO SE HA EJECUTADO (está en fase
de formulación) — no un abstract de resultados ya obtenidos. Sigue la
estructura de 6 componentes C-G-O-M-R-I:
C=Contexto, G=Brecha/Gap, O=Objetivo, M=Método, R=Resultados ESPERADOS
(proyección, NUNCA una cifra o medición ya obtenida, porque el proyecto no
se ha ejecutado), I=Implicación esperada de esos resultados proyectados.

${INSTRUCCION_HONESTIDAD}

Un solo párrafo continuo, prosa académica, ${rango.min}-${rango.max}
palabras (rango de la plantilla de ${rango.institucion}). Sin subtítulos
como "Contexto:"/"Objetivo:", sin viñetas, sin negritas.

=== C — Contexto (RUTA) ===
Tema: ${ruta!.tema}
Problema: ${ruta!.problema}
Población/contexto: ${ruta!.poblacion_contexto}
Alcance: ${ruta!.alcance_espacial}, ${ruta!.alcance_temporal}

=== Cifras de contexto disponibles (NOVA, con su propio estado de verificación) ===
${bloqueCifrasContexto(nova!)}
Usa como máximo 1 de estas cifras si aporta magnitud real al Contexto, y
SOLO con la reserva explícita si verificado=no o si el propio texto de la
cifra indica que no se encontró evidencia. Si ninguna cifra de esta lista
es necesaria para el resumen, no menciones ninguna — nunca introduzcas una
cifra, porcentaje o comparación (ej. rendimientos, participación regional)
que no esté en esta lista exacta, aunque te parezca plausible o la
recuerdes de otro contexto.

=== G — Brecha (NOVA, núcleo) ===
Brecha de conocimiento: ${nova!.nucleo_brecha_conocimiento}
Causa raíz: ${nova!.nucleo_causa_raiz}

=== O — Objetivo (Objetivos) ===
Objetivo general: ${objetivos!.objetivo_general}

=== M — Método (Metodología, resumido) ===
Enfoque metodológico: ${metodologia!.enfoque_metodologico}
Tipo de investigación: ${metodologia!.tipo_investigacion}
Diseño metodológico: ${metodologia!.diseno_metodologico}
Población: ${metodologia!.poblacion}
Muestra: ${metodologia!.muestra}

=== R/I — Resultados esperados e implicación (Impactos, proyección cualitativa) ===
${impactosTexto}

Redacta el resumen ahora. Responde ÚNICAMENTE con el párrafo del resumen,
sin título, sin conteo de palabras, sin comentarios.`;

  const texto = await llamarOrquestador(prompt);
  return { texto: texto.trim(), provisional, motivo_provisional: motivo };
}
