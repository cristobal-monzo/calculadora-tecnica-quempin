import assert from 'node:assert/strict';
import { calcularCombustionGLP, calcularCombustionGN } from '../js/calc-combustion.js';
import { propiedadesGN } from '../js/gas-gn.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Fixtures: MASTER DISEÑO.xlsm, hoja "Combustión Gas", columna "Comb. GLP" (I:K), 2026-09-01
// (GLP no cambió con las correcciones del 2026-09-01, sigue matcheando el Excel exacto)
const glp = calcularCombustionGLP({
  pctButano: 0.3, pctPropano: 0.7, potenciaKw: 60, lambda: 1.2, pciKjKg: 48029,
  presionReferenciaKPa: 0, temperaturaReferenciaC: 20, concentracionO2Pct: 0.0492,
});
cerca(glp.flujoMasicoKgS, 0.0012492452476628704);   // J5
cerca(glp.caudalCombustibleNm3H, 2.086778647855941); // J6
cerca(glp.aireEsteq, 12.023688370286743);            // J8
cerca(glp.caudalAireNm3H, 64.88871360174736);        // J9
cerca(glp.caudalTotalNormalNm3H, 66.97549224960329); // J10 = J9+J6 (base "normal", igual que el Excel para GLP)
cerca(glp.caudalTotalReferenciaM3H, 67.12828585369306); // nuevo: misma base "referencia" que ahora también se calcula para GLP
cerca(glp.composicion.co2, 0.09930948546857975);     // J17
cerca(glp.composicion.h2o, 0.1288465290309982);      // J18
cerca(glp.composicion.o2, 0.03274489635456335);      // J19
cerca(glp.composicion.n2, 0.7390990891458586);       // J20
cerca(glp.gases.pm, 28.44386808917277);              // J21
cerca(glp.gases.r, 0.2923115088965317);              // J22
cerca(glp.gases.densidadNormal, 1.269022998299888);  // J23
cerca(glp.emisionNoxAdmisiblePpm, 74.728951727984);  // J47
assert.equal(glp.emisionCoAdmisiblePpm, 93);          // J48

// Fixtures: columna "Comb. GN" (M:O), 2026-09-01 — CON la corrección de
// xCarbono/xHidrogeno (ver gas-gn.js) y con pciKjKg pasado explícitamente
// (ya no hardcodeado a propiedades.pciMasa dentro del motor); acá se le
// pasa ese mismo valor para que sea comparable con el N9/N4 del Excel.
// Los valores que dependen de xCarbono/xHidrogeno (aireEsteq en adelante)
// cambian levemente frente al Excel original — recalculados en Python/Node
// con la fórmula corregida, no son del Excel.
const compGN = { pctMetano: 0.97, pctEtano: 0.011, pctPropano: 0.001, pctButano: 0.001, pctDioxidoC: 0.01, pctNitrogeno: 0.007 };
const pciGN = propiedadesGN(compGN).pciMasa;
cerca(pciGN, 52737.48360189195); // F45, sin cambios (no depende de xCarbono/xHidrogeno)

const gn = calcularCombustionGN({
  ...compGN, potenciaKw: 280, lambda: 1.28, pciKjKg: pciGN,
  presionReferenciaKPa: 2, temperaturaReferenciaC: 10, concentracionO2Pct: 0.0492,
  pciSimplificadoKwhM3: 10,
});
cerca(gn.flujoMasicoKgS, 0.005309316654425185);      // N4 — sin cambios (usa pciMasa, no xCarbono/xHidrogeno)
cerca(gn.caudalCombustibleNm3H, 25.759949642241274); // N5 — sin cambios
cerca(gn.caudalCombustibleRefM3H, 26.18614505464325); // N6 — sin cambios
cerca(gn.aireEsteq, 12.102456559389664);             // antes 12.140266141588803 (Excel, con el bug)
cerca(gn.caudalAireNm3H, 296.0906073763962);         // antes 297.01563132529895
cerca(gn.caudalTotalNormalNm3H, 321.85055701863746); // antes N9=323.2017763799422 (que además usaba la base "referencia" — ver calc-combustion.js)
cerca(gn.caudalTotalReferenciaM3H, 322.2767524310394);
cerca(gn.composicion.co2, 0.07835556023180026);      // antes 0.07787294968634385
cerca(gn.composicion.h2o, 0.1499181989596972);       // antes 0.15073097814105252
cerca(gn.composicion.o2, 0.04235929996146135);       // antes 0.04234146149801204
cerca(gn.composicion.n2, 0.7293669408470412);        // antes 0.7290546106745915
cerca(gn.gases.pm, 27.936337557915213);              // antes 27.920420449259588
cerca(gn.gases.r, 0.29762204808569326);              // antes 0.29779171897178536
cerca(gn.emisionNoxAdmisiblePpm, 74.52847164286533); // N47 — no depende de xCarbono/xHidrogeno, sin cambios

console.log('calc-combustion.test.js: OK');
