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
); // C10 — factorHf por defecto = 1 (sin efecto en la fórmula base)

// factorHf (ASME B31.12 Tabla IX-5A) AGREGADO 2026-09-02 — recomputado a
// mano: 10*((2*170*1.2)/12.7)*0.4*1*0.8
cerca(
  presionMaximaDiseno({ limiteElasticoMPa: 170, espesorMm: 1.2, diametroMm: 12.7, factorDiseno: 0.4, factorUnion: 1, factorHf: 0.8 }),
  102.80314960629921
);

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

// CORREGIDO respecto al Excel fuente (2026-09-02, a pedido del usuario):
// C31 dividía la rugosidad (mm) por el diámetro ya en METROS sin
// reconvertir, dando una rugosidad relativa ~1000x más alta que la real.
// Valor recomputado: 0.002 / (12.7/1000 * 1000) = 0.002/12.7.
cerca(
  rugosidadRelativa({ rugosidadAbsoluta: 0.002, diametroM: 12.7 / 1000 }),
  0.00015748031496062994
);

cerca(
  reynolds({ densidad: 0.14881834275071656, velocidad: 26.522607427443383, diametroM: 12.7 / 1000, viscosidad: 0.00001 }),
  5012.754113130562
); // C30

// CORREGIDO respecto al Excel fuente (2026-09-02, a pedido del usuario):
// C32 sumaba 6.9/Re FUERA del logaritmo; la ecuación de Haaland (1983)
// publicada lo suma adentro. Recomputado con la rugosidad relativa ya
// corregida arriba — contrastado independientemente con Blasius
// (f=0.316/Re^0.25=0.0376 para este Re), coincide.
cerca(
  factorFriccionHaaland({ rugosidadRelativa: 0.00015748031496062994, reynolds: 5012.754113130562 }),
  0.03781741551718751
);

cerca(
  perdidaCargaTramo({ factorFriccion: 0.03781741551718751, longitudM: 20, diametroM: 12.7 / 1000, densidad: 0.14881834275071656, velocidad: 26.522607427443383, sumaCoeficientesLocales: 0 }),
  31.17288681188844
); // C16 — antes de la corrección de C31/C32 daba 109.75 mbar (~3.5x más alto)

console.log('physics.test.js: OK');
