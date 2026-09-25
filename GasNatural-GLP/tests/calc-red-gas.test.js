import assert from 'node:assert/strict';
import { calcularRedGas, COMPOSICION_POR_DEFECTO } from '../js/calc-red-gas.js';
import { P_ATMOSFERICA_PA } from '../js/pipe-network.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Las fórmulas subyacentes (pipe-network.js) están verificadas contra el
// Excel, Renouard clásico y Darcy-Weisbach en pipe-network.test.js. Estos
// casos verifican la orquestación. RE-BASELINEADOS 2026-09-25 (auditoría de
// coherencia física): propiedades del gas desde la composición, d5 = DI^5,
// media presión con P absoluta, velocidad real y criterio de media
// presión — ver GasNatural-GLP/CLAUDE.md.

// Caso 1: GLP 70/30 (composición por defecto), baja presión, 1/2" acero
const glp = calcularRedGas({
  gas: 'GLP', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5,
  potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15,
});
assert.equal(glp.diametroMm, 15.8);
cerca(glp.pcsVolumetricoMJm3, 101.95115139684853); // PCS a 15 °C/1 atm de GLP 70/30 (antes 119,7 fijo, ≈ butano puro)
cerca(glp.densidadRelativa, 1.6677231250453135);    // PM/PM_aire (antes 2 fijo)
cerca(glp.caudalObjetivoM3H, 30 * 3.6 / glp.pcsVolumetricoMJm3);
cerca(glp.perdidaPresionRequeridaPa, 62.994425610457924);
cerca(glp.volumenTuberiaM3, Math.PI * (0.0158 ** 2) / 4 * 10);
assert.equal(glp.perdidaAdmisiblePa, 150);
assert.equal(glp.tuberiaAdecuada, true);
assert.equal(glp.presionFinalPa, null);
// Velocidad — D.S. 66 f.5 literal: V = 1,25·Q·T/(p2·D²), p2 absoluta
// final [bar], T [K], D [mm]
const pFinalAbs = 1000 - glp.perdidaPresionRequeridaPa + P_ATMOSFERICA_PA;
cerca(glp.velocidadMS, 1.25 * glp.caudalObjetivoM3H * 288.15 / (pFinalAbs / 1e5 * 15.8 ** 2));
cerca(glp.caudalRealM3H, glp.velocidadMS * Math.PI * 0.0158 ** 2 / 4 * 3600);
// El 1,25 del decreto es la velocidad real sin Z: coincide dentro de 1 %
// con Q·(1,013/p2)·(T/288,15)/A
cerca(glp.velocidadMS, glp.caudalObjetivoM3H * (101300 / pFinalAbs) / 3600 / (Math.PI * 0.0158 ** 2 / 4), 0.01);
// Sin desnivel no hay variación por altura: total = fricción
assert.equal(glp.variacionPresionAlturaPa, 0);
cerca(glp.perdidaPresionTotalPa, glp.perdidaPresionRequeridaPa);

// Sin composición = composición por defecto del módulo
const glpExplicito = calcularRedGas({
  gas: 'GLP', composicion: COMPOSICION_POR_DEFECTO.GLP, regimenPresion: '<10 kPa', material: 'Acero Sch40',
  pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15,
});
cerca(glpExplicito.perdidaPresionRequeridaPa, glp.perdidaPresionRequeridaPa);

// La composición SÍ cambia el resultado: butano puro tiene más PC por m³
// (menos caudal) pero es más denso.
const butano = calcularRedGas({
  gas: 'GLP', composicion: { pctButano: 1, pctPropano: 0 }, regimenPresion: '<10 kPa', material: 'Acero Sch40',
  pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15,
});
assert.ok(butano.pcsVolumetricoMJm3 > glp.pcsVolumetricoMJm3);
cerca(butano.pcsVolumetricoMJm3, 120.8, 0.01); // ≈ los 119,7 MJ/m³ fijos del Excel
assert.ok(butano.caudalObjetivoM3H < glp.caudalObjetivoM3H);

// Caso 2: GN, media presión, 2" acero a 200 kPa man. — con la ecuación
// corregida la caída es chica y la tubería es adecuada.
const gn = calcularRedGas({
  gas: 'GN', regimenPresion: '>10 kPa', material: 'Acero Sch40', pulgadas: 2,
  potenciaKw: 200, longitudM: 30, presionInicialPa: 200000, temperaturaC: 15,
});
assert.equal(gn.diametroMm, 52.5);
cerca(gn.caudalObjetivoM3H, 19.213179549504353); // 200*3.6/37,474
cerca(gn.perdidaPresionRequeridaPa, 14.754916827053322);
cerca(gn.presionFinalPa, 200000 - gn.perdidaPresionRequeridaPa);
// Criterio de media presión: 10 % de la presión inicial absoluta, no los
// 120 Pa de baja presión.
cerca(gn.perdidaAdmisiblePa, 0.1 * (200000 + P_ATMOSFERICA_PA));
assert.equal(gn.tuberiaAdecuada, true);
// Velocidad real a ~3 bar abs: ~1/3 de la que daría el caudal estándar
assert.ok(gn.velocidadMS < 0.35 * (gn.caudalObjetivoM3H / 3600 / (Math.PI * 0.0525 ** 2 / 4)));
assert.equal(gn.presionRocioAbsPa, null);
assert.equal(gn.riesgoCondensacion, false);

