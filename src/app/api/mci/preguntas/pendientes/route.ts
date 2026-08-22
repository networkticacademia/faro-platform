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

  // Traer preguntas abiertas, agrupadas, diferidas y no_aplica
  const { data: todasPreguntas, error } = await supabase
    .from("preguntas_pendientes")
    .select("id, project_id, nodo_id, nodo_tipo, campo_origen, texto_pregunta, prioridad, pregunta_raiz_id, agrupada_en, depende_de, condicion_activacion, cerrada_por_rama, razon_cierre, nodos_afectados, estado, respuesta, created_at, resolved_at")
    .eq("project_id", project_id)
    .in("estado", ["abierta", "agrupada", "diferida", "no_aplica"])
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filas = (todasPreguntas ?? []) as FilaPregunta[];

  // Separar dependientes (depende_de != null)
  const dependientesMap = new Map<string, FilaPregunta[]>();
  const filasSinDependientes: FilaPregunta[] = [];

  for (const p of filas) {
    if (p.depende_de) {
      const depKey = p.depende_de as string;
      const list = dependientesMap.get(depKey) ?? [];
      list.push(p);
      dependientesMap.set(depKey, list);
    } else {
      filasSinDependientes.push(p);
    }
  }

  // Agrupar primarias por groupKey = agrupada_en ?? pregunta_raiz_id ?? id
  const grupos = new Map<string, FilaPregunta[]>();
  for (const p of filasSinDependientes) {
    const groupKey = (p.agrupada_en as string | null) ?? (p.pregunta_raiz_id as string | null) ?? p.id;
    const lista = grupos.get(groupKey) ?? [];
    lista.push(p);
    grupos.set(groupKey, lista);
  }

  // Solo consideramos como representantes aquellas preguntas primarias que están en estado 'abierta'
  const preguntas = Array.from(grupos.entries())
    .map(([repId, miembros]) => {
      const representante = miembros.find((m) => m.id === repId && m.estado === "abierta")
        ?? miembros.find((m) => m.estado === "abierta");

      if (!representante) return null;

      const resto = miembros.filter((m) => m.id !== representante.id);
      const nodosInvolucrados = Array.from(new Set(miembros.map((m) => m.nodo_tipo)));
      const dependientes = dependientesMap.get(representante.id) ?? [];

      return {
        ...representante,
        agrupa_count: resto.length,
        nodos_involucrados: nodosInvolucrados,
        dependientes: dependientes.map((d) => ({
          id: d.id,
          nodo_tipo: d.nodo_tipo,
          texto_pregunta: d.texto_pregunta,
          prioridad: d.prioridad,
          estado: d.estado,
          condicion_activacion: d.condicion_activacion,
          cerrada_por_rama: d.cerrada_por_rama,
          razon_cierre: d.razon_cierre,
        })),
        ...(incluirDetalle
          ? { agrupadas: resto.map((h) => ({ id: h.id, nodo_tipo: h.nodo_tipo, texto_pregunta: h.texto_pregunta })) }
          : {}),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => {
      if (a.prioridad !== b.prioridad) return a.prioridad.localeCompare(b.prioridad);
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  // Conteo para UI y dashboard: solo primarias abiertas
  const conteo = {
    P1: preguntas.filter((p) => p.prioridad === "P1").length,
    P2: preguntas.filter((p) => p.prioridad === "P2").length,
    P3: preguntas.filter((p) => p.prioridad === "P3").length,
  };

  return NextResponse.json({ preguntas, conteo });
}
