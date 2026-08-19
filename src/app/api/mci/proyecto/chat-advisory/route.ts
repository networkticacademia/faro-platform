import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { llamarModeloLigero } from "@/lib/openrouter/client";
import { generarDocumentoConsolidadoMarkdown } from "@/lib/faro/documentoConsolidado";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id, mensaje } = body;

  if (!project_id || !mensaje) {
    return NextResponse.json({ error: "Faltan parámetros project_id o mensaje." }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("titulo_provisional")
    .eq("id", project_id)
    .single();

  const titulo = project?.titulo_provisional ?? "Proyecto";

  // Compilar el documento markdown provisional para usarlo de contexto
  const docMarkdown = await generarDocumentoConsolidadoMarkdown(supabase, project_id);

  const prompt = `Eres un asesor metodológico de FARO, un asistente experto e inteligente de la plataforma.
Acompañas a un formulador de proyectos que está revisando la propuesta final consolidada del proyecto "${titulo}".

Contexto actual de la propuesta consolidada:
${docMarkdown.slice(0, 5000)}

El usuario te ha enviado la siguiente duda o solicitud de apoyo metodológico:
"${mensaje}"

Tu rol es ser ASESOR (advisory), no generativo. Debes aconsejar al usuario sobre qué hacer.
En particular, guíale para decidir entre estas 3 opciones metodológicas de FARO:
1. **Regenerar una vez** (cuando el agente cometió un error metodológico o le faltó un dato que se puede corregir dándole feedback al agente y regenerando el nodo).
2. **Inserción manual + Humanizador de párrafo** (cuando el usuario quiere agregar a mano un detalle específico directamente en la propuesta para afinar la redacción).
3. **Dejar como riesgo/supuesto** (cuando es una duda no verificable en este momento o es una condición operativa/externa, la cual no debe bloquear la formulación sino listarse como riesgo en la matriz).

Escribe una respuesta corta, clara y estructurada en español, dando consejos prácticos basados en el estado del proyecto y su duda. Escribe como si estuvieras conversando en texto plano.`;

  const respuesta = await llamarModeloLigero(prompt);
  return NextResponse.json({ respuesta });
}
