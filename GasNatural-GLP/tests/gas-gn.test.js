import assert from 'node:assert/strict';
import { propiedadesGN, densidadCondiciones } from '../js/gas-gn.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Fixtures: MASTER DISEÑO.xlsm, hoja "Combustión Gas", columna GN (E:G), 2026-09-01
const p = propiedadesGN({
  pctMetano: 0.97, pctEtano: 0.011, pctPropano: 0.001, pctButano: 0.001,
  pctDioxidoC: 0.01, pctNitrogeno: 0.007,
});
cerca(p.pm, 16.630882);                     // F28
cerca(p.xMetanoMasa, 0.9357116477646826);    // F29
cerca(p.xEtanoMasa, 0.019888903065994938);   // F30
cerca(p.xPropanoMasa, 0.002651513010554702); // F31
cerca(p.xButanoMasa, 0.0034949439242007727); // F32
cerca(p.xDioxidoCMasa, 0.02646221649579379); // F33
cerca(p.xNitrogenoMasa, 0.011790775738773206); // F34
cerca(p.r, 0.49994161464196546);             // F35
cerca(p.xCarbono, 0.7039167564396702);       // F36
cerca(p.xHidrogeno, 0.228709769409532);      // F37
cerca(p.xOxigeno, 0.048467783885011426);     // F38
cerca(p.xNitrogeno, 0.01890569026578641);    // F39
cerca(p.densidadNormal, 0.7419866972328316); // F40
cerca(p.pciMasa, 52737.48360189195);         // F45

cerca(densidadCondiciones({ presionKPa: 2, temperaturaC: 10, r: p.r }), 0.7299104131610814); // F44

console.log('gas-gn.test.js: OK');
