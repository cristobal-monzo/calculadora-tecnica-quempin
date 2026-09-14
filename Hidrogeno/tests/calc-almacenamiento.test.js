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

// H6/C7 RE-BASELINEADOS 2026-09-08 (a pedido del usuario): C7 era una
// función escalón que devolvía 1.2 para cualquier presión entre 200 y 300
// bar. Con la correlación continua de NIST, a 200 bar abs y 20°C el valor
// real es 1.1247527..., y la masa almacenada sube de 2.6192 a 2.7944 kg
// (+6.7%: el escalón sobrestimaba Z y por lo tanto subestimaba la masa).
// Ver tests/factor-z-h2.test.js y Hidrogeno/CLAUDE.md.
cerca(r.masaAlmacenadaKg, 2.7944252008282993);        // H6
cerca(r.zAlmacenamiento, 1.124752744441221);          // C7
cerca(r.consumoKgH, 1.800600200066689);               // C11 (PCI propio de Sheet3, 119960)
cerca(r.volumenNormalizadoNm3, 31.398035964362915);   // H9 (= masa/densidad normal, sigue a H6)
cerca(r.autonomiaHoras, r.masaAlmacenadaKg / r.consumoKgH);
cerca(r.caudalReferenciaM3H, 0.020311562223333333);   // H10
cerca(r.velocidadReferenciaMS, 0.17815724773249608, 1e-3); // H11
cerca(r.tiempoLlenadoHoras, r.volumenNormalizadoNm3 / 4); // H12

assert.equal(formatearHoras(r.autonomiaHoras), '01:33:07');

console.log('calc-almacenamiento.test.js: OK');
