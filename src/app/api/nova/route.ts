// ============================================================
// FARO — POST /api/nova
// Conecta: nova.prompt.ts (system prompt) + nova.types.ts (contrato)
// con OpenRouter (Modelo 2: Llama 3.3 70B) y persiste en Supabase.
// Fase: F4 — Construcción del problema
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================
//
// SUPUESTOS a verificar contra el código real del repositorio antes
// de probar (no fueron confirmados en esta sesión, ajústense si el
// código existente difiere):
//   1. `createClient` se exporta desde 'src/lib/supabase/server.ts'
//      siguiendo el patrón ya usado en /api/diagnostico y /api/registro.
//   2. El identificador de modelo en OpenRouter para Llama 3.3 70B es
//      'meta-llama/llama-3.3-70b-instruct' — confirmar contra el
//      catálogo vigente de OpenRouter, puede cambiar.
//   3. La tabla `graph_nodes` acepta inserción directa de los campos
//      de GraphNodeNova sin trigger que calcule weight_wi/delta_i/kappa_i
//      en el mismo insert (esos tres se calculan aparte, en el módulo MCI).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { NOVA_SYSTEM_PROMPT, buildNovaUserPrompt } from '@/lib/faro/nova/nova.prompt';
import {
  NovaOutputSchema,
  detectarXi1TrlTau,
  mapNovaToGraphNode,
  type NovaInput,
} from '@/lib/faro/nova/nova.types';

const OPENROUTER_MODEL_NOVA = 'meta-llama/llama-3.3-70b-instruct';

interface NovaRequestBody extends NovaInput {
  project_id: string;
}

export async function POST(request: NextRequest) {
  try {
    // -----------------------------------------------------
    // 1. Leer y validar mínimamente el cuerpo de la solicitud
    // -----------------------------------------------------
    const body = (await request.json()) as Partial<NovaRequestBody>;

    if (!body.project_id) {
      return NextResponse.json(
        { error: 'project_id es requerido' },
        { status: 400 }
      );
    }
    if (!body.z0 || !body.D || !body.B || body.rho === undefined) {
      return NextResponse.json(
        { error: 'Faltan campos del contrato NovaInput (z0, D, B, rho)' },
        { status: 400 }
      );
    }

    const projectId = body.project_id;
    const novaInput: NovaInput = {
      z0: body.z0,
      D: body.D,
      B: body.B,
      rho: body.rho,
    };

    // -----------------------------------------------------
    // 2. Verificar configuración
    // -----------------------------------------------------
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY no está configurada en el entorno' },
        { status: 500 }
      );
    }

    // -----------------------------------------------------
    // 3. Llamada a OpenRouter — Modelo 2 (Llama 3.3 70B)
    // -----------------------------------------------------
    const openRouterResponse = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL_NOVA,
          messages: [
            { role: 'system', content: NOVA_SYSTEM_PROMPT },
            { role: 'user', content: buildNovaUserPrompt(novaInput) },
          ],
          temperature: 0.3, // baja temperatura: se busca consistencia, no creatividad
          response_format: { type: 'json_object' },
        }),
      }
    );

    if (!openRouterResponse.ok) {
      const detalle = await openRouterResponse.text();
      return NextResponse.json(
        { error: 'Fallo la llamada a OpenRouter', detalle },
        { status: 502 }
      );
    }

    const completion = await openRouterResponse.json();
    const rawContent: string | undefined = completion?.choices?.[0]?.message?.content;

    if (!rawContent) {
      return NextResponse.json(
        { error: 'OpenRouter no devolvió contenido en la respuesta', crudo: completion },
        { status: 502 }
      );
    }

    // -----------------------------------------------------
    // 4. Parsear el JSON crudo devuelto por el modelo
    // -----------------------------------------------------
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawContent);
    } catch {
      return NextResponse.json(
        { error: 'La salida del modelo no es JSON válido', crudo: rawContent },
        { status: 422 }
      );
    }

    // -----------------------------------------------------
    // 5. Validar contra el contrato Zod — segunda línea de defensa,
    //    independiente del autochequeo que hace el propio prompt.
    // -----------------------------------------------------
    const validation = NovaOutputSchema.safeParse(parsedJson);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'La salida del modelo no cumple NovaOutputSchema',
          detalle: validation.error.flatten(),
          crudo: parsedJson,
        },
        { status: 422 }
      );
    }

    const novaOutput = validation.data;

    // -----------------------------------------------------
    // 6. Chequeo determinístico de ξ1 (TRL vs. τ) — tercera línea,
    //    corre en código sin depender del juicio del LLM.
    // -----------------------------------------------------
    const xi1Programatico = detectarXi1TrlTau(novaInput.z0, novaOutput.trl_declarado);
    const yaDeclaradoPorModelo = novaOutput.contradicciones_detectadas.some(
      (c) => c.tipo === 'xi1_trl_incoherente_con_tau'
    );
    if (xi1Programatico && !yaDeclaradoPorModelo) {
      novaOutput.contradicciones_detectadas.push(xi1Programatico);
    }

    // -----------------------------------------------------
    // 7. Persistir el nodo en graph_nodes (Supabase)
    // -----------------------------------------------------
    const supabase = await createClient();
    const graphNode = mapNovaToGraphNode(projectId, novaOutput);

    const { data: insertedNode, error: insertError } = await supabase
      .from('graph_nodes')
      .insert(graphNode)
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        {
          error: 'Fallo al persistir el nodo NOVA en graph_nodes',
          detalle: insertError.message,
          nova_output: novaOutput, // se devuelve igual, para no perder el trabajo del modelo
        },
        { status: 500 }
      );
    }

    // -----------------------------------------------------
    // 8. Respuesta exitosa
    // -----------------------------------------------------
    return NextResponse.json(
      {
        nova_output: novaOutput,
        graph_node: insertedNode,
        contradicciones_totales: novaOutput.contradicciones_detectadas.length,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Error inesperado en /api/nova',
        detalle: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
