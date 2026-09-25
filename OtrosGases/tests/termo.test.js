// Peng-Robinson y Lee-Kesler contra datos de referencia del NIST Chemistry
// WebBook (SRD 69, consultado 2026-09-25 — tablas de saturación e
// isotermas de CO₂ y NH₃). Las tolerancias documentan la exactitud real de
// una EOS cúbica generalizada, no son holgura arbitraria: ver
// OtrosGases/CLAUDE.md, sección "Exactitud frente a NIST".

import assert from 'node:assert/strict';
import {
  raicesCubica, factorZ, densidadReal, presionVaporPa, temperaturaSaturacionK,
  estadoFase, densidadNormal, celsiusAKelvin,
} from '../js/termo.js';
import { GASES_PREDEFINIDOS } from '../js/biblioteca-gases.js';

const [co2, nh3] = GASES_PREDEFINIDOS;

function dentroDe(actual, referencia, toleranciaRelativa, etiqueta) {
  const error = Math.abs(actual / referencia - 1);
  assert.ok(error <= toleranciaRelativa,
    `${etiqueta}: ${actual} vs NIST ${referencia} (error ${(error * 100).toFixed(2)} % > ${toleranciaRelativa * 100} %)`);
}

function densidad(gas, presionBarAbs, temperaturaC) {
  const presionAbsPa = presionBarAbs * 1e5;
  const temperaturaK = celsiusAKelvin(temperaturaC);
  const z = factorZ({ gas, presionAbsPa, temperaturaK });
  return densidadReal({ gas, presionAbsPa, temperaturaK, z });
}

// --- Cúbica: raíces conocidas y raíz triple ---
assert.deepEqual(raicesCubica(-6, 11, -6).map((r) => Math.round(r * 1e9) / 1e9), [1, 2, 3]); // (z-1)(z-2)(z-3)
assert.equal(raicesCubica(0, 0, -8).length, 1);
assert.ok(Math.abs(raicesCubica(0, 0, -8)[0] - 2) < 1e-12);

// En el punto crítico la cúbica de Peng-Robinson tiene raíz triple en
// Zc = 0,30740 (propiedad de la ecuación, no del gas). Raíz triple → la
// precisión numérica cae a ~1e-3 (raíz cúbica del error de redondeo).
for (const gas of [co2, nh3]) {
  const zc = factorZ({ gas, presionAbsPa: gas.presionCriticaBar * 1e5, temperaturaK: gas.temperaturaCriticaK });
  assert.ok(Math.abs(zc - 0.3074) < 2e-3, `Zc de ${gas.formula} = ${zc}`);
}

// --- Densidad del gas (Peng-Robinson) ---
dentroDe(densidad(co2, 1.01325, 0), 1.97681, 0.002, 'CO₂ 0 °C / 1 atm');
dentroDe(densidad(nh3, 1.01325, 0), 0.771546, 0.006, 'NH₃ 0 °C / 1 atm');
dentroDe(densidad(co2, 1, 20), 1.81516, 0.002, 'CO₂ 20 °C / 1 bar');
dentroDe(densidad(nh3, 1, 20), 0.706588, 0.004, 'NH₃ 20 °C / 1 bar');
dentroDe(densidad(nh3, 5, 20), 3.71105, 0.02, 'NH₃ 20 °C / 5 bar');
dentroDe(densidad(co2, 50, 20), 140.648, 0.03, 'CO₂ 20 °C / 50 bar (7 bar bajo saturación)');
// Supercrítico denso, cerca del punto crítico: la zona conocida donde
// Peng-Robinson subestima la densidad (~10 %). El test fija que el error
// no empeore y que se tome la raíz correcta (una raíz "de gas" daría ~150).
dentroDe(densidad(co2, 100, 40), 628.612, 0.11, 'CO₂ 40 °C / 100 bar (supercrítico)');
dentroDe(densidad(nh3, 150, 160), 156.182, 0.07, 'NH₃ 160 °C / 150 bar (supercrítico, Tr 1,07)');
// Ya lejos del punto crítico vuelve al error típico de la cúbica (1-3 %).
dentroDe(densidad(co2, 100, 92), 199.778, 0.02, 'CO₂ 92 °C / 100 bar (Tr 1,20)');
dentroDe(densidad(co2, 150, 120), 280.359, 0.02, 'CO₂ 120 °C / 150 bar (Tr 1,29)');
const n2 = { ...co2, masaMolarGMol: 28.0134, temperaturaCriticaK: 126.192, presionCriticaBar: 33.958, factorAcentrico: 0.0372 };
dentroDe(densidad(n2, 200, 20), 218.544, 0.035, 'N₂ 20 °C / 200 bar (Tr 2,3)');

