// Regresión del motor de la Memoria de Cálculo (red ramificada). Sin Excel
// fuente: cada tramo debe dar EXACTAMENTE lo mismo que "Tubería y Flujo"
// con las mismas entradas (el motor lo reutiliza), y la acumulación se
// verifica con relaciones de suma independientes del baseline.

import assert from 'node:assert/strict';
import { calcularRed } from '../js/calc-memoria.js';
import { calcularFlujo } from '../js/calc-flujo.js';
import { GASES_PREDEFINIDOS } from '../js/biblioteca-gases.js';
import { buscarTuberia } from '../js/tuberias.js';

const [co2, nh3] = GASES_PREDEFINIDOS;

function cerca(actual, esperado, tolerancia = 1e-9) {
  assert.ok(Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)), `esperado ${esperado}, obtuvo ${actual}`);
}

const opciones = { gas: co2, unidadCaudal: 'kg/h', factorDiseno: 0.4 };
const tramo = (id, padre, cambios = {}) => ({
  id, nombre: id, continuaDesdeId: padre, reseteaAcumulada: false,
  presionBarG: 10, temperaturaC: 20, longitudM: 30, caudal: 50,
  tuberiaId: 'sch40-0.5', material: 'Acero A106 Gr. B', ...cambios,
});

// --- Un tramo = "Tubería y Flujo" con las mismas entradas (sin accesorios) ---
const [solo] = calcularRed([tramo('A', null)], opciones);
const flujo = calcularFlujo({
  gas: co2, presionBarG: 10, temperaturaC: 20, caudal: 50, unidadCaudal: 'kg/h', largoM: 30,
  tuberia: buscarTuberia('sch40-0.5'), factorDiseno: 0.4,
});
assert.equal(solo.aplica, true);
cerca(solo.perdidaParcialMbar, flujo.perdidaCargaMbar);
cerca(solo.perdidaParcialMbar, 62.14359516132247); // baseline de calc-flujo.test.js
cerca(solo.velocidadFlujoMS, flujo.velocidadFlujoMS);
cerca(solo.velocidadErosionalMS, flujo.velocidadErosionalMS);
cerca(solo.densidadKgM3, flujo.densidadKgM3);
cerca(solo.presionMaxDisenoBar, flujo.presionMaxDisenoBar);
cerca(solo.perdidaAcumuladaMbar, solo.perdidaParcialMbar);

// --- Red ramificada A → B → (C1, C2) ---
const red = calcularRed([
  tramo('A', null),
  tramo('B', 'A', { longitudM: 5, caudal: 40 }),
  tramo('C1', 'B', { longitudM: 2, caudal: 20, tuberiaId: 'sch40-0.375' }),
  tramo('C2', 'B', { longitudM: 8, caudal: 20, tuberiaId: 'sch40-0.375' }),
], opciones);
const p = Object.fromEntries(red.map((t) => [t.id, t]));
cerca(p.B.perdidaAcumuladaMbar, p.B.perdidaParcialMbar + p.A.perdidaAcumuladaMbar);
cerca(p.C1.perdidaAcumuladaMbar, p.C1.perdidaParcialMbar + p.B.perdidaAcumuladaMbar);
cerca(p.C2.perdidaAcumuladaMbar, p.C2.perdidaParcialMbar + p.B.perdidaAcumuladaMbar);
// Mismo caudal y tubería, 4x el largo → 4x la pérdida del tramo (Darcy-Weisbach lineal en L).
cerca(p.C2.perdidaParcialMbar, 4 * p.C1.perdidaParcialMbar);

// --- Reinicio de la acumulada (regulador) en B: C1 hereda desde B ---
const conReinicio = calcularRed([
  tramo('A', null),
  tramo('B', 'A', { reseteaAcumulada: true, presionBarG: 2 }),
  tramo('C', 'B', { presionBarG: 2 }),
], opciones);
const r = Object.fromEntries(conReinicio.map((t) => [t.id, t]));
cerca(r.B.perdidaAcumuladaMbar, r.B.perdidaParcialMbar);
cerca(r.C.perdidaAcumuladaMbar, r.C.perdidaParcialMbar + r.B.perdidaParcialMbar);

// --- Tramo en fase líquida (CO₂ a 60 barG y 20 °C, sobre su Psat ~57 bar abs) ---
const conLiquido = calcularRed([
  tramo('A', null, { presionBarG: 60 }),
  tramo('B', 'A'),
  tramo('C', 'B', { reseteaAcumulada: true }),
], opciones);
const l = Object.fromEntries(conLiquido.map((t) => [t.id, t]));
assert.equal(l.A.aplica, false);
assert.equal(l.A.fase.estado, 'liquido');
assert.equal(l.A.perdidaParcialMbar, null);
assert.equal(l.A.velocidadFlujoMS, null);
assert.ok(l.A.presionMaxDisenoBar > 0); // Barlow no depende del fluido
assert.equal(l.B.aplica, true);
assert.equal(l.B.perdidaAcumuladaMbar, null); // hereda de un tramo sin resultado
cerca(l.C.perdidaAcumuladaMbar, l.C.perdidaParcialMbar); // el reinicio corta la cadena

// --- Caudal en Nm³/h o kW: mismo flujo másico, mismo resultado ---
const [enNm3] = calcularRed([tramo('A', null, { caudal: flujo.caudalNormalNm3H })], { ...opciones, unidadCaudal: 'Nm3/h' });
cerca(enNm3.perdidaParcialMbar, solo.perdidaParcialMbar);
const [nh3Kg] = calcularRed([tramo('A', null, { presionBarG: 3 })], { ...opciones, gas: nh3 });
const [nh3Kw] = calcularRed([tramo('A', null, { presionBarG: 3, caudal: (50 * nh3.pciMJkg) / 3.6 })], { ...opciones, gas: nh3, unidadCaudal: 'kW' });
cerca(nh3Kw.perdidaParcialMbar, nh3Kg.perdidaParcialMbar);

// --- Tubería manual igual a la fila de tabla → mismo resultado ---
const fila = buscarTuberia('sch40-0.5');
const [manual] = calcularRed([tramo('A', null, {
  tuberiaId: 'manual',
  tuberiaManual: { diMm: fila.diMm, espesorMm: fila.espesorMm, limiteElasticoMPa: fila.limiteElasticoMPa, rugosidadMm: fila.rugosidadMm },
})], opciones);
cerca(manual.perdidaParcialMbar, solo.perdidaParcialMbar);
cerca(manual.presionMaxDisenoBar, solo.presionMaxDisenoBar);

// --- Errores de topología: explícitos, sin cuelgue ---
assert.throws(() => calcularRed([tramo('X', 'Y'), tramo('Y', 'X')], opciones), /[Cc]iclo/);
// Un reinicio dentro del ciclo corta la suma, pero el ciclo sigue siendo un error.
assert.throws(() => calcularRed([tramo('X', 'Y'), tramo('Y', 'X', { reseteaAcumulada: true })], opciones), /[Cc]iclo/);
// Ciclo que no incluye al tramo desde el que se recorre (Z → X ⇄ Y).
assert.throws(() => calcularRed([tramo('Z', 'X'), tramo('X', 'Y', { reseteaAcumulada: true }), tramo('Y', 'X')], opciones), /[Cc]iclo/);
assert.throws(() => calcularRed([tramo('X', 'Z')], opciones), /no existe/);

console.log('calc-memoria.test.js OK');
