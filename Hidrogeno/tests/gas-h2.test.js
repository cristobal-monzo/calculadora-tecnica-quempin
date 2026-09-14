import assert from 'node:assert/strict';
import { H2, TABLA_TUBERIA, buscarTuberia, factorZHidrogeno, factorZDesdeBarG, factorZDesdeBarAbs, factorHf, factorT } from '../js/gas-h2.js';

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

// Factor Z — RE-BASELINEADO 2026-09-08 (a pedido del usuario). El fixture
// anterior de Cálculo!B93 era 1.0004759430898928: el Excel evaluaba la
// correlación con la presión MANOMÉTRICA (0.8 bar) y con T+273 en vez de
// T+273.15. Alimentada correctamente (presión ABSOLUTA 1.8 bar = 0.18 MPa,
// T=293.15 K) da 1.0010702551375645. Los 5 puntos oficiales de validación
// de NIST están en factor-z-h2.test.js.
cerca(factorZDesdeBarG({ presionBarG: 0.8, temperaturaC: 20 }), 1.0010702551375645);

// Presión ABSOLUTA: el adaptador manométrico suma la atmósfera antes de
// evaluar. Con presión manométrica cruda, 0 barG daría exactamente Z=1
// (todos los términos de la suma llevan P^ci con ci>0) — el estado real a
// 0 barG es 1 bar absoluto, y ahí Z ya no es 1.
assert.notEqual(factorZDesdeBarG({ presionBarG: 0, temperaturaC: 20 }), 1);
cerca(
  factorZDesdeBarG({ presionBarG: 0, temperaturaC: 20 }),
  factorZHidrogeno({ presionAbsMPa: 0.1, temperaturaK: 293.15 })
);
// El adaptador absoluto NO suma atmósfera: 1 bar abs es el mismo estado.
cerca(
  factorZDesdeBarAbs({ presionBarAbs: 1, temperaturaC: 20 }),
  factorZDesdeBarG({ presionBarG: 0, temperaturaC: 20 })
);

// Temperatura en kelvin, con 273.15 (no 273): 0°C debe ser 273.15 K.
cerca(
  factorZDesdeBarAbs({ presionBarAbs: 200, temperaturaC: 0 }),
  factorZHidrogeno({ presionAbsMPa: 20, temperaturaK: 273.15 })
);
assert.notEqual(
  factorZDesdeBarAbs({ presionBarAbs: 200, temperaturaC: 0 }),
  factorZHidrogeno({ presionAbsMPa: 20, temperaturaK: 273 })
);

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

// factorT (Tabla PL-3.7.1(b)(8) ASME B31.12), AGREGADO 2026-09-02 — tabla
// oficial provista por el usuario. Completa la fórmula de Barlow
// P=2·S·t·F·E·Hf·T/D (Hidrogeno/CLAUDE.md ya la documentaba con T
// pendiente de implementar). La tabla está en °F; factorT() convierte
// desde °C.
cerca(factorT({ temperaturaC: 20 }), 1); // 68°F, bajo el umbral de 250°F -> T=1 plano
cerca(factorT({ temperaturaC: (250 - 32) * 5 / 9 }), 1); // borde exacto 250°F
// Interpolación entre 350°F (0.933) y 400°F (0.900): 200°C = 392°F,
// t=(392-350)/(400-350)=0.84 -> 0.933+0.84*(0.900-0.933)=0.90528
cerca(factorT({ temperaturaC: 200 }), 0.90528);
cerca(factorT({ temperaturaC: 300 }), 0.867); // 572°F, sobre el máximo de la tabla (450°F) -> satura en el último factor

console.log('gas-h2.test.js: OK');
