import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { llamarOrquestador, parsearJsonRespuesta } from "@/lib/openrouter/client";
import {
  construirPromptObjetivos,
  camposObligatoriosParaEnfoque,
  ensamblarMatrizConsistencia,
  estructuraSegunEnfoque,
  type ObjetivosOutput,
} from "@/lib/faro/objetivos";
import { calcularDeltaI, calcularOmega } from "@/lib/faro/mci";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { project_id } = await req.json();

  if (!project_id) {
    return NextResponse.json({ error: "project_id requerido" }, { status: 400 });
  }

  // 1. Traer el proyecto (para nu, mu, y demás campos de z0*)
  const { data: project, error: errProject } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single();

  if (errProject || !project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  // 2. Traer el último nodo RUTA confirmado del proyecto (D(θ) es obligatorio)
  const { data: nodoRuta, error: errRuta } = await supabase
    .from("grafo_nodos")
    .select("*")
    .eq("project_id", project_id)
    .eq("tipo", "RUTA")
    .eq("confirmado", true)
    .order("iteracion", { ascending: false })
    .limit(1)
    .single();

  if (errRuta || !nodoRuta) {
    return NextResponse.json(
      { error: "Se requiere un nodo RUTA confirmado antes de generar Objetivos" },
      { status: 400 }
    );
  }

  // 3. Traer el último nodo NOVA confirmado del proyecto (árbol de causas es obligatorio)
  const { data: nodoNova, error: errNova } = await supabase
    .from("grafo_nodos")
    .select("*")
    .eq("project_id", project_id)
    .eq("tipo", "NOVA")
    .eq("confirmado", true)
    .order("iteracion", { ascending: false })
    .limit(1)
    .single();

  if (errNova || !nodoNova) {
    return NextResponse.json(
      { error: "Se requiere un nodo NOVA confirmado antes de generar Objetivos" },
      { status: 400 }
    );
  }

  const rutaOutput = nodoRuta.contenido;
  const novaOutput = nodoNova.contenido;

  // 4. Construir el prompt y llamar al orquestador
  const prompt = construirPromptObjetivos({
    nu: project.nu,
    mu: project.mu,
    rutaOutput,
    novaOutput,
  });

  const respuestaRaw = await llamarOrquestador(prompt);
  const objetivosOutput = parsearJsonRespuesta<ObjetivosOutput>(respuestaRaw);

  // 5. Validar campos obligatorios según el enfoque ya resuelto
  const enfoque = estructuraSegunEnfoque(project.mu);
  const camposObligatorios = camposObligatoriosParaEnfoque(enfoque);

  // 6. Ensamblar la matriz de consistencia de forma determinística (no la generó el LLM)
  const matrizConsistencia = ensamblarMatrizConsistencia(objetivosOutput);

  // 7. Calcular δ y Ω con las funciones ya generalizadas de mci.ts
  const deltaI = calcularDeltaI({
    nivel_confianza_agente: objetivosOutput.nivel_confianza_agente,
    preguntas_para_el_usuario: objetivosOutput.preguntas_para_el_usuario,
  });
  const omega = calcularOmega(objetivosOutput, camposObligatorios);

  // 8. Insertar el nodo en grafo_nodos
  const { data: nuevoNodo, error: errInsert } = await supabase
    .from("grafo_nodos")
    .insert({
      project_id,
      tipo: "OBJETIVOS",
      contenido: { ...objetivosOutput, matriz_consistencia: matrizConsistencia },
      delta_i: deltaI,
      omega,
      confirmado: false,
      iteracion: 1, // TODO: calcular iteración real igual que en ruta/generar si hay reintentos
    })
    .select()
    .single();

  if (errInsert || !nuevoNodo) {
    return NextResponse.json(
      { error: "Error al guardar el nodo Objetivos", detalle: errInsert?.message },
      { status: 500 }
    );
  }

  // 9. Registrar en sesiones_mci_log
  await supabase.from("sesiones_mci_log").insert({
    project_id,
    modulo: "OBJETIVOS",
    nodo_id: nuevoNodo.id,
    delta_i: deltaI,
    omega,
  });

  return NextResponse.json({
    nodo: nuevoNodo,
    objetivos: objetivosOutput,
    matriz_consistencia: matrizConsistencia,
  });
}
