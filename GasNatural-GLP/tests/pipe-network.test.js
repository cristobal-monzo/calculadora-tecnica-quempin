import assert from 'node:assert/strict';
import {
  buscarTuberiaRedGas, caudalBajaPresion, perdidaPresionBajaPresion,
  caudalMediaAltaPresion, perdidaPresionMediaAltaPresion, factorZPengRobinson,
  TABLA_TUBERIA_RED_GAS, P_ATMOSFERICA_PA, perdidaAdmisibleMediaPresionPa, factorCr,
} from '../js/pipe-network.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Fixture: Libro11111111.xlsx, hoja "Bases de Cálculo", caso por defecto
// (B5=H2, B6="<10 kPa", B7="Acero Sch40", B11=1"), 2026-09-01.
// La fórmula es gas-agnóstica (Renouard baja presión); se verifica con
// este caso porque es el único cacheado en el Excel fuente. Se le pasa el
// d5 literal del Excel (B15=10100000) para comparar contra B20 — la tabla
// de la app ya no usa ese valor (ver más abajo).
const tuberia1in = buscarTuberiaRedGas(1);
assert.equal(tuberia1in.diAceroMm, 26.64);
assert.equal(tuberia1in.k, 1800);

const caudal = caudalBajaPresion({
  k: 1800, diametro5: 10100000, perdidaPresionPa: 63.39954095917689,
  densidadRelativa: 0.069, longitudM: 7,
});
cerca(caudal, 20.00000004618117); // B20

const perdidaInvertida = perdidaPresionBajaPresion({
  k: 1800, diametro5: 10100000, caudalM3H: caudal, densidadRelativa: 0.069, longitudM: 7,
});
cerca(perdidaInvertida, 63.39954095917689); // round-trip: recupera el ΔP original

// d5 = DI^5 en TODAS las filas (CORREGIDO 2026-09-25 — el Excel traía un
// d5 de otra tabla en las filas de acero de 3/8" a 2-1/2", ver
// pipe-network.js), y DI creciente con la pulgada nominal.
TABLA_TUBERIA_RED_GAS.forEach((fila) => {
  cerca(fila.d5Acero, fila.diAceroMm ** 5, 1e-12);
  cerca(fila.d5Cobre, fila.diCobreMm ** 5, 1e-12);
});
for (let i = 1; i < TABLA_TUBERIA_RED_GAS.length; i++) {
  assert.ok(TABLA_TUBERIA_RED_GAS[i].diAceroMm > TABLA_TUBERIA_RED_GAS[i - 1].diAceroMm,
    `DI acero debe crecer con la pulgada: fila ${i}`);
  assert.ok(TABLA_TUBERIA_RED_GAS[i].diCobreMm > TABLA_TUBERIA_RED_GAS[i - 1].diCobreMm,
    `DI cobre debe crecer con la pulgada: fila ${i}`);
}
// Fila de 1/4" (CORREGIDA 2026-09-25): Sch 40 0,364" y cobre tipo L 0,315"
assert.equal(buscarTuberiaRedGas(0.25).diAceroMm, 9.25);
assert.equal(buscarTuberiaRedGas(0.25).diCobreMm, 8.0);

// Factor K — D.S. 66, Tabla IX (3/8" a 4"); fuera de ese rango, extrapolado
const TABLA_IX = [[0.375, 1800], [0.5, 1800], [0.75, 1800], [1, 1800], [1.25, 1980], [1.5, 1980], [2, 2160], [2.5, 2160], [3, 2340], [4, 2420]];
TABLA_IX.forEach(([pulgadas, k]) => {
  assert.equal(buscarTuberiaRedGas(pulgadas).k, k);
  assert.equal(buscarTuberiaRedGas(pulgadas).kTablaIX, true);
});
[0.125, 0.25, 5, 6, 8].forEach((pulgadas) => assert.equal(buscarTuberiaRedGas(pulgadas).kTablaIX, false));

// Baja presión contra Renouard clásico (independiente de la fórmula de
// Pole del decreto): ΔP[mbar] = 23200·dr·L[m]·Q^1,82·D^-4,82. Con
// d5 = DI^5 coinciden dentro de 0,1 % (con el d5 anterior del Excel, 29 %
// más alto). GN típico: d = 0,6, 3/4" Sch 40, 2,88 m³/h, 10 m.
{
  const d = 0.6, Q = 2.8829, D = 20.93, L = 10;
  const dp = perdidaPresionBajaPresion({ k: 1800, diametro5: D ** 5, caudalM3H: Q, densidadRelativa: d, longitudM: L });
  cerca(dp, 23200 * d * L * Q ** 1.82 * D ** -4.82 * 100, 1e-3);
}

