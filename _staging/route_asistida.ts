// ============================================================
// FARO — POST /api/mci/corpus/asistida
// Recibe texto pegado (reporte de NotebookLM/Perplexity/Elicit/etc.),
// lo parsea vía LLM, verifica cada DOI contra Crossref/DataCite, e
// inserta los candidatos válidos en corpus_fuentes. Candidatos sin
// DOI se insertan como estado_verificacion="sin_verificar".
//
// v2 (2026-08-09): se agrega el campo autores al insert — se
// capturaba en el parseo pero no se estaba persistiendo (columna
// agregada en 0014_corpus_fuentes_autores.sql).
//
// Autor: Dr. Jorge Enrique Chaparro Mesa · Unitrópico
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  parsearCandidatosDesdeTexto,
  verificarDOI,
} from "@/lib/faro/corpus/parserAsistido";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { project_id, texto_pegado, nodo_origen_id } = body ?? {};

  if (!project_id || !texto_pegado || typeof texto_pegado !== "string") {
    return NextResponse.json(
      { error: "project_id y texto_pegado son obligatorios" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  let candidatos;
  try {
    candidatos = await parsearCandidatosDesdeTexto(texto_pegado);
  } catch (error) {
    console.error("Fallo parseo LLM de texto pegado:", error);
    return NextResponse.json(
      { error: "No se pudo interpretar el texto pegado" },
      { status: 500 }
    );
  }

  const insertados: unknown[] = [];
  const descartados: { titulo: string; motivo: string }[] = [];
  const sinDoi: { titulo: string }[] = [];

  for (const candidato of candidatos) {
    if (!candidato.titulo) continue;

    if (candidato.doi) {
      const verificacion = await verificarDOI(candidato.doi);
      if (!verificacion.valido) {
        descartados.push({
          titulo: candidato.titulo,
          motivo: `DOI "${candidato.doi}" no se pudo verificar contra Crossref ni DataCite`,
        });
        continue;
      }

      const { data, error } = await supabase
        .from("corpus_fuentes")
        .insert({
          project_id,
          fuente: "asistida_manual",
          doi: candidato.doi,
          titulo: verificacion.tituloReal ?? candidato.titulo,
          autores: candidato.autores ?? null,
          anio: verificacion.anioReal ?? candidato.anio,
          revista: verificacion.revistaReal ?? candidato.revista,
          resumen_hallazgo: candidato.hallazgo,
          estado_verificacion: "verificado",
          nodo_origen_id: nodo_origen_id ?? null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          // Ya existe por DOI duplicado — en vez de descartarla sin más,
          // completa autores si la fila existente lo tiene vacío (caso
          // real: fuentes cargadas antes de que este campo se guardara).
          const { data: filaExistente } = await supabase
            .from("corpus_fuentes")
            .select("id, autores")
            .eq("project_id", project_id)
            .eq("doi", candidato.doi)
            .maybeSingle();

          if (filaExistente && !filaExistente.autores && candidato.autores) {
            await supabase
              .from("corpus_fuentes")
              .update({ autores: candidato.autores })
              .eq("id", filaExistente.id);
            descartados.push({
              titulo: candidato.titulo,
              motivo: "Ya existía — se completó el campo autores, que estaba vacío",
            });
          } else {
            descartados.push({
              titulo: candidato.titulo,
              motivo: "Ya existe en el corpus de este proyecto (DOI duplicado)",
            });
          }
        } else {
          console.error("Error insertando candidato verificado:", error);
          descartados.push({ titulo: candidato.titulo, motivo: "Error al insertar" });
        }
        continue;
      }
      insertados.push(data);
    } else {
      const { data, error } = await supabase
        .from("corpus_fuentes")
        .insert({
          project_id,
          fuente: "asistida_manual",
          doi: null,
          titulo: candidato.titulo,
          autores: candidato.autores ?? null,
          anio: candidato.anio,
          revista: candidato.revista,
          resumen_hallazgo: candidato.hallazgo,
          estado_verificacion: "sin_verificar",
          nodo_origen_id: nodo_origen_id ?? null,
        })
        .select()
        .single();

      if (error) {
        console.error("Error insertando candidato sin DOI:", error);
        descartados.push({ titulo: candidato.titulo, motivo: "Error al insertar" });
        continue;
      }
      sinDoi.push({ titulo: candidato.titulo });
      insertados.push(data);
    }
  }

  return NextResponse.json({
    total_extraidos: candidatos.length,
    insertados: insertados.length,
    descartados,
    sin_doi: sinDoi,
  });
}
