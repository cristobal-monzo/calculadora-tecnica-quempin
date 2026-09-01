import assert from 'node:assert/strict';
import { calcularFlujo } from '../js/calc-flujo.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Inputs = valores por defecto de Calculos H2.xlsx, hoja "Cálculo", 2026-09-01
const r = calcularFlujo({
  presionBarG: 0.8,
  temperaturaC: 20,
  potenciaKw: 60,
  tuberiaPulgadas: 0.5,
  presionMinBarG: 29.5,
  largoM: 20,
  codos: 0,
  tees: 0,
  valvulas: 0,
  factorDiseno: 0.4,
  factorUnion: 1,
  unidadNormalizado: '[sL/min]',
  unidadH2: '[m3/h]',
});

cerca(r.presionMaxDisenoBar, 128.50393700787401);   // C10
cerca(r.flujoMasicoKgH, 1.8);                        // C13
cerca(r.zDiseno, 1.0004759430898928);                // C26
cerca(r.densidadKgM3, 0.14881834275071656);          // C20
cerca(r.flujoVolNormalizado, 355.5849438202248);     // C11
cerca(r.flujoVolH2, 12.095283193787164);             // C12
assert.equal(r.zErosion, 1.02);                       // C27
cerca(r.velocidadErosionMS, 77.56390222440128);       // C14
cerca(r.velocidadFlujoMS, 26.522607427443383);        // C15
cerca(r.reynolds, 5012.754113130562);                 // C30
cerca(r.rugosidadRelativa, 0.15748031496062992);      // C31
cerca(r.factorFriccion, 0.13314145810934921);         // C32
cerca(r.perdidaCargaMbar, 109.74847294168545);        // C16

console.log('calc-flujo.test.js: OK');
