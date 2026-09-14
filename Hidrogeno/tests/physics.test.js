import assert from 'node:assert/strict';
import {
  reynolds, rugosidadRelativa, factorFriccionHaaland, densidadReal,
  barGaugeAPaAbs, barAbsAPaAbs, presionMaximaDiseno, velocidadErosion,
  perdidaCargaTramo, chequeoCaidaPresion,
} from '../js/physics.js';

function cerca(actual, esperado, tolerancia = 1e-9) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Fixtures extraídos de Calculos H2.xlsx, hoja "Cálculo", 2026-09-01
cerca(
  presionMaximaDiseno({ limiteElasticoMPa: 170, espesorMm: 1.2, diametroMm: 12.7, factorDiseno: 0.4, factorUnion: 1 }),
  128.50393700787401
); // C10 — factorHf por defecto = 1 (sin efecto en la fórmula base)

// factorHf (ASME B31.12 Tabla IX-5A) AGREGADO 2026-09-02 — recomputado a
// mano: 10*((2*170*1.2)/12.7)*0.4*1*0.8
cerca(
  presionMaximaDiseno({ limiteElasticoMPa: 170, espesorMm: 1.2, diametroMm: 12.7, factorDiseno: 0.4, factorUnion: 1, factorHf: 0.8 }),
  102.80314960629921
);

// factorT (ASME B31.12 Tabla PL-3.7.1(b)(8)) AGREGADO 2026-09-02 —
// recomputado a mano: 10*((2*170*1.2)/12.7)*0.4*1*1*0.9 = 128.50393700787401*0.9
cerca(
  presionMaximaDiseno({ limiteElasticoMPa: 170, espesorMm: 1.2, diametroMm: 12.7, factorDiseno: 0.4, factorUnion: 1, factorT: 0.9 }),
  115.65354330708661
);

cerca(barGaugeAPaAbs(0.8), 180000);
cerca(barAbsAPaAbs(200), 20000000);

cerca(
  densidadReal({ presionAbsPa: barGaugeAPaAbs(0.8), temperaturaC: 20, masaMolar: 0.002016, constanteR: 8.314, z: 1.0004759430898928 }),
  0.14881834275071656
); // C20

cerca(
  velocidadErosion({ zErosion: 1.02, temperaturaC: 20, presionMinBarG: 29.5, gravedadEspecifica: 0.0695 }),
  77.56390222440128
); // C14

// CORREGIDO respecto al Excel fuente (2026-09-02, a pedido del usuario):
// C31 dividía la rugosidad (mm) por el diámetro ya en METROS sin
// reconvertir, dando una rugosidad relativa ~1000x más alta que la real.
// Valor recomputado: 0.002 / (12.7/1000 * 1000) = 0.002/12.7.
cerca(
  rugosidadRelativa({ rugosidadAbsoluta: 0.002, diametroM: 12.7 / 1000 }),
  0.00015748031496062994
);

cerca(
  reynolds({ densidad: 0.14881834275071656, velocidad: 26.522607427443383, diametroM: 12.7 / 1000, viscosidad: 0.00001 }),
  5012.754113130562
); // C30

// CORREGIDO respecto al Excel fuente (2026-09-02, a pedido del usuario):
// C32 sumaba 6.9/Re FUERA del logaritmo; la ecuación de Haaland (1983)
// publicada lo suma adentro. Recomputado con la rugosidad relativa ya
// corregida arriba — contrastado independientemente con Blasius
// (f=0.316/Re^0.25=0.0376 para este Re), coincide.
cerca(
  factorFriccionHaaland({ rugosidadRelativa: 0.00015748031496062994, reynolds: 5012.754113130562 }),
  0.03781741551718751
);

cerca(
  perdidaCargaTramo({ factorFriccion: 0.03781741551718751, longitudM: 20, diametroM: 12.7 / 1000, densidad: 0.14881834275071656, velocidad: 26.522607427443383, sumaCoeficientesLocales: 0 }),
  31.17288681188844
); // C16 — antes de la corrección de C31/C32 daba 109.75 mbar (~3.5x más alto)

/* ---------------------------------------------------------------------- */
/* chequeoCaidaPresion — screening simplificado de caída de presión /      */
/* flujo sónico (AGREGADO 2026-09-08, a pedido del usuario).               */
/* NO es API RP 14E: es un chequeo adicional e independiente, ver          */
/* Hidrogeno/CLAUDE.md. Los casos 1-4 son los fixtures pedidos             */
/* explícitamente por el usuario, en presión ABSOLUTA.                     */
/* ---------------------------------------------------------------------- */

