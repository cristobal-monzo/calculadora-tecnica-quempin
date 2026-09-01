// storage.js usa `localStorage`/`document`/`Blob`, que no existen en Node
// puro — este test corre un stub mínimo de `localStorage` en globalThis
// antes de importar el módulo, y solo ejerce guardar/cargar (las funciones
// que dependen del DOM se verifican en el navegador real).
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
