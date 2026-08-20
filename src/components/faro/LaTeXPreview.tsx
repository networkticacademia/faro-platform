"use client";

import React from "react";

interface LaTeXPreviewProps {
  titulo: string;
  autor: {
    nombre: string;
    institucion: string;
    facultad?: string;
    programa?: string;
    rol?: string;
  } | null;
  markdown: string;
}

export function LaTeXPreview({ titulo, autor, markdown }: LaTeXPreviewProps) {
  // Convert basic markdown formatting to HTML elements for preview
  const parseMarkdownToLaTeXStyle = (text: string) => {
    if (!text) return [];

    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let insideList = false;
    let listItems: string[] = [];

    const pushList = (key: string) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={key} className="list-disc pl-6 mb-4 space-y-1 text-sm text-justify leading-relaxed">
            {listItems.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const lineKey = `line-${index}`;

      // Handle headings
      if (trimmed.startsWith("### ")) {
        pushList(lineKey);
        insideList = false;
        elements.push(
          <h4 key={lineKey} className="text-sm font-bold mt-4 mb-2 text-left">
            {trimmed.replace("### ", "")}
          </h4>
        );
      } else if (trimmed.startsWith("## ")) {
        pushList(lineKey);
        insideList = false;
        const textOnly = trimmed.replace("## ", "");
        // If it's Abstract or Introduction, render differently in LaTeX
        if (textOnly.toUpperCase().includes("RESUMEN") || textOnly.toUpperCase().includes("INTRODUCCIÓN")) {
          return; // Skip rendering here, handled on top
        }
        elements.push(
          <h3 key={lineKey} className="text-base font-bold mt-6 mb-3 uppercase tracking-wide text-left border-b pb-1">
            {textOnly}
          </h3>
        );
      } else if (trimmed.startsWith("# ")) {
        pushList(lineKey);
        insideList = false;
        elements.push(
          <h2 key={lineKey} className="text-lg font-bold mt-8 mb-4 uppercase text-center tracking-wider">
            {trimmed.replace("# ", "")}
          </h2>
        );
      }
      // Handle list items
      else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        insideList = true;
        listItems.push(trimmed.slice(2));
      } else if (trimmed === "") {
        pushList(lineKey);
        insideList = false;
      } else {
        pushList(lineKey);
        insideList = false;
        // Text lines - parse bold and emphasis
        let formattedText: React.ReactNode = trimmed;
        // Simple bold parser **text**
        if (trimmed.includes("**")) {
          const parts = trimmed.split("**");
          formattedText = parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part);
        }
        elements.push(
          <p key={lineKey} className="text-sm text-justify leading-relaxed mb-3 indent-6">
            {formattedText}
          </p>
        );
      }
    });

    // Final list flush
    pushList("list-final");

    return elements;
  };

  // Find Resumen Ejecutivo and Introducción to place them in standard LaTeX spots
  const extractSection = (sectionTitle: string): string => {
    const regex = new RegExp(`## ${sectionTitle}\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |\\r?\\n# |$)`, "i");
    const match = markdown.match(regex);
    return match ? match[1].trim() : "";
  };

  const resumen = extractSection("RESUMEN EJECUTIVO");
  const introduccion = extractSection("INTRODUCCIÓN");

  // Remove Resumen and Intro from the rest of the body to avoid duplication
  const getRestOfMarkdown = () => {
    let body = markdown;
    body = body.replace(/## RESUMEN EJECUTIVO\r?\n[\s\S]*?(?=\r?\n## |\r?\n# |$)/i, "");
    body = body.replace(/## INTRODUCCIÓN\r?\n[\s\S]*?(?=\r?\n## |\r?\n# |$)/i, "");
    return body;
  };

  return (
    <div className="flex flex-col items-center bg-gray-100 py-6 overflow-y-auto max-h-[85vh] w-full overflow-x-auto">
      <div className="w-[820px] min-w-[820px] min-h-[1160px] bg-white shadow-2xl border border-gray-300 p-[75px] font-serif text-gray-900 select-text relative my-4">
        
        {/* Document Header (LaTeX Style) */}
        <div className="text-center mb-8 space-y-3">
          <h1 className="text-xl font-bold uppercase tracking-tight max-w-[90%] mx-auto leading-tight">
            {titulo}
          </h1>
          
          <div className="text-sm font-medium mt-4">
            {autor?.nombre || "Autor no especificado"}
          </div>
          
          <div className="text-xs text-gray-600 italic space-y-0.5">
            <div>{autor?.institucion || "Filiación no especificada"}</div>
            {autor?.facultad && <div>{autor.facultad}</div>}
            {autor?.programa && <div>{autor.programa}</div>}
            {autor?.rol && <div className="text-[10px] uppercase font-mono tracking-wider mt-1">{autor.rol}</div>}
          </div>

          <div className="text-xs font-mono text-gray-400 mt-2">
            {new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>

        {/* Abstract / Resumen (LaTeX Standard Format) */}
        {resumen && (
          <div className="mx-8 mb-8 text-xs text-justify">
            <p className="leading-relaxed">
              <strong className="font-bold mr-1">Resumen—</strong>
              {resumen}
            </p>
          </div>
        )}

        {/* Introducción */}
        {introduccion && (
          <div className="mb-6">
            <h3 className="text-base font-bold mt-6 mb-3 uppercase tracking-wide text-left border-b pb-1">
              1. INTRODUCCIÓN
            </h3>
            <p className="text-sm text-justify leading-relaxed indent-6">
              {introduccion}
            </p>
          </div>
        )}

        {/* Rest of the document content */}
        <div className="space-y-4">
          {parseMarkdownToLaTeXStyle(getRestOfMarkdown())}
        </div>

        {/* Page Footer */}
        <div className="absolute bottom-[40px] left-0 right-0 text-center text-xs font-serif text-gray-400">
          Documento generado por L<sup>A</sup>T<sub>E</sub>X / FARO Platform — Página 1
        </div>
      </div>
    </div>
  );
}
