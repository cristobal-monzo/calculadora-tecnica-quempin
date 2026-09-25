// Regresión del motor de Tubería y Flujo. No hay Excel fuente para este
// módulo: los valores de referencia son los del motor el 2026-09-25, y cada
// bloque además verifica una relación física independiente (Reynolds a
// mano, conservación de masa, etc.) para que el baseline no sea circular.

import assert from 'node:assert/strict';
import { calcularFlujo } from '../js/calc-flujo.js';
import { GASES_PREDEFINIDOS } from '../js/biblioteca-gases.js';
import { buscarTuberia } from '../js/tuberias.js';

const [co2, nh3] = GASES_PREDEFINIDOS;

function cerca(actual, esperado, tolerancia = 1e-9) {
  assert.ok(Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)), `esperado ${esperado}, obtuvo ${actual}`);
}

const base = {
  presionBarG: 10, temperaturaC: 20, caudal: 50, unidadCaudal: 'kg/h', largoM: 30,
  tuberia: buscarTuberia('sch40-0.5'), factorDiseno: 0.4,
};

// --- CO₂, 10 barG, 20 °C, 50 kg/h, 1/2" Sch 40, 30 m (valores por defecto de la UI) ---
const r = calcularFlujo({ ...base, gas: co2 });
assert.equal(r.aplica, true);
assert.equal(r.fase.estado, 'gas');
cerca(r.fase.temperaturaSaturacionK - 273.15, -37.46207467249272);
cerca(r.presionMaxDisenoBar, 250.7305164319249);
assert.equal(r.tuberiaAdecuada, true);
cerca(r.z, 0.9344183046829919);
cerca(r.densidadKgM3, 21.281364573926957);
cerca(r.caudalNormalNm3H, 25.281096356587554);
cerca(r.velocidadFlujoMS, 3.3455361282039213);
cerca(r.velocidadErosionalMS, 26.443908940125905);
cerca(r.reynolds, 76487.64600295396);
cerca(r.factorFriccion, 0.027411348976233246);
cerca(r.perdidaCargaMbar, 62.14359516132247);
assert.equal(r.chequeoSonico.estado, 'ok');
// Relaciones independientes del baseline:
cerca(r.reynolds, (r.densidadKgM3 * r.velocidadFlujoMS * 0.01576) / (co2.viscosidadUPaS * 1e-6));
cerca(r.caudalRealM3H * r.densidadKgM3, 50); // conservación de masa
cerca(r.chequeoSonico.x, (r.perdidaCargaMbar * 100) / (10e5 + 101325)); // sobre presión ABSOLUTA

// Accesorios suman ΣK·ρv²/2 a la misma línea.
const conAccesorios = calcularFlujo({ ...base, gas: co2, codos: 2, tees: 1, valvulas: 3 });
cerca(conAccesorios.perdidaCargaMbar - r.perdidaCargaMbar, ((2 * 0.7 + 2 + 3 * 0.1) * r.densidadKgM3 * r.velocidadFlujoMS ** 2) / 2 / 100);

// El mismo caudal en Nm³/h o en kg/h da el mismo resultado.
const enNm3 = calcularFlujo({ ...base, gas: co2, caudal: r.caudalNormalNm3H, unidadCaudal: 'Nm3/h' });
cerca(enNm3.perdidaCargaMbar, r.perdidaCargaMbar);

// --- NH₃ como combustible: 100 kW, 2 barG ---
const n = calcularFlujo({ ...base, gas: nh3, presionBarG: 2, caudal: 100, unidadCaudal: 'kW' });
cerca(n.flujoMasicoKgH, (100 * 3.6) / 18.6);
cerca(n.z, 0.9736092506133384);
cerca(n.densidadKgM3, 2.1624909503184315);
cerca(n.velocidadFlujoMS, 12.744724428584755);
cerca(n.perdidaCargaMbar, 95.09905605124341);
assert.equal(n.fase.estado, 'gas');

// kW sin PCI: error explícito, no un caudal inventado.
assert.throws(() => calcularFlujo({ ...base, gas: co2, unidadCaudal: 'kW' }), /PCI/);

// --- Fase líquida: CO₂ a 60 barG / 20 °C condensa → no aplica ---
const liquido = calcularFlujo({ ...base, gas: co2, presionBarG: 60 });
assert.equal(liquido.aplica, false);
assert.equal(liquido.fase.estado, 'liquido');
assert.equal(liquido.perdidaCargaMbar, undefined);
cerca(liquido.presionMaxDisenoBar, 250.7305164319249); // Barlow se informa igual

// NH₃ a 8 barG / 20 °C (9 bar abs > Psat 8,6): también líquido.
assert.equal(calcularFlujo({ ...base, gas: nh3, presionBarG: 8 }).aplica, false);

// --- Presión sobre la de diseño → tubería no adecuada ---
// 8" Sch 40, F = 0,40: 10·2·241·8,18/219,1·0,40 = 71,98 bar. A 80 barG y
// 40 °C el CO₂ es supercrítico (una sola fase): el cálculo aplica, pero la
// tubería no resiste.
const alta = calcularFlujo({ ...base, gas: co2, presionBarG: 80, temperaturaC: 40, tuberia: buscarTuberia('sch40-8') });
cerca(alta.presionMaxDisenoBar, (10 * 2 * 241 * 8.18 / 219.1) * 0.4);
assert.equal(alta.fase.estado, 'supercritico');
assert.equal(alta.aplica, true);
assert.equal(alta.tuberiaAdecuada, false);

console.log('calc-flujo.test.js OK');
