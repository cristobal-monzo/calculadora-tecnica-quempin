// Corre todos los tests de regresión del motor de cálculo en secuencia.
await import('./unidades-presion.test.js');
await import('./gas-glp.test.js');
await import('./gas-gn.test.js');
await import('./pipe-network.test.js');
await import('./calc-red-gas.test.js');
await import('./calc-almacenamiento-glp.test.js');
await import('./calc-combustion.test.js');
await import('./calc-quemador.test.js');

console.log('\nTodos los tests de regresión pasaron.');
