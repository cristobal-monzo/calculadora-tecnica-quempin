import assert from 'node:assert/strict';
import {
  GASES_PREDEFINIDOS, validarGas, gasPersonalizadoPorDefecto, buscarGasPredefinido, ID_PERSONALIZADO,
} from '../js/biblioteca-gases.js';
import { flujoMasicoKgH } from '../js/caudal.js';

// Todos los gases predefinidos son válidos y tienen ids únicos.
for (const gas of GASES_PREDEFINIDOS) assert.deepEqual(validarGas(gas), [], gas.id);
assert.equal(new Set(GASES_PREDEFINIDOS.map((g) => g.id)).size, GASES_PREDEFINIDOS.length);
assert.ok(!GASES_PREDEFINIDOS.some((g) => g.id === ID_PERSONALIZADO));

assert.equal(buscarGasPredefinido('nh3').formula, 'NH₃');
assert.equal(buscarGasPredefinido('xx'), null);

// El personalizado parte de una copia válida (sin notas de seguridad de otro gas).
const personalizado = gasPersonalizadoPorDefecto();
assert.equal(personalizado.id, ID_PERSONALIZADO);
assert.equal(personalizado.notas, undefined);
assert.deepEqual(validarGas(personalizado), []);

// Errores concretos por campo.
assert.equal(validarGas({ ...personalizado, masaMolarGMol: 0 }).length, 1);
assert.equal(validarGas({ ...personalizado, gamma: 1 }).length, 1);
assert.equal(validarGas({ ...personalizado, viscosidadUPaS: NaN }).length, 1);
assert.equal(validarGas({ ...personalizado, factorAcentrico: -0.216 }).length, 0); // H₂ tiene ω negativo
assert.equal(validarGas({ ...personalizado, pciMJkg: null, gradoLlenadoKgL: null }).length, 0);
assert.equal(validarGas({ ...personalizado, pciMJkg: -1 }).length, 1);

// Conversión de caudal.
assert.equal(flujoMasicoKgH({ caudal: 10, unidad: 'kg/h' }), 10);
assert.equal(flujoMasicoKgH({ caudal: 10, unidad: 'Nm3/h', densidadNormalKgM3: 2 }), 20);
assert.equal(flujoMasicoKgH({ caudal: 186, unidad: 'kW', pciMJkg: 18.6 }), 36);
assert.throws(() => flujoMasicoKgH({ caudal: 1, unidad: 'kW', pciMJkg: null }), /PCI/);
assert.throws(() => flujoMasicoKgH({ caudal: 1, unidad: 'L/min' }), /desconocida/);

console.log('biblioteca-gases.test.js OK');
