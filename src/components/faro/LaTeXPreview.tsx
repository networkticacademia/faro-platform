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

  const formatTextWithFormatting = (text: string): React.ReactNode => {
    if (!text) return "";
    
    // Parse bold **text**, italic *text*, and citations (Author, Year) or \cite{...}
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|\([A-Z\u00C0-\u00DC][^)]*?\d{4}[^)]*?\)|\\cite(?:p|t)?\{[^}]+\})/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={i} className="italic text-gray-800">{part.slice(1, -1)}</em>;
      }
      if ((part.startsWith("(") && part.endsWith(")") && /\d{4}/.test(part)) || part.startsWith("\\cite")) {
        return <span key={i} className="text-blue-600 font-medium cursor-pointer hover:underline print:text-blue-700">{part}</span>;
      }
      return part;
    });
  };

  const renderMarkdownContent = (text: string) => {
    if (!text) return null;

    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let insideList = false;
    let listItems: string[] = [];
    let insideTable = false;
    let tableRows: string[][] = [];

    const flushList = (key: string) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={key} className="list-disc pl-6 mb-4 space-y-1.5 text-sm leading-relaxed text-justify text-gray-800">
            {listItems.map((item, idx) => (
              <li key={idx}>{formatTextWithFormatting(item)}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
    };

    const flushTable = (key: string) => {
      if (tableRows.length > 0) {
        const header = tableRows[0];
        const body = tableRows.slice(1).filter(r => !r.every(cell => cell.trim().startsWith("---") || cell.trim().startsWith(":--")));
        elements.push(
          <div key={key} className="my-5 overflow-x-auto print:overflow-visible">
            <table className="min-w-full text-xs border-collapse border border-gray-300">
              <thead>
                <tr className="bg-slate-100 print:bg-gray-200">
                  {header.map((col, idx) => (
                    <th key={idx} className="border border-gray-300 px-3 py-2 text-left font-bold text-gray-900">
                      {formatTextWithFormatting(col.trim())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rIdx) => (
                  <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50 print:bg-white"}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="border border-gray-300 px-3 py-2 text-gray-800">
                        {formatTextWithFormatting(cell.trim())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
      }
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const lineKey = `line-${index}`;

      // Table line detect
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        flushList(lineKey);
        insideList = false;
        insideTable = true;
        const cells = trimmed.slice(1, -1).split("|");
        tableRows.push(cells);
        return;
      } else if (insideTable) {
        flushTable(lineKey);
        insideTable = false;
      }

      // Headings
      if (trimmed.startsWith("# ")) {
        flushList(lineKey);
        insideList = false;
        const textHeading = trimmed.replace(/^#\s+/, "");
        // If heading is document title, skip to avoid double title
        if (textHeading.toUpperCase().includes("PROPUESTA DE INVESTIGACIÓN")) return;
        elements.push(
          <h2 key={lineKey} className="text-lg font-bold mt-8 mb-4 uppercase text-center tracking-wider text-gray-900 border-b-2 border-gray-800 pb-2 print:break-after-avoid">
            {textHeading}
          </h2>
        );
      } else if (trimmed.startsWith("## ")) {
        flushList(lineKey);
        insideList = false;
        elements.push(
          <h3 key={lineKey} className="text-base font-bold mt-6 mb-3 uppercase tracking-wide text-left text-faro-navy border-b border-gray-300 pb-1.5 print:break-after-avoid">
            {trimmed.replace(/^##\s+/, "")}
          </h3>
        );
      } else if (trimmed.startsWith("### ")) {
        flushList(lineKey);
        insideList = false;
        elements.push(
          <h4 key={lineKey} className="text-sm font-bold mt-4 mb-2 text-left text-gray-900 print:break-after-avoid">
            {trimmed.replace(/^###\s+/, "")}
          </h4>
        );
      } else if (trimmed.startsWith("#### ")) {
        flushList(lineKey);
        insideList = false;
        elements.push(
          <h5 key={lineKey} className="text-xs font-bold mt-3 mb-1 text-left text-gray-800 italic print:break-after-avoid">
            {trimmed.replace(/^####\s+/, "")}
          </h5>
        );
      }
      // List items
      else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        insideList = true;
        listItems.push(trimmed.slice(2));
      } else if (trimmed === "") {
        flushList(lineKey);
        insideList = false;
      } else {
        flushList(lineKey);
        insideList = false;
        elements.push(
          <p key={lineKey} className="text-sm text-justify leading-relaxed mb-3 text-gray-800 indent-6">
            {formatTextWithFormatting(trimmed)}
          </p>
        );
      }
    });

    flushList("list-final");
    flushTable("table-final");

    return elements;
  };

  return (
    <div className="w-full flex flex-col items-center bg-gray-100/80 py-8 print:bg-white print:py-0 print:m-0 overflow-y-auto max-h-[85vh] print:max-h-none print:overflow-visible">
      {/* Print styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-area, .print-area * {
            visibility: visible !important;
          }
          .print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background-color: white !important;
            color: black !important;
            font-family: 'Times New Roman', Times, serif !important;
          }
          @page {
            size: A4;
            margin: 2.5cm;
          }
        }
      `}</style>

      {/* Main Document Paper Container */}
      <div className="print-area w-[850px] min-w-[850px] bg-white shadow-xl border border-gray-300 p-[60px] md:p-[80px] font-serif text-gray-900 select-text relative my-2 rounded-sm print:w-full print:min-w-full print:p-0">
        
        {/* Cover / Header (LaTeX Academic Style) */}
        <div className="text-center mb-10 pb-8 border-b-2 border-gray-200 space-y-4">
          <div className="text-xs uppercase tracking-widest font-sans font-semibold text-gray-500 mb-2 print:text-gray-700">
            Propuesta de Investigación Científica
          </div>
          <h1 className="text-2xl font-bold uppercase tracking-tight max-w-[95%] mx-auto leading-snug text-gray-900">
            {titulo}
          </h1>
          
          <div className="text-base font-semibold mt-6 text-gray-900">
            {autor?.nombre || "Autor Investigador"}
          </div>
          
          <div className="text-xs text-gray-600 italic space-y-1 font-sans">
            <div>{autor?.institucion || "Universidad"}</div>
            {autor?.facultad && <div>{autor.facultad}</div>}
            {autor?.programa && <div>{autor.programa}</div>}
            {autor?.rol && <div className="text-[11px] uppercase font-mono tracking-wider font-semibold text-gray-700 mt-1">{autor.rol}</div>}
          </div>

          <div className="text-xs font-sans text-gray-400 mt-4 print:text-gray-600">
            {new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>

        {/* Content Body */}
        <div className="space-y-4 text-gray-900">
          {renderMarkdownContent(markdown)}
        </div>

        {/* Document Footer */}
        <div className="mt-16 pt-6 border-t text-center text-xs font-sans text-gray-400 print:text-gray-500 flex justify-between items-center">
          <span>FARO Platform — Documento Consolidado</span>
          <span>Generado automáticamente</span>
        </div>
      </div>
    </div>
  );
}

