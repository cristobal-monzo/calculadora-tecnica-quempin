// Regresión del motor de "Diámetro de Tubería". No hay Excel fuente: la
// selección se verifica contra la fórmula f.1 del D.S. 66 escrita a mano
// acá (baja presión, invertida en ΔP) y contra relaciones físicas
// independientes (ΔP ∝ L en baja presión, ΔP de codos = ΣK·ρv²/2 en H₂,
// conservación de masa), no contra un baseline del propio motor.

import assert from 'node:assert/strict';
import { calcularDiametro, regimenDesdePresion, LD_CODO_POR_DEFECTO, K_CODO_H2 } from '../js/calc-diametro.js';
import { calcularFlujo } from '../../Hidrogeno/js/calc-flujo.js';

function cerca(actual, esperado, tolerancia = 1e-9) {
  assert.ok(Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)), `esperado ${esperado}, obtuvo ${actual}`);
}

// D.S. 66 f.1 (baja presión) despejada en ΔP [Pa]:
//   Q = 9,65·10^-7,5 · K · √(D⁵·ΔP/(S·L))  →  ΔP = (Q/(9,65·10^-7,5·K))² · S·L / D⁵
// Q [m³/h] = P[kW]·3,6/PCS[MJ/m³] (f.2), D = diámetro interior [mm].
function perdidaDS66Pa({ potenciaKw, pcs, s, k, diMm, longitudM }) {
  const q = (potenciaKw * 3.6) / pcs;
  return ((q / (9.65 * 10 ** -7.5 * k)) ** 2) * s * longitudM / diMm ** 5;
}

const baseGLP = { gas: 'GLP', potenciaKw: 30, longitudM: 10, codos: 0, presionPa: 1000, temperaturaC: 15, material: 'Cobre tipo L', gasTablaVI: 'licuado' };
const GLP_LICUADO = { pcs: 119.7, s: 2.0 };
const DI_COBRE = { 0.375: 10.92, 0.5: 13.84, 0.75: 19.94 };

// --- GLP, 30 kW, 10 m, sin codos, cobre tipo L → 1/2" ---
const glp = calcularDiametro(baseGLP);
assert.equal(glp.metodo, 'ds66');
assert.equal(glp.regimen, '<10 kPa');
assert.equal(glp.perdidaAdmisiblePa, 150);
assert.equal(glp.candidatos[0].pulgadas, 0.375); // la lista parte en 3/8" (Tabla IX)
assert.equal(glp.candidatos[glp.candidatos.length - 1].pulgadas, 4);
assert.equal(glp.recomendado.pulgadas, 0.5);
cerca(glp.caudalM3H, (30 * 3.6) / 119.7);
// 3/8" no cumple y 1/2" sí, contra la fórmula del decreto escrita a mano.
const dp38 = perdidaDS66Pa({ potenciaKw: 30, ...GLP_LICUADO, k: 1800, diMm: DI_COBRE[0.375], longitudM: 10 });
const dp12 = perdidaDS66Pa({ potenciaKw: 30, ...GLP_LICUADO, k: 1800, diMm: DI_COBRE[0.5], longitudM: 10 });
assert.ok(dp38 > 150 && dp12 <= 150);
cerca(glp.candidatos[0].perdidaPa, dp38);
cerca(glp.recomendado.perdidaPa, dp12);
assert.equal(glp.candidatos[0].cumple, false);
assert.equal(glp.recomendado.gobernante.id, 'perdida');
cerca(glp.recomendado.gobernante.uso, dp12 / 150);
assert.equal(glp.recomendado.perdidaCodosPa, 0);
assert.equal(glp.riesgoCondensacion, false);

// --- Codos: cada uno suma 30 DI de largo equivalente ---
// 4 codos: 1/2" sigue cumpliendo (10 + 4·30·13,84 mm = 11,66 m).
const cuatro = calcularDiametro({ ...baseGLP, codos: 4 });
assert.equal(cuatro.recomendado.pulgadas, 0.5);
cerca(cuatro.recomendado.longitudCalculoM, 10 + (4 * LD_CODO_POR_DEFECTO * 13.84) / 1000);
cerca(cuatro.recomendado.perdidaPa, perdidaDS66Pa({ potenciaKw: 30, ...GLP_LICUADO, k: 1800, diMm: 13.84, longitudM: cuatro.recomendado.longitudCalculoM }));
// En baja presión ΔP ∝ L: el aporte de los codos es ΔP·Le/L.
cerca(cuatro.recomendado.perdidaCodosPa, dp12 * (cuatro.recomendado.longitudCodosM / 10));
// 12 codos: 1/2" pasa de 150 Pa (10 + 4,98 m) → sube a 3/4". Los codos
// cambian la respuesta, que es justamente lo que pide la calculadora.
const doce = calcularDiametro({ ...baseGLP, codos: 12 });
assert.equal(doce.candidatos[1].pulgadas, 0.5);
assert.equal(doce.candidatos[1].cumple, false);
assert.ok(doce.candidatos[1].perdidaPa > 150);
assert.equal(doce.recomendado.pulgadas, 0.75);
cerca(doce.recomendado.perdidaPa, perdidaDS66Pa({ potenciaKw: 30, ...GLP_LICUADO, k: 1800, diMm: DI_COBRE[0.75], longitudM: 10 + (12 * 30 * DI_COBRE[0.75]) / 1000 }));
// L/D editable: con 0 diámetros por codo, los codos no suman nada.
assert.equal(calcularDiametro({ ...baseGLP, codos: 12, ldCodo: 0 }).recomendado.pulgadas, 0.5);

