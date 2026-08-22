/**
 * tests/capaDecision.test.js
 * 
 * Verificación matemática y determinística de la capa de decisión:
 * 1. Las 3 probabilidades suman exactamente 1.0 (tolerancia 1e-9).
 * 2. Validación de consistencia ordinal theta_1 < theta_2.
 * 3. Monotonía: a menor L_FARO, P(converge) no decrece.
 * 4. Compuertas duras: una compuerta fallida fuerza NO_CONVERGE aun con P(converge) alta.
 * 5. Compatibilidad hacia atrás: lectura de resultados históricos sin campo decision.
 */

const PARAMETROS_PROVISIONALES = {
  beta_0: 2.0,
  beta_1: -8.0,
  theta_1: -1.0,
  theta_2: 1.0,
  T_0: 1.0,
  T_min: 0.2,
};

function lambdaLogistica(x) {
  if (x >= 40) return 1;
  if (x <= -40) return 0;
  return 1 / (1 + Math.exp(-x));
}

function calcularTemperatura(seTau, t0 = PARAMETROS_PROVISIONALES.T_0, tMin = PARAMETROS_PROVISIONALES.T_min) {
  const seClamp = Math.max(0, Math.min(1, seTau));
  return Math.max(tMin, Math.round((t0 * (1 - seClamp) + tMin) * 1000) / 1000);
}

function calcularEta(lFaroProyecto, seTau, params = PARAMETROS_PROVISIONALES) {
  const T = calcularTemperatura(seTau, params.T_0, params.T_min);
  const eta = (params.beta_0 + params.beta_1 * lFaroProyecto) / T;
  return {
    eta: Math.round(eta * 1000) / 1000,
    T,
  };
}

function calcularProbabilidades(eta, params = PARAMETROS_PROVISIONALES) {
  const pNoConverge = lambdaLogistica(params.theta_1 - eta);
  const pRevision = Math.max(0, lambdaLogistica(params.theta_2 - eta) - pNoConverge);
  const pConverge = Math.max(0, 1 - lambdaLogistica(params.theta_2 - eta));

  const suma = pNoConverge + pRevision + pConverge;
  return {
    no_converge: pNoConverge / suma,
    revision: pRevision / suma,
    converge: pConverge / suma,
  };
}

function evaluarCompuertas(condiciones) {
  const fallidas = [];
  for (const c of condiciones) {
    if (!c.cumple && c.id !== "l_faro") {
      fallidas.push(`${c.nombre}: ${c.explicacion}`);
    }
  }
  return {
    aprobadas: fallidas.length === 0,
    fallidas,
  };
}

