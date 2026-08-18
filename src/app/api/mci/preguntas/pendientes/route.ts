import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface FilaPregunta {
  id: string;
  pregunta_raiz_id: string | null;
  nodo_tipo: string;
  texto_pregunta: string;
  prioridad: "P1" | "P2" | "P3";
  created_at: string;
  [key: string]: unknown;
}

/**
 * GET /api/mci/preguntas/pendientes?project_id=...
 *
 * Trae TODAS las preguntas con estado='abierta' del proyecto (raíces e
 * hijas por igual) y las agrupa en memoria por groupKey = pregunta_raiz_id
 * ?? id — es decir, por la raíz ORIGINAL de cada pregunta, sin importar si
 * esa raíz sigue abierta.
 *
 * Antes esta consulta solo traía raíces con estado='abierta' y les colgaba
 * hijas abiertas; si la raíz se resolvía primero (habitual: el formulador
 * responde la pregunta principal y el LLM insertó una profundización -1-2
 * niveles causales, ver propagacion.ts- que sigue abierta), esas hijas
 * quedaban huérfanas — no aparecían en ninguna de las 3 superficies que
 * consumen este endpoint (ContadorPreguntasPrioridad, PreguntasPendientes-
 * Agrupadas, TriagePregunta). Bug confirmado en producción (proyecto piña,
 * 18-ago-2026: 5 preguntas abiertas de IMPACTOS invisibles en la UI).
 *
 * Ahora cada grupo se muestra usando como representante la raíz si sigue
 * abierta, o —si la raíz ya fue resuelta— la miembro abierta más antigua
 * del grupo, para que el grupo entero siga siendo visible y accionable.
 * Use ?incluir_detalle=true para traer también las preguntas agrupadas bajo cada raíz.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const project_id = searchParams.get("project_id");
  const incluirDetalle = searchParams.get("incluir_detalle") === "true";

  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  const { data: abiertas, error } = await supabase
    .from("preguntas_pendientes")
    .select("*")
    .eq("project_id", project_id)
    .eq("estado", "abierta")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filas = (abiertas ?? []) as FilaPregunta[];

  const grupos = new Map<string, FilaPregunta[]>();
  for (const p of filas) {
    const groupKey = p.pregunta_raiz_id ?? p.id;
    const lista = grupos.get(groupKey) ?? [];
    lista.push(p);
    grupos.set(groupKey, lista);
  }

  const preguntas = Array.from(grupos.values()).map((miembros) => {
    // Representante: la raíz misma si sigue abierta (comportamiento
    // original); si la raíz ya se resolvió, la miembro abierta más antigua
    // del grupo la promueve y hace de representante visible.
    const raizAbierta = miembros.find((m) => m.pregunta_raiz_id === null);
    const representante = raizAbierta ?? miembros[0];
    const resto = miembros.filter((m) => m.id !== representante.id);
    const nodosInvolucrados = Array.from(new Set(miembros.map((m) => m.nodo_tipo)));
    return {
      ...representante,
      agrupa_count: resto.length,
      nodos_involucrados: nodosInvolucrados,
      raiz_resuelta: !raizAbierta,
      ...(incluirDetalle
        ? { agrupadas: resto.map((h) => ({ id: h.id, nodo_tipo: h.nodo_tipo, texto_pregunta: h.texto_pregunta })) }
        : {}),
    };
  }).sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad.localeCompare(b.prioridad);
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const conteo = {
    P1: preguntas.filter((p) => p.prioridad === "P1").length,
    P2: preguntas.filter((p) => p.prioridad === "P2").length,
    P3: preguntas.filter((p) => p.prioridad === "P3").length,
  };

  return NextResponse.json({ preguntas, conteo });
}