// --- Acero Sch 40 (DI mayor que el cobre en el mismo nominal) ---
const acero = calcularDiametro({ ...baseGLP, material: 'Acero Sch40' });
assert.equal(acero.recomendado.diMm, 15.8);
cerca(acero.recomendado.perdidaPa, perdidaDS66Pa({ potenciaKw: 30, ...GLP_LICUADO, k: 1800, diMm: 15.8, longitudM: 10 }));

// --- Gas natural, misma instalación → 3/4" (PCS 37,54 contra 119,7:
// ~3,2 veces más caudal para los mismos kW, y admisible de 120 Pa) ---
const gn = calcularDiametro({ ...baseGLP, gas: 'GN', gasTablaVI: 'natural-v-rm' });
assert.equal(gn.perdidaAdmisiblePa, 120);
assert.equal(gn.recomendado.pulgadas, 0.75);
cerca(gn.recomendado.perdidaPa, perdidaDS66Pa({ potenciaKw: 30, pcs: 37.54, s: 0.87, k: 1800, diMm: DI_COBRE[0.75], longitudM: 10 }));
assert.ok(perdidaDS66Pa({ potenciaKw: 30, pcs: 37.54, s: 0.87, k: 1800, diMm: DI_COBRE[0.5], longitudM: 10 }) > 120);
assert.equal(gn.tablaVI.id, 'natural-v-rm');

// --- Ningún diámetro alcanza: 5.000 kW de GLP por 200 m ---
const nada = calcularDiametro({ ...baseGLP, potenciaKw: 5000, longitudM: 200 });
assert.equal(nada.recomendado, null);
assert.equal(nada.indiceRecomendado, -1);
assert.equal(nada.mayor.pulgadas, 4);
assert.ok(nada.mayor.perdidaPa > 150);

// --- Media presión: el régimen se deduce de la presión (≥ 10 kPa) ---
assert.equal(regimenDesdePresion(9999), '<10 kPa');
assert.equal(regimenDesdePresion(10000), '>10 kPa');
const media = calcularDiametro({ ...baseGLP, gas: 'GN', gasTablaVI: 'natural-v-rm', potenciaKw: 300, longitudM: 30, presionPa: 150000 });
assert.equal(media.regimen, '>10 kPa');
cerca(media.perdidaAdmisiblePa, 0.10 * (150000 + 101325)); // 10 % de la presión absoluta
assert.ok(media.recomendado !== null);
assert.ok(media.recomendado.perdidaPa <= media.perdidaAdmisiblePa);
media.candidatos.slice(0, media.indiceRecomendado).forEach((c) => assert.equal(c.cumple, false));
// Baja presión: un solo criterio (la pérdida); sin límite de velocidad.
assert.equal(glp.recomendado.criterios.length, 1);
// Media presión: D.S. 66 art. 45.2.9 d), velocidad < 40 m/s. GN 300 kW por
// 1 m a 20 kPa: en 3/8" la pérdida cumple de sobra (1 m) pero el gas va a
// ~76 m/s; 1/2" ~46 m/s; recién 3/4" baja de 40.
const rapida = calcularDiametro({ ...baseGLP, gas: 'GN', gasTablaVI: 'natural-v-rm', potenciaKw: 300, longitudM: 1, presionPa: 20000 });
const r38 = rapida.candidatos[0];
assert.equal(r38.criterios.find((k) => k.id === 'perdida').cumple, true);
assert.equal(r38.criterios.find((k) => k.id === 'velocidad').cumple, false);
assert.equal(r38.gobernante.id, 'velocidad');
assert.equal(rapida.candidatos[1].cumple, false);
assert.equal(rapida.recomendado.pulgadas, 0.75);
assert.ok(rapida.recomendado.velocidadMS < 40);
// La velocidad es la de f.5 del decreto: V = 1,25·Q·T/(p2·D²), p2 absoluta [bar].
const p2Bar = (20000 - r38.perdidaPa + 101325) / 1e5;
cerca(r38.velocidadMS, (1.25 * ((300 * 3.6) / 37.54) * 288.15) / (p2Bar * DI_COBRE[0.375] ** 2));
// Límite estricto: "inferior a 40 m/s" (40 exacto no cumple).
const velocidad38 = r38.criterios.find((k) => k.id === 'velocidad');
assert.equal(velocidad38.limite, 40);
assert.equal(velocidad38.estricto, true);

