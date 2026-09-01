# Calculadora Técnica QUEMPIN — Hidrógeno Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task (chosen over subagent-driven-development
> here because every task depends on the exact numeric fixtures extracted from
> `Calculos H2.xlsx` in the spec — a fresh subagent per task would need that
> context re-derived or re-pasted every time, which is wasted work when the
> same agent that extracted the fixtures is executing the plan). Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static, browser-only hydrogen engineering dashboard
(pipe/flow sizing, storage sizing, branching pressure-loss network report)
faithfully ported from `Calculos H2.xlsx`, plus the QUEMPIN multi-gas hub
shell, ready to push to a new public GitHub repo with Pages enabled.

**Architecture:** Vanilla HTML/CSS/JS ES modules, no build step, no
frameworks. A shared `physics.js` (pure functions) + `gas-h2.js` (H2
constants/tables) power three independent calculator engines
(`calc-flujo.js`, `calc-almacenamiento.js`, `calc-memoria.js`), each
unit-tested with plain Node scripts against the exact cached values from the
source workbook. `ui.js` wires the engines to three tabs in
`Hidrogeno/index.html`. `storage.js` handles localStorage autosave + JSON
import/export. A root `index.html` hub (reusing the QUEMPIN brand CSS
system) links to the Hidrogeno app.

**Tech Stack:** Plain JavaScript (ES modules), HTML5, CSS3 (custom
properties for theming), Node.js (`node --test` free — plain `assert`
scripts) for regression tests, git, GitHub CLI (`gh`) for repo creation and
Pages.

**Spec:** [docs/superpowers/specs/2026-09-01-calculadora-tecnica-hidrogeno-design.md](../specs/2026-09-01-calculadora-tecnica-hidrogeno-design.md)

## Global Constraints

- No frameworks, no bundler, no npm dependencies — everything must run by
  opening `index.html` in a browser or via a static file server.
- Every formula ported from the Excel must cite its source cell(s) in a
  comment.
- All monetary/engineering numbers come from `Calculos H2.xlsx` (analyzed
  2026-09-01) — do not invent or "round" constants.
- Brand system (colors, fonts, dark/light theme) must match
  `_reference-finanzas-quempin/index.html` exactly (same CSS custom
  property names and values), per the spec's "Diseño visual" section.
- All UI copy is in Spanish (Chile), matching the source workbook's
  terminology.

---

### Task 1: `physics.js` — shared pure functions

**Files:**
- Create: `Hidrogeno/js/physics.js`
- Test: `Hidrogeno/tests/physics.test.js`

**Interfaces:**
- Produces: `reynolds({densidad, velocidad, diametroM, viscosidad})`,
  `rugosidadRelativa({rugosidadAbsoluta, diametroM})`,
  `factorFriccionHaaland({rugosidadRelativa, reynolds})`,
  `densidadReal({presionAbsPa, temperaturaC, masaMolar, constanteR, z})`,
  `barGaugeAPaAbs(bar)`, `barAbsAPaAbs(bar)`,
  `presionMaximaDiseno({limiteElasticoMPa, espesorMm, diametroMm, factorDiseno, factorUnion})`,
  `velocidadErosion({zErosion, temperaturaC, presionMinBarG, gravedadEspecifica})`,
  `perdidaCargaTramo({factorFriccion, longitudM, diametroM, densidad, velocidad, sumaCoeficientesLocales})`
  — all consumed by Tasks 3, 4, 5.

- [ ] **Step 1: Write the failing test**

```js
// Hidrogeno/tests/physics.test.js
import assert from 'node:assert/strict';
import {
  reynolds, rugosidadRelativa, factorFriccionHaaland, densidadReal,
  barGaugeAPaAbs, barAbsAPaAbs, presionMaximaDiseno, velocidadErosion,
  perdidaCargaTramo,
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
); // C10

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

cerca(
  rugosidadRelativa({ rugosidadAbsoluta: 0.002, diametroM: 12.7 / 1000 }),
  0.15748031496062992
); // C31

cerca(
  reynolds({ densidad: 0.14881834275071656, velocidad: 26.522607427443383, diametroM: 12.7 / 1000, viscosidad: 0.00001 }),
  5012.754113130562
); // C30

cerca(
  factorFriccionHaaland({ rugosidadRelativa: 0.15748031496062992, reynolds: 5012.754113130562 }),
  0.13314145810934921
); // C32

cerca(
  perdidaCargaTramo({ factorFriccion: 0.13314145810934921, longitudM: 20, diametroM: 12.7 / 1000, densidad: 0.14881834275071656, velocidad: 26.522607427443383, sumaCoeficientesLocales: 0 }),
  109.74847294168545
); // C16

console.log('physics.test.js: OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node Hidrogeno/tests/physics.test.js`
Expected: FAIL — `Cannot find module '../js/physics.js'`

- [ ] **Step 3: Write the implementation**

```js
// Hidrogeno/js/physics.js
// Funciones puras de mecánica de fluidos compresibles, gas-agnósticas.
// Cada función recibe explícitamente los parámetros físicos que necesita.
// Fuente: Calculos H2.xlsx, hoja "Cálculo" (celda de origen citada por función).

export function barGaugeAPaAbs(bar) {
  // Presión manométrica [bar] -> presión absoluta [Pa], asumiendo 1 bar de
  // presión atmosférica (simplificación usada en todo el Excel fuente).
  return (1 + bar) * 100000;
}

export function barAbsAPaAbs(bar) {
  return bar * 100000;
}

export function densidadReal({ presionAbsPa, temperaturaC, masaMolar, constanteR, z }) {
  // Cálculo!C20 = ((1+C3)*100000*C18)/(C26*C19*(C4+273.15))
  return (presionAbsPa * masaMolar) / (z * constanteR * (temperaturaC + 273.15));
}

export function presionMaximaDiseno({ limiteElasticoMPa, espesorMm, diametroMm, factorDiseno, factorUnion }) {
  // Cálculo!C10 = 10*((2*$K$3*$J$3)/$I$3)*$C$28*$C$29*1*1  (Barlow, ASME B31.12)
  return 10 * ((2 * limiteElasticoMPa * espesorMm) / diametroMm) * factorDiseno * factorUnion;
}

export function velocidadErosion({ zErosion, temperaturaC, presionMinBarG, gravedadEspecifica }) {
  // Cálculo!C14 — API RP 14E, unidades US convertidas a m/s
  const rankine = (temperaturaC + 273) * (9 / 5);
  const psia = (1 + presionMinBarG) * 14.5;
  const piesPorSegundo = 100 * Math.sqrt((zErosion * 10.73 * rankine) / (29 * gravedadEspecifica * psia));
  return piesPorSegundo * 0.3048;
}

export function reynolds({ densidad, velocidad, diametroM, viscosidad }) {
  // Cálculo!C30 = ($C$20*$C$15*($I$3/1000))/(0.00001)
  return (densidad * velocidad * diametroM) / viscosidad;
}

export function rugosidadRelativa({ rugosidadAbsoluta, diametroM }) {
  // Cálculo!C31 = L3/($I$3/1000) — puerto literal (rugosidadAbsoluta ya en
  // la misma escala numérica que la tabla fuente, no se reconvierte).
  return rugosidadAbsoluta / diametroM;
}

export function factorFriccionHaaland({ rugosidadRelativa, reynolds }) {
  // Cálculo!C32 = 1/((-1.8*LOG(($C$31/3.7)^1.11)+(6.9/$C$30)))^2
  const termino = -1.8 * Math.log10(Math.pow(rugosidadRelativa / 3.7, 1.11)) + 6.9 / reynolds;
  return 1 / Math.pow(termino, 2);
}

export function perdidaCargaTramo({ factorFriccion, longitudM, diametroM, densidad, velocidad, sumaCoeficientesLocales = 0 }) {
  // Cálculo!C16 = (($C$32*$C$8)/(($I$3/1000))+(I6*0.7+J6*2+K6*0.1))*($C$20*($C$15^2)/2)/100
  const terminoFriccion = (factorFriccion * longitudM) / diametroM + sumaCoeficientesLocales;
  const presionDinamicaPa = (densidad * Math.pow(velocidad, 2)) / 2;
  return (terminoFriccion * presionDinamicaPa) / 100; // Pa -> mbar
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node Hidrogeno/tests/physics.test.js`
Expected: prints `physics.test.js: OK`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add Hidrogeno/js/physics.js Hidrogeno/tests/physics.test.js
git commit -m "feat: add shared compressible-flow physics functions"
```

---

### Task 2: `gas-h2.js` — hydrogen constants, pipe table, Z-factor correlation

**Files:**
- Create: `Hidrogeno/js/gas-h2.js`
- Test: `Hidrogeno/tests/gas-h2.test.js`

**Interfaces:**
- Consumes: nothing (no dependency on Task 1).
- Produces: `H2` (constants object), `TABLA_TUBERIA` (array), `buscarTuberia(pulgadas)`,
  `factorZDiseno({presionBarG, temperaturaC})`, `factorZErosion(presionMinBarG)`,
  `TABLA_REFERENCIA_ASME_B31_12` (object) — consumed by Tasks 3, 4, 5.

- [ ] **Step 1: Write the failing test**

```js
// Hidrogeno/tests/gas-h2.test.js
import assert from 'node:assert/strict';
import { H2, TABLA_TUBERIA, buscarTuberia, factorZDiseno, factorZErosion } from '../js/gas-h2.js';

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

// Fixtures Cálculo!B93 y Cálculo!C27, 2026-09-01
cerca(factorZDiseno({ presionBarG: 0.8, temperaturaC: 20 }), 1.0004759430898928);
assert.equal(factorZErosion(29.5), 1.02);
assert.equal(factorZErosion(10), 1);
assert.equal(factorZErosion(45), 1.02);
assert.equal(factorZErosion(150), 1.1);
assert.equal(factorZErosion(250), 1.2);
assert.throws(() => factorZErosion(350), /rango/);

