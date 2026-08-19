const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/ANON_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const piniaProjectId = '63e3aa2f-0eec-4628-a1c3-0380d3922025';
  console.log("=== RUNNING FARO PLATFORM DB DIAGNOSTIC ===");
  console.log("Project ID (Piña):", piniaProjectId);

  // Query distinct tipo from grafo_nodos
  const { data: distinctTipos, error: errTipos } = await supabase
    .from('grafo_nodos')
    .select('tipo');
  
  if (errTipos) {
    console.error("Error fetching tipos:", errTipos.message);
  } else {
    const tipos = [...new Set(distinctTipos.map(r => r.tipo))].sort();
    console.log("\n1. DISTINCT values in grafo_nodos.tipo:", tipos);
  }

  // Query distinct nodo_tipo from preguntas_pendientes
  const { data: distinctNodoTipos, error: errNodoTipos } = await supabase
    .from('preguntas_pendientes')
    .select('nodo_tipo');
  
  if (errNodoTipos) {
    console.error("Error fetching nodo_tipos:", errNodoTipos.message);
  } else {
    const nodoTipos = [...new Set(distinctNodoTipos.map(r => r.nodo_tipo))].sort();
    console.log("2. DISTINCT values in preguntas_pendientes.nodo_tipo:", nodoTipos);
  }

  // Query distinct estado from preguntas_pendientes
  const { data: distinctEstados, error: errEstados } = await supabase
    .from('preguntas_pendientes')
    .select('estado');
  
  if (errEstados) {
    console.error("Error fetching states:", errEstados.message);
  } else {
    const estados = [...new Set(distinctEstados.map(r => r.estado))].sort();
    console.log("3. DISTINCT values in preguntas_pendientes.estado:", estados);
  }

  // 4. Count of nodes by tipo and confirmado_humano for project piña
  const { data: piniaNodes, error: errPiniaNodes } = await supabase
    .from('grafo_nodos')
    .select('tipo, confirmado_humano, iteracion')
    .eq('project_id', piniaProjectId);

  if (errPiniaNodes) {
    console.error("Error fetching piña nodes:", errPiniaNodes.message);
  } else {
    console.log("\n4. Nodos for project piña by tipo and confirmado_humano:");
    const summary = {};
    piniaNodes.forEach(node => {
      const key = `${node.tipo} (confirmado: ${node.confirmado_humano})`;
      if (!summary[key]) {
        summary[key] = { count: 0, max_iter: -1 };
      }
      summary[key].count++;
      if (node.iteracion > summary[key].max_iter) {
        summary[key].max_iter = node.iteracion;
      }
    });
    console.log(JSON.stringify(summary, null, 2));
  }

  // 5. State of questions for project piña
  const { data: piniaQuestions, error: errPiniaQuestions } = await supabase
    .from('preguntas_pendientes')
    .select('nodo_tipo, prioridad, estado')
    .eq('project_id', piniaProjectId);

  if (errPiniaQuestions) {
    console.error("Error fetching piña questions:", errPiniaQuestions.message);
  } else {
    console.log("\n5. Questions for project piña by nodo_tipo, prioridad, estado:");
    const qSummary = {};
    piniaQuestions.forEach(q => {
      const key = `${q.nodo_tipo} | ${q.prioridad} | ${q.estado}`;
      qSummary[key] = (qSummary[key] || 0) + 1;
    });
    console.log(JSON.stringify(qSummary, null, 2));
  }
}

run();
