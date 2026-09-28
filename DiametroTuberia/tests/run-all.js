// Corre todos los tests de regresión del motor de cálculo en secuencia.
// Cada archivo importado lanza (throw) si alguna aserción falla, lo que
// aborta este script con código de salida distinto de 0.

await import('./calc-diametro.test.js');

console.log('\nTodos los tests de regresión pasaron.');