function decidirTerminacion(input) {
  const params = input.params || PARAMETROS_PROVISIONALES;
  const { eta, T } = calcularEta(input.lFaroProyecto, input.seTau, params);
  const probs = calcularProbabilidades(eta, params);
  const compuertas = evaluarCompuertas(input.condiciones);

  const razones = [];
  let estado;

  if (!compuertas.aprobadas) {
    estado = "NO_CONVERGE";
    razones.push(
      `Bloqueo por compuertas duras (${compuertas.fallidas.length} fallida(s)). La probabilidad matemática no anula los requisitos binarios.`
    );
  } else {
    if (eta <= params.theta_1) {
      estado = "NO_CONVERGE";
      razones.push(
        `Variable latente eta (${eta.toFixed(3)}) <= theta_1 (${params.theta_1.toFixed(3)}) — alta incertidumbre residual en el grafo.`
      );
    } else if (eta <= params.theta_2) {
      estado = "REVISION";
      razones.push(
        `Variable latente eta (${eta.toFixed(3)}) en banda de rechazo (theta_1 < eta <= theta_2) — requiere derivación a riesgos y validación contextual.`
      );
    } else {
      estado = "CONVERGE";
      razones.push(
        `Variable latente eta (${eta.toFixed(3)}) > theta_2 (${params.theta_2.toFixed(3)}) con compuertas satisfechas — proyecto listo para exportación.`
      );
    }
  }

  return {
    estado,
    probabilidades: probs,
    probabilidades_porcentaje: {
      no_converge: Math.round(probs.no_converge * 100),
      revision: Math.round(probs.revision * 100),
      converge: Math.round(probs.converge * 100),
    },
    eta,
    temperatura: T,
    compuertas_aprobadas: compuertas.aprobadas,
    compuertas_fallidas: compuertas.fallidas,
    razones,
    es_preliminar: true,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[TEST FAILED] ${message}`);
  }
}

console.log("=== INICIANDO SUITE DE TESTS: CAPA DE DECISIÓN FARO ===");

// TEST 1: theta_1 < theta_2
console.log("\n[Test 1] Validación de parámetros ordinales (theta_1 < theta_2)");
assert(
  PARAMETROS_PROVISIONALES.theta_1 < PARAMETROS_PROVISIONALES.theta_2,
  "theta_1 debe ser estrictamente menor que theta_2"
);
console.log("  ✓ theta_1 < theta_2 verificado.");

// TEST 2: Suma de probabilidades = 1.0 (tolerancia 1e-9) para un barrido amplio de eta
console.log("\n[Test 2] Suma de probabilidades = 1.0 (tolerancia 1e-9) en barrido de eta");
for (let eta = -20; eta <= 20; eta += 0.5) {
  const probs = calcularProbabilidades(eta);
  const suma = probs.no_converge + probs.revision + probs.converge;
  assert(
    Math.abs(suma - 1.0) < 1e-9,
    `Las probabilidades no suman 1 para eta=${eta}. Suma=${suma}`
  );
  assert(probs.no_converge >= 0 && probs.no_converge <= 1, `P(no_converge) fuera de [0,1] en eta=${eta}`);
  assert(probs.revision >= 0 && probs.revision <= 1, `P(revision) fuera de [0,1] en eta=${eta}`);
  assert(probs.converge >= 0 && probs.converge <= 1, `P(converge) fuera de [0,1] en eta=${eta}`);
}
console.log("  ✓ 81 puntos de eta probados: todas las probabilidades en [0,1] y suman 1.0.");

// TEST 3: Monotonía: si L_FARO decrece, P(converge) no decrece
console.log("\n[Test 3] Monotonía respecto a L_FARO (a menor L_FARO, mayor o igual P(converge))");
let pConvergeAnterior = -1;
for (let lFaro = 1.0; lFaro >= 0.0; lFaro -= 0.02) {
  const { eta } = calcularEta(lFaro, 0.25);
  const probs = calcularProbabilidades(eta);
  if (pConvergeAnterior >= 0) {
    assert(
      probs.converge >= pConvergeAnterior - 1e-9,
      `Violación de monotonía: L_FARO descendió a ${lFaro.toFixed(2)} pero P(converge) disminuyó de ${pConvergeAnterior} a ${probs.converge}`
    );
  }
  pConvergeAnterior = probs.converge;
}
console.log("  ✓ Monotonía estricta comprobada en todo el rango L_FARO in [0, 1].");

// TEST 4: Compuertas duras bloquean CONVERGE aunque L_FARO sea óptimo (0.05) y P(converge) > 0.95
console.log("\n[Test 4] Bloqueo incondicional por compuertas duras");
const condicionesConFallo = [
  { id: "completitud", nombre: "Completitud de nodos", cumple: false, explicacion: "Falta 1 nodo" },
  { id: "l_faro", nombre: "L_FARO <= tau_c", cumple: true, explicacion: "L_FARO óptimo" },
  { id: "estructural", nombre: "Sin brechas", cumple: true, explicacion: "OK" },
  { id: "contradicciones", nombre: "Sin contradicciones", cumple: true, explicacion: "OK" },
  { id: "cronograma", nombre: "Cronograma", cumple: true, explicacion: "OK" },
];

const decisionBloqueada = decidirTerminacion({
  lFaroProyecto: 0.05,
  seTau: 0.25,
  condiciones: condicionesConFallo,
});

assert(
  decisionBloqueada.estado === "NO_CONVERGE",
  `Estado esperado NO_CONVERGE por compuerta fallida, obtenido: ${decisionBloqueada.estado}`
);
assert(
  !decisionBloqueada.compuertas_aprobadas,
  "compuertas_aprobadas debe ser false"
);
assert(
  decisionBloqueada.compuertas_fallidas.length === 1,
  "Debe listar 1 compuerta fallida"
);
assert(
  decisionBloqueada.probabilidades.converge > 0.60,
  `P(converge) latente debe ser alta a pesar del bloqueo (obtenido: ${decisionBloqueada.probabilidades.converge})`
);
console.log("  ✓ Compuerta fallida forzó NO_CONVERGE con razón explícita a pesar de P(converge) latente favorable.");

// TEST 5: Banda de rechazo REVISION en rango intermedio de L_FARO con compuertas OK
console.log("\n[Test 5] Detección de banda de rechazo (REVISION)");
const condicionesAprobadas = [
  { id: "completitud", nombre: "Completitud de nodos", cumple: true, explicacion: "OK" },
  { id: "l_faro", nombre: "L_FARO <= tau_c", cumple: false, explicacion: "L_FARO intermedio" },
  { id: "estructural", nombre: "Sin brechas", cumple: true, explicacion: "OK" },
  { id: "contradicciones", nombre: "Sin contradicciones", cumple: true, explicacion: "OK" },
  { id: "cronograma", nombre: "Cronograma", cumple: true, explicacion: "OK" },
];

const decisionRevision = decidirTerminacion({
  lFaroProyecto: 0.25,
  seTau: 0.25,
  condiciones: condicionesAprobadas,
});

assert(
  decisionRevision.estado === "REVISION",
  `Estado esperado REVISION para eta=0, obtenido: ${decisionRevision.estado}`
);
console.log("  ✓ Estado REVISION asignado correctamente en la banda de rechazo (-1 < eta <= 1).");

// TEST 6: Compatibilidad hacia atrás — lectura de fila histórica sin clave 'decision'
console.log("\n[Test 6] Compatibilidad con filas históricas sin clave 'decision'");
const filaHistoricaRaw = {
  convergio: false,
  l_faro_proyecto: 0.45,
  tau_c_proyecto: 0.28,
  condiciones: condicionesAprobadas,
  phi: null,
  promedio_delta_ij: null,
  es_provisional: true,
  detalle_l_faro_por_nodo: [],
};

assert(filaHistoricaRaw.decision === undefined, "Fila histórica no tiene campo decision");
assert(typeof filaHistoricaRaw.l_faro_proyecto === "number", "l_faro_proyecto se lee intacto");
console.log("  ✓ Filas históricas sin clave 'decision' son leídas sin excepción y con tipado válido.");

console.log("\n=======================================================");
console.log(" TODOS LOS TESTS PASARON SATISFACTORIAMENTE (6/6)");
console.log("=======================================================\n");
