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
  palabrasClave: string[];
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

    // 2. Construir el prompt para generar los títulos y palabras clave usando las fórmulas
    const prompt = `
Eres un experto en metodología de investigación y redacción científica. Tu tarea es generar:
1. DOS propuestas de títulos científicos altamente estructurados basados en sus objetivos y delimitación.
2. CINCO palabras clave (keywords) óptimas para la indexación y recuperabilidad del proyecto.

=== DATOS DEL PROYECTO ===
- Pregunta de Investigación: "${pregunta}"
- Objetivo General: "${objetivoGeneral}"
- Región/Contexto: "${project.region ?? ""}"
- Población: "${project.poblacion_usuarios ?? ""}"
- Tecnología de interés: "${project.tecnologia_interes ?? ""}"

=== FÓRMULAS DE REDACCIÓN DE TÍTULO ===

PROPUESTA 1 (Opción A): "Fórmula de la Simetría Absoluta" (Regla del Hilo Dorado)
- El título debe ser idéntico al Objetivo General, pero removiendo el verbo en infinitivo de Bloom al inicio y transformándolo en un sustantivo de acción (frase nominal).
- Ejemplo: Si el Objetivo General es "Determinar la relación entre X e Y...", el título simétrico debe ser "Relación entre X e Y...".
- Restricción: No agregues palabras de marketing, no uses dos puntos (:), mantén el hilo directo e idéntico al objetivo.

PROPUESTA 2 (Opción B): "Fórmula Baena Paz / PICO-SPIDER" (Impacto y Publicación)
- Debe combinar una frase corta de impacto (gancho o metáfora) seguida de la delimitación metodológica exacta tras dos puntos (:).
- Debe incluir las variables principales, la población y el contexto espacial de forma refinada.

=== REGLAS PARA SELECCIONAR LAS 5 PALABRAS CLAVE (REGLA 2-2-1) ===
Aplica estrictamente las directrices del archivo de indexación científica:
1. REGLA DE ORO DE EXCLUSIÓN: NO repitas palabras completas que ya figuren directamente en los títulos propuestos (Opción A u Opción B). Las palabras clave deben complementar el título para maximizar la cobertura de búsqueda.
2. DISTRIBUCIÓN 2-2-1:
   - 2 términos conceptuales de la temática o fenómeno de estudio (que no estén en el título).
   - 2 términos metodológicos o tecnológicos que describan la herramienta o enfoque (ej. "Machine learning", "Wireless sensor networks", "Image processing").
   - 1 descriptor de aplicación, contexto o población que conecte el trabajo con su campo de uso (ej. "Precision agriculture", "Smallholder farms").
3. Deben estar escritas en español (o inglés si es una sigla técnica muy consolidada como "IoT" o "Machine learning") y separadas en la lista.

=== INSTRUCCIONES DE SALIDA ===
Devuelve únicamente un objeto JSON con las siguientes claves:
{
  "opcionA": "Título propuesto bajo la Fórmula de Simetría Absoluta",
  "explicacionA": "Breve justificación metodológica de esta opción (máx. 2 líneas)",
  "opcionB": "Título propuesto bajo el Enfoque Baena Paz / PICO-SPIDER",
  "explicacionB": "Breve justificación metodológica de esta opción (máx. 2 líneas)",
  "palabrasClave": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
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
