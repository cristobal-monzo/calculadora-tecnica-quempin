import assert from 'node:assert/strict';
import { calcularFlujo } from '../js/calc-flujo.js';
import { factorZDesdeBarG } from '../js/gas-h2.js';
import { velocidadErosion } from '../js/physics.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Inputs = valores por defecto de Calculos H2.xlsx, hoja "Cálculo", 2026-09-01
const base = {
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
};
const r = calcularFlujo(base);

// Barlow con el diámetro EXTERIOR: en 1/2" el "DI" del Excel (12,7 mm) ya
// era el exterior, así que C10 no cambia con la corrección de la tabla del
// 2026-09-25 (ver gas-h2.js).
cerca(r.presionMaxDisenoBar, 128.50393700787401);   // C10 — Hf=1 en este caso (presión cae en la zona plana de la Tabla IX-5A, ≤2000 psig)
assert.equal(r.factorHfAplicado, 1);                 // factorHf, AGREGADO 2026-09-02
assert.equal(r.factorTAplicado, 1);                  // factorT, AGREGADO 2026-09-02 — 20°C=68°F, bajo el umbral de 250°F
assert.equal(r.tuberiaAdecuada, true);               // tuberiaAdecuada, AGREGADO 2026-09-02 — presionBarG(0.8) <= presionMaxDisenoBar
cerca(r.flujoMasicoKgH, 1.8);                        // C13
// C26/C20/C12 RE-BASELINEADOS 2026-09-08 al unificar el factor Z (presión
// ABSOLUTA en MPa y T en K) — ver Hidrogeno/CLAUDE.md.
cerca(r.zDiseno, 1.0010702551375645);                // C26
cerca(r.densidadKgM3, 0.14872999277372206);          // C20
cerca(r.flujoVolNormalizado, 355.5849438202248);     // C11 (no depende de Z)
cerca(r.flujoVolH2, 12.102468146680552);             // C12

// C15/C30/C31/C32/C16 RE-BASELINEADOS 2026-09-25: el flujo usa el DI REAL
// de 1/2" (12,7 − 2·1,2 = 10,3 mm) en vez del diámetro exterior. Antes:
// v=26.53836263399149 m/s, Re=5012.754113130562, ε/D=0.00015748031496062994,
// f=0.03781741551718751, ΔP=31.19140442075346 mbar.
cerca(r.velocidadFlujoMS, 40.346616167748955);        // C15
cerca(r.velocidadFlujoMS, (1.8 / r.densidadKgM3 / 3600) / (Math.PI * 0.0103 ** 2 / 4));
cerca(r.reynolds, 6180.774489005642);                 // C30
cerca(r.rugosidadRelativa, 0.002 / 10.3);             // C31
cerca(r.factorFriccion, 0.035578138218634446);        // C32
cerca(r.perdidaCargaMbar, 83.62936199136904);         // C16
// Re = ṁ·D/(A·µ) = 4ṁ/(π·D·µ) no depende de ρ ni de Z
cerca(r.reynolds, 4 * (1.8 / 3600) / (Math.PI * 0.0103 * 0.00001));

// Caudal real de H₂ en L/min (CORREGIDO 2026-09-25): m³/h × 1000/60, sin
// el factor 17,5817 (que incluye el paso de Nm³ a 0 °C a litros estándar a
// 15 °C y solo corresponde al caudal normalizado).
const rLmin = calcularFlujo({ ...base, unidadH2: '[L/min]' });
cerca(rLmin.flujoVolH2, r.flujoVolH2 * 1000 / 60);
cerca(rLmin.velocidadFlujoMS, r.velocidadFlujoMS); // la velocidad no depende de la unidad mostrada

// Velocidad de erosión — API RP 14E en el MISMO estado del gas
// (CORREGIDO 2026-09-25, ver calc-flujo.js). Con los valores por defecto
// del Excel la "presión mínima" (29,5 barG) supera a la de operación
// (0,8 barG): no puede ser la mínima de la línea, así que se usa la de
// operación y se avisa. Antes: velocidad erosional a 29,5 barG = 77.495
// m/s contra velocidad de flujo a 0,8 barG.
assert.equal(r.presionMinimaSobreOperacion, true);
assert.equal(r.presionErosionBarG, 0.8);
cerca(r.zErosion, r.zDiseno);
cerca(r.velocidadErosionMS, 316.3046016440929);
cerca(r.velocidadFlujoErosionMS, r.velocidadFlujoMS);

