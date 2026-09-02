import assert from 'node:assert/strict';
import { calcularRed } from '../js/calc-memoria.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Topología reducida inspirada en Calculos H2.xlsx, hoja "MC": A-B es raíz,
// B-C continúa desde A-B, y hay dos ramas (C-D1 y C-D2) que continúan
// ambas desde B-C, verificando la bifurcación.
const tramos = [
  { id: 'AB', nombre: 'A-B', continuaDesdeId: null, presionMPa: 0.15, longitudM: 15.5, potenciaKw: 12, tuberiaPulgadas: 0.25, material: 'AISI 316L', temperaturaC: 20 },
  { id: 'BC', nombre: 'B-C', continuaDesdeId: 'AB', presionMPa: 0.08, longitudM: 0.3, potenciaKw: 12, tuberiaPulgadas: 0.25, material: 'AISI 316L', temperaturaC: 20 },
  { id: 'CD1', nombre: 'C-D1', continuaDesdeId: 'BC', presionMPa: 2, longitudM: 2, potenciaKw: 12, tuberiaPulgadas: 0.25, material: 'AISI 316L', temperaturaC: 20 },
  { id: 'CD2', nombre: 'C-D2', continuaDesdeId: 'BC', presionMPa: 2, longitudM: 5, potenciaKw: 12, tuberiaPulgadas: 0.25, material: 'AISI 316L', temperaturaC: 20 },
];

const resultado = calcularRed(tramos);
const porId = Object.fromEntries(resultado.map((t) => [t.id, t]));

// Cada tramo trae sus propios campos calculados
assert.ok(porId.AB.perdidaParcialMbar > 0);
assert.ok(porId.AB.densidadKgM3 > 0);
assert.ok(porId.AB.velocidadFlujoMS > 0);

// La acumulada del root es igual a su propia parcial
cerca(porId.AB.perdidaAcumuladaMbar, porId.AB.perdidaParcialMbar);

// B-C acumula sobre A-B
cerca(porId.BC.perdidaAcumuladaMbar, porId.BC.perdidaParcialMbar + porId.AB.perdidaAcumuladaMbar);

// Las dos ramas parten del mismo padre (B-C) con la MISMA acumulada heredada
// pero distinta parcial propia (largo distinto: 2m vs 5m) -> acumuladas distintas
cerca(porId.CD1.perdidaAcumuladaMbar, porId.CD1.perdidaParcialMbar + porId.BC.perdidaAcumuladaMbar);
cerca(porId.CD2.perdidaAcumuladaMbar, porId.CD2.perdidaParcialMbar + porId.BC.perdidaAcumuladaMbar);
assert.notEqual(porId.CD1.perdidaAcumuladaMbar, porId.CD2.perdidaAcumuladaMbar);

// Ciclo -> error explícito, no cuelgue infinito
assert.throws(
  () => calcularRed([
    { id: 'X', nombre: 'X', continuaDesdeId: 'Y', presionMPa: 1, longitudM: 1, potenciaKw: 1, tuberiaPulgadas: 0.25, material: '-', temperaturaC: 20 },
    { id: 'Y', nombre: 'Y', continuaDesdeId: 'X', presionMPa: 1, longitudM: 1, potenciaKw: 1, tuberiaPulgadas: 0.25, material: '-', temperaturaC: 20 },
  ]),
  /[Cc]iclo/
);

// Tubería manual por tramo (2026-09-02, a pedido del usuario) — un tramo
// con tuberiaManual igual a la fila tabulada de 1/4" (diMm:6.4,
// espesorMm:1.2, limiteElasticoMPa:185, rugosidadMm:0.002) debe dar
// exactamente el mismo resultado que uno con tuberiaPulgadas:0.25.
const tramoTabulado = { id: 'M1', nombre: 'M1', continuaDesdeId: null, presionMPa: 0.15, longitudM: 15.5, potenciaKw: 12, tuberiaPulgadas: 0.25, material: 'AISI 316L', temperaturaC: 20 };
const tramoManual = { id: 'M2', nombre: 'M2', continuaDesdeId: null, presionMPa: 0.15, longitudM: 15.5, potenciaKw: 12, tuberiaPulgadas: null, tuberiaManual: { diMm: 6.4, espesorMm: 1.2, limiteElasticoMPa: 185, rugosidadMm: 0.002 }, material: 'AISI 316L', temperaturaC: 20 };
const resultadoManual = calcularRed([tramoTabulado, tramoManual]);
const porIdManual = Object.fromEntries(resultadoManual.map((t) => [t.id, t]));
cerca(porIdManual.M2.perdidaParcialMbar, porIdManual.M1.perdidaParcialMbar);
cerca(porIdManual.M2.densidadKgM3, porIdManual.M1.densidadKgM3);
cerca(porIdManual.M2.velocidadFlujoMS, porIdManual.M1.velocidadFlujoMS);

// continuaDesdeId inválido -> error explícito
assert.throws(
  () => calcularRed([
    { id: 'X', nombre: 'X', continuaDesdeId: 'NO_EXISTE', presionMPa: 1, longitudM: 1, potenciaKw: 1, tuberiaPulgadas: 0.25, material: '-', temperaturaC: 20 },
  ]),
  /no existe/
);

console.log('calc-memoria.test.js: OK');