console.log('gas-h2.test.js: OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node Hidrogeno/tests/gas-h2.test.js`
Expected: FAIL — `Cannot find module '../js/gas-h2.js'`

- [ ] **Step 3: Write the implementation**

```js
// Hidrogeno/js/gas-h2.js
// Propiedades físicas y tablas de referencia específicas de hidrógeno.
// Fuente: Calculos H2.xlsx, hoja "Cálculo" (celdas citadas por bloque). Analizado 2026-09-01.

export const H2 = {
  masaMolarKgMol: 0.002016,     // Cálculo!C18
  constanteR: 8.314,             // Cálculo!C19  [J/mol·K]
  pciKjKg: 120000,               // Cálculo!C21
  pcsKjKg: 142000,                // Cálculo!C22
  gravedadEspecifica: 0.0695,     // Cálculo!C25
  densidadNormalKgM3: 0.089,      // Sheet3!C6 (0°C, 1 bar)
  viscosidadPaS: 0.00001,         // Cálculo!C30 (denominador fijo en el Excel)
};

// Tabla de tubería — Cálculo!H33:L38
export const TABLA_TUBERIA = [
  { pulgadas: 0.25,  diMm: 6.4,  espesorMm: 1.2, limiteElasticoMPa: 185, rugosidadMm: 0.002 },
  { pulgadas: 0.375, diMm: 9.5,  espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
  { pulgadas: 0.5,   diMm: 12.7, espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
  { pulgadas: 0.75,  diMm: 16,   espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
  { pulgadas: 1,     diMm: 23,   espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
  { pulgadas: 1.25,  diMm: 42,   espesorMm: 2.7, limiteElasticoMPa: 130, rugosidadMm: 0.045 },
];

export function buscarTuberia(pulgadas) {
  const fila = TABLA_TUBERIA.find((f) => f.pulgadas === pulgadas);
  if (!fila) throw new Error(`Diámetro de tubería no encontrado en la tabla: ${pulgadas}"`);
  return fila;
}

// Correlación de compresibilidad Z (9 términos) — Cálculo!B84:D92, total en B93.
// Z = 1 + Σ ai · (100/(T+273))^bi · (P/10)^ci   [T en °C, P en bar manométrico]
const COEFICIENTES_Z = [
  { a: 0.0588846,     b: 1.325, c: 1 },
  { a: -0.06136111,   b: 1.87,  c: 1 },
  { a: -0.002650473,  b: 2.5,   c: 2 },
  { a: 0.002731125,   b: 2.8,   c: 2 },
  { a: 0.001802374,   b: 2.938, c: 2.42 },
  { a: -0.001150707,  b: 3.14,  c: 2.63 },
  { a: 9.588528e-05,  b: 3.37,  c: 3 },
  { a: -1.10904e-07,  b: 3.75,  c: 4 },
  { a: 1.264403e-10,  b: 4,     c: 5 },
];

export function factorZDiseno({ presionBarG, temperaturaC }) {
  const suma = COEFICIENTES_Z.reduce(
    (acc, { a, b, c }) => acc + a * Math.pow(100 / (temperaturaC + 273), b) * Math.pow(presionBarG / 10, c),
    0
  );
  return 1 + suma;
}

// Factor Z para velocidad de erosión — Cálculo!C27 = IFS(C7<20,1,C7<50,1.02,C7<200,1.1,C7<300,1.2)
export function factorZErosion(presionMinBarG) {
  if (presionMinBarG < 20) return 1;
  if (presionMinBarG < 50) return 1.02;
  if (presionMinBarG < 200) return 1.1;
  if (presionMinBarG < 300) return 1.2;
  throw new Error('Presión mínima fuera del rango de la correlación Z (< 300 bar)');
}