// Con una presión mínima real (0,5 barG < 0,8 barG), las dos velocidades
// se evalúan ahí: la de flujo sube (gas menos denso) y la erosional también.
const rMin = calcularFlujo({ ...base, presionMinBarG: 0.5 });
assert.equal(rMin.presionMinimaSobreOperacion, false);
assert.equal(rMin.presionErosionBarG, 0.5);
cerca(rMin.zErosion, factorZDesdeBarG({ presionBarG: 0.5, temperaturaC: 20 }));
cerca(rMin.velocidadErosionMS, velocidadErosion({
  zErosion: rMin.zErosion, temperaturaC: 20, presionMinBarG: 0.5, gravedadEspecifica: 0.0695,
}));
cerca(rMin.velocidadFlujoErosionMS, 48.407315556464376);
assert.ok(rMin.velocidadFlujoErosionMS > rMin.velocidadFlujoMS);
// API RP 14E: Ve = 100/√ρ[lb/ft³] en ft/s. Verificación con la densidad
// del gas a 0,5 barG calculada por separado (ρ·v constante = ṁ/A).
{
  const rhoMin = (1.8 / 3600) / (rMin.velocidadFlujoErosionMS * Math.PI * 0.0103 ** 2 / 4);
  cerca(rMin.velocidadErosionMS, 0.3048 * 100 / Math.sqrt(rhoMin * 0.0624279606), 0.01);
}

// factorHf, AGREGADO 2026-09-02 — caso sintético con factorDiseno=1.0
// (tubería 1.25", F=1) para forzar una presión de diseño por encima de la
// zona plana de la Tabla IX-5A (>2000 psig) y ejercitar la interpolación +
// iteración real. RE-BASELINEADO 2026-09-25: DE de NPS 1-1/4" = 42,2 mm
// (antes 42). Antes: 156.7518365893937 bar / Hf 0.9378315009620852.
const rAltaPresion = calcularFlujo({ ...base, tuberiaPulgadas: 1.25, factorDiseno: 1.0 });
cerca(rAltaPresion.presionMaxDisenoBar, 156.26653399278317);
cerca(rAltaPresion.factorHfAplicado, 0.939380019158792);

// Tubería manual (2026-09-02, a pedido del usuario) — con el DI real de la
// fila tabulada de 1/2" (10,3 mm), su espesor, límite elástico y
// rugosidad, debe dar exactamente el mismo resultado que el caso "r":
// el DE para Barlow se deduce como DI + 2·espesor = 12,7 mm.
const rManual = calcularFlujo({
  ...base, tuberiaPulgadas: null,
  tuberiaManual: { diMm: 10.3, espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
});
cerca(rManual.presionMaxDisenoBar, r.presionMaxDisenoBar);
cerca(rManual.perdidaCargaMbar, r.perdidaCargaMbar);
cerca(rManual.velocidadFlujoMS, r.velocidadFlujoMS);

// tuberiaAdecuada, AGREGADO 2026-09-02 — rama "No adecuada": presión de
// operación deliberadamente muy por encima de la máxima de diseño (tubería
// más delgada de la tabla, 1/4").
const rInadecuada = calcularFlujo({ ...base, presionBarG: 500, tuberiaPulgadas: 0.25 });
assert.ok(rInadecuada.presionMaxDisenoBar < 500);
assert.equal(rInadecuada.tuberiaAdecuada, false);

/* ---------------------------------------------------------------------- */
/* chequeoSonico — screening de caída de presión / flujo sónico            */
/* (AGREGADO 2026-09-08, a pedido del usuario). Chequeo ADICIONAL: no      */
/* toca ni reemplaza a API RP 14E. Ver Hidrogeno/CLAUDE.md.                */
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

// Los tres estados restantes, alcanzados alargando la línea y afinando la
// tubería (más pérdida de carga sobre la misma presión de operación).
// Casos RE-ELEGIDOS 2026-09-25 (con el DI real la pérdida por metro es
// mayor que con el diámetro exterior del Excel).
const flujoCon = (tuberiaPulgadas, largoM) => calcularFlujo({ ...base, tuberiaPulgadas, largoM });

// ADVERTENCIA — 1/2", 100 m: x entre 0.10 y 0.4717
const rAdvertencia = flujoCon(0.5, 100);
cerca(rAdvertencia.chequeoSonico.x, 0.23230378330935847);
assert.equal(rAdvertencia.chequeoSonico.estado, 'advertencia');

// CRÍTICO — 3/8", 40 m: x por encima de la caída crítica (0.4717)
const rCritico = flujoCon(0.375, 40);
cerca(rCritico.chequeoSonico.x, 0.5304381417590727);
assert.ok(rCritico.chequeoSonico.relacionPresion <= rCritico.chequeoSonico.relacionPresionCritica);
assert.equal(rCritico.chequeoSonico.estado, 'critico');

// NO APLICA — 1/4", 20 m: la pérdida de carga (~7939 mbar) excede la
// presión absoluta disponible (1800 mbar), o sea P2_abs < 0. El screening
// no inventa un ratio: se declara fuera de dominio.
const rFueraDeDominio = flujoCon(0.25, 20);
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
