import assert from 'node:assert/strict';
import {
  barGaugeAPaAbs, velocidadErosional, presionMaximaDiseno, factorT, chequeoCaidaPresion,
} from '../js/physics.js';
import { TABLA_TUBERIA, buscarTuberia, tuberiaDesdeManual } from '../js/tuberias.js';

function cerca(actual, esperado, tolerancia = 1e-9) {
  assert.ok(Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)), `esperado ${esperado}, obtuvo ${actual}`);
}

assert.equal(barGaugeAPaAbs(0), 101325);
assert.equal(barGaugeAPaAbs(1), 201325);

// Velocidad erosional: C/√ρ reproduce EXACTAMENTE la forma desarrollada que
// usa Hidrógeno (Hidrogeno/js/physics.js, velocidadErosion) cuando se le da
// la densidad que esa forma supone implícitamente.
{
  const z = 1.0181922871446787, temperaturaC = 20, presionMinBarG = 29.5, gravedadEspecifica = 0.0695;
  const rankine = (temperaturaC + 273) * (9 / 5);
  const psia = (1 + presionMinBarG) * 14.5;
  const formaHidrogeno = 100 * Math.sqrt((z * 10.73 * rankine) / (29 * gravedadEspecifica * psia)) * 0.3048;
  const densidadLbFt3 = (29 * gravedadEspecifica * psia) / (z * 10.73 * rankine);
  cerca(velocidadErosional({ densidadKgM3: densidadLbFt3 / 0.0624279606 }), formaHidrogeno);
  cerca(formaHidrogeno, 77.49513975277209, 1e-12); // valor baselineado en Hidrogeno/tests/calc-flujo.test.js
}

// Barlow con diámetro EXTERIOR: 1/2" Sch 40 A106 Gr. B, F = 0,40.
cerca(presionMaximaDiseno({ limiteElasticoMPa: 241, espesorMm: 2.77, diametroExteriorMm: 21.3, factorDiseno: 0.4 }), 250.73051643192490);

// Factor T: plano hasta 250 °F (121,1 °C), interpolado después.
assert.equal(factorT({ temperaturaC: 20 }), 1);
cerca(factorT({ temperaturaC: (325 - 32) * 5 / 9 }), 0.95);
assert.equal(factorT({ temperaturaC: 400 }), 0.867);

// Screening sónico con el γ del gas.
const s = chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: 80, gamma: 1.29 });
assert.equal(s.estado, 'advertencia');
cerca(s.relacionPresionCritica, Math.pow(2 / 2.29, 1.29 / 0.29));
assert.equal(chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: 50, gamma: 1.29 }).estado, 'critico');
assert.equal(chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: 95, gamma: 1.29 }).estado, 'ok');
assert.equal(chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: -1, gamma: 1.29 }).estado, 'no-aplica');

// Tabla de tubería ASME B36.10M: DI = DE − 2·espesor, ids únicos.
assert.equal(TABLA_TUBERIA.length, 26);
assert.equal(new Set(TABLA_TUBERIA.map((f) => f.id)).size, TABLA_TUBERIA.length);
assert.equal(buscarTuberia('sch40-0.5').diMm, 15.76);
assert.equal(buscarTuberia('sch80-0.5').diMm, 13.84);
assert.equal(buscarTuberia('sch40-4').diMm, 102.26);
assert.throws(() => buscarTuberia('sch40-99'));
cerca(tuberiaDesdeManual({ diMm: 10, espesorMm: 1.5, limiteElasticoMPa: 170, rugosidadMm: 0.0015 }).deMm, 13);

console.log('physics.test.js OK');