const normalCo2 = densidadNormal(co2);
assert.equal(normalCo2.ideal, false);
dentroDe(normalCo2.densidadKgM3, 1.97681, 0.002, 'densidad normal CO₂');

// Un gas que a 0 °C / 1 atm sería líquido: Nm³ de gas ideal, marcado.
const pentano = { ...co2, masaMolarGMol: 72.15, temperaturaCriticaK: 469.7, presionCriticaBar: 33.7, factorAcentrico: 0.252 };
const normalPentano = densidadNormal(pentano);
assert.equal(normalPentano.ideal, true);
assert.equal(normalPentano.z, 1);

// --- Presión de vapor (Lee-Kesler) ---
const PSAT_NIST_CO2 = [[-20, 19.6963], [0, 34.8514], [10, 45.0219], [20, 57.2906], [30, 72.1369]];
for (const [c, ref] of PSAT_NIST_CO2) {
  dentroDe(presionVaporPa({ gas: co2, temperaturaK: celsiusAKelvin(c) }) / 1e5, ref, 0.01, `Psat CO₂ ${c} °C`);
}
const PSAT_NIST_NH3 = [[0, 4.2925], [20, 8.5704], [40, 15.5453]];
for (const [c, ref] of PSAT_NIST_NH3) {
  dentroDe(presionVaporPa({ gas: nh3, temperaturaK: celsiusAKelvin(c) }) / 1e5, ref, 0.01, `Psat NH₃ ${c} °C`);
}
// Lee-Kesler pierde exactitud en el NH₃ (polar) a baja temperatura reducida:
// ~3 % a −20 °C, ~5 % en el punto de ebullición normal. Documentado, no oculto.
dentroDe(presionVaporPa({ gas: nh3, temperaturaK: celsiusAKelvin(-20) }) / 1e5, 1.9002, 0.03, 'Psat NH₃ −20 °C');
dentroDe(presionVaporPa({ gas: nh3, temperaturaK: celsiusAKelvin(-33.33) }) / 1e5, 1.0125, 0.05, 'Psat NH₃ −33,33 °C');

assert.equal(presionVaporPa({ gas: co2, temperaturaK: celsiusAKelvin(35) }), null); // sobre Tc
// En Tc la correlación vuelve a Pc (Tr = 1 → ln Pr ≈ 0).
dentroDe(presionVaporPa({ gas: co2, temperaturaK: co2.temperaturaCriticaK - 1e-6 }), co2.presionCriticaBar * 1e5, 1e-3, 'Psat en Tc');

// Temperatura de condensación: inversa exacta de la presión de vapor.
for (const c of [-10, 5, 25]) {
  const p = presionVaporPa({ gas: co2, temperaturaK: celsiusAKelvin(c) });
  assert.ok(Math.abs(temperaturaSaturacionK({ gas: co2, presionAbsPa: p }) - celsiusAKelvin(c)) < 1e-6);
}
assert.equal(temperaturaSaturacionK({ gas: co2, presionAbsPa: 80e5 }), null); // sobre Pc

// --- Estado de fase ---
const fase = (gas, bar, c) => estadoFase({ gas, presionAbsPa: bar * 1e5, temperaturaK: celsiusAKelvin(c) }).estado;
assert.equal(fase(co2, 11, 20), 'gas');
assert.equal(fase(co2, 50, 20), 'cerca-condensacion'); // condensa a 14,4 °C: margen < 10 K
assert.equal(fase(co2, 58, 20), 'liquido');            // sobre la Psat de 57,2 bar
assert.equal(fase(co2, 100, 40), 'supercritico');     // Tr 1,03: zona crítica
assert.equal(fase(co2, 100, 92), 'gas');              // Tr 1,20: gas comprimido común
assert.equal(fase(n2, 200, 20), 'gas');               // N₂ de cilindro: lejos del punto crítico
assert.equal(fase(co2, 60, 40), 'gas');                // sobre Tc, bajo Pc
assert.equal(fase(nh3, 3, 20), 'gas');
assert.equal(fase(nh3, 9, 20), 'liquido');             // Psat NH₃ 20 °C ≈ 8,6 bar

console.log('termo.test.js OK');
