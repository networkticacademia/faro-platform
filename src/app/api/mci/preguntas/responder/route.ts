import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { evaluarCondicionActivacion } from "@/lib/faro/arbolPreguntas";

/**
 * Registra la respuesta del formulador a UNA pregunta pendiente.
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
  const { pregunta_id, respuesta } = body as { pregunta_id?: string; respuesta?: string };

  if (!pregunta_id || !respuesta?.trim()) {
    return NextResponse.json({ error: "Faltan pregunta_id o respuesta." }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from("preguntas_pendientes")
    .update({ respuesta, estado: "resuelta", resolved_at: timestamp })
    .eq("id", pregunta_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 1. Al responder la representante, las preguntas secundarias agrupadas pasan automáticamente a 'resuelta'
  await supabase
    .from("preguntas_pendientes")
    .update({ respuesta, estado: "resuelta", resolved_at: timestamp })
    .or(`agrupada_en.eq.${pregunta_id},pregunta_raiz_id.eq.${pregunta_id}`)
    .in("estado", ["agrupada", "diferida"]);

  // 2. ACTIVACIÓN Y CIERRE DE RAMAS: Consultar dependientes de esta primaria
  const { data: dependientes } = await supabase
    .from("preguntas_pendientes")
    .select("id, texto_pregunta, condicion_activacion")
    .eq("depende_de", pregunta_id);

  if (dependientes && dependientes.length > 0) {
    const textoPrimaria = data.texto_pregunta as string;
    for (const dep of dependientes) {
      if (!dep.condicion_activacion) {
        // Sin condición: se activa incondicionalmente tras responder la primaria
        await supabase
          .from("preguntas_pendientes")
          .update({ estado: "abierta" })
          .eq("id", dep.id);
        continue;
      }

      // Evaluar con modelo ligero si se cumple la condición de activación
      const evaluacion = await evaluarCondicionActivacion(
        textoPrimaria,
        respuesta,
        dep.texto_pregunta,
        dep.condicion_activacion
      );

      if (evaluacion.activar) {
        await supabase
          .from("preguntas_pendientes")
          .update({ estado: "abierta" })
          .eq("id", dep.id);
      } else {
        await supabase
          .from("preguntas_pendientes")
          .update({
            estado: "no_aplica",
            cerrada_por_rama: true,
            razon_cierre: evaluacion.razon,
            resolved_at: timestamp,
          })
          .eq("id", dep.id);
      }
    }
  }

  return NextResponse.json({ pregunta: data });
}

/**
 * PATCH /api/mci/preguntas/responder
 * Permite reabrir manualmente una pregunta dependiente que fue cerrada por rama (no_aplica -> abierta).
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { pregunta_id, estado } = body as { pregunta_id?: string; estado?: string };

  if (!pregunta_id || !estado) {
    return NextResponse.json({ error: "Faltan pregunta_id o estado." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("preguntas_pendientes")
    .update({
      estado,
      cerrada_por_rama: false,
      razon_cierre: null,
      resolved_at: null,
    })
    .eq("id", pregunta_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pregunta: data });
}
