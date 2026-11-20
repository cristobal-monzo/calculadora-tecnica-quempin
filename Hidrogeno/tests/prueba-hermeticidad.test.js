import assert from 'node:assert/strict';
import { pruebaHermeticidadIP, pruebaHermeticidadRed, referenciaDS66, volumenTuberiaM3 } from '../js/prueba-hermeticidad.js';
import { calcularRed } from '../js/calc-memoria.js';
import { buscarTuberia } from '../js/gas-h2.js';

function cerca(actual, esperado, tolerancia = 1e-9) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// --- ASME B31.12-2008 IP-10 ---
const p10 = pruebaHermeticidadIP({ presionDisenoBarG: 10, volumenM3: 0.1 });
assert.equal(p10.duracionMinimaMin, 10); // IP-10.6.2(b)(1)
cerca(p10.hidrostaticaBarG, 15); // IP-10.7.2(a)
cerca(p10.neumaticaBarG, 11); // IP-10.8.4
cerca(p10.alivioMaxBarG, 11 + 1.1); // IP-10.8.2: 10 % de 11 bar < 345 kPa

const p200 = pruebaHermeticidadIP({ presionDisenoBarG: 200, volumenM3: 0.1 });
cerca(p200.neumaticaBarG, 220);
cerca(p200.alivioMaxBarG, 220 + 3.45); // manda el tope de 345 kPa

// --- Referencia D.S. 66 f.11: volumen × 214, entre 15 min y 1 h ---
cerca(referenciaDS66(0.1).duracionMin, 21.4);
assert.equal(referenciaDS66(0.1).ajuste, null);
cerca(referenciaDS66(0.01).duracionMin, 15);
assert.equal(referenciaDS66(0.01).ajuste, 'minimo');
cerca(referenciaDS66(0.5).duracionMin, 60);
assert.equal(referenciaDS66(0.5).ajuste, 'maximo');

// --- Volumen: DI 100 mm, 10 m -> π/4·0,1²·10 ---
cerca(volumenTuberiaM3({ diametroInteriorMm: 100, longitudM: 10 }), Math.PI / 4 * 0.01 * 10);

// --- Red de la Memoria: mayor presión y suma de volúmenes ---
const red = calcularRed([
  { id: 'A', nombre: 'A', continuaDesdeId: null, presionMPa: 0.5, longitudM: 10, potenciaKw: 12, tuberiaPulgadas: 0.25, material: 'AISI 316L', temperaturaC: 20 },
  { id: 'B', nombre: 'B', continuaDesdeId: 'A', presionMPa: 2, longitudM: 4, potenciaKw: 12, tuberiaPulgadas: 0.25, material: 'AISI 316L', temperaturaC: 20 },
]);
const porId = Object.fromEntries(red.map((t) => [t.id, t]));
cerca(porId.A.volumenTuberiaM3, volumenTuberiaM3({ diametroInteriorMm: buscarTuberia(0.25).diMm, longitudM: 10 }));
cerca(porId.B.volumenTuberiaM3 / porId.A.volumenTuberiaM3, 4 / 10); // mismo diámetro
const pr = pruebaHermeticidadRed(red);
cerca(pr.presionDisenoBarG, 20);
cerca(pr.volumenM3, porId.A.volumenTuberiaM3 + porId.B.volumenTuberiaM3);
cerca(pr.neumaticaBarG, 22);
cerca(pr.volumenEstanqueM3, 0);

// Tubería + estanque (2026-11-19): el volumen probado suma los dos
const conEstanque = pruebaHermeticidadRed(red, { volumenEstanqueM3: 0.19 });
cerca(conEstanque.volumenTuberiaM3, pr.volumenM3);
cerca(conEstanque.volumenEstanqueM3, 0.19);
cerca(conEstanque.volumenM3, pr.volumenM3 + 0.19);
cerca(conEstanque.ds66.formulaMin, (pr.volumenM3 + 0.19) * 214);
cerca(pruebaHermeticidadRed(red, { volumenEstanqueM3: -1 }).volumenM3, pr.volumenM3); // negativo o NaN no suma
cerca(pruebaHermeticidadRed(red, { volumenEstanqueM3: NaN }).volumenM3, pr.volumenM3);

console.log('prueba-hermeticidad.test.js: OK');
