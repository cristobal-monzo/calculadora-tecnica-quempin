import assert from 'node:assert/strict';
import { propiedadesGLP, densidadCondiciones, presionVaporPa, presionRocioGLPPa, PROPANO, BUTANO } from '../js/gas-glp.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Fixtures: MASTER DISEÑO.xlsm, hoja "Combustión Gas", columna GLP (E:G), 2026-09-01
const p = propiedadesGLP({ pctButano: 0.3, pctPropano: 0.7 });
cerca(p.pm, 48.305099999999996);            // F4
cerca(p.xButanoMasa, 0.3609805175850997);    // F5
cerca(p.xPropanoMasa, 0.6390194824149004);   // F6
cerca(p.r, 0.17212406143450693);             // F7
// F8/F9 CORREGIDOS (2026-09-25): base molar en vez de ponderar los átomos
// por fracción de masa — ver gas-glp.js. Excel: 0.8211624897372563 / 0.17883751026274367.
cerca(p.xCarbono, 0.820540688250309);
cerca(p.xHidrogeno, 0.17945931174969101);
cerca(p.xCarbono, 12.011 * (0.3 * 4 + 0.7 * 3) / p.pm);
cerca(p.densidadNormal, 2.155131736759461);  // F10
cerca(p.pciMasa, 45989.84889794246);         // F15
cerca(p.pcsMasa, 49904.04298924959);         // F16
cerca(p.pciSimplificadoKwhM3, 28);           // J45

cerca(densidadCondiciones({ presionKPa: 3, temperaturaC: 15, r: p.r }), 2.103430584189789); // F14

// Red de Gas (AGREGADO 2026-09-25)
cerca(p.densidadRelativa, 48.3051 / 28.9647, 1e-5);
cerca(p.pcsVolumetricoMJm3, 101.95115139684853);
// Pseudocríticas de Kay: con 50/50 reproducen Bases de Cálculo!J40:L40
const mitad = propiedadesGLP({ pctButano: 0.5, pctPropano: 0.5 });
cerca(mitad.temperaturaCriticaK, 397.45);
cerca(mitad.presionCriticaBar, 40.23);
cerca(mitad.factorAcentrico, 0.176);

// Presión de vapor (Lee-Kesler) contra NIST Chemistry WebBook a 20 °C:
// propano 8,3640 bar, n-butano 2,0800 bar — dentro de 1 %.
cerca(presionVaporPa(PROPANO, 293.15) / 1e5, 8.364, 0.01);
cerca(presionVaporPa(BUTANO, 293.15) / 1e5, 2.08, 0.01);
assert.equal(presionVaporPa(PROPANO, 380), null); // sobre Tc no hay líquido

// Presión de rocío 70/30 (Raoult): 1/(0,7/Psat_C3 + 0,3/Psat_C4)
const rocio20 = presionRocioGLPPa({ pctButano: 0.3, pctPropano: 0.7, temperaturaC: 20 });
cerca(rocio20, 1 / (0.7 / presionVaporPa(PROPANO, 293.15) + 0.3 / presionVaporPa(BUTANO, 293.15)));
cerca(rocio20 / 1e5, 4.395, 0.01);
// Más frío y más butano -> condensa a menor presión
assert.ok(presionRocioGLPPa({ pctButano: 0.3, pctPropano: 0.7, temperaturaC: 0 }) < rocio20);
assert.ok(presionRocioGLPPa({ pctButano: 0.6, pctPropano: 0.4, temperaturaC: 20 }) < rocio20);

console.log('gas-glp.test.js: OK');
