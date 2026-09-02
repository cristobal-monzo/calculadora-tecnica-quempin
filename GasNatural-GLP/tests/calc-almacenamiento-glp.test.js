import assert from 'node:assert/strict';
import { cilindrosPorVaporizacion, cilindrosPorConsumoDiario, calcularEstanqueGLP, consumoArtefacto } from '../js/calc-almacenamiento-glp.js';

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

// Corregido respecto al Excel (2026-09-01, a pedido del usuario):
// Cocina/Bajo a 10°C tenía K33=35 en la hoja fuente, un valor muchísimo
// más alto que el resto de la fila y que las filas Medio/Alto de la misma
// tabla — se corrigió a 3.5 (probable error de tipeo del "."), consistente
// con el patrón de esa fila y de las filas vecinas.
cerca(consumoArtefacto({ artefacto: 'cocina', nivel: 'bajo', temperaturaC: 10 }), 3.5);

// Fixtures: MASTER DISEÑO.xlsm, hoja "Estanque GLP", 2026-09-01. B8/B9
// CORREGIDOS respecto al Excel fuente (2026-09-02, a pedido del usuario):
// usaban la constante 52737 kJ/kg, que es el PCI de GAS NATURAL (ver
// gas-gn.test.js), no el de GLP — casi con certeza una referencia cruzada
// de hoja en el Excel fuente. Ahora usan el PCI real del GLP, derivado de
// la composición (30% butano / 70% propano, igual que el resto del
// módulo). Antes de la corrección: qKw=66.84853724682291,
// qMcalH=57.493127738678986 (con el PCI de GN, ~13% más alto).
const estanque = calcularEstanqueGLP({ diametroM: 0.76, alturaM: 1.36, capacidadLitros: 500, pctButano: 0.3, pctPropano: 0.7 });
cerca(estanque.capacidadRealLitros, 400);              // B5
cerca(estanque.superficieM2, 4.154442125107143);       // B6
cerca(estanque.qKgH, 4.563299658466779);                // B7
cerca(estanque.pciKjKg, 45989.84889794246);             // PCI real de GLP (30/70), no el de GN
cerca(estanque.qKw, 58.29596160247766);                 // B8
cerca(estanque.qMcalH, 50.13747951859133);               // B9

console.log('calc-almacenamiento-glp.test.js: OK');
