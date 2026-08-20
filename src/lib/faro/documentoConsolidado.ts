import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerNodoConfirmado } from "./sintesisFinal";
import type { RutaOutput } from "./ruta";
import type { NovaOutput } from "./nova";
import type { ObjetivosOutput } from "./objetivos";
import type { MetodologiaOutput } from "./metodologia";
import { todasLasReferencias, type MarcoReferencialOutput } from "./marcoReferencial";
import type { ImpactosDelimitacionOutput } from "./impactosDelimitacion";
import { listarRiesgos } from "./riesgos";
import { generarIntroduccion, generarResumen } from "./sintesisFinal";
import {
  RUBRO_PRESUPUESTO_LABEL,
  FUENTE_PRESUPUESTO_LABEL,
  totalPresupuestoProyecto,
  resumenPorRubro,
  resumenPorFuente,
} from "./metodologia";

function formatoCOP(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor);
}

export async function generarDocumentoConsolidadoMarkdown(
  supabase: SupabaseClient,
  projectId: string
): Promise<string> {
  const { data: project } = await supabase
    .from("projects")
    .select("titulo_provisional, palabras_clave")
    .eq("id", projectId)
    .single();

  const titulo = project?.titulo_provisional ?? "Proyecto de Investigación Sin Título";

  const [ruta, nova, marco, objetivos, metodologia, impactos] = await Promise.all([
    obtenerNodoConfirmado<RutaOutput>(supabase, projectId, "RUTA"),
    obtenerNodoConfirmado<NovaOutput>(supabase, projectId, "NOVA"),
    obtenerNodoConfirmado<MarcoReferencialOutput>(supabase, projectId, "MARCO_REFERENCIAL"),
    obtenerNodoConfirmado<ObjetivosOutput>(supabase, projectId, "OBJETIVOS"),
    obtenerNodoConfirmado<MetodologiaOutput>(supabase, projectId, "METODOLOGIA"),
    obtenerNodoConfirmado<ImpactosDelimitacionOutput>(supabase, projectId, "IMPACTOS_DELIMITACION"),
  ]);

  let resumenText = "";
  try {
    const res = await generarResumen(supabase, projectId);
    resumenText = res.texto;
  } catch (e) {
    resumenText = "*(Resumen ejecutivo pendiente de confirmación de los nodos base)*";
  }

  let introText = "";
  try {
    const res = await generarIntroduccion(supabase, projectId);
    introText = res.texto;
  } catch (e) {
    introText = "*(Introducción pendiente de confirmación de los nodos base)*";
  }

  const riesgos = await listarRiesgos(supabase, projectId);

  let doc = `# PROPUESTA DE INVESTIGACIÓN: ${titulo.toUpperCase()}\n\n`;

  doc += `## RESUMEN EJECUTIVO\n\n${resumenText}\n\n`;
  
  const keywords = (project?.palabras_clave as string[]) ?? [];
  if (keywords.length > 0) {
    doc += `**Palabras clave:** ${keywords.join(", ")}\n\n`;
  }

  const abstractText = `This scientific research proposal establishes a formal methodological framework for "${titulo}". The investigation addresses critical knowledge gaps through systematic data acquisition, domain modeling, and empirical validation in accordance with academic standards.`;
  doc += `## ABSTRACT\n\n${abstractText}\n\n`;
  if (keywords.length > 0) {
    doc += `**Keywords:** ${keywords.join(", ")}\n\n`;
  }

  // Tabla de Contenido (Índice General justo después de Resumen y Abstract)
  doc += `## TABLA DE CONTENIDO\n\n`;
  doc += `- **RESUMEN EJECUTIVO**\n`;
  doc += `- **ABSTRACT**\n`;
  doc += `- **INTRODUCCIÓN**\n`;
  doc += `- **1. PLANTEAMIENTO DEL PROBLEMA Y JUSTIFICACIÓN**\n`;
  doc += `  - 1.1. Contexto y Delimitación del Objeto de Estudio\n`;
  doc += `  - 1.2. Novedad Académica, Brechas y Causas (NOVA)\n`;
  doc += `- **2. MARCO REFERENCIAL**\n`;
  doc += `  - 2.1. Marco Teórico\n`;
  doc += `  - 2.2. Marco Conceptual\n`;
  doc += `- **3. OBJETIVOS DEL PROYECTO**\n`;
  doc += `  - 3.1. Objetivo General\n`;
  doc += `  - 3.2. Objetivos Específicos\n`;
  doc += `- **4. DISEÑO METODOLÓGICO Y CADENA DE VALOR**\n`;
  doc += `  - 4.1. Marco Metodológico\n`;
  doc += `  - 4.2. Plan de Trabajo por Objetivos\n`;
  doc += `  - 4.3. Cronograma de Actividades (Gantt Operacional)\n`;
  doc += `- **5. IMPACTOS, RECURSOS Y DELIMITACIÓN**\n`;
  doc += `  - 5.1. Impactos del Proyecto\n`;
  doc += `  - 5.2. Recursos Requeridos\n`;
  doc += `- **6. PRESUPUESTO DEL PROYECTO**\n`;
  doc += `  - 6.1. Resumen General del Presupuesto\n`;
  doc += `  - 6.2. Desglose por Rubros\n`;
  doc += `  - 6.3. Cofinanciación\n`;
  doc += `- **7. MATRIZ DE RIESGOS, SUPUESTOS Y ADVERTENCIAS (L3)**\n`;
  doc += `- **8. REFERENCIAS BIBLIOGRÁFICAS**\n`;
  doc += `- **9. ANEXOS Y MATERIAL COMPLEMENTARIO**\n\n`;

  doc += `## INTRODUCCIÓN\n\n${introText}\n\n`;

  // 1. Planteamiento del problema (RUTA + NOVA)
  doc += `## 1. PLANTEAMIENTO DEL PROBLEMA Y JUSTIFICACIÓN\n\n`;
  if (ruta) {
    doc += `### 1.1. Contexto y Delimitación del Objeto de Estudio\n`;
    doc += `- **Problema central:** ${ruta.problema}\n`;
    doc += `- **Objeto de estudio:** ${ruta.objeto_estudio}\n`;
    doc += `- **Población/Contexto:** ${ruta.poblacion_contexto}\n`;
    doc += `- **Alcance espacial:** ${ruta.alcance_espacial}\n`;
    doc += `- **Alcance temporal:** ${ruta.alcance_temporal}\n\n`;
  }
  if (nova) {
    doc += `### 1.2. Novedad Académica, Brechas y Causas (NOVA)\n`;
    doc += `- **Brecha de conocimiento:** ${nova.nucleo_brecha_conocimiento}\n`;
    doc += `- **Causa raíz:** ${nova.nucleo_causa_raiz}\n`;
    doc += `- **Justificación social:** ${nova.valor_justificacion_social ?? "No definida"}\n`;
    doc += `- **Contribución al conocimiento:** ${nova.valor_contribucion ?? "No definida"}\n`;
    doc += `- **Novedad frente al estado del arte:** ${nova.avance_novedad_estado_arte ?? "No definida"}\n\n`;
    
    if (nova.nucleo_causas_estructuradas && nova.nucleo_causas_estructuradas.length > 0) {
      doc += `**Causas estructuradas:**\n`;
      nova.nucleo_causas_estructuradas.forEach((c: any) => {
        doc += `- **[${c.tipo.toUpperCase()}]** ${c.id}: ${c.texto}\n`;
      });
      doc += `\n`;
    }
  }

  // 2. Marco Referencial
  doc += `## 2. MARCO REFERENCIAL\n\n`;
  if (marco) {
    doc += `### 2.1. Marco Teórico\n`;
    doc += `- **Postura teórica:** ${marco.marco_teorico?.postura_teorica ?? "No definida"}\n`;
    doc += `- **Teorías sustantivas:** ${(marco.marco_teorico?.teorias_sustantivas ?? []).join(", ") || "Ninguna"}\n\n`;

    doc += `### 2.2. Marco Conceptual\n`;
    const conceptual = marco.marco_conceptual?.definiciones ?? [];
    if (conceptual.length > 0) {
      conceptual.forEach((d: any) => {
        doc += `- **${d.termino}:** ${d.definicion}\n`;
      });
    } else {
      doc += `*No hay definiciones conceptuales registradas.*\n`;
    }
    doc += `\n`;
  } else {
    doc += `*Marco referencial no configurado o pendiente.*\n\n`;
  }

  // 3. Objetivos
  doc += `## 3. OBJETIVOS DEL PROYECTO\n\n`;
  if (objetivos) {
    doc += `### 3.1. Objetivo General\n`;
    doc += `${objetivos.objetivo_general}\n\n`;

    doc += `### 3.2. Objetivos Específicos\n`;
    const oes = objetivos.objetivos_especificos ?? [];
    if (oes.length > 0) {
      oes.forEach((oe: any) => {
        doc += `- **${oe.id}:** ${oe.texto} *(Asociado a causa: ${oe.causa_id ?? "Ninguna"})*\n`;
      });
    } else {
      doc += `*No hay objetivos específicos registrados.*\n`;
    }
    doc += `\n`;
  } else {
    doc += `*Objetivos pendientes de configuración.*\n\n`;
  }

  // 4. Metodología
  doc += `## 4. DISEÑO METODOLÓGICO Y CADENA DE VALOR\n\n`;
  if (metodologia) {
    doc += `### 4.1. Marco Metodológico\n`;
    doc += `- **Enfoque metodológico:** ${metodologia.enfoque_metodologico}\n`;
    doc += `- **Tipo de investigación:** ${metodologia.tipo_investigacion}\n`;
    doc += `- **Diseño metodológico:** ${metodologia.diseno_metodologico}\n`;
    doc += `- **Población:** ${metodologia.poblacion}\n`;
    doc += `- **Muestra:** ${metodologia.muestra}\n\n`;

    doc += `### 4.2. Plan de Trabajo por Objetivos (Cadena de Valor)\n`;
    (metodologia.plan_por_objetivo ?? []).forEach((po: any) => {
      doc += `#### Objetivo Específico: ${po.objetivo_especifico}\n`;
      (po.productos ?? []).forEach((p: any) => {
        doc += `- **Producto esperado:** ${p.nombre_producto}\n`;
        doc += `  - **Actividades asociadas:**\n`;
        (p.actividades ?? []).forEach((act: any) => {
          doc += `    - ${act.actividad}\n`;
        });
      });
      doc += `\n`;
    });

    doc += `### 4.3. Cronograma de Actividades (Gantt Operacional)\n`;
    doc += `| Objetivo | Actividad Metodológica | T1 (Mes 1-3) | T2 (Mes 4-6) | T3 (Mes 7-9) | T4 (Mes 10-12) |\n`;
    doc += `| :--- | :--- | :---: | :---: | :---: | :---: |\n`;

    let actIdx = 1;
    (metodologia.plan_por_objetivo ?? []).forEach((po: any, oIdx: number) => {
      (po.productos ?? []).forEach((p: any) => {
        (p.actividades ?? []).forEach((act: any) => {
          const t1 = actIdx % 4 === 1 || actIdx % 4 === 2 ? "X" : "";
          const t2 = actIdx % 4 === 2 || actIdx % 4 === 3 ? "X" : "";
          const t3 = actIdx % 4 === 3 || actIdx % 4 === 0 ? "X" : "";
          const t4 = actIdx % 4 === 0 || actIdx % 4 === 1 ? "X" : "";
          doc += `| OE-${oIdx + 1} | ${act.actividad} | ${t1} | ${t2} | ${t3} | ${t4} |\n`;
          actIdx++;
        });
      });
    });
    doc += `\n`;
  } else {
    doc += `*Metodología pendiente de configuración.*\n\n`;
  }

  // 5. Impactos y Delimitación
  doc += `## 5. IMPACTOS, RECURSOS Y DELIMITACIÓN\n\n`;
  if (impactos) {
    doc += `### 5.1. Impactos del Proyecto\n`;
    const imps = impactos.impactos ?? [];
    if (imps.length > 0) {
      imps.forEach((i: any) => {
        doc += `- **[${i.tipo.toUpperCase()}]** ${i.descripcion} *(Indicador: ${i.indicador_verificacion_futura})*\n`;
      });
    } else {
      doc += `*No se registraron impactos.*\n`;
    }
    doc += `\n`;

    doc += `### 5.2. Recursos Requeridos\n`;
    const recs = impactos.recursos ?? [];
    if (recs.length > 0) {
      recs.forEach((r: any) => {
        doc += `- **[${r.categoria.toUpperCase()}]** ${r.descripcion}\n`;
      });
    } else {
      doc += `*No se registraron recursos.*\n`;
    }
    doc += `\n`;
  } else {
    doc += `*Impactos y delimitación pendientes.*\n\n`;
  }

  // 6. Presupuesto
  doc += `## 6. PRESUPUESTO DEL PROYECTO\n\n`;
  if (metodologia && metodologia.plan_por_objetivo) {
    const plan = metodologia.plan_por_objetivo;
    const total = totalPresupuestoProyecto(plan);
    const rubros = resumenPorRubro(plan);
    const fuentes = resumenPorFuente(plan);

    doc += `### 6.1. Resumen General del Presupuesto\n`;
    doc += `- **Costo total proyectado:** ${formatoCOP(total)}\n\n`;

    doc += `### 6.2. Desglose por Rubros\n`;
    doc += `| Rubro | Total |\n`;
    doc += `| :--- | :---: |\n`;
    Object.keys(RUBRO_PRESUPUESTO_LABEL).forEach((rKey) => {
      const label = RUBRO_PRESUPUESTO_LABEL[rKey as keyof typeof RUBRO_PRESUPUESTO_LABEL];
      const val = rubros[rKey as keyof typeof rubros] ?? 0;
      if (val > 0) {
        doc += `| ${label} | ${formatoCOP(val)} |\n`;
      }
    });
    doc += `\n`;

    doc += `### 6.3. Cofinanciación\n`;
    doc += `| Fuente de Financiación | Total |\n`;
    doc += `| :--- | :---: |\n`;
    Object.keys(FUENTE_PRESUPUESTO_LABEL).forEach((fKey) => {
      const label = FUENTE_PRESUPUESTO_LABEL[fKey as keyof typeof FUENTE_PRESUPUESTO_LABEL];
      const val = fuentes[fKey as keyof typeof fuentes] ?? 0;
      if (val > 0) {
        doc += `| ${label} | ${formatoCOP(val)} |\n`;
      }
    });
    doc += `\n`;
  } else {
    doc += `*Presupuesto pendiente de configuración (requiere Metodología).*\n\n`;
  }

  // 7. Riesgos y Supuestos
  doc += `## 7. MATRIZ DE RIESGOS, SUPUESTOS Y ADVERTENCIAS (L3)\n\n`;
  if (riesgos.length > 0) {
    doc += `| Origen | Descripción | Severidad | Actividad de Mitigación |\n`;
    doc += `| :--- | :--- | :---: | :--- |\n`;
    riesgos.forEach((r) => {
      const origenLabel = r.origen === "contradiccion_delta_ij" ? "Advertencia L3" :
                          r.origen === "pregunta_operativa" ? "Pregunta Operativa" :
                          r.origen === "excedente_tope" ? "Excedente" : "Error Verificador";
      doc += `| ${origenLabel} | ${r.descripcion} | ${r.severidad.toUpperCase()} | ${r.actividad_mitigacion_ref ?? "Mitigación estándar (OE-1)"} |\n`;
    });
    doc += `\n`;
  } else {
    doc += `*No se registraron riesgos ni advertencias pendientes.*\n\n`;
  }

  // 8. Referencias Bibliográficas
  doc += `## 8. REFERENCIAS BIBLIOGRÁFICAS\n\n`;
  const { data: fuentesData } = await supabase
    .from("corpus_fuentes")
    .select("titulo, autores, doi, anio, revista")
    .eq("project_id", projectId)
    .eq("estado_verificacion", "verificado")
    .order("anio", { ascending: false });

  const listaReferencias: string[] = [];

  if (fuentesData && fuentesData.length > 0) {
    fuentesData.forEach((f) => {
      const autoresStr = f.autores ? `${f.autores}.` : "Autor no especificado.";
      const anioStr = f.anio ? `(${f.anio}).` : "(s.f.).";
      const tituloStr = f.titulo ? `${f.titulo}.` : "";
      const revistaStr = f.revista ? `*${f.revista}*.` : "";
      const doiStr = f.doi ? `https://doi.org/${f.doi}` : "";
      listaReferencias.push(`- ${autoresStr} ${anioStr} ${tituloStr} ${revistaStr} ${doiStr}`.trim());
    });
  }

  if (marco) {
    const refsMarco = todasLasReferencias(marco);
    refsMarco.forEach((r) => {
      const autoresStr = r.autor ? `${r.autor}.` : "Autor no especificado.";
      const anioStr = r.año ? `(${r.año}).` : "(s.f.).";
      const tituloStr = r.titulo ? `${r.titulo}.` : "";
      const revistaStr = r.fuente ? `*${r.fuente}*.` : "";
      const doiStr = r.doi_o_isbn ? `${r.doi_o_isbn}` : "";
      const refFormatted = `- ${autoresStr} ${anioStr} ${tituloStr} ${revistaStr} ${doiStr}`.trim();
      if (!listaReferencias.includes(refFormatted)) {
        listaReferencias.push(refFormatted);
      }
    });
  }

  if (listaReferencias.length > 0) {
    listaReferencias.forEach((ref) => {
      doc += `${ref}\n`;
    });
    doc += `\n`;
  } else {
    doc += `*Las referencias bibliográficas se compilarán automáticamente a medida que se verifiquen fuentes en el módulo RSL o en el Marco Referencial.*\n\n`;
  }

  // 9. Anexos y Material Complementario
  doc += `## 9. ANEXOS Y MATERIAL COMPLEMENTARIO\n\n`;
  doc += `### Anexo A. Matriz de Trazabilidad del Grafo Científico (Hilo Dorado)\n`;
  doc += `- Matriz de consistencia lógica entre problemas (RUTA), causas/novedad (NOVA), objetivos y componentes metodológicos.\n\n`;
  doc += `### Anexo B. Registro de Evaluación de Evidencia RSL\n`;
  doc += `- Listado de fuentes bibliográficas verificadas con índices de relevancia y validación metodológica.\n\n`;
  doc += `### Anexo C. Guía de Figuras y Esquemas Conceptuales Recomendados\n`;
  doc += `- Marcadores y diagramas sugeridos para su inclusión en la versión final de publicación en LaTeX / Overleaf.\n\n`;

  return doc;
}

