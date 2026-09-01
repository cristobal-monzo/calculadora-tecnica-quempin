import assert from 'node:assert/strict';
import { cilindrosPorVaporizacion, cilindrosPorConsumoDiario, calcularEstanqueGLP } from '../js/calc-almacenamiento-glp.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Fixtures: Libro11111111.xlsx, hoja "Bases de Cálculo", 2026-09-01
// Cálculo por razón de vaporización: F5=90kW, F14=30kW -> F15=3, F16=3
cerca(cilindrosPorVaporizacion({ potenciaTotalKw: 90, razonVaporizacionKw: 30 }), 3); // F16

// Cálculo por consumo diario: F7=1 calefont, F8=3 cocinas, F9=0 estufas,
// F10="Bajo", F12=5°C, F6=45kg -> F18=17.3 kWh/día, F19=0.5508, F20=1
const resultado = cilindrosPorConsumoDiario({
  nCalefont: 1, nCocinas: 3, nEstufas: 0, nivel: 'bajo', temperaturaC: 5, pesoCilindroKg: 45,
});
cerca(resultado.consumoDiarioKwh, 17.299999999999997); // F18
assert.equal(resultado.nCilindros, 1); // F20

// Fixtures: MASTER DISEÑO.xlsm, hoja "Estanque GLP", 2026-09-01
const estanque = calcularEstanqueGLP({ diametroM: 0.76, alturaM: 1.36, capacidadLitros: 500 });
cerca(estanque.capacidadRealLitros, 400);              // B5
cerca(estanque.superficieM2, 4.154442125107143);       // B6
cerca(estanque.qKgH, 4.563299658466779);                // B7
cerca(estanque.qKw, 66.84853724682291);                 // B8
cerca(estanque.qMcalH, 57.493127738678986);              // B9

console.log('calc-almacenamiento-glp.test.js: OK');
