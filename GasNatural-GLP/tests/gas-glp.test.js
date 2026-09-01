import assert from 'node:assert/strict';
import { propiedadesGLP, densidadCondiciones } from '../js/gas-glp.js';

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
cerca(p.xCarbono, 0.8211624897372563);       // F8
cerca(p.xHidrogeno, 0.17883751026274367);    // F9
cerca(p.densidadNormal, 2.155131736759461);  // F10
cerca(p.pciMasa, 45989.84889794246);         // F15
cerca(p.pcsMasa, 49904.04298924959);         // F16
cerca(p.pciSimplificadoKwhM3, 28);           // J45

cerca(densidadCondiciones({ presionKPa: 3, temperaturaC: 15, r: p.r }), 2.103430584189789); // F14

console.log('gas-glp.test.js: OK');
