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

// F36:F39 CORREGIDOS respecto al Excel (2026-09-25, ver nota en
// gas-gn.js): masa de cada elemento por mol de mezcla en base MOLAR. El
// Excel mezclaba masa (carbono) con molar (hidrógeno); la corrección del
// 2026-09-01 pasó todo a masa (xCarbono 0.7058, xHidrogeno 0.2267), que
// tampoco es la fracción elemental real.
cerca(p.xCarbono, 0.728710101659009);
cerca(p.xHidrogeno, 0.24025842991464316);
cerca(p.xOxigeno, 0.01924069977725789);
cerca(p.xNitrogeno, 0.0117907686490899);
// Verificación independiente: masa de C por mol de mezcla / PM
cerca(p.xCarbono, 12.011 * (0.97 + 2 * 0.011 + 3 * 0.001 + 4 * 0.001 + 0.01) / p.pm, 1e-4);

cerca(p.densidadNormal, 0.7419866972328316); // F40
// F45 CORREGIDO (2026-09-25): PCI del metano 55050 → 50010 kJ/kg (el Excel
// tenía el PCI igual al PCS, B13=55050 vs B14=55053). Antes 52737.48.
cerca(p.pciMasa, 48021.49689715795);
cerca(p.pcsMasa, 53278.81478023836);
// Coherencia PCS − PCI: calor de condensación del agua formada
// (44,0 kJ/mol H₂O, 2 mol H₂O por mol de CH₄)
cerca(p.pcsMasa - p.pciMasa, 2 * 44.0 * 1000 / 16.043 * p.xMetanoMasa
  + 3 * 44.0 * 1000 / 30.07 * p.xEtanoMasa + 4 * 44.0 * 1000 / 44.097 * p.xPropanoMasa
  + 5 * 44.0 * 1000 / 58.124 * p.xButanoMasa, 0.01);

// Red de Gas (AGREGADO 2026-09-25): el PCS por m³ a 15 °C con la
// composición por defecto reproduce los 37,54 MJ/m³ fijos del Excel
// (Bases de Cálculo!B19) dentro de 0,2 %.
cerca(p.pcsVolumetricoMJm3, 37.47427634998466);
cerca(p.pcsVolumetricoMJm3, 37.54, 0.003);
cerca(p.densidadRelativa, 16.630882 / 28.9647);
// Metano puro → sus propias constantes críticas (Bases de Cálculo!J41:L41)
const metano = propiedadesGN({ pctMetano: 1, pctEtano: 0, pctPropano: 0, pctButano: 0, pctDioxidoC: 0, pctNitrogeno: 0 });
cerca(metano.temperaturaCriticaK, 190.6);
cerca(metano.presionCriticaBar, 45.99);
cerca(metano.factorAcentrico, 0.011);

cerca(densidadCondiciones({ presionKPa: 2, temperaturaC: 10, r: p.r }), 0.7299104131610814); // F44

console.log('gas-gn.test.js: OK');