// Tabla de referencia ASME B31.12 — Cálculo!A55:I59. Solo de consulta: el
// Excel fuente no deriva el factor de diseño (C28) automáticamente de esta
// tabla, el usuario lo elige a mano; esta app replica ese mismo
// comportamiento (ver Hidrogeno/CLAUDE.md, sección "Tabla ASME B31.12").
export const TABLA_REFERENCIA_ASME_B31_12 = {
  columnasBar: [69, 138, 207, 276, 345, 414, 483], // Cálculo!C55:I55
  filas: [
    { resistenciaTensionMPa: 455.07, limiteFluenciaMPa: 358.55, factores: [1.0, 1.0, 0.954, 0.91, 0.88, 0.84, 0.78] },
    { resistenciaTensionMPa: 517.11, limiteFluenciaMPa: 413.69, factores: [0.874, 0.874, 0.834, 0.796, 0.77, 0.734, 0.682] },
    { resistenciaTensionMPa: 565.43, limiteFluenciaMPa: 482.63, factores: [0.776, 0.776, 0.742, 0.706, 0.684, 0.652, 0.606] },
    { resistenciaTensionMPa: 620.53, limiteFluenciaMPa: 551.58, factores: [0.694, 0.694, 0.662, 0.632, 0.61, 0.584, 0.542] },
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node Hidrogeno/tests/gas-h2.test.js`
Expected: prints `gas-h2.test.js: OK`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add Hidrogeno/js/gas-h2.js Hidrogeno/tests/gas-h2.test.js
git commit -m "feat: add hydrogen properties, pipe schedule and Z-factor correlation"
```

---

### Task 3: `calc-flujo.js` — Tubería y Flujo engine

**Files:**
- Create: `Hidrogeno/js/calc-flujo.js`
- Test: `Hidrogeno/tests/calc-flujo.test.js`

**Interfaces:**
- Consumes: everything from Task 1 (`physics.js`) and Task 2 (`gas-h2.js`).
- Produces: `calcularFlujo(inputs)` returning
  `{ presionMaxDisenoBar, flujoMasicoKgH, zDiseno, densidadKgM3, flujoVolNormalizado, flujoVolH2, zErosion, velocidadErosionMS, velocidadFlujoMS, reynolds, rugosidadRelativa, factorFriccion, perdidaCargaMbar }`
  — consumed by Task 8 (UI) and by Task 5 (`calc-memoria.js` reuses the
  same building blocks, not this function directly).

- [ ] **Step 1: Write the failing test**

```js
// Hidrogeno/tests/calc-flujo.test.js
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

cerca(r.presionMaxDisenoBar, 128.50393700787401);   // C10
cerca(r.flujoMasicoKgH, 1.8);                        // C13
cerca(r.zDiseno, 1.0004759430898928);                // C26
cerca(r.densidadKgM3, 0.14881834275071656);          // C20
cerca(r.flujoVolNormalizado, 355.5849438202248);     // C11
cerca(r.flujoVolH2, 12.095283193787164);             // C12
assert.equal(r.zErosion, 1.02);                       // C27
cerca(r.velocidadErosionMS, 77.56390222440128);       // C14
cerca(r.velocidadFlujoMS, 26.522607427443383);        // C15
cerca(r.reynolds, 5012.754113130562);                 // C30
cerca(r.rugosidadRelativa, 0.15748031496062992);      // C31
cerca(r.factorFriccion, 0.13314145810934921);         // C32
cerca(r.perdidaCargaMbar, 109.74847294168545);        // C16

console.log('calc-flujo.test.js: OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node Hidrogeno/tests/calc-flujo.test.js`
Expected: FAIL — `Cannot find module '../js/calc-flujo.js'`

- [ ] **Step 3: Write the implementation**

```js
// Hidrogeno/js/calc-flujo.js
// Motor de cálculo de la pestaña "Tubería y Flujo" — puerto 1:1 de
// Calculos H2.xlsx, hoja "Cálculo". Cada valor cita su celda de origen.

import {
  barGaugeAPaAbs, densidadReal, presionMaximaDiseno, velocidadErosion,
  reynolds, rugosidadRelativa, factorFriccionHaaland, perdidaCargaTramo,
} from './physics.js';
import { H2, buscarTuberia, factorZDiseno, factorZErosion } from './gas-h2.js';

const FACTOR_SL_MIN = 17.5817; // constante fuente (Cálculo!C11/C12/C15)

export function calcularFlujo(inputs) {
  const {
    presionBarG, temperaturaC, potenciaKw, tuberiaPulgadas, presionMinBarG,
    largoM, codos, tees, valvulas, factorDiseno, factorUnion,
    unidadNormalizado = '[Nm3/h]', unidadH2 = '[m3/h]', pciKjKg = H2.pciKjKg,
  } = inputs;

  const tuberia = buscarTuberia(tuberiaPulgadas);
  const diametroM = tuberia.diMm / 1000;

  // Cálculo!C10
  const presionMaxDisenoBar = presionMaximaDiseno({
    limiteElasticoMPa: tuberia.limiteElasticoMPa, espesorMm: tuberia.espesorMm,
    diametroMm: tuberia.diMm, factorDiseno, factorUnion,
  });

  // Cálculo!C13
  const flujoMasicoKgH = (potenciaKw / pciKjKg) * 3600;

  // Cálculo!C26
  const zDiseno = factorZDiseno({ presionBarG, temperaturaC });

  // Cálculo!C20
  const densidadKgM3 = densidadReal({
    presionAbsPa: barGaugeAPaAbs(presionBarG), temperaturaC,
    masaMolar: H2.masaMolarKgMol, constanteR: H2.constanteR, z: zDiseno,
  });

  // Cálculo!C11
  const flujoVolNormalizado = unidadNormalizado === '[Nm3/h]'
    ? flujoMasicoKgH / H2.densidadNormalKgM3
    : (FACTOR_SL_MIN * flujoMasicoKgH) / H2.densidadNormalKgM3;

  // Cálculo!C12
  const flujoVolH2 = unidadH2 === '[m3/h]'
    ? flujoMasicoKgH / densidadKgM3
    : (FACTOR_SL_MIN * flujoMasicoKgH) / densidadKgM3;

  // Cálculo!C27
  const zErosion = factorZErosion(presionMinBarG);

  // Cálculo!C14
  const velocidadErosionMS = velocidadErosion({
    zErosion, temperaturaC, presionMinBarG, gravedadEspecifica: H2.gravedadEspecifica,
  });

  // Cálculo!C15
  const areaM2 = Math.PI * Math.pow(diametroM, 2) / 4;
  const velocidadFlujoMS = unidadH2 === '[m3/h]'
    ? (flujoVolH2 / 3600) / areaM2
    : (flujoVolH2 / 3600) / (areaM2 * FACTOR_SL_MIN);

  // Cálculo!C30, C31, C32
  const reynoldsNum = reynolds({
    densidad: densidadKgM3, velocidad: velocidadFlujoMS, diametroM, viscosidad: H2.viscosidadPaS,
  });
  const rugosidadRel = rugosidadRelativa({ rugosidadAbsoluta: tuberia.rugosidadMm, diametroM });
  const factorFriccion = factorFriccionHaaland({ rugosidadRelativa: rugosidadRel, reynolds: reynoldsNum });

  // Cálculo!C16
  const sumaCoeficientesLocales = codos * 0.7 + tees * 2 + valvulas * 0.1;
  const perdidaCargaMbar = perdidaCargaTramo({
    factorFriccion, longitudM: largoM, diametroM, densidad: densidadKgM3,
    velocidad: velocidadFlujoMS, sumaCoeficientesLocales,
  });

  return {
    tuberia, presionMaxDisenoBar, flujoMasicoKgH, zDiseno, densidadKgM3,
    flujoVolNormalizado, flujoVolH2, zErosion, velocidadErosionMS,
    velocidadFlujoMS, reynolds: reynoldsNum, rugosidadRelativa: rugosidadRel,
    factorFriccion, perdidaCargaMbar,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node Hidrogeno/tests/calc-flujo.test.js`
Expected: prints `calc-flujo.test.js: OK`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add Hidrogeno/js/calc-flujo.js Hidrogeno/tests/calc-flujo.test.js
git commit -m "feat: add Tubería y Flujo calculation engine"
```

---

### Task 4: `calc-almacenamiento.js` — Almacenamiento engine

**Files:**
- Create: `Hidrogeno/js/calc-almacenamiento.js`
- Test: `Hidrogeno/tests/calc-almacenamiento.test.js`

**Interfaces:**
- Consumes: `densidadReal`, `barAbsAPaAbs` from Task 1; `H2` from Task 2.
- Produces: `calcularAlmacenamiento(inputs)` returning
  `{ masaAlmacenadaKg, zAlmacenamiento, densidadRealKgM3, autonomiaHoras, consumoKgH, consumoNm3H, consumoLMin, volumenNormalizadoNm3, caudalReferenciaM3H, velocidadReferenciaMS, tiempoLlenadoHoras }`
  and `formatearHoras(horasDecimal)` returning `"HH:MM:SS"` — both consumed
  by Task 9 (UI).

- [ ] **Step 1: Write the failing test**

```js
// Hidrogeno/tests/calc-almacenamiento.test.js
import assert from 'node:assert/strict';
import { calcularAlmacenamiento, formatearHoras } from '../js/calc-almacenamiento.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Inputs = valores por defecto de Calculos H2.xlsx, hoja "Sheet3", 2026-09-01
const r = calcularAlmacenamiento({
  potenciaKw: 60,
  temperaturaC: 20,
  presionBarAbs: 200,
  volumenM3: 0.19,
  unidadCaudalReferencia: '[m³/h]',
});

cerca(r.masaAlmacenadaKg, 2.619197844806117);       // H6
assert.equal(r.zAlmacenamiento, 1.2);                 // C7
cerca(r.consumoKgH, 1.800600200066689);               // C11 (PCI propio de Sheet3, 119960)
cerca(r.volumenNormalizadoNm3, 29.42918926748446);    // H9
cerca(r.autonomiaHoras, r.masaAlmacenadaKg / r.consumoKgH);
cerca(r.caudalReferenciaM3H, 0.020311562223333333);   // H10
cerca(r.velocidadReferenciaMS, 0.17815724773249608, 1e-3); // H11
cerca(r.tiempoLlenadoHoras, r.volumenNormalizadoNm3 / 4); // H12

assert.equal(formatearHoras(1.4545833333333333), '01:27:17');

console.log('calc-almacenamiento.test.js: OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node Hidrogeno/tests/calc-almacenamiento.test.js`
Expected: FAIL — `Cannot find module '../js/calc-almacenamiento.js'`

- [ ] **Step 3: Write the implementation**

```js
// Hidrogeno/js/calc-almacenamiento.js
// Motor de cálculo de la pestaña "Almacenamiento" — puerto de
// Calculos H2.xlsx, hoja "Sheet3", CON UNA CORRECCIÓN DELIBERADA: la
// densidad real se calcula con la presión/temperatura PROPIAS de esta
// pestaña, no con las de la pestaña "Tubería y Flujo" (ver
// Hidrogeno/CLAUDE.md, sección "Discrepancias del Excel fuente").
//
// El PCI (119960 kJ/kg) y el corte de la función escalón de Z usados acá
// son los propios de Sheet3 en el Excel fuente, intencionalmente distintos
// de los de calc-flujo.js (120000 kJ/kg) — ver la misma sección del
// CLAUDE.md antes de "unificarlos".

import { densidadReal, barAbsAPaAbs } from './physics.js';
import { H2 } from './gas-h2.js';

const PCI_ALMACENAMIENTO_KJ_KG = 119960; // Sheet3!C4
const CONSTANTE_R_BAR_CM3 = 83.14472;    // Sheet3!H6 (R en cm3·bar/(mol·K))
const MASA_MOLAR_G_MOL = 2.016;          // Sheet3!H6

function factorZAlmacenamiento(presionBarAbs) {
  // Sheet3!C7 = IFS(H4<50,1.02,H4<200,1.1,H4<300,1.2)
  if (presionBarAbs < 50) return 1.02;
  if (presionBarAbs < 200) return 1.1;
  if (presionBarAbs < 300) return 1.2;
  throw new Error('Presión de almacenamiento fuera del rango de la correlación Z (< 300 bar)');
}

export function formatearHoras(horasDecimal) {
  const totalSegundos = Math.round(horasDecimal * 3600);
  const h = Math.floor(totalSegundos / 3600);
  const m = Math.floor((totalSegundos % 3600) / 60);
  const s = totalSegundos % 60;
  const dosDigitos = (n) => String(n).padStart(2, '0');
  return `${dosDigitos(h)}:${dosDigitos(m)}:${dosDigitos(s)}`;
}

export function calcularAlmacenamiento(inputs) {
  const {
    potenciaKw, temperaturaC, presionBarAbs, volumenM3,
    unidadCaudalReferencia = '[m³/h]',
  } = inputs;

  // Sheet3!C7
  const zAlmacenamiento = factorZAlmacenamiento(presionBarAbs);

  // Sheet3!H6 — PV=ZnRT, puerto literal (validado contra el valor cacheado del Excel)
  const masaAlmacenadaKg =
    (1000 * (presionBarAbs / 1000) * (volumenM3 * 1000) * MASA_MOLAR_G_MOL) /
    (zAlmacenamiento * (CONSTANTE_R_BAR_CM3 * (temperaturaC + 273.15)));

  // Corrección deliberada respecto al Excel: densidad propia de esta pestaña
  const densidadRealKgM3 = densidadReal({
    presionAbsPa: barAbsAPaAbs(presionBarAbs), temperaturaC,
    masaMolar: H2.masaMolarKgMol, constanteR: H2.constanteR, z: zAlmacenamiento,
  });

  // Sheet3!C10:C14 — consumo del quemador
  const consumoKgS = potenciaKw / PCI_ALMACENAMIENTO_KJ_KG;
  const consumoKgH = consumoKgS * 3600;
  const consumoNm3H = consumoKgH / H2.densidadNormalKgM3;
  const consumoLMin = (consumoNm3H * 1000) / 60;

  // Sheet3!H8
  const autonomiaHoras = masaAlmacenadaKg / consumoKgH;

  // Sheet3!H9
  const volumenNormalizadoNm3 = masaAlmacenadaKg / H2.densidadNormalKgM3;

  // Sheet3!H10 — caudal de referencia en línea capilar Ø¼", puerto literal
  const baseCaudal = ((360 / 2.16) / 60) * (CONSTANTE_R_BAR_CM3 * (temperaturaC + 273.15)) / (presionBarAbs * 1000);
  const caudalReferenciaM3H = unidadCaudalReferencia === '[L/min]' ? baseCaudal : (baseCaudal * 60) / 1000;

  // Sheet3!H11 — velocidad en línea capilar Ø¼" (diámetro interno 6.35 mm), puerto literal
  const areaCapilarM2 = Math.PI * Math.pow(6.35 / 1000, 2);
  const baseVelocidad = (caudalReferenciaM3H * 4 / (60 * 1000)) / areaCapilarM2;
  const velocidadReferenciaMS = unidadCaudalReferencia === '[L/min]' ? baseVelocidad : (baseVelocidad * 1000) / 60;

  // Sheet3!H12
  const tiempoLlenadoHoras = volumenNormalizadoNm3 / 4;

  return {
    masaAlmacenadaKg, zAlmacenamiento, densidadRealKgM3, consumoKgH, consumoNm3H,
    consumoLMin, autonomiaHoras, volumenNormalizadoNm3, caudalReferenciaM3H,
    velocidadReferenciaMS, tiempoLlenadoHoras,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node Hidrogeno/tests/calc-almacenamiento.test.js`
Expected: prints `calc-almacenamiento.test.js: OK`, exit code 0. If the
`velocidadReferenciaMS` fixture is off by more than the `1e-3` relative
tolerance, recompute it by hand from the Excel `H11` cached value
(`0.17815724773249608`) before adjusting the implementation — the tolerance
is loose there only because of the double unit-conversion in the source
formula, not because the port is approximate.

- [ ] **Step 5: Commit**

```bash
git add Hidrogeno/js/calc-almacenamiento.js Hidrogeno/tests/calc-almacenamiento.test.js
git commit -m "feat: add Almacenamiento calculation engine"
```

---

### Task 5: `calc-memoria.js` — branching network engine

**Files:**
- Create: `Hidrogeno/js/calc-memoria.js`
- Test: `Hidrogeno/tests/calc-memoria.test.js`

**Interfaces:**
- Consumes: `barGaugeAPaAbs`, `densidadReal`, `reynolds`, `rugosidadRelativa`,
  `factorFriccionHaaland`, `perdidaCargaTramo` from Task 1;
  `H2`, `buscarTuberia`, `factorZDiseno` from Task 2.
- Produces: `calcularRed(tramos)` where `tramos` is
  `Array<{id, nombre, continuaDesdeId, presionMPa, longitudM, potenciaKw, tuberiaPulgadas, material, temperaturaC}>`
  and the return value is the same array with each tramo enriched with
  `{densidadKgM3, velocidadFlujoMS, perdidaParcialMbar, perdidaAcumuladaMbar}`
  — consumed by Task 10 (UI: tree diagram + table).

- [ ] **Step 1: Write the failing test**

```js
// Hidrogeno/tests/calc-memoria.test.js
import assert from 'node:assert/strict';
import { calcularRed } from '../js/calc-memoria.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Topología reducida inspirada en Calculos H2.xlsx, hoja "MC": A-B es raíz,
// B-C continúa desde A-B, y hay dos ramas (C-D1 y C-D2) que continúan
// ambas desde B-C, verificando la bifurcación.
const tramos = [
  { id: 'AB', nombre: 'A-B', continuaDesdeId: null, presionMPa: 0.15, longitudM: 15.5, potenciaKw: 12, tuberiaPulgadas: 0.25, material: 'AISI 316L', temperaturaC: 20 },
  { id: 'BC', nombre: 'B-C', continuaDesdeId: 'AB', presionMPa: 0.08, longitudM: 0.3, potenciaKw: 12, tuberiaPulgadas: 0.25, material: 'AISI 316L', temperaturaC: 20 },
  { id: 'CD1', nombre: 'C-D1', continuaDesdeId: 'BC', presionMPa: 2, longitudM: 2, potenciaKw: 12, tuberiaPulgadas: 0.25, material: 'AISI 316L', temperaturaC: 20 },
  { id: 'CD2', nombre: 'C-D2', continuaDesdeId: 'BC', presionMPa: 2, longitudM: 5, potenciaKw: 12, tuberiaPulgadas: 0.25, material: 'AISI 316L', temperaturaC: 20 },
];

const resultado = calcularRed(tramos);
const porId = Object.fromEntries(resultado.map((t) => [t.id, t]));

// Cada tramo trae sus propios campos calculados
assert.ok(porId.AB.perdidaParcialMbar > 0);
assert.ok(porId.AB.densidadKgM3 > 0);
assert.ok(porId.AB.velocidadFlujoMS > 0);

// La acumulada del root es igual a su propia parcial
cerca(porId.AB.perdidaAcumuladaMbar, porId.AB.perdidaParcialMbar);

// B-C acumula sobre A-B
cerca(porId.BC.perdidaAcumuladaMbar, porId.BC.perdidaParcialMbar + porId.AB.perdidaAcumuladaMbar);

// Las dos ramas parten del mismo padre (B-C) con la MISMA acumulada heredada
// pero distinta parcial propia (largo distinto: 2m vs 5m) -> acumuladas distintas
cerca(porId.CD1.perdidaAcumuladaMbar, porId.CD1.perdidaParcialMbar + porId.BC.perdidaAcumuladaMbar);
cerca(porId.CD2.perdidaAcumuladaMbar, porId.CD2.perdidaParcialMbar + porId.BC.perdidaAcumuladaMbar);
assert.notEqual(porId.CD1.perdidaAcumuladaMbar, porId.CD2.perdidaAcumuladaMbar);

// Ciclo -> error explícito, no cuelgue infinito
assert.throws(
  () => calcularRed([
    { id: 'X', nombre: 'X', continuaDesdeId: 'Y', presionMPa: 1, longitudM: 1, potenciaKw: 1, tuberiaPulgadas: 0.25, material: '-', temperaturaC: 20 },
    { id: 'Y', nombre: 'Y', continuaDesdeId: 'X', presionMPa: 1, longitudM: 1, potenciaKw: 1, tuberiaPulgadas: 0.25, material: '-', temperaturaC: 20 },
  ]),
  /[Cc]iclo/
);

// continuaDesdeId inválido -> error explícito
assert.throws(
  () => calcularRed([
    { id: 'X', nombre: 'X', continuaDesdeId: 'NO_EXISTE', presionMPa: 1, longitudM: 1, potenciaKw: 1, tuberiaPulgadas: 0.25, material: '-', temperaturaC: 20 },
  ]),
  /no existe/
);

console.log('calc-memoria.test.js: OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node Hidrogeno/tests/calc-memoria.test.js`
Expected: FAIL — `Cannot find module '../js/calc-memoria.js'`

- [ ] **Step 3: Write the implementation**

```js
// Hidrogeno/js/calc-memoria.js
// Motor de cálculo de la pestaña "Memoria de Cálculo" — red de tramos
// ramificada. En el Excel fuente (hoja "MC") esta tabla es de valores
// pegados a mano; acá son fórmulas vivas que reutilizan physics.js y
// gas-h2.js tramo por tramo. Supuestos explícitos frente al Excel:
//   - La presión de cada tramo [MPa] se trata como manométrica (mismo
//     criterio que calc-flujo.js), convertida a bar (*10).
//   - Cada tramo tiene su propia temperatura (default 20°C) — la hoja "MC"
//     no registra temperatura por tramo.
//   - No se incluyen pérdidas locales por accesorios por tramo (la hoja
//     "MC" tampoco las lista) — limitación conocida de v1, ver
//     Hidrogeno/CLAUDE.md.

import { barGaugeAPaAbs, densidadReal, reynolds, rugosidadRelativa, factorFriccionHaaland, perdidaCargaTramo } from './physics.js';
import { H2, buscarTuberia, factorZDiseno } from './gas-h2.js';

function calcularTramoIndividual(tramo) {
  const presionBarG = tramo.presionMPa * 10;
  const tuberia = buscarTuberia(tramo.tuberiaPulgadas);
  const diametroM = tuberia.diMm / 1000;

  const flujoMasicoKgH = (tramo.potenciaKw / H2.pciKjKg) * 3600;
  const zDiseno = factorZDiseno({ presionBarG, temperaturaC: tramo.temperaturaC });
  const densidadKgM3 = densidadReal({
    presionAbsPa: barGaugeAPaAbs(presionBarG), temperaturaC: tramo.temperaturaC,
    masaMolar: H2.masaMolarKgMol, constanteR: H2.constanteR, z: zDiseno,
  });

  const flujoVolM3H = flujoMasicoKgH / densidadKgM3;
  const areaM2 = Math.PI * Math.pow(diametroM, 2) / 4;
  const velocidadFlujoMS = (flujoVolM3H / 3600) / areaM2;

  const reynoldsNum = reynolds({ densidad: densidadKgM3, velocidad: velocidadFlujoMS, diametroM, viscosidad: H2.viscosidadPaS });
  const rugosidadRel = rugosidadRelativa({ rugosidadAbsoluta: tuberia.rugosidadMm, diametroM });
  const factorFriccion = factorFriccionHaaland({ rugosidadRelativa: rugosidadRel, reynolds: reynoldsNum });

  const perdidaParcialMbar = perdidaCargaTramo({
    factorFriccion, longitudM: tramo.longitudM, diametroM, densidad: densidadKgM3,
    velocidad: velocidadFlujoMS, sumaCoeficientesLocales: 0,
  });

  return { ...tramo, densidadKgM3, velocidadFlujoMS, perdidaParcialMbar };
}

export function calcularRed(tramos) {
  const calculados = tramos.map(calcularTramoIndividual);
  const porId = new Map(calculados.map((t) => [t.id, t]));

  for (const t of calculados) {
    if (t.continuaDesdeId !== null && t.continuaDesdeId !== undefined && !porId.has(t.continuaDesdeId)) {
      throw new Error(`El tramo "${t.nombre}" continúa desde "${t.continuaDesdeId}", que no existe en la red.`);
    }
  }

  const acumuladaCache = new Map();
  const enProgreso = new Set();

  function perdidaAcumulada(id) {
    if (acumuladaCache.has(id)) return acumuladaCache.get(id);
    if (enProgreso.has(id)) {
      throw new Error(`Ciclo detectado en la red de tramos, involucrando "${id}".`);
    }
    enProgreso.add(id);
    const tramo = porId.get(id);
    const base = tramo.continuaDesdeId ? perdidaAcumulada(tramo.continuaDesdeId) : 0;
    const total = tramo.perdidaParcialMbar + base;
    enProgreso.delete(id);
    acumuladaCache.set(id, total);
    return total;
  }

  for (const t of calculados) {
    t.perdidaAcumuladaMbar = perdidaAcumulada(t.id);
  }

  return calculados;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node Hidrogeno/tests/calc-memoria.test.js`
Expected: prints `calc-memoria.test.js: OK`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add Hidrogeno/js/calc-memoria.js Hidrogeno/tests/calc-memoria.test.js
git commit -m "feat: add branching pressure-loss network engine for Memoria de Cálculo"
```

---

### Task 6: `storage.js` — localStorage autosave + JSON import/export

**Files:**
- Create: `Hidrogeno/js/storage.js`
- Test: `Hidrogeno/tests/storage.test.js`

**Interfaces:**
- Produces: `guardar(clave, datos)`, `cargar(clave, porDefecto)`,
  `exportarJSON(nombreArchivo, datos)`, `importarJSON(archivo)` — consumed
  by Task 8, 9, 10 (UI).

- [ ] **Step 1: Write the failing test**

```js
// Hidrogeno/tests/storage.test.js
// storage.js usa `localStorage`/`document`/`Blob`, que no existen en Node
// puro — este test corre un stub mínimo de `localStorage` en globalThis
// antes de importar el módulo, y solo ejerce guardar/cargar (las funciones
// que dependen del DOM se verifican en el Task 14, navegador real).
import assert from 'node:assert/strict';

const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, v),
  removeItem: (k) => almacen.delete(k),
};

const { guardar, cargar } = await import('../js/storage.js');

assert.deepEqual(cargar('no-existe', { a: 1 }), { a: 1 });
guardar('proyecto', { tramos: [1, 2, 3] });
assert.deepEqual(cargar('proyecto', null), { tramos: [1, 2, 3] });

console.log('storage.test.js: OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node Hidrogeno/tests/storage.test.js`
Expected: FAIL — `Cannot find module '../js/storage.js'`

- [ ] **Step 3: Write the implementation**

```js
// Hidrogeno/js/storage.js
// Autoguardado en localStorage + exportar/importar proyecto como JSON.

const PREFIJO = 'quempin-h2-calculadora::';

export function guardar(clave, datos) {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(datos));
  } catch (error) {
    console.warn('No se pudo guardar en localStorage:', error);
  }
}

export function cargar(clave, porDefecto) {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    return crudo === null ? porDefecto : JSON.parse(crudo);
  } catch (error) {
    console.warn('No se pudo leer de localStorage:', error);
    return porDefecto;
  }
}

export function exportarJSON(nombreArchivo, datos) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

export function importarJSON(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
      try {
        resolve(JSON.parse(lector.result));
      } catch (error) {
        reject(error);
      }
    };
    lector.onerror = () => reject(lector.error);
    lector.readAsText(archivo);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node Hidrogeno/tests/storage.test.js`
Expected: prints `storage.test.js: OK`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add Hidrogeno/js/storage.js Hidrogeno/tests/storage.test.js
git commit -m "feat: add localStorage autosave and JSON project import/export"
```

---

### Task 7: `tests/run-all.js` — single entry point for regression tests

**Files:**
- Create: `Hidrogeno/tests/run-all.js`

**Interfaces:**
- Consumes: nothing new — just sequences Tasks 1-6's test files.
- Produces: a single `node Hidrogeno/tests/run-all.js` command used in
  Task 14 (final verification) and citable in `Hidrogeno/CLAUDE.md`.

- [ ] **Step 1: Write the script**

```js
// Hidrogeno/tests/run-all.js
// Corre todos los tests de regresión del motor de cálculo en secuencia.
// Cada archivo importado lanza (throw) si alguna aserción falla, lo que
// aborta este script con código de salida distinto de 0.

await import('./physics.test.js');
await import('./gas-h2.test.js');
await import('./calc-flujo.test.js');
await import('./calc-almacenamiento.test.js');
await import('./calc-memoria.test.js');
await import('./storage.test.js');

console.log('\nTodos los tests de regresión pasaron.');
```

- [ ] **Step 2: Run it**

Run: `node Hidrogeno/tests/run-all.js`
Expected: all six `*.test.js: OK` lines print, followed by "Todos los tests
de regresión pasaron.", exit code 0.

- [ ] **Step 3: Commit**

```bash
git add Hidrogeno/tests/run-all.js
git commit -m "test: add single entry point for the regression suite"
```

---

### Task 8: Brand CSS system (`Hidrogeno/css/styles.css`)

**Files:**
- Create: `Hidrogeno/css/styles.css`

**Interfaces:**
- Produces: CSS custom properties (`--surface-1`, `--page-plane`,
  `--surface-card`, `--text-primary`, `--text-secondary`, `--text-muted`,
  `--gridline`, `--baseline`, `--brand-orange`, `--brand-black`,
  `--brand-gray-11`, `--brand-gray-7`, `--brand-orange-ink`) matching
  `_reference-finanzas-quempin/index.html` exactly, plus classes for tabs
  (`.tabs`, `.tab`, `.tab.active`, `.tab-panel`), cards, form rows/inputs,
  result tiles, and a `@media print` block — consumed by Task 11 (hub) and
  Task 12 (Hidrogeno index.html).

- [ ] **Step 1: Extract the exact brand block**

Read `_reference-finanzas-quempin/index.html` lines with the `@font-face`
Lato embed and the `:root` / `@media (prefers-color-scheme: dark)` /
`[data-theme]` custom-property blocks (already located during design at
lines ~4-99). Copy them verbatim into the new file so hue and font-weight
match pixel-for-pixel — do not retype the base64 font data by hand.

- [ ] **Step 2: Write the layout/component rules**

Append tab navigation, form, and result-tile rules using only the custom
properties from Step 1 (no new hardcoded colors):

```css
/* --- Estructura de pestañas --- */
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--gridline); margin: 24px 0 20px; flex-wrap: wrap; }
.tab {
  font: inherit; font-weight: 700; font-size: 13.5px; padding: 10px 16px;
  background: none; border: none; border-bottom: 3px solid transparent;
  color: var(--text-secondary); cursor: pointer;
}
.tab:hover { color: var(--text-primary); }
.tab.active { color: var(--brand-orange-ink, var(--brand-orange)); border-bottom-color: var(--brand-orange); }
.tab-panel { display: none; }
.tab-panel.active { display: block; }