// Rama >10kPa: autoconsistencia algebraica — invertir el caudal calculado
// debe devolver exactamente el ΔP de entrada.
const paramsAltaPresion = { diametroMm: 52.5, presionInicialPa: 200000, factorSuperexp: 1.02, factorCr: 0.045, longitudM: 15 };
const caudalAlta = caudalMediaAltaPresion({ ...paramsAltaPresion, perdidaPresionPa: 5000 });
const perdidaAltaInvertida = perdidaPresionMediaAltaPresion({ ...paramsAltaPresion, caudalM3H: caudalAlta });
cerca(perdidaAltaInvertida, 5000);

// La ecuación trabaja con presión ABSOLUTA y el exponente 0,541 sobre todo
// el corchete (CORREGIDO 2026-09-25): el caudal crece como
// (P1² − P2²)^0,541 con P absolutas.
const p1Abs = (200000 + P_ATMOSFERICA_PA) / 1e5;
const p2Abs = (200000 - 5000 + P_ATMOSFERICA_PA) / 1e5;
cerca(caudalAlta, 0.12426 * 52.5 ** 2.623 * ((p1Abs ** 2 - p2Abs ** 2) * 1.02 / (0.045 * 15)) ** 0.541);

// Media presión contra dos referencias independientes, con un GN típico
// (d = 0,6, µ = 0,012 cP, 15 °C), 3/4" Sch 40, 14,41 m³/h, 30 m, 50 kPa man.:
//   - Renouard clásico: P1² − P2² [bar abs²] = 48600·dr·L[km]·Q^1,82·D^-4,82
//   - Darcy-Weisbach isotérmico (Haaland, ε = 0,045 mm, µ = 11 µPa·s):
//     P1² − P2² = f·(L/D)·G²·Rs·T
// Antes de la corrección la fórmula daba ~16x más que ambas. (Con la d de
// la Tabla VI del D.S. 66 para GN, 0,87, la fórmula del decreto se separa
// ~8 % de Renouard clásico: escala con S^0,848 y Renouard con d^1.)
{
  const d = 0.6, Q = 14.41, D = 20.93, L = 30, p1g = 50000;
  const z = factorZPengRobinson({ presionAbsBar: (p1g + P_ATMOSFERICA_PA) / 1e5, temperaturaK: 288.15, temperaturaCriticaK: 190.6, presionCriticaBar: 45.99, factorAcentrico: 0.011 });
  const cr = factorCr({ densidadRelativa: d, viscosidadCp: 0.012, temperaturaC: 15 });
  const dp = perdidaPresionMediaAltaPresion({ diametroMm: D, presionInicialPa: p1g, caudalM3H: Q, factorSuperexp: 1 / z, factorCr: cr, longitudM: L });
  const p1 = (p1g + P_ATMOSFERICA_PA) / 1e5;
  const renouardPa = (p1 - Math.sqrt(p1 ** 2 - 48600 * d * (L / 1000) * Q ** 1.82 * D ** -4.82)) * 1e5;
  assert.ok(Math.abs(dp / renouardPa - 1) < 0.05, `media presión: ${dp} Pa vs Renouard ${renouardPa} Pa`);
  const Dm = D / 1000;
  const G = (Q * d * 1.225 / 3600) / (Math.PI * Dm * Dm / 4);
  const f = 1 / (-1.8 * Math.log10((0.045 / D / 3.7) ** 1.11 + 6.9 / (G * Dm / 11e-6))) ** 2;
  const rs = 8314.46 / (d * 28.9647);
  const p1Pa = p1g + P_ATMOSFERICA_PA;
  const darcyPa = p1Pa - Math.sqrt(p1Pa ** 2 - f * L / Dm * G * G * rs * 288.15);
  assert.ok(Math.abs(dp / darcyPa - 1) < 0.10, `media presión: ${dp} Pa vs Darcy ${darcyPa} Pa`);
}

// Criterio de media presión: 10 % de la presión inicial ABSOLUTA
cerca(perdidaAdmisibleMediaPresionPa(50000), 0.1 * (50000 + 101325));

// Fixtures: Bases de Cálculo!R40 (GLP) y R41 (GN). El Excel evaluaba con
// M40 = 0,01 bar (la presión manométrica B8) y 293,15 K; con esos mismos
// argumentos la fórmula reproduce el valor cacheado. La app ahora le pasa
// presión absoluta y la temperatura real (ver calc-red-gas.js).
cerca(
  factorZPengRobinson({ presionAbsBar: 0.01, temperaturaK: 293.15, temperaturaCriticaK: 397.45, presionCriticaBar: 40.23, factorAcentrico: 0.176 }),
  0.9997779878016306
); // R40 (GLP)
cerca(
  factorZPengRobinson({ presionAbsBar: 0.01, temperaturaK: 293.15, temperaturaCriticaK: 190.6, presionCriticaBar: 45.99, factorAcentrico: 0.011 }),
  0.9999765036980676
); // R41 (GN)

console.log('pipe-network.test.js: OK');
