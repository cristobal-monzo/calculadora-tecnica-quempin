// Tests de la ÚNICA función de factor de compresibilidad Z del hidrógeno
// (`factorZHidrogeno` en js/gas-h2.js), AGREGADOS 2026-09-08 a pedido del
// usuario junto con la unificación de Z en toda la app.
//
// Tres bloques:
//   1. Los 5 puntos oficiales de validación publicados por NIST para esta
//      ecuación (Tabla 2 de Lemmon, Huber & Leachman 2008) — son puntos
//      pensados justamente para verificar implementaciones informáticas.
//   2. Continuidad alrededor de 200 bar: regresión del bug que motivó este
//      cambio (Almacenamiento usaba una función escalón que saltaba de
//      Z=1.1 a Z=1.2 exactamente en 200 bar, con el salto artificial
//      correspondiente en la masa almacenada).
//   3. Consistencia entre pestañas: "Tubería y Flujo" y "Almacenamiento"
//      deben dar EXACTAMENTE el mismo Z para el mismo estado termodinámico.

import assert from 'node:assert/strict';
import { factorZHidrogeno, factorZDesdeBarG, factorZDesdeBarAbs } from '../js/gas-h2.js';
import { calcularFlujo } from '../js/calc-flujo.js';
import { calcularAlmacenamiento } from '../js/calc-almacenamiento.js';

function cerca(actual, esperado, tolerancia = 1e-7) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia,
    `esperado ${esperado}, obtuvo ${actual} (dif ${Math.abs(actual - esperado)})`
  );
}

/* ---------------------------------------------------------------------- */
/* 1. Puntos oficiales de validación NIST                                 */
/* ---------------------------------------------------------------------- */

// Lemmon, E. W.; Huber, M. L.; Leachman, J. W. "Revised Standardized
// Equation for Hydrogen Gas Densities for Fuel Consumption Applications",
// Journal of Research of the NIST, Vol. 113, No. 6, 2008 — Tabla 2.
// Presión ABSOLUTA en MPa, temperatura en K.
// La tolerancia de 1e-7 está limitada por las 9 cifras significativas con
// que la publicación entrega los coeficientes ai, no por la implementación
// (las diferencias reales quedan en el orden de 1e-9).
const PUNTOS_NIST = [
  { temperaturaK: 200, presionAbsMPa: 1,   z: 1.00675450 },
  { temperaturaK: 300, presionAbsMPa: 10,  z: 1.05985282 },
  { temperaturaK: 400, presionAbsMPa: 50,  z: 1.24304763 },
  { temperaturaK: 500, presionAbsMPa: 200, z: 1.74461629 },
  { temperaturaK: 200, presionAbsMPa: 200, z: 2.85953449 },
];

for (const { temperaturaK, presionAbsMPa, z } of PUNTOS_NIST) {
  cerca(factorZHidrogeno({ presionAbsMPa, temperaturaK }), z);
}

/* ---------------------------------------------------------------------- */
/* 2. Continuidad alrededor de 200 bar                                    */
/* ---------------------------------------------------------------------- */

// Valores de referencia calculados con la correlación a 300 K.
cerca(factorZHidrogeno({ presionAbsMPa: 19.99, temperaturaK: 300 }), 1.12245981);
cerca(factorZHidrogeno({ presionAbsMPa: 20.00, temperaturaK: 300 }), 1.12252354);
cerca(factorZHidrogeno({ presionAbsMPa: 20.01, temperaturaK: 300 }), 1.12258727);

// Sin escalón: los tres puntos están alineados y el paso entre ellos es del
// mismo orden (una función escalón daría un salto de ~0.1 en uno de los dos
// intervalos y 0 en el otro).
const zAntes = factorZHidrogeno({ presionAbsMPa: 19.99, temperaturaK: 300 });
const zJusto = factorZHidrogeno({ presionAbsMPa: 20.00, temperaturaK: 300 });
const zDespues = factorZHidrogeno({ presionAbsMPa: 20.01, temperaturaK: 300 });
const pasoBajo = zJusto - zAntes;
const pasoAlto = zDespues - zJusto;
assert.ok(pasoBajo > 0 && pasoAlto > 0, 'Z debe crecer monótonamente en este tramo');
assert.ok(Math.abs(pasoAlto - pasoBajo) < 1e-6, `salto discreto detectado: ${pasoBajo} vs ${pasoAlto}`);

// La masa almacenada debe cambiar suavemente en el mismo entorno.
const masa = (presionBarAbs) =>
  calcularAlmacenamiento({ potenciaKw: 60, temperaturaC: 26.85, presionBarAbs, volumenM3: 0.19 }).masaAlmacenadaKg;
const masaAntes = masa(199.9);
const masaJusto = masa(200.0);
const masaDespues = masa(200.1);
const deltaMasaBajo = masaJusto - masaAntes;
const deltaMasaAlto = masaDespues - masaJusto;
assert.ok(deltaMasaBajo > 0 && deltaMasaAlto > 0, 'la masa debe crecer con la presión');
assert.ok(
  Math.abs(deltaMasaAlto - deltaMasaBajo) < 1e-6 * masaJusto,
  `salto artificial en la masa almacenada en 200 bar: ${deltaMasaBajo} vs ${deltaMasaAlto}`
);

/* ---------------------------------------------------------------------- */
/* 3. Consistencia entre pestañas                                         */
/* ---------------------------------------------------------------------- */

// Mismo estado termodinámico expresado como lo pide cada pestaña: "Tubería
// y Flujo" trabaja en presión manométrica, "Almacenamiento" en absoluta
// (1 bar de atmósfera, la convención de todo el módulo). El Z resultante
// debe ser idéntico bit a bit, no solo parecido.
const flujo = calcularFlujo({
  presionBarG: 199, temperaturaC: 20, potenciaKw: 60, tuberiaPulgadas: 0.5,
  presionMinBarG: 199, largoM: 20, codos: 0, tees: 0, valvulas: 0,
  factorDiseno: 0.4, factorUnion: 1,
});
const almacenamiento = calcularAlmacenamiento({
  potenciaKw: 60, temperaturaC: 20, presionBarAbs: 200, volumenM3: 0.19,
});
assert.equal(flujo.zDiseno, almacenamiento.zAlmacenamiento);

// El Z de velocidad de erosión sale de la misma función (evaluado en la
// presión mínima del tramo, que acá es la misma).
assert.equal(flujo.zErosion, flujo.zDiseno);

// Y los adaptadores de unidades coinciden con la función base.
assert.equal(
  factorZDesdeBarG({ presionBarG: 199, temperaturaC: 20 }),
  factorZHidrogeno({ presionAbsMPa: 20, temperaturaK: 293.15 })
);
assert.equal(
  factorZDesdeBarAbs({ presionBarAbs: 200, temperaturaC: 20 }),
  factorZHidrogeno({ presionAbsMPa: 20, temperaturaK: 293.15 })
);

// Rango de almacenamiento de H₂ comprimido (100-700 bar): la correlación
// debe evaluarse sin lanzar (la función escalón anterior tiraba error sobre
// 300 bar) y seguir creciendo monótonamente.
let zPrevio = 0;
for (let barAbs = 100; barAbs <= 700; barAbs += 50) {
  const z = factorZDesdeBarAbs({ presionBarAbs: barAbs, temperaturaC: 20 });
  assert.ok(z > zPrevio, `Z no monótono en ${barAbs} bar abs`);
  zPrevio = z;
}

console.log('factor-z-h2.test.js: OK');
