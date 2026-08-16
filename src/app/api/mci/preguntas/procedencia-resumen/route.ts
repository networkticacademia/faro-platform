import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { esProcedenciaConfirmada, type Procedencia } from "@/lib/faro/procedencia";

/**
 * GET /api/mci/preguntas/procedencia-resumen?project_id=...
 *
 * Contador simple, sin LLM: preguntas RESUELTAS agrupadas por nodo_tipo,
 * separadas en procedencia "sólida" (esProcedenciaConfirmada) vs "débil"
 * (supuesto/estimacion/pendiente_de_verificacion). NO se limita a los
 * casos de "profundidad_agotada" — cuenta cualquier pregunta resuelta con
 * procedencia débil, incluida la que el formulador responde directamente
 * en el primer intento.
 *
 * Instrumento de validación de diseño: si la procedencia débil se
 * concentra en RUTA/NOVA (checkpoints tempranos ya la atraparon barato)
 * vs. si se acumula en Metodología/Impactos (señal de que los checkpoints
 * anteriores dejaron pasar algo).
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
  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("preguntas_pendientes")
    .select("nodo_tipo, estado_procedencia")
    .eq("project_id", project_id)
    .eq("estado", "resuelta")
    .not("estado_procedencia", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const porNodo = new Map<string, { solida: number; debil: number }>();
  for (const fila of data ?? []) {
    const entrada = porNodo.get(fila.nodo_tipo) ?? { solida: 0, debil: 0 };
    if (esProcedenciaConfirmada(fila.estado_procedencia as Procedencia)) {
      entrada.solida += 1;
    } else {
      entrada.debil += 1;
    }
    porNodo.set(fila.nodo_tipo, entrada);
  }

  const resumen = Array.from(porNodo.entries()).map(([nodo_tipo, conteo]) => ({
    nodo_tipo,
    solida: conteo.solida,
    debil: conteo.debil,
  }));

  return NextResponse.json({ resumen });
}