// Caso 3: GN media presión que SÍ excede el criterio (3/8", 200 kW, 30 m,
// 50 kPa man.): 34,6 kPa de caída contra 15,1 kPa admisibles.
const gnChico = calcularRedGas({
  gas: 'GN', regimenPresion: '>10 kPa', material: 'Acero Sch40', pulgadas: 0.375,
  potenciaKw: 200, longitudM: 30, presionInicialPa: 50000, temperaturaC: 15,
});
cerca(gnChico.perdidaPresionRequeridaPa, 34610.11751995637);
assert.equal(gnChico.tuberiaAdecuada, false);

// Material Cobre usa el diámetro de cobre, no el de acero
const glpCobre = calcularRedGas({
  gas: 'GLP', regimenPresion: '<10 kPa', material: 'Cobre tipo L', pulgadas: 0.5,
  potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15,
});
assert.equal(glpCobre.diametroMm, 13.84);

// Diámetro manual [mm] — con el mismo DI (y k) que una fila tabulada da
// exactamente el mismo resultado en los dos regímenes (desde el
// 2026-09-25 la tabla también usa d5 = DI^5).
const gnManualAlta = calcularRedGas({
  gas: 'GN', regimenPresion: '>10 kPa', pulgadas: null, tuberiaManual: { diametroMm: 52.5 },
  potenciaKw: 200, longitudM: 30, presionInicialPa: 200000, temperaturaC: 15,
});
assert.equal(gnManualAlta.diametroMm, 52.5);
cerca(gnManualAlta.perdidaPresionRequeridaPa, gn.perdidaPresionRequeridaPa);
assert.equal(gnManualAlta.tuberia, null); // sin fila de tabla

const glpManualBaja = calcularRedGas({
  gas: 'GLP', regimenPresion: '<10 kPa', pulgadas: null,
  tuberiaManual: { diametroMm: 15.8, k: 1800 },
  potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15,
});
cerca(glpManualBaja.perdidaPresionRequeridaPa, glp.perdidaPresionRequeridaPa);

// Condensación del GLP (AGREGADO 2026-09-25): presión de rocío de 70/30
// = 4,40 bar abs a 20 °C y 2,27 a 0 °C (Lee-Kesler + Raoult, ver
// gas-glp.test.js).
const condensacion = (presionInicialPa, temperaturaC) => calcularRedGas({
  gas: 'GLP', regimenPresion: '>10 kPa', material: 'Acero Sch40', pulgadas: 1,
  potenciaKw: 60, longitudM: 20, presionInicialPa, temperaturaC,
});
assert.equal(condensacion(500000, 20).riesgoCondensacion, true);  // 6,0 bar abs > 4,4
assert.equal(condensacion(150000, 20).riesgoCondensacion, false); // 2,5 bar abs < 4,4
assert.equal(condensacion(150000, 0).riesgoCondensacion, true);   // 2,5 bar abs > 2,27 en invierno
cerca(condensacion(150000, 20).presionRocioAbsPa, 439547.79019136424);

// Variación de presión con la altura — D.S. 66 e.2 (AGREGADA 2026-09-25):
// Δph = 12·(1 − d)·h. El GLP (d > 1) PIERDE presión al subir; el GN
// (d < 1) la GANA. Entra en la pérdida total, en la adecuación y en la
// presión final.
const conAltura = (gas, desnivelM, extra = {}) => calcularRedGas({
  gas, regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5,
  potenciaKw: 30, longitudM: 10, presionInicialPa: 2800, temperaturaC: 15, desnivelM, ...extra,
});
const glpSube = conAltura('GLP', 15);
cerca(glpSube.variacionPresionAlturaPa, 12 * (1 - glpSube.densidadRelativa) * 15);
assert.ok(glpSube.variacionPresionAlturaPa < 0);
cerca(glpSube.perdidaPresionTotalPa, glpSube.perdidaPresionRequeridaPa - glpSube.variacionPresionAlturaPa);
cerca(glpSube.perdidaPresionRequeridaPa, glp.perdidaPresionRequeridaPa); // la fricción no cambia
assert.equal(glpSube.alturaObligatoriaDS66, true);  // > 10 m: el decreto la exige
assert.equal(conAltura('GLP', 8).alturaObligatoriaDS66, false);
// 15 m de subida le suman ~120 Pa al GLP: con 63 Pa de fricción ya no cumple 150 Pa
assert.equal(glp.tuberiaAdecuada, true);
assert.equal(glpSube.tuberiaAdecuada, false);
const gnSube = conAltura('GN', 15);
assert.ok(gnSube.variacionPresionAlturaPa > 0);
assert.ok(gnSube.perdidaPresionTotalPa < gnSube.perdidaPresionRequeridaPa);
// Bajar invierte el signo
cerca(conAltura('GLP', -15).variacionPresionAlturaPa, -glpSube.variacionPresionAlturaPa);
// Media presión: la presión final descuenta la pérdida total
const mpSube = conAltura('GN', 30, { regimenPresion: '>10 kPa', presionInicialPa: 50000 });
cerca(mpSube.presionFinalPa, 50000 - mpSube.perdidaPresionTotalPa);

console.log('calc-red-gas.test.js: OK');
