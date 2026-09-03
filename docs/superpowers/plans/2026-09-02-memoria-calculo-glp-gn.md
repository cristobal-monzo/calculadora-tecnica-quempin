# Memoria de Cálculo (GLP/GN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Memoria de Cálculo" tab to `GasNatural-GLP/` — a branched
network of pipe segments (tramos), mirroring the tab that already exists
in `Hidrogeno/`, but built on Red de Gas's Renouard/Peng-Robinson physics
instead of Hidrógeno's Barlow physics.

**Architecture:** A thin engine (`calc-memoria-red-gas.js`) delegates each
tramo straight to the existing, already-tested `calcularRedGas()` — it
does not reimplement any formula. A second pass walks the parent/child
tree to roll up an accumulated pressure-loss figure for reporting only
(no tramo's own input is ever derived from another tramo's output). The
UI (`ui.js` + `index.html` + `css/styles.css`) mirrors Hidrógeno's Memoria
de Cálculo tab 1:1 in structure (editable table, SVG tree diagram, JSON
export/import, print view), swapping in Red de Gas's own fields.

**Tech Stack:** Vanilla JS (ES modules, no bundler, no dependencies), plain
Node's `assert/strict` for tests, static HTML/CSS.

**Spec:** [`docs/superpowers/specs/2026-09-02-memoria-calculo-glp-gn-design.md`](../specs/2026-09-02-memoria-calculo-glp-gn-design.md)
(read this first — it explains and justifies the two modeling decisions:
gas comes from the page's global Combustible selector, not per tramo; and
tramos do not chain pressure to each other).

## Global Constraints

- Gas (GLP/GN) is never a per-tramo field — it always comes from the
  module's existing global `combustible` selector.
- No pressure chaining between tramos: a child tramo's `presionInicialPa`
  is always its own manual input, never derived from a parent's
  `presionFinalPa`.
- No per-tramo "Tubería adecuada" indicator column (Hidrógeno's own
  Memoria deliberately excludes the analogous erosion-velocity check —
  same boundary applies here, see spec).
- All new manual-entry `<input>` elements use `type="text"
  inputmode="decimal"`, read via the existing `numeroFlexible()` helper
  already defined in `GasNatural-GLP/js/ui.js` — never `type="number"`
  and never bare `Number(...)` on user input.
- Every tramo carries a `reseteaAcumulada` boolean (a "Reinicia acum."
  checkbox) — same semantics as `Hidrogeno/js/calc-memoria.js`: when
  true, the accumulated-loss rollup ignores whatever the parent
  accumulated and restarts at 0 for that tramo and everything downstream
  of it.
- Run `node GasNatural-GLP/tests/run-all.js` after every task that
  touches a `.js` file under `GasNatural-GLP/js/` — it must stay green.
- No new npm dependencies. No build step. Files stay plain ES modules
  loaded via `<script type="module">`, same as every other file in this
  repo.

---

## Task 1: Port `exportarJSON`/`importarJSON` into `GasNatural-GLP/js/storage.js`

**Files:**
- Modify: `GasNatural-GLP/js/storage.js`

**Interfaces:**
- Produces: `exportarJSON(nombreArchivo: string, datos: any): void`,
  `importarJSON(archivo: File): Promise<any>` — both exported from
  `GasNatural-GLP/js/storage.js`, identical contract to the same-named
  functions already in `Hidrogeno/js/storage.js`.

Hidrógeno's copy of this file already has these two functions (used by
its Memoria de Cálculo tab for the "Exportar/Importar proyecto" buttons);
GasNatural-GLP's copy currently only has `guardar`/`cargar`. This task
ports the two missing functions verbatim — no test file, matching
precedent: `Hidrogeno/tests/storage.test.js` only exercises
`guardar`/`cargar` (its own comment explains `exportarJSON`/`importarJSON`
depend on `Blob`/`document`/`FileReader`, which aren't available in plain
Node, and are "verified in the real browser instead" — GasNatural-GLP
doesn't have a `storage.test.js` at all today, so this task doesn't add
one either).

- [ ] **Step 1: Add the two functions to `storage.js`**

Open `GasNatural-GLP/js/storage.js`. It currently ends after the
`cargar` function (line 23). Append:

