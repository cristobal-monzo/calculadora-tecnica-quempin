import assert from 'node:assert/strict';
import { calcularRedGas, TABLA_VI_DS66, buscarGasTablaVI, propiedadesRedGas } from '../js/calc-red-gas.js';
import { P_ATMOSFERICA_PA } from '../js/pipe-network.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Orquestación de Red de Gas contra el D.S. 66 (sección e) — RE-BASELINEADO
// 2026-09-25: d, PCS y viscosidad de la Tabla VI (no de la composición),
// d5 = DI^5, f.3 con P absoluta, velocidad f.5, altura e.2 y criterio de
// media presión. Ver GasNatural-GLP/CLAUDE.md.

// --- Tabla VI del D.S. 66 ---
cerca(buscarGasTablaVI('GLP', 'licuado').densidadRelativa, 2.0);
cerca(buscarGasTablaVI('GLP', 'licuado').pcsMJm3, 119.7);
cerca(buscarGasTablaVI('GLP', 'licuado-catalitico').densidadRelativa, 1.6);
cerca(buscarGasTablaVI('GLP', 'licuado-catalitico').pcsMJm3, 95.04);
cerca(buscarGasTablaVI('GN', 'natural-v-rm').densidadRelativa, 0.87);
cerca(buscarGasTablaVI('GN', 'natural-v-rm').pcsMJm3, 37.54);
cerca(buscarGasTablaVI('GN', 'natural-viii').pcsMJm3, 40.56);
cerca(buscarGasTablaVI('GN', 'natural-xii').pcsMJm3, 39.73);
TABLA_VI_DS66.GLP.forEach((f) => assert.equal(f.viscosidadCp, 0.008));
TABLA_VI_DS66.GN.forEach((f) => assert.equal(f.viscosidadCp, 0.012));
// Id desconocido o ausente (proyecto guardado antes) -> fila por defecto
assert.equal(buscarGasTablaVI('GLP', undefined).id, 'licuado');
assert.equal(buscarGasTablaVI('GN', 'no-existe').id, 'natural-v-rm');
// Pseudocríticas para Z coherentes con la d de la tabla: Licuado (d 2,0)
// ≈ butano (Tc 425,1 K); GN = metano (Bases de Cálculo!J41:L41)
assert.ok(propiedadesRedGas('GLP', 'licuado').temperaturaCriticaK > 420);
cerca(propiedadesRedGas('GN', 'natural-v-rm').temperaturaCriticaK, 190.6);

// D.S. 66 literal, para contrastar (constantes del decreto tal cual)
const ds66BajaPa = ({ potenciaKw, k, D, d, L, PCS }) => (potenciaKw / (2.68 * 10 ** -7.5 * k * PCS)) ** 2 * d * L / D ** 5; // f.2
const ds66MediaPa = ({ potenciaKw, D, S, visc, tC, Y, L, PCS, p1g }) => {                                                 // f.4
  const cr = 0.00639 * S * (tC + 273) * (visc / S) ** 0.152;
  const p1 = (p1g + P_ATMOSFERICA_PA) / 1e5;
  const dif = (potenciaKw / (0.0345 * D ** 2.623 * PCS)) ** (1 / 0.541) * cr * L / Y;
  return (p1 - Math.sqrt(p1 * p1 - dif)) * 1e5;
};
const ds66Velocidad = ({ Q, tC, p2Pa, D }) => 1.25 * Q * (tC + 273.15) / ((p2Pa + P_ATMOSFERICA_PA) / 1e5 * D * D); // f.5

// Caso 1: GLP Licuado (Tabla VI por defecto), baja presión, 1/2" acero
const glp = calcularRedGas({
  gas: 'GLP', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5,
  potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15,
});
assert.equal(glp.diametroMm, 15.8);
assert.equal(glp.gasTablaVI, 'licuado');
cerca(glp.caudalObjetivoM3H, 30 * 3.6 / 119.7); // = 0,90226 m³/h, el valor original del Excel
cerca(glp.perdidaPresionRequeridaPa, 54.802974898547255);
// contra f.2 del decreto (constante 2,68 ≈ 9,65/3,6: difieren 0,04 %)
cerca(glp.perdidaPresionRequeridaPa, ds66BajaPa({ potenciaKw: 30, k: 1800, D: 15.8, d: 2.0, L: 10, PCS: 119.7 }), 1e-3);
assert.equal(glp.perdidaAdmisiblePa, 150);
assert.equal(glp.tuberiaAdecuada, true);
assert.equal(glp.presionFinalPa, null);
assert.equal(glp.kFueraDeTablaIX, false);
cerca(glp.volumenTuberiaM3, Math.PI * (0.0158 ** 2) / 4 * 10);
// Velocidad — f.5 literal
cerca(glp.velocidadMS, ds66Velocidad({ Q: glp.caudalObjetivoM3H, tC: 15, p2Pa: 1000 - glp.perdidaPresionRequeridaPa, D: 15.8 }));
cerca(glp.caudalRealM3H, glp.velocidadMS * Math.PI * 0.0158 ** 2 / 4 * 3600);
// Sin desnivel no hay variación por altura: total = fricción
assert.equal(glp.variacionPresionAlturaPa, 0);
cerca(glp.perdidaPresionTotalPa, glp.perdidaPresionRequeridaPa);

