import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import { obtenerNodoConfirmado } from "@/lib/faro/sintesisFinal";
import type { ObjetivosOutput } from "@/lib/faro/objetivos";
import type { RutaOutput } from "@/lib/faro/ruta";

interface TitleProposalResponse {
  opcionA: string;
  explicacionA: string;
  opcionB: string;
  explicacionB: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });
  }

  const body = await request.json();
  const { project_id } = body;
  if (!project_id) {
    return NextResponse.json({ error: "Falta project_id." }, { status: 400 });
  }

  try {
    // 1. Obtener datos del proyecto y nodos confirmados
    const { data: project, error: errProject } = await supabase
      .from("projects")
      .select("titulo_provisional, tau, nu, alpha_area, region, poblacion_usuarios, tecnologia_interes")
      .eq("id", project_id)
      .single();

    if (errProject || !project) {
      return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
    }

    const [rutaNode, objetivosNode] = await Promise.all([
      obtenerNodoConfirmado<RutaOutput>(supabase, project_id, "RUTA"),
      obtenerNodoConfirmado<ObjetivosOutput>(supabase, project_id, "OBJETIVOS"),
    ]);

    const pregunta = rutaNode?.pregunta_investigacion || rutaNode?.problema || "No definida";
    const objetivoGeneral = objetivosNode?.objetivo_general || "No definido";

    // 2. Construir el prompt para generar los títulos usando las fórmulas
    const prompt = `
Eres un experto en metodología de investigación y redacción científica. Tu tarea es generar DOS propuestas de títulos científicos altamente estructurados para un proyecto de investigación basado en sus objetivos y delimitación.

=== DATOS DEL PROYECTO ===
- Pregunta de Investigación: "${pregunta}"
- Objetivo General: "${objetivoGeneral}"
- Región/Contexto: "${project.region ?? ""}"
- Población: "${project.poblacion_usuarios ?? ""}"
- Tecnología de interés: "${project.tecnologia_interes ?? ""}"

=== FÓRMULAS DE REDACCIÓN DE TÍTULO ===

PROPUESTA 1 (Opción A): "Fórmula de la Simetría Absoluta" (Regla del Hilo Dorado)
- Esta regla exige consistencia lógica estricta. El título debe ser idéntico al Objetivo General, pero removiendo el verbo en infinitivo de Bloom al inicio y transformándolo en un sustantivo de acción (frase nominal).
- Ejemplo: Si el Objetivo General es "Determinar la relación entre X e Y...", el título simétrico debe ser "Relación entre X e Y...".
- Restricción: No agregues palabras de marketing, no uses dos puntos (:), mantén el hilo directo e idéntico al objetivo pero sustantivado.

PROPUESTA 2 (Opción B): "Fórmula Baena Paz / PICO-SPIDER" (Impacto y Publicación)
- Diseñado para publicación científica de alto impacto (Q1) o comités evaluadores.
- Debe combinar una frase provocativa, gancho o metáfora corta (enfoque de impacto) seguida de la delimitación metodológica exacta tras dos puntos (:).
- Ejemplo: "Hoyos negros en la hipertensión: Factores condicionantes del desapego al tratamiento en adultos mayores, Pasto 2026".
- Debe incluir las variables principales, la población y el contexto espacial de forma refinada.

=== INSTRUCCIONES DE SALIDA ===
Devuelve únicamente un objeto JSON con las siguientes claves:
{
  "opcionA": "Título propuesto bajo la Fórmula de Simetría Absoluta",
  "explicacionA": "Breve justificación metodológica de esta opción (máx. 2 líneas)",
  "opcionB": "Título propuesto bajo el Enfoque Baena Paz / PICO-SPIDER",
  "explicacionB": "Breve justificación metodológica de esta opción (máx. 2 líneas)"
}

No agregues comentarios antes ni después del JSON. Asegúrate de que el JSON sea válido.
`;

    const respuestaCruda = await llamarOrquestador(prompt);
    const titulosProposiciones = parsearJsonRespuesta<TitleProposalResponse>(respuestaCruda);

    return NextResponse.json({ titulos: titulosProposiciones });
  } catch (e) {
    return NextResponse.json({ error: `Error al proponer títulos: ${(e as Error).message}` }, { status: 500 });
  }
}
