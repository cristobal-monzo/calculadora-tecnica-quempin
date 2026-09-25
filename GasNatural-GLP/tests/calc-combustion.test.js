import assert from 'node:assert/strict';
import { calcularCombustionGLP, calcularCombustionGN } from '../js/calc-combustion.js';
import { propiedadesGN } from '../js/gas-gn.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Fixtures: MASTER DISEÑO.xlsm, hoja "Combustión Gas", columna "Comb. GLP" (I:K), 2026-09-01.
// J4..J6 y J47/J48 siguen siendo los del Excel. RE-BASELINEADOS 2026-09-25
// (auditoría de coherencia física) los que dependen de xCarbono/xHidrogeno
// (base molar, ver gas-glp.js — cambio chico en GLP) y el caudal total de
// referencia (ahora convierte también el aire a la T/P de referencia). El
// valor del Excel va en el comentario.
const glp = calcularCombustionGLP({
  pctButano: 0.3, pctPropano: 0.7, potenciaKw: 60, lambda: 1.2, pciKjKg: 48029,
  presionReferenciaKPa: 0, temperaturaReferenciaC: 20, concentracionO2Pct: 0.0492,
});
cerca(glp.flujoMasicoKgS, 0.0012492452476628704);   // J5
cerca(glp.caudalCombustibleNm3H, 2.086778647855941); // J6
cerca(glp.aireEsteq, 12.034616082635857);            // J8 Excel: 12.023688370286743
cerca(glp.caudalAireNm3H, 64.94768761829758);        // J9 Excel: 64.88871360174736
cerca(glp.caudalTotalNormalNm3H, 67.03446626615352); // J10 = J9+J6. Excel: 66.97549224960329
// Caudal total a la condición de referencia: aire y combustible en la
// misma base (antes sumaba aire en Nm³/h + combustible en m³/h: 67.128)
cerca(glp.caudalAireRefM3H, glp.caudalAireNm3H * (20 + 273.15) / 273.15);
cerca(glp.caudalTotalReferenciaM3H, 71.94271933341717);
cerca(glp.composicion.co2, 0.09912779547327973);     // J17 Excel: 0.09930948546857975
cerca(glp.composicion.h2o, 0.12915576735534307);     // J18 Excel: 0.1288465290309982
cerca(glp.composicion.o2, 0.03273948521333115);      // J19 Excel: 0.03274489635456335
cerca(glp.composicion.n2, 0.738976951958046);        // J20 Excel: 0.7390990891458586
cerca(glp.gases.pm, 28.4378484424322);               // J21 Excel: 28.44386808917277
cerca(glp.gases.r, 0.29237338460507284);             // J22 Excel: 0.2923115088965317
cerca(glp.gases.densidadNormal, 1.26875443179791);   // J23 Excel: 1.269022998299888
cerca(glp.emisionNoxAdmisiblePpm, 74.728951727984);  // J47
assert.equal(glp.emisionCoAdmisiblePpm, 93);          // J48

// Aire estequiométrico contra el cálculo directo por O2 requerido:
// suma de y_i*(C_i + H_i/4), / 0,21 * 22,4 / PM
cerca(glp.aireEsteq, (0.3 * 6.5 + 0.7 * 5) / 0.21 * 22.4 / glp.pm, 1e-6);

// Columna "Comb. GN" (M:O). RE-BASELINEADOS 2026-09-25: PCI del metano
// corregido (55050 -> 50010 kJ/kg, ver gas-gn.js) y fracciones elementales
// en base molar. El valor anterior va en el comentario.
const compGN = { pctMetano: 0.97, pctEtano: 0.011, pctPropano: 0.001, pctButano: 0.001, pctDioxidoC: 0.01, pctNitrogeno: 0.007 };
const pciGN = propiedadesGN(compGN).pciMasa;
cerca(pciGN, 48021.49689715795); // F45. Antes 52737.48 (PCI metano = PCS)

const gn = calcularCombustionGN({
  ...compGN, potenciaKw: 280, lambda: 1.28, pciKjKg: pciGN,
  presionReferenciaKPa: 2, temperaturaReferenciaC: 10, concentracionO2Pct: 0.0492,
  pciSimplificadoKwhM3: 10,
});
cerca(gn.flujoMasicoKgS, 0.005830722032668898);      // N4. Antes 0.005309316654425185
cerca(gn.caudalCombustibleNm3H, 28.289724594646323); // N5. Antes 25.759949642241274
cerca(gn.caudalCombustibleRefM3H, 28.757774843493966); // N6. Antes 26.18614505464325
cerca(gn.aireEsteq, 12.763396375051117);             // antes 12.102456559389664 (Excel: 12.140266141588803)
cerca(gn.aireEsteq, (0.97 * 2 + 0.011 * 3.5 + 0.001 * 5 + 0.001 * 6.5) / 0.21 * 22.4 / gn.pm, 1e-6);
cerca(gn.caudalAireNm3H, 342.92651422785127);        // antes 296.0906073763962
cerca(gn.caudalTotalNormalNm3H, 371.2162388224976);  // antes 321.85055701863746
cerca(gn.caudalTotalReferenciaM3H, 377.35796891873315);
cerca(gn.composicion.co2, 0.07680880925425818);      // antes 0.07835556023180026
cerca(gn.composicion.h2o, 0.15086460387052664);      // antes 0.1499181989596972
cerca(gn.composicion.o2, 0.042412591966022935);      // antes 0.04235929996146135
cerca(gn.composicion.n2, 0.7299139949091923);        // antes 0.7293669408470412
cerca(gn.gases.pm, 27.902345994910156);              // antes 27.936337557915213
cerca(gn.gases.r, 0.29798462113245583);              // antes 0.29762204808569326
cerca(gn.emisionNoxAdmisiblePpm, 74.52847164286533); // N47 — no depende de xCarbono/xHidrogeno, sin cambios

console.log('calc-combustion.test.js: OK');