// Licuado catalítico: menos PCS (más caudal) y menos denso
const catalitico = calcularRedGas({
  gas: 'GLP', gasTablaVI: 'licuado-catalitico', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5,
  potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15,
});
cerca(catalitico.caudalObjetivoM3H, 30 * 3.6 / 95.04);
cerca(catalitico.perdidaPresionRequeridaPa, ds66BajaPa({ potenciaKw: 30, k: 1800, D: 15.8, d: 1.6, L: 10, PCS: 95.04 }), 1e-3);

// Caso 2: GN Vª y RM, media presión, 2" acero a 200 kPa man. — contra f.4
const gn = calcularRedGas({
  gas: 'GN', regimenPresion: '>10 kPa', material: 'Acero Sch40', pulgadas: 2,
  potenciaKw: 200, longitudM: 30, presionInicialPa: 200000, temperaturaC: 15,
});
assert.equal(gn.diametroMm, 52.5);
cerca(gn.caudalObjetivoM3H, 200 * 3.6 / 37.54);
cerca(gn.perdidaPresionRequeridaPa, ds66MediaPa({
  potenciaKw: 200, D: 52.5, S: 0.87, visc: 0.012, tC: 15, Y: 1 / gn.z, L: 30, PCS: 37.54, p1g: 200000,
}), 2e-3);
cerca(gn.presionFinalPa, 200000 - gn.perdidaPresionTotalPa);
// Criterio de media presión: 10 % de la presión inicial absoluta
cerca(gn.perdidaAdmisiblePa, 0.1 * (200000 + P_ATMOSFERICA_PA));
assert.equal(gn.tuberiaAdecuada, true);
cerca(gn.velocidadMS, ds66Velocidad({ Q: gn.caudalObjetivoM3H, tC: 15, p2Pa: gn.presionFinalPa, D: 52.5 }));
assert.equal(gn.presionRocioAbsPa, null);
assert.equal(gn.riesgoCondensacion, false);

// Región: VIIIª tiene más PCS -> menos caudal para la misma potencia
const gnViii = calcularRedGas({
  gas: 'GN', gasTablaVI: 'natural-viii', regimenPresion: '>10 kPa', material: 'Acero Sch40', pulgadas: 2,
  potenciaKw: 200, longitudM: 30, presionInicialPa: 200000, temperaturaC: 15,
});
cerca(gnViii.caudalObjetivoM3H, 200 * 3.6 / 40.56);
assert.ok(gnViii.perdidaPresionRequeridaPa < gn.perdidaPresionRequeridaPa);

// Caso 3: GN media presión que excede el criterio (3/8", 200 kW, 30 m, 50 kPa man.)
const gnChico = calcularRedGas({
  gas: 'GN', regimenPresion: '>10 kPa', material: 'Acero Sch40', pulgadas: 0.375,
  potenciaKw: 200, longitudM: 30, presionInicialPa: 50000, temperaturaC: 15,
});
assert.equal(gnChico.tuberiaAdecuada, false);

// Material Cobre usa el diámetro de cobre, no el de acero
const glpCobre = calcularRedGas({
  gas: 'GLP', regimenPresion: '<10 kPa', material: 'Cobre tipo L', pulgadas: 0.5,
  potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15,
});
assert.equal(glpCobre.diametroMm, 13.84);

