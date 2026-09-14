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
// C26/C20/C12/C27/C14/C15/C16 RE-BASELINEADOS 2026-09-08 (a pedido del
// usuario) al unificar el factor Z — ver Hidrogeno/CLAUDE.md y
// tests/factor-z-h2.test.js. Dos cambios de fondo: (a) la correlación
// ahora recibe presión ABSOLUTA en MPa y T en K (antes, manométrica y
// T+273), y (b) el Z de erosión ya no sale de una función escalón
// (1.02 fijo) sino de la misma correlación continua.
cerca(r.zDiseno, 1.0010702551375645);                // C26
cerca(r.densidadKgM3, 0.14872999277372206);          // C20
cerca(r.flujoVolNormalizado, 355.5849438202248);     // C11 (no depende de Z)
cerca(r.flujoVolH2, 12.102468146680552);             // C12
cerca(r.zErosion, 1.0181922871446787);                // C27
cerca(r.velocidadErosionMS, 77.49513975277209);       // C14
cerca(r.velocidadFlujoMS, 26.53836263399149);         // C15
// C30 NO cambia: Re = ρ·v·D/µ y v = ṁ/(ρ·A), así que el producto ρ·v es
// independiente de Z — buena verificación cruzada de que el re-baseline
// solo movió lo que tenía que moverse.
cerca(r.reynolds, 5012.754113130562);                 // C30
// C31/C32/C16 CORREGIDOS respecto al Excel fuente (2026-09-02, a pedido del
// usuario) — ver Hidrogeno/CLAUDE.md y physics.test.js.
cerca(r.rugosidadRelativa, 0.00015748031496062994);
cerca(r.factorFriccion, 0.03781741551718751);
cerca(r.perdidaCargaMbar, 31.19140442075346);

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

/* ---------------------------------------------------------------------- */
/* chequeoSonico — screening de caída de presión / flujo sónico            */
/* (AGREGADO 2026-09-08, a pedido del usuario). Chequeo ADICIONAL: no      */
/* toca ni reemplaza a API RP 14E (velocidadErosionMS), que sigue arriba   */
/* con su valor de siempre. Ver Hidrogeno/CLAUDE.md.                       */
/* ---------------------------------------------------------------------- */

// P1 = presión de operación; P2 = P1 menos la pérdida de carga de la línea
// que el motor ya calcula. Ambas convertidas a ABSOLUTA antes de razonar.
assert.equal(r.chequeoSonico.aplica, true);
assert.equal(r.chequeoSonico.estado, 'ok');
cerca(r.chequeoSonico.relacionPresionCritica, 0.5282817877171742);

// EL punto de la conversión gauge -> absoluta. Con presionBarG=0.8 la
// presión aguas arriba absoluta es 1,8 bar (180000 Pa), no 0,8 bar.
const p1Abs = 180000;
const p2Abs = (1 + (0.8 - r.perdidaCargaMbar / 1000)) * 100000;
cerca(r.chequeoSonico.x, (p1Abs - p2Abs) / p1Abs);
cerca(r.chequeoSonico.relacionPresion, p2Abs / p1Abs);
cerca(r.chequeoSonico.caidaPresionPorcentaje, r.chequeoSonico.x * 100);

// Y la contraprueba: si alguien usara presión MANOMÉTRICA (80000 Pa) el x
// saldría 2,25x más grande. Este assert falla si se pierde la conversión.
const xSiFueraGauge = (80000 - (0.8 - r.perdidaCargaMbar / 1000) * 100000) / 80000;
assert.ok(
  Math.abs(r.chequeoSonico.x - xSiFueraGauge) > 1e-9,
  'chequeoSonico debe usar presión absoluta, no manométrica'
);
cerca(xSiFueraGauge / r.chequeoSonico.x, 180000 / 80000);

// API RP 14E intacto: el chequeo nuevo no alteró la velocidad erosional ni
// la de flujo (mismos valores baselineados más arriba en este archivo).
cerca(r.velocidadErosionMS, 77.49513975277209);
cerca(r.velocidadFlujoMS, 26.53836263399149);

// Los tres estados restantes, alcanzados alargando la línea y afinando la
// tubería (más pérdida de carga sobre la misma presión de operación).
const flujoCon = (tuberiaPulgadas, largoM) => calcularFlujo({
  presionBarG: 0.8, temperaturaC: 20, potenciaKw: 60, tuberiaPulgadas,
  presionMinBarG: 29.5, largoM, codos: 0, tees: 0, valvulas: 0,
  factorDiseno: 0.4, factorUnion: 1, unidadNormalizado: '[sL/min]', unidadH2: '[m3/h]',
});

// ADVERTENCIA — 1/2", 200 m: x entre 0.10 y 0.4717
const rAdvertencia = flujoCon(0.5, 200);
cerca(rAdvertencia.chequeoSonico.x, 0.17328558011529707);
cerca(rAdvertencia.chequeoSonico.relacionPresion, 0.826714419884703);
assert.equal(rAdvertencia.chequeoSonico.estado, 'advertencia');

// CRÍTICO — 3/8", 150 m: x por encima de la caída crítica (0.4717)
const rCritico = flujoCon(0.375, 150);
cerca(rCritico.chequeoSonico.x, 0.5102579624494026);
cerca(rCritico.chequeoSonico.relacionPresion, 0.4897420375505974);
assert.ok(rCritico.chequeoSonico.relacionPresion <= rCritico.chequeoSonico.relacionPresionCritica);
assert.equal(rCritico.chequeoSonico.estado, 'critico');

// NO APLICA — 1/4", 60 m: la pérdida de carga (2383 mbar) excede la presión
// absoluta disponible (1800 mbar), o sea P2_abs < 0. El screening no
// inventa un ratio: se declara fuera de dominio.
const rFueraDeDominio = flujoCon(0.25, 60);
assert.ok(rFueraDeDominio.perdidaCargaMbar > 1800);
assert.equal(rFueraDeDominio.chequeoSonico.aplica, false);
assert.equal(rFueraDeDominio.chequeoSonico.estado, 'no-aplica');
assert.equal(rFueraDeDominio.chequeoSonico.x, null);

// El chequeo nuevo no rompe nada existente en esos mismos escenarios:
// API RP 14E sigue devolviendo su velocidad erosional en los tres.
[rAdvertencia, rCritico, rFueraDeDominio].forEach((res) => {
  assert.ok(Number.isFinite(res.velocidadErosionMS) && res.velocidadErosionMS > 0);
});

console.log('calc-flujo.test.js: OK');
