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

assert.equal(formatearHoras(r.autonomiaHoras), '01:27:17');

console.log('calc-almacenamiento.test.js: OK');
