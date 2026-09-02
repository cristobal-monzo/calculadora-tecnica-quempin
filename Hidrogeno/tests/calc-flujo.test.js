import assert from 'node:assert/strict';
import { calcularFlujo } from '../js/calc-flujo.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Inputs = valores por defecto de Calculos H2.xlsx, hoja "Cálculo", 2026-09-01
const r = calcularFlujo({
  presionBarG: 0.8,
  temperaturaC: 20,
  potenciaKw: 60,
  tuberiaPulgadas: 0.5,
  presionMinBarG: 29.5,
  largoM: 20,
  codos: 0,
  tees: 0,
  valvulas: 0,
  factorDiseno: 0.4,
  factorUnion: 1,
  unidadNormalizado: '[sL/min]',
  unidadH2: '[m3/h]',
});

cerca(r.presionMaxDisenoBar, 128.50393700787401);   // C10 — Hf=1 en este caso (presión cae en la zona plana de la Tabla IX-5A, ≤2000 psig)
assert.equal(r.factorHfAplicado, 1);                 // factorHf, AGREGADO 2026-09-02
assert.equal(r.factorTAplicado, 1);                  // factorT, AGREGADO 2026-09-02 — 20°C=68°F, bajo el umbral de 250°F
assert.equal(r.tuberiaAdecuada, true);               // tuberiaAdecuada, AGREGADO 2026-09-02 — presionBarG(0.8) <= presionMaxDisenoBar
cerca(r.flujoMasicoKgH, 1.8);                        // C13
cerca(r.zDiseno, 1.0004759430898928);                // C26
cerca(r.densidadKgM3, 0.14881834275071656);          // C20
cerca(r.flujoVolNormalizado, 355.5849438202248);     // C11
cerca(r.flujoVolH2, 12.095283193787164);             // C12
assert.equal(r.zErosion, 1.02);                       // C27
cerca(r.velocidadErosionMS, 77.56390222440128);       // C14
cerca(r.velocidadFlujoMS, 26.522607427443383);        // C15
cerca(r.reynolds, 5012.754113130562);                 // C30
// C31/C32/C16 CORREGIDOS respecto al Excel fuente (2026-09-02, a pedido del
// usuario) — ver Hidrogeno/CLAUDE.md y physics.test.js.
cerca(r.rugosidadRelativa, 0.00015748031496062994);
cerca(r.factorFriccion, 0.03781741551718751);
cerca(r.perdidaCargaMbar, 31.17288681188844);

// factorHf, AGREGADO 2026-09-02 — caso sintético con factorDiseno=1.0
// (tubería 1.25", F=1) para forzar una presión de diseño por encima de la
// zona plana de la Tabla IX-5A (>2000 psig) y ejercitar la interpolación +
// iteración real (no solo el caso trivial Hf=1 de arriba).
const rAltaPresion = calcularFlujo({
  presionBarG: 0.8, temperaturaC: 20, potenciaKw: 60, tuberiaPulgadas: 1.25,
  presionMinBarG: 29.5, largoM: 20, codos: 0, tees: 0, valvulas: 0,
  factorDiseno: 1.0, factorUnion: 1, unidadNormalizado: '[sL/min]', unidadH2: '[m3/h]',
});
cerca(rAltaPresion.presionMaxDisenoBar, 156.7518365893937);
cerca(rAltaPresion.factorHfAplicado, 0.9378315009620852);

// Tubería manual (2026-09-02, a pedido del usuario) — con los mismos
// datos que la fila tabulada de 1/2" (diMm:12.7, espesorMm:1.2,
// limiteElasticoMPa:170, rugosidadMm:0.002), debe dar exactamente el mismo
// resultado que el caso "r" de arriba, tuberiaPulgadas se ignora.
const rManual = calcularFlujo({
  presionBarG: 0.8, temperaturaC: 20, potenciaKw: 60, tuberiaPulgadas: null,
  tuberiaManual: { diMm: 12.7, espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
  presionMinBarG: 29.5, largoM: 20, codos: 0, tees: 0, valvulas: 0,
  factorDiseno: 0.4, factorUnion: 1, unidadNormalizado: '[sL/min]', unidadH2: '[m3/h]',
});
cerca(rManual.presionMaxDisenoBar, r.presionMaxDisenoBar);
cerca(rManual.perdidaCargaMbar, r.perdidaCargaMbar);
cerca(rManual.velocidadFlujoMS, r.velocidadFlujoMS);

// tuberiaAdecuada, AGREGADO 2026-09-02 — rama "No adecuada": presión de
// operación deliberadamente muy por encima de la máxima de diseño (tubería
// más delgada de la tabla, 1/4").
const rInadecuada = calcularFlujo({
  presionBarG: 500, temperaturaC: 20, potenciaKw: 60, tuberiaPulgadas: 0.25,
  presionMinBarG: 29.5, largoM: 20, codos: 0, tees: 0, valvulas: 0,
  factorDiseno: 0.4, factorUnion: 1, unidadNormalizado: '[sL/min]', unidadH2: '[m3/h]',
});
assert.ok(rInadecuada.presionMaxDisenoBar < 500);
assert.equal(rInadecuada.tuberiaAdecuada, false);

console.log('calc-flujo.test.js: OK');