/* --- Formularios --- */
.campo { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
.campo label { font-size: 12.5px; font-weight: 700; color: var(--text-secondary); }
.campo input, .campo select {
  font: inherit; font-size: 14px; padding: 8px 10px; border-radius: 6px;
  border: 1px solid var(--gridline); background: var(--surface-card); color: var(--text-primary);
}
.campo input:focus-visible, .campo select:focus-visible { outline: 2px solid var(--brand-orange); outline-offset: 1px; }
.fila-campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0 20px; }

/* --- Resultados --- */
.resultados { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 20px; }
.resultado-tile {
  background: var(--surface-card); border: 1px solid var(--gridline); border-radius: 10px;
  padding: 14px 16px;
}
.resultado-tile .valor { font-size: 22px; font-weight: 900; color: var(--text-primary); }
.resultado-tile .etiqueta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.resultado-tile.alerta { border-color: var(--brand-orange); }
.resultado-tile.alerta .valor { color: var(--brand-orange-ink, var(--brand-orange)); }

/* --- Impresión (Memoria de Cálculo) --- */
@media print {
  .tabs, .no-imprimir, header .theme-toggle { display: none !important; }
  body { background: #ffffff; color: #000000; }
  /* Solo se imprime la pestaña activa (evita que las 3 pestañas queden
     apiladas en el PDF) — el default ya oculta .tab-panel sin .active. */
  .tab-panel.active { display: block !important; }
  #memoria-tabla-impresion { display: table !important; }
}
```

- [ ] **Step 3: Verify no orphaned selectors**

Run: `grep -c "var(--" "Hidrogeno/css/styles.css"` and confirm every custom
property referenced was defined in Step 1's copied block (cross-check by
eye against the reference file — this is a static-analysis sanity check,
not a script).

- [ ] **Step 4: Commit**

```bash
git add Hidrogeno/css/styles.css
git commit -m "feat: add QUEMPIN brand CSS system for the Hidrógeno app"
```

---

### Task 9: `Hidrogeno/index.html` shell + `ui.js` — Tab 1 (Tubería y Flujo)

**Files:**
- Create: `Hidrogeno/index.html`
- Create: `Hidrogeno/js/ui.js`

**Interfaces:**
- Consumes: `calcularFlujo` (Task 3), `TABLA_TUBERIA` (Task 2), `guardar`/`cargar` (Task 6).
- Produces: the page shell (header, tab bar, three `.tab-panel` sections —
  panels 2 and 3 built out in Tasks 10-11), and `ui.js`'s
  `initTabs()`/`initTeoriaFlujo()` exports, consumed by Task 12 (final
  wiring) and verified in Task 14 (Playwright).

- [ ] **Step 1: Write the page shell**

```html
<!-- Hidrogeno/index.html -->
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hidrógeno — Calculadora Técnica QUEMPIN</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🧪</text></svg>">
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <header class="viz-header">
    <div class="viz-titleblock">
      <span class="viz-wordmark">QUEMP<span class="in">IN</span></span>
      <h1>Calculadora de Hidrógeno</h1>
      <p>Dimensionamiento de tuberías, almacenamiento y memoria de cálculo — ASME B31.12 / NFPA 2</p>
    </div>
    <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Cambiar tema">🌓</button>
  </header>

  <nav class="tabs" role="tablist">
    <button class="tab active" role="tab" data-tab="flujo">Tubería y Flujo</button>
    <button class="tab" role="tab" data-tab="almacenamiento">Almacenamiento</button>
    <button class="tab" role="tab" data-tab="memoria">Memoria de Cálculo</button>
  </nav>

  <main>
    <section class="tab-panel active" id="panel-flujo" data-panel="flujo">
      <form id="form-flujo" class="fila-campos" autocomplete="off">
        <div class="campo">
          <label for="flujo-presion">Presión manométrica [bar]</label>
          <input id="flujo-presion" type="number" step="any" value="0.8" required>
        </div>
        <div class="campo">
          <label for="flujo-temperatura">Temperatura [°C]</label>
          <input id="flujo-temperatura" type="number" step="any" value="20" required>
        </div>
        <div class="campo">
          <label for="flujo-potencia">Potencia combustión [kW]</label>
          <input id="flujo-potencia" type="number" step="any" value="60" required>
        </div>
        <div class="campo">
          <label for="flujo-tuberia">Tubería utilizada</label>
          <select id="flujo-tuberia" required></select>
        </div>
        <div class="campo">
          <label for="flujo-presion-min">Presión manométrica mínima [bar]</label>
          <input id="flujo-presion-min" type="number" step="any" value="29.5" required>
        </div>
        <div class="campo">
          <label for="flujo-largo">Largo de la línea [m]</label>
          <input id="flujo-largo" type="number" step="any" value="20" required>
        </div>
        <div class="campo">
          <label for="flujo-codos">Codos</label>
          <input id="flujo-codos" type="number" step="1" min="0" value="0">
        </div>
        <div class="campo">
          <label for="flujo-tees">Tee</label>
          <input id="flujo-tees" type="number" step="1" min="0" value="0">
        </div>
        <div class="campo">
          <label for="flujo-valvulas">Válvulas</label>
          <input id="flujo-valvulas" type="number" step="1" min="0" value="0">
        </div>
        <div class="campo">
          <label for="flujo-factor-diseno">Factor de diseño F (ASME B31.12)</label>
          <input id="flujo-factor-diseno" type="number" step="any" value="0.4" required>
        </div>
        <div class="campo">
          <label for="flujo-factor-union">Factor de uniones longitudinales E</label>
          <input id="flujo-factor-union" type="number" step="any" value="1" required>
        </div>
        <div class="campo">
          <label for="flujo-unidad-normalizado">Unidad flujo normalizado</label>
          <select id="flujo-unidad-normalizado">
            <option value="[Nm3/h]">[Nm3/h]</option>
            <option value="[sL/min]" selected>[sL/min]</option>
          </select>
        </div>
        <div class="campo">
          <label for="flujo-unidad-h2">Unidad flujo H2</label>
          <select id="flujo-unidad-h2">
            <option value="[m3/h]" selected>[m3/h]</option>
            <option value="[L/min]">[L/min]</option>
          </select>
        </div>
      </form>

      <div class="resultados" id="resultados-flujo" aria-live="polite"></div>

      <details class="no-imprimir">
        <summary>Tabla de tubería (referencia)</summary>
        <table id="tabla-tuberia-flujo"></table>
      </details>
    </section>

    <section class="tab-panel" id="panel-almacenamiento" data-panel="almacenamiento"></section>
    <section class="tab-panel" id="panel-memoria" data-panel="memoria"></section>
  </main>

  <script type="module" src="js/ui.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `ui.js` — tabs + Tab 1 wiring**

```js
// Hidrogeno/js/ui.js
import { calcularFlujo } from './calc-flujo.js';
import { TABLA_TUBERIA } from './gas-h2.js';
import { guardar, cargar } from './storage.js';

export function initTabs() {
  const botones = document.querySelectorAll('.tab');
  const paneles = document.querySelectorAll('.tab-panel');
  botones.forEach((boton) => {
    boton.addEventListener('click', () => {
      botones.forEach((b) => b.classList.remove('active'));
      paneles.forEach((p) => p.classList.remove('active'));
      boton.classList.add('active');
      document.querySelector(`[data-panel="${boton.dataset.tab}"]`).classList.add('active');
    });
  });
}

function poblarSelectTuberia(select) {
  select.innerHTML = TABLA_TUBERIA.map(
    (f) => `<option value="${f.pulgadas}">${f.pulgadas}" — DI ${f.diMm} mm</option>`
  ).join('');
}

