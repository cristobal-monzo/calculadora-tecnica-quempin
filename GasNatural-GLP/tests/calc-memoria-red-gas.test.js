import assert from 'node:assert/strict';
import { calcularRedMemoria } from '../js/calc-memoria-red-gas.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Cadena de 2 tramos GLP, baja presión, tubería 1/2" Acero (mismos inputs
// que el caso "glp" ya verificado en calc-red-gas.test.js) — B continúa
// desde A con un largo distinto.
const tramos = [
  { id: 'A', nombre: 'A', continuaDesdeId: null, regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 },
  { id: 'B', nombre: 'B', continuaDesdeId: 'A', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 5, presionInicialPa: 1000, temperaturaC: 15 },
];
const resultado = calcularRedMemoria(tramos, 'GLP');
const porId = Object.fromEntries(resultado.map((t) => [t.id, t]));

// Cada tramo trae los campos que ya devuelve calcularRedGas
assert.ok(porId.A.perdidaPresionRequeridaPa > 0);
assert.equal(porId.A.tuberiaAdecuada, true);

// La acumulada del root es igual a su propia pérdida requerida
cerca(porId.A.perdidaAcumuladaPa, porId.A.perdidaPresionRequeridaPa);

// B acumula sobre A (mismo diámetro, largo distinto -> pérdida propia distinta)
cerca(porId.B.perdidaAcumuladaPa, porId.B.perdidaPresionRequeridaPa + porId.A.perdidaAcumuladaPa);
assert.notEqual(porId.A.perdidaPresionRequeridaPa, porId.B.perdidaPresionRequeridaPa);

// Régimen media/alta presión: presionFinalPa no-null se reexpone tal cual
const tramosAlta = [
  { id: 'C', nombre: 'C', continuaDesdeId: null, regimenPresion: '>10 kPa', material: 'Acero Sch40', pulgadas: 2, potenciaKw: 200, longitudM: 30, presionInicialPa: 200000, temperaturaC: 15 },
];
const resultadoAlta = calcularRedMemoria(tramosAlta, 'GN');
assert.ok(resultadoAlta[0].presionFinalPa !== null);
cerca(resultadoAlta[0].presionFinalPa, 200000 - resultadoAlta[0].perdidaPresionRequeridaPa);

// Régimen baja presión: presionFinalPa se reexpone como null
assert.equal(porId.A.presionFinalPa, null);

// El gas viene del segundo parámetro, no de un campo por tramo — el mismo
// tramo da resultados distintos según el gas pasado (PCI volumétrico distinto).
const tramoBase = { id: 'X', nombre: 'X', continuaDesdeId: null, regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 };
const comoGLP = calcularRedMemoria([tramoBase], 'GLP');
const comoGN = calcularRedMemoria([tramoBase], 'GN');
assert.notEqual(comoGLP[0].caudalObjetivoM3H, comoGN[0].caudalObjetivoM3H);

// Diámetro manual por tramo — mismo criterio que Red de Gas de un solo tramo
const tramoManual = [{ id: 'M', nombre: 'M', continuaDesdeId: null, regimenPresion: '<10 kPa', pulgadas: 'manual', tuberiaManual: { diametroMm: 15.8, k: 1800 }, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 }];
const resultadoManual = calcularRedMemoria(tramoManual, 'GLP');
assert.equal(resultadoManual[0].diametroMm, 15.8);
assert.equal(resultadoManual[0].tuberia, null);

// Ciclo -> error explícito, no cuelgue infinito
assert.throws(
  () => calcularRedMemoria([
    { id: 'X', nombre: 'X', continuaDesdeId: 'Y', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 },
    { id: 'Y', nombre: 'Y', continuaDesdeId: 'X', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 },
  ], 'GLP'),
  /[Cc]iclo/
);

// continuaDesdeId inválido -> error explícito
assert.throws(
  () => calcularRedMemoria([
    { id: 'X', nombre: 'X', continuaDesdeId: 'NO_EXISTE', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 },
  ], 'GLP'),
  /no existe/
);

// Reseteo de pérdida acumulada — mismo criterio que Hidrogeno/js/calc-memoria.js:
// un tramo con reseteaAcumulada=true ignora la acumulada heredada del padre.
const tramosReset = [
  { id: 'P', nombre: 'P', continuaDesdeId: null, regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 },
  { id: 'Q', nombre: 'Q', continuaDesdeId: 'P', reseteaAcumulada: true, regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 5, presionInicialPa: 1000, temperaturaC: 15 },
  { id: 'R', nombre: 'R', continuaDesdeId: 'Q', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 3, presionInicialPa: 1000, temperaturaC: 15 },
];
const resultadoReset = calcularRedMemoria(tramosReset, 'GLP');
const porIdReset = Object.fromEntries(resultadoReset.map((t) => [t.id, t]));
cerca(porIdReset.Q.perdidaAcumuladaPa, porIdReset.Q.perdidaPresionRequeridaPa);
assert.notEqual(porIdReset.Q.perdidaAcumuladaPa, porIdReset.Q.perdidaPresionRequeridaPa + porIdReset.P.perdidaAcumuladaPa);
cerca(porIdReset.R.perdidaAcumuladaPa, porIdReset.R.perdidaPresionRequeridaPa + porIdReset.Q.perdidaAcumuladaPa);

console.log('calc-memoria-red-gas.test.js: OK');