// Un diámetro que no puede entregar el caudal a esa presión no revienta el
// cálculo: queda marcado y se sigue con el siguiente.
const saturada = calcularDiametro({ ...baseGLP, gas: 'GN', gasTablaVI: 'natural-v-rm', potenciaKw: 3000, longitudM: 300, presionPa: 20000 });
assert.equal(saturada.candidatos[0].excedeCapacidad, true);
assert.equal(saturada.candidatos[0].cumple, false);

// --- GLP en media presión que condensa (8 bar man. a 0 °C) ---
const condensa = calcularDiametro({ ...baseGLP, presionPa: 800000, temperaturaC: 0 });
assert.equal(condensa.riesgoCondensacion, true);

// --- Hidrógeno: 60 kW, 20 m, 0,8 barG, 20 °C (valores por defecto de
// Tubería y Flujo). En 1/2" la velocidad es ~40 m/s (ver Hidrogeno/CLAUDE.md,
// 2026-09-25) → no cumple 20 m/s; 3/4" sí. ---
const baseH2 = { gas: 'H2', potenciaKw: 60, longitudM: 20, codos: 0, presionPa: 80000, temperaturaC: 20 };
const h2 = calcularDiametro(baseH2);
assert.equal(h2.metodo, 'darcy');
const h2Media = h2.candidatos.find((c) => c.pulgadas === 0.5);
assert.equal(h2Media.cumple, false);
assert.ok(h2Media.velocidadMS > 20);
assert.equal(h2Media.gobernante.id, 'velocidad');
assert.equal(h2.recomendado.pulgadas, 0.75);
assert.ok(h2.recomendado.velocidadMS <= 20);
cerca(h2.perdidaAdmisiblePa, 0.10 * 180000); // 10 % de 1,8 bar abs
// Mismo número que Tubería y Flujo para el mismo diámetro.
const directo = calcularFlujo({
  presionBarG: 0.8, temperaturaC: 20, potenciaKw: 60, tuberiaPulgadas: 0.75, presionMinBarG: 0.8,
  largoM: 20, codos: 0, tees: 0, valvulas: 0, factorDiseno: 0.4, factorUnion: 1,
});
cerca(h2.recomendado.velocidadMS, directo.velocidadFlujoMS);
cerca(h2.recomendado.perdidaPa, directo.perdidaCargaMbar * 100);
// Conservación de masa: ṁ = ρ·v·A con ṁ = 60 kW / 120 MJ/kg.
const a34 = Math.PI * (h2.recomendado.diMm / 1000) ** 2 / 4;
cerca(directo.densidadKgM3 * h2.recomendado.velocidadMS * a34 * 3600, (60 / 120000) * 3600);
// Codos en H₂: K = 0,7 cada uno → ΔP extra = 0,7·n·ρv²/2. Con K_CODO_H2
// (el que muestra la UI) comprueba además que coincide con el del motor.
const h2Codos = calcularDiametro({ ...baseH2, codos: 5 });
assert.equal(K_CODO_H2, 0.7);
cerca(h2Codos.recomendado.perdidaCodosPa, (5 * K_CODO_H2 * directo.densidadKgM3 * directo.velocidadFlujoMS ** 2) / 2);
// Velocidad máxima editable: con 45 m/s alcanza 1/2".
assert.equal(calcularDiametro({ ...baseH2, velocidadMaxMS: 45 }).recomendado.pulgadas, 0.5);

// --- Entradas inválidas: mensaje explícito, no un diámetro inventado ---
assert.throws(() => calcularDiametro({ ...baseGLP, potenciaKw: 0 }), /potencia/);
assert.throws(() => calcularDiametro({ ...baseGLP, longitudM: -1 }), /largo/);
assert.throws(() => calcularDiametro({ ...baseGLP, codos: 1.5 }), /codos/);
assert.throws(() => calcularDiametro({ ...baseGLP, codos: -1 }), /codos/);
assert.throws(() => calcularDiametro({ ...baseGLP, presionPa: 0 }), /presión/);
assert.throws(() => calcularDiametro({ ...baseGLP, gas: 'CO2' }), /Gas no soportado/);

console.log('calc-diametro.test.js OK');