```js

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

- [ ] **Step 2: Verify the file still parses and the existing suite is unaffected**

Run: `node --check GasNatural-GLP/js/storage.js && node GasNatural-GLP/tests/run-all.js`
Expected: `node --check` prints nothing (success); the test run prints
`Todos los tests de regresión pasaron.` (this file isn't imported by any
existing test, so nothing changes — this just confirms the port didn't
break the module).

- [ ] **Step 3: Commit**

```bash
git add GasNatural-GLP/js/storage.js
git commit -m "feat: port exportarJSON/importarJSON into GasNatural-GLP storage.js"
```

---

## Task 2: Engine — `calc-memoria-red-gas.js`

**Files:**
- Create: `GasNatural-GLP/js/calc-memoria-red-gas.js`
- Test: `GasNatural-GLP/tests/calc-memoria-red-gas.test.js`
- Modify: `GasNatural-GLP/tests/run-all.js`

**Interfaces:**
- Consumes: `calcularRedGas(inputs): result` from
  `GasNatural-GLP/js/calc-red-gas.js` (already exists — takes `{ gas,
  regimenPresion, material, pulgadas, tuberiaManual, potenciaKw,
  longitudM, presionInicialPa, temperaturaC }`, returns `{ tuberia,
  diametroMm, caudalObjetivoM3H, perdidaPresionRequeridaPa, presionFinalPa,
  velocidadMS, volumenTuberiaM3, perdidaAdmisiblePa, tuberiaAdecuada }`).
- Produces: `calcularRedMemoria(tramos: Array<Tramo>, gas: 'GLP' | 'GN'):
  Array<Tramo & RedGasResult & { perdidaAcumuladaPa: number }>` from
  `GasNatural-GLP/js/calc-memoria-red-gas.js`. A `Tramo` is `{ id: string,
  nombre: string, continuaDesdeId: string | null, reseteaAcumulada?:
  boolean, regimenPresion, material, pulgadas, tuberiaManual?,
  potenciaKw, longitudM, presionInicialPa, temperaturaC }` — everything
  `calcularRedGas` needs except `gas`, which is supplied once for the
  whole network. Throws `Error` (message matching `/no existe/` or
  `/[Cc]iclo/`) for an invalid `continuaDesdeId` or a cycle — Task 4's
  `recalcularMemoria()` in `ui.js` relies on this to show a single error
  row.

- [ ] **Step 1: Write the failing test file**

Create `GasNatural-GLP/tests/calc-memoria-red-gas.test.js`:

```js
import assert from 'node:assert/strict';
import { calcularRedMemoria } from '../js/calc-memoria-red-gas.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Cadena de 2 tramos GLP, baja presión, tubería 1/2" Acero (mismos inputs
// que el caso "glp" ya verificado en calc-red-gas.test.js) — B continúa
// desde A con un largo distinto.
const tramos = [
  { id: 'A', nombre: 'A', continuaDesdeId: null, regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 },
  { id: 'B', nombre: 'B', continuaDesdeId: 'A', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 5, presionInicialPa: 1000, temperaturaC: 15 },
];
const resultado = calcularRedMemoria(tramos, 'GLP');
const porId = Object.fromEntries(resultado.map((t) => [t.id, t]));

// Cada tramo trae los campos que ya devuelve calcularRedGas
assert.ok(porId.A.perdidaPresionRequeridaPa > 0);
assert.equal(porId.A.tuberiaAdecuada, true);

// La acumulada del root es igual a su propia pérdida requerida
cerca(porId.A.perdidaAcumuladaPa, porId.A.perdidaPresionRequeridaPa);

// B acumula sobre A (mismo diámetro, largo distinto -> pérdida propia distinta)
cerca(porId.B.perdidaAcumuladaPa, porId.B.perdidaPresionRequeridaPa + porId.A.perdidaAcumuladaPa);
assert.notEqual(porId.A.perdidaPresionRequeridaPa, porId.B.perdidaPresionRequeridaPa);

// Régimen media/alta presión: presionFinalPa no-null se reexpone tal cual
const tramosAlta = [
  { id: 'C', nombre: 'C', continuaDesdeId: null, regimenPresion: '>10 kPa', material: 'Acero Sch40', pulgadas: 2, potenciaKw: 200, longitudM: 30, presionInicialPa: 200000, temperaturaC: 15 },
];
const resultadoAlta = calcularRedMemoria(tramosAlta, 'GN');
assert.ok(resultadoAlta[0].presionFinalPa !== null);
cerca(resultadoAlta[0].presionFinalPa, 200000 - resultadoAlta[0].perdidaPresionRequeridaPa);

// Régimen baja presión: presionFinalPa se reexpone como null
assert.equal(porId.A.presionFinalPa, null);

// El gas viene del segundo parámetro, no de un campo por tramo — el mismo
// tramo da resultados distintos según el gas pasado (PCI volumétrico distinto).
const tramoBase = { id: 'X', nombre: 'X', continuaDesdeId: null, regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 };
const comoGLP = calcularRedMemoria([tramoBase], 'GLP');
const comoGN = calcularRedMemoria([tramoBase], 'GN');
assert.notEqual(comoGLP[0].caudalObjetivoM3H, comoGN[0].caudalObjetivoM3H);

// Diámetro manual por tramo — mismo criterio que Red de Gas de un solo tramo
const tramoManual = [{ id: 'M', nombre: 'M', continuaDesdeId: null, regimenPresion: '<10 kPa', pulgadas: 'manual', tuberiaManual: { diametroMm: 15.8, k: 1800 }, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 }];
const resultadoManual = calcularRedMemoria(tramoManual, 'GLP');
assert.equal(resultadoManual[0].diametroMm, 15.8);
assert.equal(resultadoManual[0].tuberia, null);

// Ciclo -> error explícito, no cuelgue infinito
assert.throws(
  () => calcularRedMemoria([
    { id: 'X', nombre: 'X', continuaDesdeId: 'Y', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 },
    { id: 'Y', nombre: 'Y', continuaDesdeId: 'X', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 },
  ], 'GLP'),
  /[Cc]iclo/
);

// continuaDesdeId inválido -> error explícito
assert.throws(
  () => calcularRedMemoria([
    { id: 'X', nombre: 'X', continuaDesdeId: 'NO_EXISTE', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 },
  ], 'GLP'),
  /no existe/
);

