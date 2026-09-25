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

// Autonomía sobre la masa UTILIZABLE (AGREGADO 2026-09-25): por defecto se
// vacía hasta 10 bar abs (presión residual, editable). Antes se usaba toda
// la masa: 1,552 h (01:33:07).
cerca(r.masaResidualKg, 0.15622331966517705);
cerca(r.masaUtilizableKg, r.masaAlmacenadaKg - r.masaResidualKg);
cerca(r.autonomiaHoras, r.masaUtilizableKg / r.consumoKgH);
assert.equal(formatearHoras(r.autonomiaHoras), '01:27:55');
// Con presión residual 0 vuelve al cálculo del Excel (toda la masa)
const sinResidual = calcularAlmacenamiento({ potenciaKw: 60, temperaturaC: 20, presionBarAbs: 200, volumenM3: 0.19, presionResidualBarAbs: 0 });
cerca(sinResidual.autonomiaHoras, r.masaAlmacenadaKg / r.consumoKgH);
assert.equal(formatearHoras(sinResidual.autonomiaHoras), '01:33:07');
// Presión residual por sobre la de almacenamiento: no hay masa utilizable
assert.equal(calcularAlmacenamiento({ potenciaKw: 60, temperaturaC: 20, presionBarAbs: 5, volumenM3: 0.19 }).masaUtilizableKg, 0);

// H10/H11 CORREGIDOS 2026-09-25: caudal REAL de llenado a la presión del
// estanque = caudal de llenado (4 Nm³/h por defecto, antes fijo en la
// fórmula como 360 g/h) × densidad normal / densidad real (con Z). El Excel
// dividía por 2,16 en vez de 2,016 y omitía Z: 0.020311562223333333 m³/h.
cerca(r.caudalReferenciaM3H, 4 * 0.089 / r.densidadRealKgM3);
cerca(r.caudalReferenciaM3H, 0.024203961573011776);
// Velocidad en la línea de 1/4" con su DI real (3,95 mm, no los 6,35 mm
// del diámetro exterior). Excel: 0.17815724773249608 m/s.
assert.equal(r.diametroCapilarMm, 3.95);
cerca(r.velocidadReferenciaMS, (r.caudalReferenciaM3H / 3600) / (Math.PI * 0.00395 ** 2 / 4));
const enLitros = calcularAlmacenamiento({ potenciaKw: 60, temperaturaC: 20, presionBarAbs: 200, volumenM3: 0.19, unidadCaudalReferencia: '[L/min]' });
cerca(enLitros.caudalReferenciaM3H, r.caudalReferenciaM3H * 1000 / 60);
cerca(enLitros.velocidadReferenciaMS, r.velocidadReferenciaMS);

// H12 — tiempo de llenado desde la presión residual, al caudal de llenado
cerca(r.tiempoLlenadoHoras, r.volumenUtilizableNm3 / 4);
const llenadoRapido = calcularAlmacenamiento({ potenciaKw: 60, temperaturaC: 20, presionBarAbs: 200, volumenM3: 0.19, caudalLlenadoNm3H: 8 });
cerca(llenadoRapido.tiempoLlenadoHoras, r.tiempoLlenadoHoras / 2);
cerca(llenadoRapido.caudalReferenciaM3H, 2 * r.caudalReferenciaM3H);

console.log('calc-almacenamiento.test.js: OK');
