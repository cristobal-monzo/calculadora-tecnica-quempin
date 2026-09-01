import assert from 'node:assert/strict';
import { H2, TABLA_TUBERIA, buscarTuberia, factorZDiseno, factorZErosion } from '../js/gas-h2.js';

function cerca(actual, esperado, tolerancia = 1e-9) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

assert.equal(H2.masaMolarKgMol, 0.002016);
assert.equal(H2.constanteR, 8.314);
assert.equal(H2.pciKjKg, 120000);
assert.equal(H2.densidadNormalKgM3, 0.089);
assert.equal(TABLA_TUBERIA.length, 6);

const fila = buscarTuberia(0.5);
assert.equal(fila.diMm, 12.7);
assert.equal(fila.espesorMm, 1.2);
assert.equal(fila.limiteElasticoMPa, 170);
assert.equal(fila.rugosidadMm, 0.002);
assert.throws(() => buscarTuberia(3), /no encontrado/);

// Fixtures Cálculo!B93 y Cálculo!C27, 2026-09-01
cerca(factorZDiseno({ presionBarG: 0.8, temperaturaC: 20 }), 1.0004759430898928);
assert.equal(factorZErosion(29.5), 1.02);
assert.equal(factorZErosion(10), 1);
assert.equal(factorZErosion(45), 1.02);
assert.equal(factorZErosion(150), 1.1);
assert.equal(factorZErosion(250), 1.2);
assert.throws(() => factorZErosion(350), /rango/);

console.log('gas-h2.test.js: OK');