// Reseteo de pérdida acumulada — mismo criterio que Hidrogeno/js/calc-memoria.js:
// un tramo con reseteaAcumulada=true ignora la acumulada heredada del padre.
const tramosReset = [
  { id: 'P', nombre: 'P', continuaDesdeId: null, regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15 },
  { id: 'Q', nombre: 'Q', continuaDesdeId: 'P', reseteaAcumulada: true, regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 5, presionInicialPa: 1000, temperaturaC: 15 },
  { id: 'R', nombre: 'R', continuaDesdeId: 'Q', regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.5, potenciaKw: 30, longitudM: 3, presionInicialPa: 1000, temperaturaC: 15 },
];
const resultadoReset = calcularRedMemoria(tramosReset, 'GLP');
const porIdReset = Object.fromEntries(resultadoReset.map((t) => [t.id, t]));
cerca(porIdReset.Q.perdidaAcumuladaPa, porIdReset.Q.perdidaPresionRequeridaPa);
assert.notEqual(porIdReset.Q.perdidaAcumuladaPa, porIdReset.Q.perdidaPresionRequeridaPa + porIdReset.P.perdidaAcumuladaPa);
cerca(porIdReset.R.perdidaAcumuladaPa, porIdReset.R.perdidaPresionRequeridaPa + porIdReset.Q.perdidaAcumuladaPa);

console.log('calc-memoria-red-gas.test.js: OK');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node GasNatural-GLP/tests/calc-memoria-red-gas.test.js`
Expected: `Cannot find module '../js/calc-memoria-red-gas.js'` (the file
doesn't exist yet).

- [ ] **Step 3: Write the engine**

Create `GasNatural-GLP/js/calc-memoria-red-gas.js`:

```js
// Motor de cálculo de la pestaña "Memoria de Cálculo" — red de tramos
// ramificada para Red de Gas (GLP/GN). Mismo patrón que
// Hidrogeno/js/calc-memoria.js, pero NO reimplementa la física de
// Renouard/Peng-Robinson: cada tramo se resuelve con calcularRedGas(), ya
// existente en calc-red-gas.js, inyectando el gas vigente (selector
// global Combustible, no un campo por tramo) en cada llamada — cualquier
// corrección futura a Red de Gas se hereda automáticamente acá, sin
// duplicar fórmulas. Ver
// docs/superpowers/specs/2026-09-02-memoria-calculo-glp-gn-design.md.
//
// Deliberadamente NO encadena presión entre tramos: cada tramo recibe su
// propia presionInicialPa como input manual (mismo criterio que
// Hidrogeno, ver el spec) — perdidaAcumuladaPa solo suma para reportar.

import { calcularRedGas } from './calc-red-gas.js';

function calcularTramoIndividual(tramo, gas) {
  const resultado = calcularRedGas({ ...tramo, gas });
  return { ...tramo, ...resultado };
}

export function calcularRedMemoria(tramos, gas) {
  const calculados = tramos.map((t) => calcularTramoIndividual(t, gas));
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
    // Punto de reseteo (mismo criterio que Hidrogeno/js/calc-memoria.js):
    // un tramo con reseteaAcumulada=true ignora la acumulada heredada de
    // su padre, como si fuera raíz — modela un regulador de presión que
    // reinicia la referencia.
    const heredaBase = tramo.continuaDesdeId && !tramo.reseteaAcumulada;
    const base = heredaBase ? perdidaAcumulada(tramo.continuaDesdeId) : 0;
    const total = tramo.perdidaPresionRequeridaPa + base;
    enProgreso.delete(id);
    acumuladaCache.set(id, total);
    return total;
  }

  for (const t of calculados) {
    t.perdidaAcumuladaPa = perdidaAcumulada(t.id);
  }

  return calculados;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node GasNatural-GLP/tests/calc-memoria-red-gas.test.js`
Expected: `calc-memoria-red-gas.test.js: OK`

- [ ] **Step 5: Register the new test in `run-all.js`**

In `GasNatural-GLP/tests/run-all.js`, add a line after
`await import('./calc-red-gas.test.js');`:

```js
await import('./calc-memoria-red-gas.test.js');
```

- [ ] **Step 6: Run the full suite**

Run: `node GasNatural-GLP/tests/run-all.js`
Expected: every line ends in `OK`, followed by `Todos los tests de
regresión pasaron.`

- [ ] **Step 7: Commit**

```bash
git add GasNatural-GLP/js/calc-memoria-red-gas.js GasNatural-GLP/tests/calc-memoria-red-gas.test.js GasNatural-GLP/tests/run-all.js
git commit -m "feat: add calcularRedMemoria engine for GLP/GN Memoria de Calculo"
```

---

## Task 3: HTML tab/panel + CSS

**Files:**
- Modify: `GasNatural-GLP/index.html`
- Modify: `GasNatural-GLP/css/styles.css`

**Interfaces:**
- Produces (element IDs Task 4's `ui.js` code depends on — must match
  exactly): `#memoria-agregar-tramo`, `#memoria-exportar`,
  `#memoria-importar`, `#memoria-imprimir`, `#memoria-arbol`,
  `#memoria-tabla-cuerpo`, `#memoria-presion-inicial-unidad`,
  `#memoria-perdida-requerida-unidad`, `#memoria-perdida-acumulada-unidad`,
  `#memoria-presion-final-unidad`, `#memoria-impresion-th-presion`,
  `#memoria-impresion-th-perdida`, `#memoria-tabla-impresion-cuerpo`.
