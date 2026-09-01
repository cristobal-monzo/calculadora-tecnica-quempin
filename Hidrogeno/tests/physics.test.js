import assert from 'node:assert/strict';
import {
  reynolds, rugosidadRelativa, factorFriccionHaaland, densidadReal,
  barGaugeAPaAbs, barAbsAPaAbs, presionMaximaDiseno, velocidadErosion,
  perdidaCargaTramo,
} from '../js/physics.js';

function cerca(actual, esperado, tolerancia = 1e-9) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Fixtures extraídos de Calculos H2.xlsx, hoja "Cálculo", 2026-09-01
cerca(
  presionMaximaDiseno({ limiteElasticoMPa: 170, espesorMm: 1.2, diametroMm: 12.7, factorDiseno: 0.4, factorUnion: 1 }),
  128.50393700787401
); // C10

cerca(barGaugeAPaAbs(0.8), 180000);
cerca(barAbsAPaAbs(200), 20000000);

cerca(
  densidadReal({ presionAbsPa: barGaugeAPaAbs(0.8), temperaturaC: 20, masaMolar: 0.002016, constanteR: 8.314, z: 1.0004759430898928 }),
  0.14881834275071656
); // C20

cerca(
  velocidadErosion({ zErosion: 1.02, temperaturaC: 20, presionMinBarG: 29.5, gravedadEspecifica: 0.0695 }),
  77.56390222440128
); // C14

cerca(
  rugosidadRelativa({ rugosidadAbsoluta: 0.002, diametroM: 12.7 / 1000 }),
  0.15748031496062992
); // C31

cerca(
  reynolds({ densidad: 0.14881834275071656, velocidad: 26.522607427443383, diametroM: 12.7 / 1000, viscosidad: 0.00001 }),
  5012.754113130562
); // C30

cerca(
  factorFriccionHaaland({ rugosidadRelativa: 0.15748031496062992, reynolds: 5012.754113130562 }),
  0.13314145810934921
); // C32

cerca(
  perdidaCargaTramo({ factorFriccion: 0.13314145810934921, longitudM: 20, diametroM: 12.7 / 1000, densidad: 0.14881834275071656, velocidad: 26.522607427443383, sumaCoeficientesLocales: 0 }),
  109.74847294168545
); // C16

console.log('physics.test.js: OK');
