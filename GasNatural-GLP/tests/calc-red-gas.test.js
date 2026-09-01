import assert from 'node:assert/strict';
import { calcularRedGas } from '../js/calc-red-gas.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Los formulas subyacentes (pipe-network.js) ya están verificadas contra
// Calculos H2.xlsx y Bases de Cálculo!R40/R41 (Peng-Robinson). Estos casos
// verifican la orquestación (selección de material/diámetro, velocidad,
// volumen, comparación contra pérdida admisible) contra valores derivados
// una vez de una corrida de referencia — ver comentario en cada caso.

// Caso 1: GLP, baja presión, tubería 1/2" Acero — tubería adecuada
const glp = calcularRedGas({
  gas: 'GLP', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5,
  potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15,
});
assert.equal(glp.diametroMm, 15.8);
cerca(glp.caudalObjetivoM3H, 0.9022556390977443); // Potencia*3.6/PCI_GLP = 30*3.6/119.7
cerca(glp.perdidaPresionRequeridaPa, 85.65427027088825);
cerca(glp.velocidadMS, glp.caudalObjetivoM3H / 3600 / (Math.PI * (0.0158 / 1) ** 2 / 4));
cerca(glp.volumenTuberiaM3, Math.PI * (0.0158 ** 2) / 4 * 10);
assert.equal(glp.perdidaAdmisiblePa, 150);
assert.equal(glp.tuberiaAdecuada, true); // 85.65 Pa < 150 Pa admisible

// Caso 2: GN, media/alta presión, tubería 2" Acero — tubería INSUFICIENTE
// (demuestra que el algebra de la rama >10kPa detecta un diámetro chico)
const gn = calcularRedGas({
  gas: 'GN', regimenPresion: '>10 kPa', material: 'Acero Sch40', pulgadas: 2,
  potenciaKw: 200, longitudM: 30, presionInicialPa: 200000, temperaturaC: 15,
});
assert.equal(gn.diametroMm, 52.5);
cerca(gn.caudalObjetivoM3H, 19.179541822056475); // 200*3.6/37.54
cerca(gn.perdidaPresionRequeridaPa, 579.7293620408454);
cerca(gn.presionFinalPa, 200000 - 579.7293620408454);
assert.equal(gn.perdidaAdmisiblePa, 120);
assert.equal(gn.tuberiaAdecuada, false); // 579.7 Pa > 120 Pa admisible -> hace falta un diámetro mayor

// Material Cobre usa el diámetro de cobre, no el de acero
const glpCobre = calcularRedGas({
  gas: 'GLP', regimenPresion: '<10 kPa', material: 'Cobre tipo L', pulgadas: 0.5,
  potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15,
});
assert.equal(glpCobre.diametroMm, 13.84);

console.log('calc-red-gas.test.js: OK');