- Produces (CSS classes Task 4's generated row markup depends on):
  `.mem-tuberia-manual`, `.mem-eliminar`, `.select-unidad-columna`.

This task only adds markup and styles — no `<script>` wiring yet, so the
new tab will show empty/static content until Task 4. That's expected and
fine to leave uncommitted-looking mid-plan; it's still a meaningful,
reviewable diff on its own (you can open the page and see the tab and
its static toolbar/table headers render correctly).

- [ ] **Step 1: Add the tab button**

In `GasNatural-GLP/index.html`, inside `<nav class="tabs" role="tablist">`,
after the `Quemador Atmosférico` button (currently the last one), add:

```html
      <button class="tab" role="tab" data-tab="memoria">Memoria de Cálculo</button>
```

- [ ] **Step 2: Add the panel markup**

In `GasNatural-GLP/index.html`, immediately after the closing `</section>`
of `panel-quemador` (and before the closing `</main>`), add:

```html
    <section class="tab-panel" id="panel-memoria" data-panel="memoria">
      <div class="no-imprimir" style="display:flex; gap:8px; flex-wrap:wrap; margin: 20px 0 16px;">
        <button type="button" id="memoria-agregar-tramo">+ Agregar tramo</button>
        <button type="button" id="memoria-exportar">Exportar proyecto (.json)</button>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size: 12.5px; color: var(--text-secondary);">
          Importar proyecto
          <input type="file" id="memoria-importar" accept="application/json">
        </label>
        <button type="button" id="memoria-imprimir">Imprimir / Guardar PDF</button>
      </div>

      <svg id="memoria-arbol" width="100%" height="220" role="img" aria-label="Diagrama de la red de tramos"></svg>

      <div style="overflow-x:auto;">
        <table id="memoria-tabla" class="no-imprimir">
          <thead>
            <tr>
              <th>Tramo</th><th>Continúa desde</th>
              <th title="Reinicia la pérdida de carga acumulada desde este tramo (ej. después de un regulador de presión)">Reinicia acum.</th>
              <th>Régimen de presión</th>
              <th>Material</th>
              <th>Diámetro</th>
              <th>Potencia [kW]</th>
              <th>Longitud [m]</th>
              <th>Presión inicial <select id="memoria-presion-inicial-unidad" class="select-unidad-columna" aria-label="Unidad de la columna Presión inicial"><option value="Pa" selected>Pa</option><option value="kPa">kPa</option><option value="mbar">mbar</option><option value="bar">bar</option><option value="MPa">MPa</option><option value="psi">psi</option></select></th>
              <th>Temp. [°C]</th>
              <th>Caudal objetivo [m³/h]</th>
              <th>Velocidad [m/s]</th>
              <th>Pérdida requerida <select id="memoria-perdida-requerida-unidad" class="select-unidad-columna" aria-label="Unidad de la columna Pérdida requerida"><option value="Pa" selected>Pa</option><option value="kPa">kPa</option><option value="mbar">mbar</option><option value="bar">bar</option><option value="MPa">MPa</option><option value="psi">psi</option></select></th>
              <th>Pérdida acumulada <select id="memoria-perdida-acumulada-unidad" class="select-unidad-columna" aria-label="Unidad de la columna Pérdida acumulada"><option value="Pa" selected>Pa</option><option value="kPa">kPa</option><option value="mbar">mbar</option><option value="bar">bar</option><option value="MPa">MPa</option><option value="psi">psi</option></select></th>
              <th>Presión final <select id="memoria-presion-final-unidad" class="select-unidad-columna" aria-label="Unidad de la columna Presión final"><option value="Pa" selected>Pa</option><option value="kPa">kPa</option><option value="mbar">mbar</option><option value="bar">bar</option><option value="MPa">MPa</option><option value="psi">psi</option></select></th>
              <th></th>
            </tr>
          </thead>
          <tbody id="memoria-tabla-cuerpo"></tbody>
        </table>
      </div>

      <table id="memoria-tabla-impresion" style="display:none;">
        <caption>Memoria de Cálculo — Red de Gas — QUEMPIN</caption>
        <thead>
          <tr><th>Tramo</th><th>Continúa desde</th><th id="memoria-impresion-th-presion">Presión inicial [Pa]</th><th>Longitud [m]</th><th>Diámetro</th><th id="memoria-impresion-th-perdida">Pérdida acumulada [Pa]</th></tr>
        </thead>
        <tbody id="memoria-tabla-impresion-cuerpo"></tbody>
      </table>
    </section>
```

- [ ] **Step 3: Add the CSS**

Append to the end of `GasNatural-GLP/css/styles.css`:

```css

/* --- Memoria de Cálculo: barra de acciones y tabla editable --- */
#memoria-agregar-tramo, #memoria-exportar, #memoria-imprimir {
  font: inherit; font-size: 12.5px; font-weight: 700; padding: 8px 14px;
  border-radius: 6px; border: 1px solid var(--gridline); background: var(--surface-card);
  color: var(--text-primary); cursor: pointer;
}
#memoria-agregar-tramo:hover, #memoria-exportar:hover, #memoria-imprimir:hover { border-color: var(--brand-orange); }
#memoria-tabla input, #memoria-tabla select {
  font: inherit; font-size: 12.5px; padding: 4px 6px; border-radius: 4px;
  border: 1px solid var(--gridline); background: var(--surface-card); color: var(--text-primary); width: 100%;
}
#memoria-tabla th .select-unidad-columna { width: auto; font-weight: 700; padding: 2px 4px; margin-left: 4px; }
.mem-tuberia-manual { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-top: 4px; min-width: 90px; }
.mem-tuberia-manual input { width: 100%; font-size: 11px !important; padding: 2px 3px !important; }
.mem-eliminar { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; }
.mem-eliminar:hover { color: var(--brand-orange); }
#memoria-arbol { background: var(--surface-card); border: 1px solid var(--gridline); border-radius: 10px; margin-bottom: 16px; }

/* --- Impresión (Memoria de Cálculo) --- */
@media print {
  .tabs, .no-imprimir, .viz-theme-toggle, .selector-combustible { display: none !important; }
  body { background: #ffffff; color: #000000; }
  .tab-panel.active { display: block !important; }
  #memoria-tabla-impresion { display: table !important; }
}
```

Note the print rule also hides `.selector-combustible` — Hidrógeno's
equivalent rule doesn't have this because Hidrógeno has no gas selector
at all; GasNatural-GLP does, and it's page chrome, not memoria content,
so it should disappear when printing too.

- [ ] **Step 4: Manually verify in a browser**

Open `GasNatural-GLP/index.html` directly in a browser (or serve the repo
root with any static file server). Click the new "Memoria de Cálculo" tab.
Expected: the tab appears in the nav, clicking it shows the toolbar
buttons, an empty SVG area, and a table with all 16 column headers — the
table body is empty (Task 4 fills it), which is expected at this point.

- [ ] **Step 5: Commit**

```bash
git add GasNatural-GLP/index.html GasNatural-GLP/css/styles.css
git commit -m "feat: add Memoria de Calculo tab markup and styles to GasNatural-GLP"
```

---

## Task 4: `ui.js` — wire the Memoria de Cálculo tab

**Files:**
- Modify: `GasNatural-GLP/js/ui.js`

**Interfaces:**
- Consumes: `calcularRedMemoria(tramos, gas)` (Task 2),
  `exportarJSON`/`importarJSON` (Task 1), the DOM ids/classes from Task 3,
  and these already-existing names in this same file: `combustible`
  (module-level `let`, current gas), `alCambiarCombustible(fn)`
  (registers a callback fired on gas change), `numeroFlexible(valor)`,
  `guardar`/`cargar`, `aPa`/`desdePa`/`formatearPresion` (from
  `unidades-presion.js`), `formatearPulgadas(valor)`, `tile(valor,
  etiqueta, variante)`.
- Produces: nothing consumed by later tasks — this is the last code task.

- [ ] **Step 1: Add the new import**

In `GasNatural-GLP/js/ui.js`, change the top import line:

```js
import { calcularRedGas } from './calc-red-gas.js';
```

to:

```js
import { calcularRedGas } from './calc-red-gas.js';
import { calcularRedMemoria } from './calc-memoria-red-gas.js';
```

- [ ] **Step 2: Add `exportarJSON`/`importarJSON` to the storage import**

Change:

```js
import { guardar, cargar } from './storage.js';
```

to:

```js
import { guardar, cargar, exportarJSON, importarJSON } from './storage.js';
```

- [ ] **Step 3: Add the Memoria de Cálculo section**

At the end of `GasNatural-GLP/js/ui.js`, immediately before the final
`/* ---------------------------------------------------------------------- */`
block that calls `initTabs(); initSelectorCombustible(); ...`, insert:

```js
/* ---------------------------------------------------------------------- */
/* Pestaña 5 — Memoria de Cálculo (red ramificada de Red de Gas)          */
/* ---------------------------------------------------------------------- */

let tramosMemoria = [];
let contadorIdMemoria = 0;

function tramoMemoriaPorDefecto() {
  contadorIdMemoria += 1;
  return {
    id: `t${contadorIdMemoria}`, nombre: `Tramo ${contadorIdMemoria}`, continuaDesdeId: null,
    reseteaAcumulada: false, regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.75,
    potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15,
  };
}

function etiquetaDiametroMemoria(t) {
  return t.pulgadas === 'manual' ? `Manual ${t.tuberiaManual.diametroMm} mm` : formatearPulgadas(t.pulgadas);
}

function porNombreTramoMemoria(id) {
  return id ? (tramosMemoria.find((t) => t.id === id)?.nombre ?? '') : '— raíz —';
}

function renderTablaMemoria(resultado) {
  const opcionesPadre = (actualId) => ['<option value="">— raíz —</option>'].concat(
    tramosMemoria.filter((t) => t.id !== actualId).map((t) => `<option value="${t.id}">${t.nombre}</option>`)
  ).join('');

  // Unidad elegida en cada cabecera de columna de presión — independiente
  // entre las cuatro, no hay una unidad "de la tabla". El dato canónico
  // en `tramosMemoria` sigue siempre en Pa (lo que espera calcularRedGas
  // vía calcularRedMemoria); cambiar la unidad de una columna solo
  // redibuja la tabla, ver leerFilaMemoria().
  const unidadPresionInicial = document.getElementById('memoria-presion-inicial-unidad').value;
  const unidadPerdidaRequerida = document.getElementById('memoria-perdida-requerida-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  const unidadPresionFinal = document.getElementById('memoria-presion-final-unidad').value;

  document.getElementById('memoria-tabla-cuerpo').innerHTML = resultado.map((t) => `
    <tr data-id="${t.id}">
      <td><input type="text" class="mem-nombre" value="${t.nombre}"></td>
      <td><select class="mem-padre">${opcionesPadre(t.id)}</select></td>
      <td style="text-align:center;"><input type="checkbox" class="mem-reset"${t.reseteaAcumulada ? ' checked' : ''} title="Reinicia la pérdida de carga acumulada desde este tramo (ej. después de un regulador de presión)"></td>
      <td>
        <select class="mem-regimen">
          <option value="<10 kPa"${t.regimenPresion === '<10 kPa' ? ' selected' : ''}>Baja (&lt;10 kPa)</option>
          <option value=">10 kPa"${t.regimenPresion === '>10 kPa' ? ' selected' : ''}>Media/alta (&gt;10 kPa)</option>
        </select>
      </td>
      <td${t.pulgadas === 'manual' ? ' style="display:none;"' : ''}>
        <select class="mem-material">
          <option value="Acero Sch40"${t.material === 'Acero Sch40' ? ' selected' : ''}>Acero Sch40</option>
          <option value="Cobre tipo L"${t.material === 'Cobre tipo L' ? ' selected' : ''}>Cobre tipo L</option>
        </select>
      </td>
      <td>
        <select class="mem-diametro">
          ${TABLA_TUBERIA_RED_GAS.map((f) => `<option value="${f.pulgadas}"${f.pulgadas === t.pulgadas ? ' selected' : ''}>${formatearPulgadas(f.pulgadas)}</option>`).join('')}
          <option value="manual"${t.pulgadas === 'manual' ? ' selected' : ''}>Manual (mm)</option>
        </select>
        <div class="mem-tuberia-manual"${t.pulgadas === 'manual' ? '' : ' style="display:none;"'}>
          <input type="text" inputmode="decimal" class="mem-diametro-manual-mm" value="${t.tuberiaManual?.diametroMm ?? 50}" title="Diámetro interior [mm]">
          <input type="text" inputmode="decimal" class="mem-diametro-manual-k" value="${t.tuberiaManual?.k ?? 1800}" title="Factor K (rugosidad, solo baja presión)">
        </div>
      </td>
      <td><input type="text" inputmode="decimal" class="mem-potencia" value="${t.potenciaKw}"></td>
      <td><input type="text" inputmode="decimal" class="mem-largo" value="${t.longitudM}"></td>
      <td><input type="text" inputmode="decimal" class="mem-presion" value="${Number(desdePa(t.presionInicialPa, unidadPresionInicial).toPrecision(6))}"></td>
      <td><input type="text" inputmode="decimal" class="mem-temp" value="${t.temperaturaC}"></td>
      <td>${t.caudalObjetivoM3H.toFixed(3)}</td>
      <td>${t.velocidadMS.toFixed(2)}</td>
      <td>${formatearPresion(t.perdidaPresionRequeridaPa, unidadPerdidaRequerida)}</td>
      <td>${formatearPresion(t.perdidaAcumuladaPa, unidadPerdidaAcumulada)}</td>
      <td>${t.presionFinalPa !== null ? formatearPresion(t.presionFinalPa, unidadPresionFinal) : '—'}</td>
      <td><button type="button" class="mem-eliminar no-imprimir">✕</button></td>
    </tr>
  `).join('');

  tramosMemoria.forEach((t) => {
    const selectPadre = document.querySelector(`#memoria-tabla-cuerpo tr[data-id="${t.id}"] .mem-padre`);
    if (selectPadre) selectPadre.value = t.continuaDesdeId ?? '';
  });
}

