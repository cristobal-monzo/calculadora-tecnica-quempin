// Motor de cálculo de la pestaña "Memoria de Cálculo" — red de tramos
// ramificada para Red de Gas (GLP/GN). Mismo patrón que
// Hidrogeno/js/calc-memoria.js, pero NO reimplementa la física de
// Renouard/Peng-Robinson: cada tramo se resuelve con calcularRedGas(), ya
// existente en calc-red-gas.js, inyectando el gas vigente (selector
// global Combustible, no un campo por tramo) en cada llamada — cualquier
// corrección futura a Red de Gas se hereda automáticamente acá, sin
// duplicar fórmulas. Ver
// docs/superpowers/specs/2026-09-02-memoria-calculo-glp-gn-design.md.
//
// La composición del gas también es de toda la red (2026-09-25): se pasa
// junto con el gas y cada tramo la hereda — ver calc-red-gas.js.
//
// Deliberadamente NO encadena presión entre tramos: cada tramo recibe su
// propia presionInicialPa como input manual (mismo criterio que
// Hidrogeno, ver el spec) — perdidaAcumuladaPa solo suma para reportar.

import { calcularRedGas } from './calc-red-gas.js';

function calcularTramoIndividual(tramo, gas, composicion) {
  const resultado = calcularRedGas({ ...tramo, gas, composicion });
  return { ...tramo, ...resultado };
}

export function calcularRedMemoria(tramos, gas, composicion) {
  const calculados = tramos.map((t) => calcularTramoIndividual(t, gas, composicion));
  const porId = new Map(calculados.map((t) => [t.id, t]));

  for (const t of calculados) {
    if (t.continuaDesdeId !== null && t.continuaDesdeId !== undefined && !porId.has(t.continuaDesdeId)) {
      throw new Error(`El tramo "${t.nombre}" continúa desde "${t.continuaDesdeId}", que no existe en la red.`);
    }
  }

  const acumuladaCache = new Map();
  const enProgreso = new Set();

  function perdidaAcumulada(id) {
    if (acumuladaCache.has(id)) return acumuladaCache.get(id);
    if (enProgreso.has(id)) {
      throw new Error(`Ciclo detectado en la red de tramos, involucrando "${id}".`);
    }
    enProgreso.add(id);
    const tramo = porId.get(id);
    // Punto de reseteo (mismo criterio que Hidrogeno/js/calc-memoria.js):
    // un tramo con reseteaAcumulada=true ignora la acumulada heredada de
    // su padre, como si fuera raíz — modela un regulador de presión que
    // reinicia la referencia.
    const heredaBase = tramo.continuaDesdeId && !tramo.reseteaAcumulada;
    const base = heredaBase ? perdidaAcumulada(tramo.continuaDesdeId) : 0;
    // Pérdida TOTAL del tramo (fricción + variación por altura, D.S. 66
    // e.2 — ver calc-red-gas.js), 2026-09-25.
    const total = tramo.perdidaPresionTotalPa + base;
    enProgreso.delete(id);
    acumuladaCache.set(id, total);
    return total;
  }

  for (const t of calculados) {
    t.perdidaAcumuladaPa = perdidaAcumulada(t.id);
  }

  return calculados;
}