// El límite crítico de gas ideal para gamma=1.40 — (2/(gamma+1))^(gamma/(gamma-1)).
// Valor de referencia publicado: 0.5283. Se verifica contra el resultado
// expuesto por la función, no contra una constante hardcodeada aparte.
const limite = chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: 95, gamma: 1.4 });
cerca(limite.relacionPresionCritica, 0.5282817877171742);
cerca(limite.caidaPresionCritica, 0.4717182122828258);
assert.ok(Math.abs(limite.relacionPresionCritica - 0.528) < 0.001, 'límite crítico ≈ 0.528');
assert.ok(Math.abs(limite.caidaPresionCritica - 0.472) < 0.001, 'caída crítica ≈ 0.472');

// Caso 1 — P1=100 abs, P2=95 abs -> x=0.05, OK
const caso1 = chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: 95, gamma: 1.4 });
assert.equal(caso1.aplica, true);
cerca(caso1.x, 0.05);
cerca(caso1.caidaPresionPorcentaje, 5);
cerca(caso1.relacionPresion, 0.95);
assert.equal(caso1.estado, 'ok');

// Caso 2 — P1=100 abs, P2=80 abs -> x=0.20, ADVERTENCIA
const caso2 = chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: 80, gamma: 1.4 });
cerca(caso2.x, 0.20);
cerca(caso2.caidaPresionPorcentaje, 20);
cerca(caso2.relacionPresion, 0.80);
assert.equal(caso2.estado, 'advertencia');

// Caso 3 — P1=100 abs, P2=52.8 abs -> justo en el límite crítico, CRÍTICO.
// 0.528 <= 0.5282817... , o sea x=0.472 >= 0.47171... : cae del lado crítico.
const caso3 = chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: 52.8, gamma: 1.4 });
cerca(caso3.x, 0.472);
cerca(caso3.relacionPresion, 0.528);
assert.equal(caso3.estado, 'critico');

// Caso 4 — P1=100 abs, P2=40 abs -> bien pasado el límite, CRÍTICO
const caso4 = chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: 40, gamma: 1.4 });
cerca(caso4.x, 0.60);
cerca(caso4.relacionPresion, 0.40);
assert.equal(caso4.estado, 'critico');

// Fronteras exactas de la clasificación: x=0.10 es OK (<=), y apenas por
// encima ya es advertencia. Sin esto, un `<` en vez de `<=` pasaría el
// caso 1 igual y el bug quedaría vivo.
assert.equal(chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: 90, gamma: 1.4 }).estado, 'ok');
assert.equal(chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: 89.9, gamma: 1.4 }).estado, 'advertencia');

// Validaciones: fuera de dominio -> no aplica, sin ratios inventados.
const p1Cero = chequeoCaidaPresion({ presionAguasArribaAbs: 0, presionAguasAbajoAbs: 0, gamma: 1.4 });
assert.equal(p1Cero.aplica, false);
assert.equal(p1Cero.estado, 'no-aplica');
assert.equal(p1Cero.x, null);
assert.equal(p1Cero.relacionPresion, null);

assert.equal(chequeoCaidaPresion({ presionAguasArribaAbs: -1, presionAguasAbajoAbs: -2, gamma: 1.4 }).estado, 'no-aplica');
assert.equal(chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: -0.1, gamma: 1.4 }).estado, 'no-aplica');

// P2 > P1: no es una caída de presión, el screening no aplica.
const contraflujo = chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: 120, gamma: 1.4 });
assert.equal(contraflujo.aplica, false);
assert.equal(contraflujo.estado, 'no-aplica');

// P2 = P1 (sin caída) sí aplica: x=0, OK.
const sinCaida = chequeoCaidaPresion({ presionAguasArribaAbs: 100, presionAguasAbajoAbs: 100, gamma: 1.4 });
assert.equal(sinCaida.aplica, true);
cerca(sinCaida.x, 0);
assert.equal(sinCaida.estado, 'ok');

// Agnóstica de unidad: mismas presiones en Pa dan idéntico resultado que en bar.
const enBar = chequeoCaidaPresion({ presionAguasArribaAbs: 1.8, presionAguasAbajoAbs: 1.44, gamma: 1.4 });
const enPa = chequeoCaidaPresion({ presionAguasArribaAbs: 180000, presionAguasAbajoAbs: 144000, gamma: 1.4 });
cerca(enBar.x, enPa.x);
assert.equal(enBar.estado, enPa.estado);

console.log('physics.test.js: OK');