function renderArbolMemoria(resultado) {
  const porId = Object.fromEntries(resultado.map((t) => [t.id, t]));
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
      ${n.t.reseteaAcumulada ? `<circle cx="${n.nivel * anchoNivel + 60}" cy="${n.fila * altoFila + 20}" r="12" fill="none" stroke="var(--text-primary)" stroke-width="2"/>` : ''}
      <circle cx="${n.nivel * anchoNivel + 60}" cy="${n.fila * altoFila + 20}" r="8" fill="var(--brand-orange)"/>
      <title>${n.t.nombre} — ${formatearPresion(n.t.perdidaAcumuladaPa, 'Pa')} Pa acumulados, ${n.t.velocidadMS.toFixed(2)} m/s${n.t.reseteaAcumulada ? ' (reinicia acumulada)' : ''}</title>
      <text x="${n.nivel * anchoNivel + 74}" y="${n.fila * altoFila + 24}" font-size="12" fill="var(--text-primary)">${n.t.nombre}</text>
    </g>`).join('');
  svg.setAttribute('height', String(Math.max(...porNivel.values(), 1) * altoFila + 20));
  svg.innerHTML = lineas + circulos;
}

function recalcularMemoria() {
  let resultado;
  try {
    resultado = calcularRedMemoria(tramosMemoria, combustible);
  } catch (error) {
    document.getElementById('memoria-tabla-cuerpo').innerHTML =
      `<tr><td colspan="16" class="resultado-tile alerta">${error.message}</td></tr>`;
    return;
  }
  renderTablaMemoria(resultado);
  renderArbolMemoria(resultado);

  const unidadPresionInicial = document.getElementById('memoria-presion-inicial-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  document.getElementById('memoria-impresion-th-presion').textContent = `Presión inicial [${unidadPresionInicial}]`;
  document.getElementById('memoria-impresion-th-perdida').textContent = `Pérdida acumulada [${unidadPerdidaAcumulada}]`;
  document.getElementById('memoria-tabla-impresion-cuerpo').innerHTML = resultado.map((t) => `
    <tr><td>${t.nombre}</td><td>${porNombreTramoMemoria(t.continuaDesdeId)}${t.reseteaAcumulada ? ' (reinicia acumulada)' : ''}</td><td>${formatearPresion(t.presionInicialPa, unidadPresionInicial)}</td><td>${t.longitudM}</td><td>${etiquetaDiametroMemoria(t)}</td><td>${formatearPresion(t.perdidaAcumuladaPa, unidadPerdidaAcumulada)}</td></tr>
  `).join('');
  guardar('memoria-red-gas', tramosMemoria);
}

function leerFilaMemoria(fila) {
  const id = fila.dataset.id;
  const val = (clase) => fila.querySelector(`.${clase}`).value;
  const unidadPresionInicial = document.getElementById('memoria-presion-inicial-unidad').value;
  const diametroSeleccionado = val('mem-diametro');
  const esManual = diametroSeleccionado === 'manual';
  return {
    id,
    nombre: val('mem-nombre'),
    continuaDesdeId: val('mem-padre') || null,
    reseteaAcumulada: fila.querySelector('.mem-reset').checked,
    regimenPresion: val('mem-regimen'),
    material: val('mem-material'),
    pulgadas: esManual ? 'manual' : Number(diametroSeleccionado),
    tuberiaManual: esManual ? {
      diametroMm: numeroFlexible(val('mem-diametro-manual-mm')), k: numeroFlexible(val('mem-diametro-manual-k')),
    } : undefined,
    potenciaKw: numeroFlexible(val('mem-potencia')),
    longitudM: numeroFlexible(val('mem-largo')),
    presionInicialPa: aPa(numeroFlexible(val('mem-presion')), unidadPresionInicial),
    temperaturaC: numeroFlexible(val('mem-temp')),
  };
}

function initMemoria() {
  tramosMemoria = cargar('memoria-red-gas', null) ?? [tramoMemoriaPorDefecto()];
  contadorIdMemoria = tramosMemoria.length;

  ['memoria-presion-inicial-unidad', 'memoria-perdida-requerida-unidad', 'memoria-perdida-acumulada-unidad', 'memoria-presion-final-unidad'].forEach((id) => {
    const clave = `memoria-red-gas-${id}`;
    const guardado = cargar(clave, null);
    const select = document.getElementById(id);
    if (guardado) select.value = guardado;
    select.addEventListener('input', () => {
      guardar(clave, select.value);
      recalcularMemoria();
    });
  });

  document.getElementById('memoria-agregar-tramo').addEventListener('click', () => {
    tramosMemoria.push(tramoMemoriaPorDefecto());
    recalcularMemoria();
  });

  document.getElementById('memoria-tabla-cuerpo').addEventListener('input', (evento) => {
    const fila = evento.target.closest('tr[data-id]');
    if (!fila) return;
    const actualizado = leerFilaMemoria(fila);
    tramosMemoria = tramosMemoria.map((t) => (t.id === actualizado.id ? actualizado : t));
    recalcularMemoria();
  });

  document.getElementById('memoria-tabla-cuerpo').addEventListener('click', (evento) => {
    if (!evento.target.classList.contains('mem-eliminar')) return;
    const id = evento.target.closest('tr[data-id]').dataset.id;
    tramosMemoria = tramosMemoria.filter((t) => t.id !== id).map((t) => (t.continuaDesdeId === id ? { ...t, continuaDesdeId: null } : t));
    recalcularMemoria();
  });

  document.getElementById('memoria-exportar').addEventListener('click', () => {
    exportarJSON('proyecto-gas-natural-glp.json', tramosMemoria);
  });

  document.getElementById('memoria-importar').addEventListener('change', async (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    tramosMemoria = await importarJSON(archivo);
    contadorIdMemoria = tramosMemoria.length;
    recalcularMemoria();
  });

  document.getElementById('memoria-imprimir').addEventListener('click', () => window.print());

  alCambiarCombustible(recalcularMemoria);
  recalcularMemoria();
}
```

- [ ] **Step 4: Wire `initMemoria()` into startup**

At the very end of `GasNatural-GLP/js/ui.js`, change:

```js
initTabs();
initSelectorCombustible();
initRedGas();
initAlmacenamiento();
initCombustion();
initQuemador();
initSelectorGas({ actualId: 'gas-natural-glp', profundidad: 1 });
```

to:

```js
initTabs();
initSelectorCombustible();
initRedGas();
initAlmacenamiento();
initCombustion();
initQuemador();
initMemoria();
initSelectorGas({ actualId: 'gas-natural-glp', profundidad: 1 });
```

- [ ] **Step 5: Verify the file parses and the automated suite is still green**

Run: `node --check GasNatural-GLP/js/ui.js && node GasNatural-GLP/tests/run-all.js`
Expected: `node --check` prints nothing; the test run ends with `Todos
los tests de regresión pasaron.` (`ui.js` isn't imported by any test —
this only confirms no syntax error and that nothing else broke).

- [ ] **Step 6: Manually verify in a browser**

Open `GasNatural-GLP/index.html`, go to "Memoria de Cálculo":
- A default tramo row should appear immediately, with computed Caudal
  objetivo / Velocidad / Pérdida requerida / Pérdida acumulada already
  filled in, and the tree diagram shows one node.
- Click "+ Agregar tramo", set the new row's "Continúa desde" to the
  first tramo — the tree diagram should now show two connected nodes,
  and the second row's "Pérdida acumulada" should be its own requerida
  plus the first row's.
- Change "Diámetro" on a row to "Manual (mm)" — the Material cell should
  hide and two manual fields should appear inline; entering values should
  recompute that row.
- Change "Régimen de presión" on a row to "Media/alta" — a "Presión
  final" value should appear instead of "—".
- Check the "Reinicia acum." checkbox on the second tramo — its Pérdida
  acumulada should drop to just its own requerida, and the tree diagram
  should draw a ring around that node.
- Switch the page's Combustible selector between GLP/GN — all rows'
  computed columns should change (different PCI volumétrico).
- Click "Exportar proyecto (.json)" — a file should download. Reload the
  page — the same tramos should still be there (localStorage). Click
  "Imprimir / Guardar PDF" — the print preview should show a trimmed
  6-column table instead of the full editable one.
- Delete a tramo with "✕" — any tramo that had it as "Continúa desde"
  should revert to "— raíz —".

- [ ] **Step 7: Commit**

```bash
git add GasNatural-GLP/js/ui.js
git commit -m "feat: wire Memoria de Calculo tab (table, tree, import/export, print) for GasNatural-GLP"
```

---

## Task 5: Documentation — `GasNatural-GLP/CLAUDE.md`

**Files:**
- Modify: `GasNatural-GLP/CLAUDE.md`

- [ ] **Step 1: Update the tab/engine table**

Find the "Las 4 pestañas y su hoja de origen" table and its heading.
Change the heading to "Las 5 pestañas y su hoja de origen" and add a row:

```
| Memoria de Cálculo | (sin hoja fuente — no existe en el Excel) | `js/calc-memoria-red-gas.js` |
```

- [ ] **Step 2: Add a new documentation section**

After the section documenting the manual-diameter feature (search for
"## Tabla de tuberías ampliada + diámetro manual"), add a new section:

```markdown
## Memoria de Cálculo (2026-09-02, a pedido del usuario)

Quinta pestaña, mirroring la de `Hidrogeno/js/calc-memoria.js` pero sobre
Red de Gas en vez de Barlow — ver
[`../docs/superpowers/specs/2026-09-02-memoria-calculo-glp-gn-design.md`](../docs/superpowers/specs/2026-09-02-memoria-calculo-glp-gn-design.md)
para las dos decisiones de modelado confirmadas con el usuario:

- **El gas es de toda la red, no por tramo** — sigue el selector global
  de Combustible que ya gobierna las otras 4 pestañas. Cambiarlo
  recalcula toda la tabla.
- **Sin encadenar presión entre tramos** — cada tramo tiene su propia
  presión inicial como input manual; la "pérdida acumulada" solo suma
  hacia arriba para reportar, igual que en Hidrógeno.

`js/calc-memoria-red-gas.js` no reimplementa Renouard/Peng-Robinson: cada
tramo se resuelve llamando directamente a `calcularRedGas()` — cualquier
corrección futura a Red de Gas se hereda automáticamente acá.

Igual que Hidrógeno, **no hay indicador "Tubería adecuada" por tramo** en
la tabla (aunque `calcularRedGas` lo devuelve gratis) — Hidrógeno mismo
excluye el chequeo análogo (velocidad de erosión) de su propia Memoria,
mismo criterio acá para no agregar una columna más a una tabla ya ancha
(16 columnas: Tramo, Continúa desde, Reinicia acum., Régimen, Material,
Diámetro, Potencia, Longitud, Presión inicial, Temp., Caudal objetivo,
Velocidad, Pérdida requerida, Pérdida acumulada, Presión final, eliminar).

Igual que Hidrógeno: reseteo de pérdida acumulada por tramo
(`reseteaAcumulada`, checkbox "Reinicia acum."), tubería manual por tramo
(mismo criterio que el tramo único de Red de Gas: sin fila de tabla,
"Material" se oculta y se piden diámetro interior + factor K), árbol SVG,
exportar/importar proyecto (`.json`, requirió agregar `exportarJSON`/
`importarJSON` a `js/storage.js`, portadas tal cual desde
`Hidrogeno/js/storage.js`), impresión con tabla recortada, y autoguardado
en localStorage (clave `memoria-red-gas`, distinta de `red-gas` para no
pisar el estado del tramo único).

Una diferencia deliberada del bloque de impresión (`@media print`) frente
al de Hidrógeno: también oculta `.selector-combustible`, que Hidrógeno no
tiene — es parte del chrome de la página, no del contenido de la memoria.
```

- [ ] **Step 2: Verify the markdown renders sensibly**

Run: `node --check GasNatural-GLP/js/ui.js` (sanity check nothing broke
in a prior task) and visually re-read the edited `CLAUDE.md` section for
typos.
Expected: no errors; the new section reads coherently alongside the rest
of the file.

- [ ] **Step 3: Run the full regression suite one final time**

Run: `node GasNatural-GLP/tests/run-all.js`
Expected: `Todos los tests de regresión pasaron.`

- [ ] **Step 4: Commit**

```bash
git add GasNatural-GLP/CLAUDE.md
git commit -m "docs: document Memoria de Calculo tab in GasNatural-GLP/CLAUDE.md"
```