// Diámetro manual [mm] — con el mismo DI (y K) que una fila tabulada da
// exactamente el mismo resultado en los dos regímenes.
const gnManualAlta = calcularRedGas({
  gas: 'GN', regimenPresion: '>10 kPa', pulgadas: null, tuberiaManual: { diametroMm: 52.5 },
  potenciaKw: 200, longitudM: 30, presionInicialPa: 200000, temperaturaC: 15,
});
cerca(gnManualAlta.perdidaPresionRequeridaPa, gn.perdidaPresionRequeridaPa);
assert.equal(gnManualAlta.tuberia, null);
const glpManualBaja = calcularRedGas({
  gas: 'GLP', regimenPresion: '<10 kPa', pulgadas: null, tuberiaManual: { diametroMm: 15.8, k: 1800 },
  potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15,
});
cerca(glpManualBaja.perdidaPresionRequeridaPa, glp.perdidaPresionRequeridaPa);
assert.equal(glpManualBaja.kFueraDeTablaIX, false); // K manual: responsabilidad del usuario

// K fuera de la Tabla IX (1/4") se marca solo en baja presión
const cuarto = (regimenPresion) => calcularRedGas({
  gas: 'GLP', regimenPresion, material: 'Acero Sch40', pulgadas: 0.25,
  potenciaKw: 5, longitudM: 5, presionInicialPa: regimenPresion === '<10 kPa' ? 2800 : 50000, temperaturaC: 15,
});
assert.equal(cuarto('<10 kPa').kFueraDeTablaIX, true);
assert.equal(cuarto('>10 kPa').kFueraDeTablaIX, false);

// Condensación del GLP: usa la composición REAL (no la d de la Tabla VI).
// 70/30 por defecto: rocío 4,40 bar abs a 20 °C y 2,27 a 0 °C.
const condensacion = (presionInicialPa, temperaturaC, composicion) => calcularRedGas({
  gas: 'GLP', composicion, regimenPresion: '>10 kPa', material: 'Acero Sch40', pulgadas: 1,
  potenciaKw: 60, longitudM: 20, presionInicialPa, temperaturaC,
});
assert.equal(condensacion(500000, 20).riesgoCondensacion, true);
assert.equal(condensacion(150000, 20).riesgoCondensacion, false);
assert.equal(condensacion(150000, 0).riesgoCondensacion, true);
cerca(condensacion(150000, 20).presionRocioAbsPa, 439547.79019136424);
// Más butano -> condensa antes; la d de dimensionamiento (Tabla VI) no cambia
assert.equal(condensacion(150000, 20, { pctButano: 0.9, pctPropano: 0.1 }).riesgoCondensacion, true);
cerca(condensacion(150000, 20, { pctButano: 0.9, pctPropano: 0.1 }).perdidaPresionRequeridaPa,
  condensacion(150000, 20).perdidaPresionRequeridaPa);

// Variación de presión con la altura — D.S. 66 e.2: Δph = 12·(1 − d)·h,
// con la d de la Tabla VI. El GLP (d 2,0) PIERDE 12 Pa por metro de
// subida; el GN (d 0,87) GANA 1,56 Pa/m.
const conAltura = (gas, desnivelM, extra = {}) => calcularRedGas({
  gas, regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5,
  potenciaKw: 30, longitudM: 10, presionInicialPa: 2800, temperaturaC: 15, desnivelM, ...extra,
});
const glpSube = conAltura('GLP', 15);
cerca(glpSube.variacionPresionAlturaPa, 12 * (1 - 2.0) * 15); // −180 Pa
cerca(glpSube.perdidaPresionTotalPa, glpSube.perdidaPresionRequeridaPa + 180);
cerca(glpSube.perdidaPresionRequeridaPa, glp.perdidaPresionRequeridaPa); // la fricción no cambia
assert.equal(glpSube.alturaObligatoriaDS66, true);
assert.equal(conAltura('GLP', 8).alturaObligatoriaDS66, false);
assert.equal(glp.tuberiaAdecuada, true);
assert.equal(glpSube.tuberiaAdecuada, false); // 55 + 180 Pa > 150 Pa
const gnSube = conAltura('GN', 15);
cerca(gnSube.variacionPresionAlturaPa, 12 * (1 - 0.87) * 15);
assert.ok(gnSube.perdidaPresionTotalPa < gnSube.perdidaPresionRequeridaPa);
cerca(conAltura('GLP', -15).variacionPresionAlturaPa, -glpSube.variacionPresionAlturaPa);
const mpSube = conAltura('GN', 30, { regimenPresion: '>10 kPa', presionInicialPa: 50000 });
cerca(mpSube.presionFinalPa, 50000 - mpSube.perdidaPresionTotalPa);

console.log('calc-red-gas.test.js: OK');
