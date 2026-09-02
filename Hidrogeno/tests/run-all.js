// Corre todos los tests de regresión del motor de cálculo en secuencia.
// Cada archivo importado lanza (throw) si alguna aserción falla, lo que
// aborta este script con código de salida distinto de 0.

await import('./unidades-presion.test.js');
await import('./physics.test.js');
await import('./gas-h2.test.js');
await import('./calc-flujo.test.js');
await import('./calc-almacenamiento.test.js');
await import('./calc-memoria.test.js');
await import('./storage.test.js');

console.log('\nTodos los tests de regresión pasaron.');