function leerFlujoForm() {
  const num = (id) => Number(document.getElementById(id).value);
  return {
    presionBarG: num('flujo-presion'),
    temperaturaC: num('flujo-temperatura'),
    potenciaKw: num('flujo-potencia'),
    tuberiaPulgadas: Number(document.getElementById('flujo-tuberia').value),
    presionMinBarG: num('flujo-presion-min'),
    largoM: num('flujo-largo'),
    codos: num('flujo-codos'),
    tees: num('flujo-tees'),
    valvulas: num('flujo-valvulas'),
    factorDiseno: num('flujo-factor-diseno'),
    factorUnion: num('flujo-factor-union'),
    unidadNormalizado: document.getElementById('flujo-unidad-normalizado').value,
    unidadH2: document.getElementById('flujo-unidad-h2').value,
  };
}

function tile(valor, etiqueta, alerta = false) {
  return `<div class="resultado-tile${alerta ? ' alerta' : ''}"><div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div></div>`;
}

function renderResultadosFlujo(r) {
  const cercaDeErosion = r.velocidadFlujoMS >= r.velocidadErosionMS * 0.8;
  document.getElementById('resultados-flujo').innerHTML = [
    tile(`${r.presionMaxDisenoBar.toFixed(2)} bar`, 'Presión máxima de diseño (Barlow, ASME B31.12)'),
    tile(`${r.densidadKgM3.toFixed(4)} kg/m³`, 'Densidad real'),
    tile(`${r.flujoMasicoKgH.toFixed(3)} kg/h`, 'Flujo másico de H₂'),
    tile(`${r.flujoVolNormalizado.toFixed(2)}`, 'Flujo volumétrico normalizado'),
    tile(`${r.flujoVolH2.toFixed(3)}`, 'Flujo volumétrico H₂'),
    tile(`${r.velocidadFlujoMS.toFixed(2)} m/s`, 'Velocidad de flujo', cercaDeErosion),
    tile(`${r.velocidadErosionMS.toFixed(2)} m/s`, 'Velocidad de erosión (límite)'),
    tile(`${r.perdidaCargaMbar.toFixed(2)} mbar`, 'Pérdida de carga'),
    tile(r.zDiseno.toFixed(6), 'Factor Z (diseño)'),
    tile(r.reynolds.toFixed(0), 'Número de Reynolds'),
    tile(r.factorFriccion.toFixed(5), 'Factor de fricción (Haaland)'),
  ].join('');
}

