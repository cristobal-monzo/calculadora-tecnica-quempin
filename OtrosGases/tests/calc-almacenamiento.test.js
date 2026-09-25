import assert from 'node:assert/strict';
import { calcularAlmacenamiento, formatearHoras } from '../js/calc-almacenamiento.js';
import { GASES_PREDEFINIDOS } from '../js/biblioteca-gases.js';

const [co2, nh3] = GASES_PREDEFINIDOS;

function cerca(actual, esperado, tolerancia = 1e-9) {
  assert.ok(Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)), `esperado ${esperado}, obtuvo ${actual}`);
}

// --- Gas comprimido: CO₂ 40 bar abs / 20 °C (bajo su Psat de 57 bar), 50 L ---
const c = calcularAlmacenamiento({ gas: co2, modo: 'comprimido', presionBarAbs: 40, temperaturaC: 20, volumenM3: 0.05, consumo: 2, unidadConsumo: 'kg/h' });
assert.equal(c.aplica, true);
cerca(c.z, 0.7268251353934087);
cerca(c.densidadKgM3, 99.37001716294301);
cerca(c.masaKg, c.densidadKgM3 * 0.05);
cerca(c.volumenNormalNm3, c.masaKg / c.densidadNormalKgM3);
cerca(c.autonomiaHoras, c.masaKg / 2);

// Sobre la presión de vapor: el recipiente tendría líquido → no aplica.
const condensa = calcularAlmacenamiento({ gas: co2, modo: 'comprimido', presionBarAbs: 60, temperaturaC: 20, volumenM3: 0.05 });
assert.equal(condensa.aplica, false);
assert.equal(condensa.fase.estado, 'liquido');

// --- Gas licuado: cilindro de CO₂ de 36,8 L de capacidad de agua ---
// 36,8 L × 0,68 kg/L = 25,0 kg: el cilindro comercial "de 25 kg".
const l = calcularAlmacenamiento({ gas: co2, modo: 'licuado', gradoLlenadoKgL: 0.68, temperaturaC: 20, volumenM3: 0.0368, consumo: 2, unidadConsumo: 'kg/h' });
cerca(l.masaKg, 25.024);
assert.equal(l.supercritico, false);
cerca(l.presionVaporAbsBar, 57.20263983044522); // NIST: 57,29 bar
cerca(l.presionVaporManBar, l.presionVaporAbsBar - 1.01325);
cerca(l.autonomiaHoras, 25.024 / 2);

// La masa de un gas licuado no depende de la temperatura; la presión sí.
const caliente = calcularAlmacenamiento({ gas: co2, modo: 'licuado', gradoLlenadoKgL: 0.68, temperaturaC: 35, volumenM3: 0.0368 });
cerca(caliente.masaKg, l.masaKg);
assert.equal(caliente.supercritico, true); // 35 °C > Tc 31 °C: sin presión de vapor
assert.equal(caliente.presionVaporAbsBar, null);
assert.equal(caliente.autonomiaHoras, null); // consumo 0 → sin autonomía

// --- NH₃ licuado, consumo en kW (NH₃ como combustible) ---
const a = calcularAlmacenamiento({ gas: nh3, modo: 'licuado', gradoLlenadoKgL: 0.54, temperaturaC: 20, volumenM3: 0.1, consumo: 100, unidadConsumo: 'kW' });
cerca(a.masaKg, 54);
cerca(a.consumoKgH, (100 * 3.6) / 18.6);
cerca(a.autonomiaHoras, 2.79);
cerca(a.presionVaporAbsBar, 8.60891365958817); // NIST: 8,57 bar

assert.equal(formatearHoras(12.512), '12:30:43');

console.log('calc-almacenamiento.test.js OK');
