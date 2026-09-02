import assert from 'node:assert/strict';
import { H2, TABLA_TUBERIA, buscarTuberia, factorZDiseno, factorZErosion, factorHf } from '../js/gas-h2.js';

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

// factorHf (Tabla IX-5A ASME B31.12), AGREGADO 2026-09-02 — tabla oficial
// provista por el usuario. Fila 1 (fluencia<=358.55 MPa): factores planos
// 1.0 hasta 2000 psig, luego decrecientes hasta 0.78 a 3000 psig.
cerca(factorHf({ limiteFluenciaMPa: 170, presionDisenoBarG: 0 }), 1);
cerca(factorHf({ limiteFluenciaMPa: 170, presionDisenoBarG: 1000 / 14.5037737797 }), 1); // borde 1000 psig
// Interpolación lineal a medio camino entre 2000 psig (1.0) y 2200 psig (0.954)
cerca(factorHf({ limiteFluenciaMPa: 170, presionDisenoBarG: 2100 / 14.5037737797 }), 0.977);
// Por encima del máximo de la tabla (3000 psig) -> se satura en el último factor de la fila
cerca(factorHf({ limiteFluenciaMPa: 170, presionDisenoBarG: 5000 / 14.5037737797 }), 0.78);
// Fila 2 (413.69 MPa, material de mayor resistencia) en el mismo punto de interpolación
cerca(factorHf({ limiteFluenciaMPa: 400, presionDisenoBarG: 2100 / 14.5037737797 }), 0.854);
assert.throws(() => factorHf({ limiteFluenciaMPa: 600, presionDisenoBarG: 100 }), /rango/);

console.log('gas-h2.test.js: OK');