function renderTablaTuberia() {
  const filas = TABLA_TUBERIA.map(
    (f) => `<tr><td>${f.pulgadas}"</td><td>${f.diMm}</td><td>${f.espesorMm}</td><td>${f.limiteElasticoMPa}</td><td>${f.rugosidadMm}</td></tr>`
  ).join('');
  document.getElementById('tabla-tuberia-flujo').innerHTML =
    `<thead><tr><th>Nominal</th><th>DI [mm]</th><th>Espesor [mm]</th><th>S mín. [MPa]</th><th>Rugosidad [mm]</th></tr></thead><tbody>${filas}</tbody>`;
}

export function initTeoriaFlujo() {
  const form = document.getElementById('form-flujo');
  const select = document.getElementById('flujo-tuberia');
  poblarSelectTuberia(select);
  renderTablaTuberia();

  const guardados = cargar('flujo', null);
  if (guardados) {
    Object.entries(guardados).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.value = valor;
    });
  } else {
    select.value = '0.5';
  }

  function recalcular() {
    const inputs = leerFlujoForm();
    const resultado = calcularFlujo(inputs);
    renderResultadosFlujo(resultado);
    guardar('flujo', Object.fromEntries(
      Array.from(form.querySelectorAll('input, select')).map((el) => [el.id, el.value])
    ));
  }

  form.addEventListener('input', recalcular);
  recalcular();
}

initTabs();
initTeoriaFlujo();
```

- [ ] **Step 3: Manual smoke check**

Run a static file server (`npx --yes serve Hidrogeno` or
`python -m http.server --directory Hidrogeno 8000`) and open the page —
confirm the "Tubería y Flujo" tab renders 11 result tiles that update as
inputs change, and that the pipe table shows 6 rows. Full cross-browser
verification happens in Task 14; this is just a fast local sanity check
before moving on.

- [ ] **Step 4: Commit**

```bash
git add Hidrogeno/index.html Hidrogeno/js/ui.js
git commit -m "feat: add Hidrógeno app shell, tab navigation, and Tubería y Flujo tab"
```

---

### Task 10: Tab 2 — Almacenamiento UI

**Files:**
- Modify: `Hidrogeno/index.html:` (`#panel-almacenamiento` section)
- Modify: `Hidrogeno/js/ui.js` (add `initAlmacenamiento()`)

**Interfaces:**
- Consumes: `calcularAlmacenamiento`, `formatearHoras` (Task 4); `guardar`/`cargar` (Task 6).
- Produces: `initAlmacenamiento()` exported and called at module load,
  matching the pattern of `initTeoriaFlujo()`.

- [ ] **Step 1: Add the panel markup**

Replace the empty `<section class="tab-panel" id="panel-almacenamiento" data-panel="almacenamiento"></section>`
in `Hidrogeno/index.html` with:

```html
<section class="tab-panel" id="panel-almacenamiento" data-panel="almacenamiento">
  <form id="form-almacenamiento" class="fila-campos" autocomplete="off">
    <div class="campo">
      <label for="alm-potencia">Potencia quemador [kW]</label>
      <input id="alm-potencia" type="number" step="any" value="60" required>
    </div>
    <div class="campo">
      <label for="alm-temperatura">Temperatura [°C]</label>
      <input id="alm-temperatura" type="number" step="any" value="20" required>
    </div>
    <div class="campo">
      <label for="alm-presion">Presión de almacenamiento [bar abs]</label>
      <input id="alm-presion" type="number" step="any" value="200" required>
    </div>
    <div class="campo">
      <label for="alm-volumen">Volumen del estanque [m³]</label>
      <input id="alm-volumen" type="number" step="any" value="0.19" required>
    </div>
    <div class="campo">
      <label for="alm-unidad-caudal">Unidad caudal de referencia</label>
      <select id="alm-unidad-caudal">
        <option value="[m³/h]" selected>[m³/h]</option>
        <option value="[L/min]">[L/min]</option>
      </select>
    </div>
  </form>
  <div class="resultados" id="resultados-almacenamiento" aria-live="polite"></div>
</section>
```

