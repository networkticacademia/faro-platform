import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { previsualizarPropagacion, ejecutarPropagacion } from "@/lib/faro/propagacion";
import type { Procedencia } from "@/lib/faro/procedencia";

/**
 * POST /api/mci/preguntas/propagar
 * body: { modo: "previsualizar", pregunta_raiz_id }
 *    → { nodos_afectados: [...] }
 * body: { modo: "ejecutar", project_id, pregunta_raiz_id, respuesta, procedencia, nodos_confirmados }
 *    → regenera los nodos confirmados y marca preguntas resueltas
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { modo } = body as { modo?: "previsualizar" | "ejecutar" };

  if (modo === "previsualizar") {
    const { pregunta_raiz_id } = body as { pregunta_raiz_id?: string };
    if (!pregunta_raiz_id) {
      return NextResponse.json({ error: "Falta pregunta_raiz_id." }, { status: 400 });
    }
    const resultado = await previsualizarPropagacion(supabase, pregunta_raiz_id);
    return NextResponse.json(resultado);
  }

  if (modo === "ejecutar") {
    const { project_id, pregunta_raiz_id, respuesta, procedencia, nodos_confirmados } = body as {
      project_id?: string;
      pregunta_raiz_id?: string;
      respuesta?: string;
      procedencia?: Procedencia;
      nodos_confirmados?: {
        nodo_ids: string[];
        nodo_tipo: string;
        preguntas_que_resuelve: string[];
      }[];
    };

    if (!project_id || !pregunta_raiz_id || !respuesta?.trim() || !procedencia) {
      return NextResponse.json(
        { error: "Faltan project_id, pregunta_raiz_id, respuesta o procedencia." },
        { status: 400 }
      );
    }
    if (!nodos_confirmados || nodos_confirmados.length === 0) {
      return NextResponse.json(
        { error: "Falta la lista de nodos confirmados por el formulador." },
        { status: 400 }
      );
    }

    const resultado = await ejecutarPropagacion(supabase, {
      project_id,
      pregunta_raiz_id,
      respuesta,
      procedencia,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodosConfirmados: nodos_confirmados as any,
    });
    return NextResponse.json(resultado);
  }

  return NextResponse.json({ error: "modo debe ser 'previsualizar' o 'ejecutar'." }, { status: 400 });
}
