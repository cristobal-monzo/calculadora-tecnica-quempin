import assert from 'node:assert/strict';
import { aPa, desdePa, formatearPresion, UNIDADES_PRESION } from '../js/unidades-presion.js';

function cerca(actual, esperado, tolerancia = 1e-9) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Definiciones estándar: 1 bar = 100000 Pa = 100 kPa = 1000 mbar = 14.5037738 psi
cerca(aPa(1, 'bar'), 100000);
cerca(aPa(1, 'kPa'), 1000);
cerca(aPa(1, 'mbar'), 100);
cerca(aPa(1, 'psi'), 6894.757293168361);
cerca(aPa(1, 'Pa'), 1);
cerca(desdePa(100000, 'psi'), 14.503773773375974);

// Round-trip: convertir a Pa y volver debe devolver el valor original, para cada unidad
UNIDADES_PRESION.forEach((unidad) => {
  const valorOriginal = 12345.6789;
  cerca(desdePa(aPa(valorOriginal, unidad), unidad), valorOriginal);
});

cerca(Number(formatearPresion(100000, 'bar')), 1);
cerca(Number(formatearPresion(100000, 'kPa')), 100);
cerca(Number(formatearPresion(100000, 'mbar')), 1000);

console.log('unidades-presion.test.js: OK');