- [ ] **Step 2: Add `initAlmacenamiento()` to `ui.js`**

```js
// Hidrogeno/js/ui.js — agregar al final del archivo, antes de las llamadas initX()
import { calcularAlmacenamiento, formatearHoras } from './calc-almacenamiento.js';

function leerAlmacenamientoForm() {
  const num = (id) => Number(document.getElementById(id).value);
  return {
    potenciaKw: num('alm-potencia'),
    temperaturaC: num('alm-temperatura'),
    presionBarAbs: num('alm-presion'),
    volumenM3: num('alm-volumen'),
    unidadCaudalReferencia: document.getElementById('alm-unidad-caudal').value,
  };
}

function renderResultadosAlmacenamiento(r) {
  document.getElementById('resultados-almacenamiento').innerHTML = [
    tile(`${r.masaAlmacenadaKg.toFixed(3)} kg`, 'Masa de H₂ almacenada (PV=ZnRT)'),
    tile(r.zAlmacenamiento.toFixed(3), 'Factor de compresibilidad Z'),
    tile(`${r.densidadRealKgM3.toFixed(3)} kg/m³`, 'Densidad real en el estanque'),
    tile(`${r.volumenNormalizadoNm3.toFixed(2)} Nm³`, 'Volumen normalizado'),
    tile(formatearHoras(r.autonomiaHoras), 'Autonomía (hh:mm:ss)'),
    tile(`${r.consumoKgH.toFixed(3)} kg/h`, 'Consumo del quemador'),
    tile(`${r.consumoNm3H.toFixed(3)} Nm³/h`, 'Consumo del quemador (normalizado)'),
    tile(`${r.caudalReferenciaM3H.toFixed(4)}`, 'Caudal de referencia (línea capilar Ø¼")'),
    tile(`${r.velocidadReferenciaMS.toFixed(3)} m/s`, 'Velocidad de referencia (línea capilar Ø¼")'),
    tile(formatearHoras(r.tiempoLlenadoHoras), 'Tiempo de llenado (hh:mm:ss)'),
  ].join('');
}

export function initAlmacenamiento() {
  const form = document.getElementById('form-almacenamiento');
  const guardados = cargar('almacenamiento', null);
  if (guardados) {
    Object.entries(guardados).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.value = valor;
    });
  }

  function recalcular() {
    const resultado = calcularAlmacenamiento(leerAlmacenamientoForm());
    renderResultadosAlmacenamiento(resultado);
    guardar('almacenamiento', Object.fromEntries(
      Array.from(form.querySelectorAll('input, select')).map((el) => [el.id, el.value])
    ));
  }

  form.addEventListener('input', recalcular);
  recalcular();
}
```

Add `initAlmacenamiento();` next to the existing `initTeoriaFlujo();` call
at the bottom of `ui.js`.

- [ ] **Step 3: Manual smoke check**

Reload the local server from Task 9, click "Almacenamiento", confirm 10
result tiles render and update live, and that changing "Presión de
almacenamiento" changes "Densidad real en el estanque" (this is the
deliberate fix vs. the Excel — it must NOT match whatever the Flujo tab's
density shows when the two tabs have different pressures).

- [ ] **Step 4: Commit**

```bash
git add Hidrogeno/index.html Hidrogeno/js/ui.js
git commit -m "feat: add Almacenamiento tab UI"
```

---

### Task 11: Tab 3 — Memoria de Cálculo UI (branching network + tree diagram + print)

**Files:**
- Modify: `Hidrogeno/index.html` (`#panel-memoria` section)
- Modify: `Hidrogeno/js/ui.js` (add `initMemoria()`)

**Interfaces:**
- Consumes: `calcularRed` (Task 5); `TABLA_TUBERIA` (Task 2);
  `guardar`/`cargar`/`exportarJSON`/`importarJSON` (Task 6).
- Produces: `initMemoria()`, called alongside the other `initX()` functions.

- [ ] **Step 1: Add the panel markup**

```html
<section class="tab-panel" id="panel-memoria" data-panel="memoria">
  <div class="no-imprimir" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
    <button type="button" id="memoria-agregar-tramo">+ Agregar tramo</button>
    <button type="button" id="memoria-exportar">Exportar proyecto (.json)</button>
    <label style="display:inline-flex; align-items:center; gap:6px;">
      Importar proyecto
      <input type="file" id="memoria-importar" accept="application/json">
    </label>
    <button type="button" id="memoria-imprimir">Imprimir / Guardar PDF</button>
  </div>

  <svg id="memoria-arbol" width="100%" height="220" role="img" aria-label="Diagrama de la red de tramos"></svg>

  <table id="memoria-tabla" class="no-imprimir">
    <thead>
      <tr>
        <th>Tramo</th><th>Continúa desde</th><th>Presión [MPa]</th><th>Longitud [m]</th>
        <th>Potencia [kW]</th><th>Diámetro</th><th>Material</th><th>Temp. [°C]</th>
        <th>Densidad [kg/m³]</th><th>Velocidad [m/s]</th><th>Pérdida parcial [mbar]</th>
        <th>Pérdida acumulada [mbar]</th><th></th>
      </tr>
    </thead>
    <tbody id="memoria-tabla-cuerpo"></tbody>
  </table>

  <table id="memoria-tabla-impresion" style="display:none;">
    <caption>Memoria de Cálculo — Red de Hidrógeno — QUEMPIN</caption>
    <thead>
      <tr><th>Tramo</th><th>Continúa desde</th><th>Presión [MPa]</th><th>Longitud [m]</th><th>Diámetro</th><th>Pérdida acumulada [mbar]</th></tr>
    </thead>
    <tbody id="memoria-tabla-impresion-cuerpo"></tbody>
  </table>
</section>
```

- [ ] **Step 2: Add `initMemoria()` to `ui.js`**

```js
// Hidrogeno/js/ui.js — agregar al final del archivo, antes de las llamadas initX()
import { calcularRed } from './calc-memoria.js';
import { exportarJSON, importarJSON } from './storage.js';

let tramos = [];
let contadorId = 0;

function tramoPorDefecto() {
  contadorId += 1;
  return {
    id: `t${contadorId}`, nombre: `Tramo ${contadorId}`, continuaDesdeId: null,
    presionMPa: 0.5, longitudM: 5, potenciaKw: 12, tuberiaPulgadas: 0.25,
    material: 'AISI 316L', temperaturaC: 20,
  };
}

function renderTablaMemoria(resultado) {
  const opcionesPadre = (actualId) => ['<option value="">— raíz —</option>'].concat(
    tramos.filter((t) => t.id !== actualId).map((t) => `<option value="${t.id}">${t.nombre}</option>`)
  ).join('');

  document.getElementById('memoria-tabla-cuerpo').innerHTML = resultado.map((t) => `
    <tr data-id="${t.id}">
      <td><input type="text" class="mem-nombre" value="${t.nombre}"></td>
      <td><select class="mem-padre">${opcionesPadre(t.id)}</select></td>
      <td><input type="number" step="any" class="mem-presion" value="${t.presionMPa}"></td>
      <td><input type="number" step="any" class="mem-largo" value="${t.longitudM}"></td>
      <td><input type="number" step="any" class="mem-potencia" value="${t.potenciaKw}"></td>
      <td><select class="mem-tuberia">${TABLA_TUBERIA.map((f) => `<option value="${f.pulgadas}"${f.pulgadas === t.tuberiaPulgadas ? ' selected' : ''}>${f.pulgadas}"</option>`).join('')}</select></td>
      <td><input type="text" class="mem-material" value="${t.material}"></td>
      <td><input type="number" step="any" class="mem-temp" value="${t.temperaturaC}"></td>
      <td>${t.densidadKgM3.toFixed(4)}</td>
      <td>${t.velocidadFlujoMS.toFixed(2)}</td>
      <td>${t.perdidaParcialMbar.toFixed(2)}</td>
      <td>${t.perdidaAcumuladaMbar.toFixed(2)}</td>
      <td><button type="button" class="mem-eliminar no-imprimir">✕</button></td>
    </tr>
  `).join('');

  tramos.forEach((t) => {
    const fila = document.querySelector(`#memoria-tabla-cuerpo tr[data-id="${t.id}"] .mem-padre`);
    if (fila) fila.value = t.continuaDesdeId ?? '';
  });
}

function renderArbol(resultado) {
  const porId = Object.fromEntries(resultado.map((t) => [t.id, t]));
  const raices = resultado.filter((t) => !t.continuaDesdeId);
  const nivelDe = (t, visitados = new Set()) => {
    if (!t.continuaDesdeId || visitados.has(t.id)) return 0;
    visitados.add(t.id);
    return 1 + nivelDe(porId[t.continuaDesdeId], visitados);
  };
  const anchoNivel = 140, altoFila = 40;
  const nodos = resultado.map((t) => ({ t, nivel: nivelDe(t) }));
  const porNivel = new Map();
  nodos.forEach((n) => {
    const fila = porNivel.get(n.nivel) ?? 0;
    n.fila = fila;
    porNivel.set(n.nivel, fila + 1);
  });

  const svg = document.getElementById('memoria-arbol');
  const lineas = nodos.filter((n) => n.t.continuaDesdeId).map((n) => {
    const padre = nodos.find((p) => p.t.id === n.t.continuaDesdeId);
    if (!padre) return '';
    return `<line x1="${padre.nivel * anchoNivel + 60}" y1="${padre.fila * altoFila + 20}" x2="${n.nivel * anchoNivel + 60}" y2="${n.fila * altoFila + 20}" stroke="var(--gridline)" stroke-width="2"/>`;
  }).join('');
  const circulos = nodos.map((n) => `
    <g>
      <circle cx="${n.nivel * anchoNivel + 60}" cy="${n.fila * altoFila + 20}" r="8" fill="var(--brand-orange)"/>
      <title>${n.t.nombre} — ${n.t.perdidaAcumuladaMbar.toFixed(2)} mbar acumulados, ${n.t.velocidadFlujoMS.toFixed(2)} m/s</title>
      <text x="${n.nivel * anchoNivel + 74}" y="${n.fila * altoFila + 24}" font-size="12" fill="var(--text-primary)">${n.t.nombre}</text>
    </g>`).join('');
  svg.setAttribute('height', String((Math.max(...porNivel.values(), 1)) * altoFila + 20));
  svg.innerHTML = lineas + circulos;
}

function recalcularMemoria() {
  let resultado;
  try {
    resultado = calcularRed(tramos);
  } catch (error) {
    document.getElementById('memoria-tabla-cuerpo').innerHTML =
      `<tr><td colspan="13" class="resultado-tile alerta">${error.message}</td></tr>`;
    return;
  }
  renderTablaMemoria(resultado);
  renderArbol(resultado);
  document.getElementById('memoria-tabla-impresion-cuerpo').innerHTML = resultado.map((t) => `
    <tr><td>${t.nombre}</td><td>${porNombre(t.continuaDesdeId)}</td><td>${t.presionMPa}</td><td>${t.longitudM}</td><td>${t.tuberiaPulgadas}"</td><td>${t.perdidaAcumuladaMbar.toFixed(2)}</td></tr>
  `).join('');
  guardar('memoria', tramos);

  function porNombre(id) {
    return id ? (tramos.find((t) => t.id === id)?.nombre ?? '') : '— raíz —';
  }
}

function leerFilaMemoria(fila) {
  const id = fila.dataset.id;
  const val = (clase) => fila.querySelector(`.${clase}`).value;
  return {
    id,
    nombre: val('mem-nombre'),
    continuaDesdeId: val('mem-padre') || null,
    presionMPa: Number(val('mem-presion')),
    longitudM: Number(val('mem-largo')),
    potenciaKw: Number(val('mem-potencia')),
    tuberiaPulgadas: Number(val('mem-tuberia')),
    material: val('mem-material'),
    temperaturaC: Number(val('mem-temp')),
  };
}

export function initMemoria() {
  tramos = cargar('memoria', null) ?? [tramoPorDefecto()];
  contadorId = tramos.length;

  document.getElementById('memoria-agregar-tramo').addEventListener('click', () => {
    tramos.push(tramoPorDefecto());
    recalcularMemoria();
  });

  document.getElementById('memoria-tabla-cuerpo').addEventListener('input', (evento) => {
    const fila = evento.target.closest('tr[data-id]');
    if (!fila) return;
    const actualizado = leerFilaMemoria(fila);
    tramos = tramos.map((t) => (t.id === actualizado.id ? actualizado : t));
    recalcularMemoria();
  });

  document.getElementById('memoria-tabla-cuerpo').addEventListener('click', (evento) => {
    if (!evento.target.classList.contains('mem-eliminar')) return;
    const id = evento.target.closest('tr[data-id]').dataset.id;
    tramos = tramos.filter((t) => t.id !== id).map((t) => (t.continuaDesdeId === id ? { ...t, continuaDesdeId: null } : t));
    recalcularMemoria();
  });

  document.getElementById('memoria-exportar').addEventListener('click', () => {
    exportarJSON('proyecto-hidrogeno.json', tramos);
  });

  document.getElementById('memoria-importar').addEventListener('change', async (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    tramos = await importarJSON(archivo);
    contadorId = tramos.length;
    recalcularMemoria();
  });

  document.getElementById('memoria-imprimir').addEventListener('click', () => window.print());

  recalcularMemoria();
}
```

- [ ] **Step 3: Manual smoke check**

Reload the server, click "Memoria de Cálculo", add 3-4 tramos, set one
tramo's "Continúa desde" to another, confirm the SVG tree updates and the
table's "Pérdida acumulada" reflects the chosen parent. Try Ctrl+P and
confirm the print preview shows only the letterhead table (via `@media
print` from Task 8), not the form controls.

- [ ] **Step 4: Commit**

```bash
git add Hidrogeno/index.html Hidrogeno/js/ui.js
git commit -m "feat: add Memoria de Cálculo tab with branching tree diagram and print export"
```

---

### Task 12: Root hub (`index.html`) + `CLAUDE.md` (maestro) + `Hidrogeno/CLAUDE.md` (contenido)

**Files:**
- Create: `index.html` (repo root)
- Create: `CLAUDE.md` (repo root)
- Create: `Hidrogeno/CLAUDE.md`

**Interfaces:**
- Consumes: brand CSS pattern from `_reference-finanzas-quempin/index.html`
  (read-only reference, not imported).
- Produces: the public entry point linked from Task 14's verification.

- [ ] **Step 1: Write the hub `index.html`**

Reuse the exact `@font-face`/`:root`/dark-mode CSS block from
`_reference-finanzas-quempin/index.html` (same approach as Task 8 Step 1),
with a card grid of one item: "Hidrógeno" (`href="Hidrogeno/"`), styled
with `.hub-card` matching that reference file's card component. Favicon:
🗂️ is already used by the Finanzas hub — pick a distinct one, e.g. 🧪 (same
as the Hidrógeno app, since this hub is currently a single-card gateway to
it). Title: "QUEMPIN — Calculadora Técnica".

- [ ] **Step 2: Write the maestro `CLAUDE.md`**

Cover: project purpose (multi-gas engineering dashboard, starting with H2),
brand system source (`assets/OFICIAL MANUAL DE MARCA GRÁFICA QUEMPIN.pdf`),
hosting (GitHub Pages from `main`, no gh-pages branch, no password gate —
with the one-sentence reasoning from the spec), the folder convention
(`<Gas o familia de gases>/` with its own `CLAUDE.md`, `index.html`, `css/`,
`js/`, `tests/`), and a pointer to
`docs/superpowers/specs/2026-09-01-calculadora-tecnica-hidrogeno-design.md`
for the full design rationale.

- [ ] **Step 3: Write `Hidrogeno/CLAUDE.md`**

Cover: source workbook (`Calculos H2.xlsx`, analyzed 2026-09-01), the three
tabs and which Excel sheet each ports, the **documented discrepancies**
from the spec's "Pestaña 2" section verbatim (PCI 119960 vs 120000, Z-factor
step function boundary difference, and the deliberate density fix), the
"Fuera de alcance" list from the spec, and the regression test command
(`node Hidrogeno/tests/run-all.js`) as the way to verify any future formula
change against the source workbook's cached values.

- [ ] **Step 4: Commit**

```bash
git add index.html CLAUDE.md Hidrogeno/CLAUDE.md
git commit -m "docs: add hub page and CLAUDE.md documentation for the project and Hidrógeno module"
```

---

### Task 13: Git repo init, GitHub repo creation, Pages

**Files:** none (repo-level operations only).

- [ ] **Step 1: Initialize the repo (if not already done in an earlier task)**

Run: `git init` at the folder root (skip if Task 1's commit already
implied a repo — check with `git rev-parse --is-inside-work-tree` first).

- [ ] **Step 2: Confirm `.gitignore` is respected**

Run: `git status` — confirm `_reference-finanzas-quempin/` and
`*.lnk` do NOT appear as untracked-to-be-added.

- [ ] **Step 3: Create the GitHub repo and push**

```bash
gh repo create calculadora-tecnica-quempin --public --source=. --remote=origin --push
```

- [ ] **Step 4: Enable GitHub Pages from `main` (root)**

```bash
gh api -X POST repos/:owner/calculadora-tecnica-quempin/pages -f "source[branch]=main" -f "source[path]=/"
```

If this returns a 409 (Pages already enabled) or 422, use
`gh api repos/:owner/calculadora-tecnica-quempin/pages -X PUT -f "source[branch]=main" -f "source[path]=/"`
instead, or fall back to `gh repo edit --enable-pages` /
manual confirmation via `gh browse --settings` if the CLI's Pages API
surface differs from what's documented here — report back the exact error
before trying a third approach.

- [ ] **Step 5: Verify the live URL**

Run: `gh api repos/:owner/calculadora-tecnica-quempin/pages --jq .html_url`
and confirm it responds (Pages builds can take 1-2 minutes — poll, don't
assume failure on the first miss).

---

### Task 14: Full regression + browser verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full regression suite one more time**

Run: `node Hidrogeno/tests/run-all.js`
Expected: exit code 0, all six suites print `OK`.

- [ ] **Step 2: Playwright pass over the live (or local) site**

Navigate to the deployed Pages URL (or the local static server if Pages
hasn't finished building yet). For each of the 3 tabs: take a snapshot,
enter the exact default values from the spec's fixtures, and confirm the
displayed result tiles match the cached Excel values from Task 3/4's test
fixtures (rendered to 2-4 significant figures, per the `toFixed()` calls in
`ui.js`). Toggle the theme button and confirm dark/light both render with
sufficient contrast. Resize to a narrow mobile width (390px) and confirm
the tab bar wraps instead of overflowing.

- [ ] **Step 3: Report results**

Summarize: regression suite status, screenshots/observations from the
Playwright pass, the live Pages URL, and any open items from the spec's
"Fuera de alcance" section as explicit follow-ups (not silently deferred).
