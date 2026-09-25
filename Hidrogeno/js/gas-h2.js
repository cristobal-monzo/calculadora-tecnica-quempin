// Propiedades físicas y tablas de referencia específicas de hidrógeno.
// Fuente: Calculos H2.xlsx, hoja "Cálculo" (celdas citadas por bloque). Analizado 2026-09-01.

import { barGaugeAPaAbs, barAbsAPaAbs, celsiusAKelvin } from './physics.js';
import { desdePa } from './unidades-presion.js';

export const H2 = {
  masaMolarKgMol: 0.002016,     // Cálculo!C18
  constanteR: 8.314,             // Cálculo!C19  [J/mol·K]
  pciKjKg: 120000,               // Cálculo!C21
  pcsKjKg: 142000,                // Cálculo!C22
  gravedadEspecifica: 0.0695,     // Cálculo!C25
  densidadNormalKgM3: 0.089,      // Sheet3!C6 (0°C, 1 bar)
  viscosidadPaS: 0.00001,         // Cálculo!C30 (denominador fijo en el Excel)
  // AGREGADA 2026-09-08 (a pedido del usuario): relación de calores
  // específicos cp/cv del H₂, aproximación fija para el screening de
  // flujo sónico de chequeoCaidaPresion(). No viene del Excel fuente y
  // NO es un input editable — es una constante del gas. Valor real ~1.405
  // a 20°C y 1 atm; se adopta 1.40 como pide el criterio de screening.
  gammaIdeal: 1.40,
};

// Tabla de tubería — Cálculo!H33:L38.
//
// CORREGIDA 2026-09-25 (auditoría de coherencia física): la columna del
// Excel rotulada "DI [mm]" mezclaba diámetros EXTERIORES e INTERIORES:
//   - 1/4", 3/8", 1/2": 6,4 / 9,5 / 12,7 = diámetro EXTERIOR del tubing
//     (¼" = 6,35 mm, ⅜" = 9,525 mm, ½" = 12,7 mm);
//   - 3/4", 1": 16 / 23 ≈ exterior − 2·espesor (19,05 − 2,4 = 16,65;
//     25,4 − 2,4 = 23,0), o sea el interior;
//   - 1-1/4": 42 = exterior de un tubo NPS 1-1/4" (42,2 mm, ASME B36.10),
//     con pared de 2,7 mm (≈ Sch 10, 2,77 mm) y rugosidad de acero
//     comercial (0,045 mm).
// Usar el exterior como interior subestimaba la velocidad ~1,5x y la
// pérdida de carga ~2,7x en ½"; usar el interior en Barlow (que va con el
// EXTERIOR, ASME B31.12 PL-3.7.1) sobrestimaba la presión máxima de diseño
// en ¾" y 1". Ahora cada fila guarda el diámetro exterior (DE) y el
// espesor del Excel, y el interior se deriva: DI = DE − 2·espesor (mismo
// criterio que OtrosGases/js/tuberias.js). Límite elástico y rugosidad sin
// cambios. Ver Hidrogeno/CLAUDE.md.
const FILAS_TUBERIA = [
  { pulgadas: 0.25,  deMm: 6.35,  espesorMm: 1.2, limiteElasticoMPa: 185, rugosidadMm: 0.002 },
  { pulgadas: 0.375, deMm: 9.525, espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
  { pulgadas: 0.5,   deMm: 12.7,  espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
  { pulgadas: 0.75,  deMm: 19.05, espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
  { pulgadas: 1,     deMm: 25.4,  espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
  { pulgadas: 1.25,  deMm: 42.2,  espesorMm: 2.7, limiteElasticoMPa: 130, rugosidadMm: 0.045 },
];

export const TABLA_TUBERIA = FILAS_TUBERIA.map((f) => ({
  ...f, diMm: Math.round((f.deMm - 2 * f.espesorMm) * 1000) / 1000,
}));

// Tubería manual: el usuario da DI, espesor, límite elástico y rugosidad;
// el DE (para Barlow) se deduce.
export function diametroExteriorMm(tuberia) {
  return tuberia.deMm ?? tuberia.diMm + 2 * tuberia.espesorMm;
}

export function buscarTuberia(pulgadas) {
  const fila = TABLA_TUBERIA.find((f) => f.pulgadas === pulgadas);
  if (!fila) throw new Error(`Diámetro de tubería no encontrado en la tabla: ${pulgadas}"`);
  return fila;
}

// Correlación de compresibilidad Z del hidrógeno (9 términos) —
// Cálculo!B84:D92, total en B93. Los coeficientes del Excel fuente resultan
// ser exactamente los de la ecuación estandarizada de NIST:
//
//   Lemmon, E. W.; Huber, M. L.; Leachman, J. W. "Revised Standardized
//   Equation for Hydrogen Gas Densities for Fuel Consumption Applications",
//   Journal of Research of the NIST, Vol. 113, No. 6, 2008.
//
//   Z = 1 + Σ[i=1..9] ai · (100/T)^bi · P^ci   [T en K, P ABSOLUTA en MPa]
//
// Verificado contra los 5 puntos de validación de la Tabla 2 de esa
// publicación (tests/factor-z-h2.test.js). Es una ecuación para DENSIDAD de
// hidrógeno GASEOSO, no una EOS universal; su rango publicado es 220-1000 K
// y hasta 200 MPa (2000 bar), que cubre de sobra el almacenamiento de H₂
// comprimido de la app (100-700 bar).
const COEFICIENTES_Z = [
  { a: 0.0588846,     b: 1.325, c: 1 },
  { a: -0.06136111,   b: 1.87,  c: 1 },
  { a: -0.002650473,  b: 2.5,   c: 2 },
  { a: 0.002731125,   b: 2.8,   c: 2 },
  { a: 0.001802374,   b: 2.938, c: 2.42 },
  { a: -0.001150707,  b: 3.14,  c: 2.63 },
  { a: 9.588528e-05,  b: 3.37,  c: 3 },
  { a: -1.10904e-07,  b: 3.75,  c: 4 },
  { a: 1.264403e-10,  b: 4,     c: 5 },
];

// FUENTE ÚNICA de Z para hidrógeno en toda la app (2026-09-08, a pedido del
// usuario). Antes había tres caminos distintos para el mismo estado
// termodinámico: esta correlación mal alimentada (factorZDiseno, con presión
// MANOMÉTRICA y T+273), y dos funciones escalón con los mismos valores
// mágicos 1.02/1.1/1.2 (factorZErosion acá y factorZAlmacenamiento en
// calc-almacenamiento.js). Ver Hidrogeno/CLAUDE.md.
export function factorZHidrogeno({ presionAbsMPa, temperaturaK }) {
  const suma = COEFICIENTES_Z.reduce(
    (acc, { a, b, c }) => acc + a * Math.pow(100 / temperaturaK, b) * Math.pow(presionAbsMPa, c),
    0
  );
  return 1 + suma;
}

// Adaptadores de unidades: son el único lugar donde se traduce lo que pide
// cada pestaña (bar manométrico o bar absoluto, °C) a lo que exige la
// correlación (MPa ABSOLUTOS, K). Reutilizan las conversiones que ya
// existían — barGaugeAPaAbs/barAbsAPaAbs (physics.js, con el supuesto de 1
// bar de atmósfera de todo el módulo), desdePa (unidades-presion.js) y
// celsiusAKelvin (physics.js) — para no repetir ninguna constante.
export function factorZDesdeBarG({ presionBarG, temperaturaC }) {
  return factorZHidrogeno({
    presionAbsMPa: desdePa(barGaugeAPaAbs(presionBarG), 'MPa'),
    temperaturaK: celsiusAKelvin(temperaturaC),
  });
}

export function factorZDesdeBarAbs({ presionBarAbs, temperaturaC }) {
  return factorZHidrogeno({
    presionAbsMPa: desdePa(barAbsAPaAbs(presionBarAbs), 'MPa'),
    temperaturaK: celsiusAKelvin(temperaturaC),
  });
}

// Tabla Hf — ASME B31.12, Tabla IX-5A "Carbon Steel Pipeline Materials
// Performance Factor". CORREGIDA respecto a la versión anterior de este
// archivo (2026-09-02, a pedido del usuario, con la tabla oficial de la
// norma como fuente): antes se leía como "tabla de referencia genérica"
// (puerto de Cálculo!A55:I59, columnas rotuladas 69-483 bar = 1000-7000 psi
// en pasos redondos de 1000 psi) sin poder confirmar su significado exacto
// contra la norma. Es en realidad la tabla de Hf (derating por
// fragilización de hidrógeno) — las columnas reales de presión de diseño
// del sistema llegan solo hasta 3000 psig, en pasos de 200 psi por encima
// de 2000 (1000, 2000, 2200, 2400, 2600, 2800, 3000). Los factores de cada
// fila no cambiaron: coincidían exactamente con la tabla real, solo el
// rótulo de las columnas estaba mal. Fila elegida por límite de fluencia
// mínimo especificado del material (nota (b) de la tabla); interpolación
// lineal en presión entre columnas (nota (c)). Ver Hidrogeno/CLAUDE.md.
export const TABLA_HF_ASME_B31_12 = {
  columnasPsig: [1000, 2000, 2200, 2400, 2600, 2800, 3000],
  filas: [
    { resistenciaTensionMPa: 455.07, limiteFluenciaMPa: 358.55, factores: [1.0, 1.0, 0.954, 0.91, 0.88, 0.84, 0.78] },
    { resistenciaTensionMPa: 517.11, limiteFluenciaMPa: 413.69, factores: [0.874, 0.874, 0.834, 0.796, 0.77, 0.734, 0.682] },
    { resistenciaTensionMPa: 565.43, limiteFluenciaMPa: 482.63, factores: [0.776, 0.776, 0.742, 0.706, 0.684, 0.652, 0.606] },
    { resistenciaTensionMPa: 620.53, limiteFluenciaMPa: 551.58, factores: [0.694, 0.694, 0.662, 0.632, 0.61, 0.584, 0.542] },
  ],
};

const PSIG_POR_BAR = 14.5037737797;

// Factor Hf en función del material (por límite de fluencia) y la presión
// de diseño del sistema — AGREGADO respecto al Excel fuente (2026-09-02, a
// pedido del usuario): el Excel no aplicaba Hf en la fórmula de Barlow en
// absoluto. Ver Hidrogeno/CLAUDE.md y physics.js (presionMaximaDiseno).
export function factorHf({ limiteFluenciaMPa, presionDisenoBarG }) {
  const fila = TABLA_HF_ASME_B31_12.filas.find((f) => limiteFluenciaMPa <= f.limiteFluenciaMPa);
  if (!fila) {
    const maxMPa = TABLA_HF_ASME_B31_12.filas[TABLA_HF_ASME_B31_12.filas.length - 1].limiteFluenciaMPa;
    throw new Error(`Límite de fluencia ${limiteFluenciaMPa} MPa fuera del rango de la Tabla IX-5A (máx ${maxMPa} MPa).`);
  }
  const { columnasPsig } = TABLA_HF_ASME_B31_12;
  const presionPsig = presionDisenoBarG * PSIG_POR_BAR;
  const ultimo = columnasPsig.length - 1;
  if (presionPsig <= columnasPsig[0]) return fila.factores[0];
  if (presionPsig >= columnasPsig[ultimo]) return fila.factores[ultimo];
  for (let i = 0; i < ultimo; i++) {
    if (presionPsig >= columnasPsig[i] && presionPsig <= columnasPsig[i + 1]) {
      const t = (presionPsig - columnasPsig[i]) / (columnasPsig[i + 1] - columnasPsig[i]);
      return fila.factores[i] + t * (fila.factores[i + 1] - fila.factores[i]);
    }
  }
}

// Tabla de factor de diseño F — ASME B31.12, Tabla PL-3.7.1(b)(6)-1 "Basic
// Design Factor, F (Used With Option A)" (provista por el usuario,
// 2026-09-02). Reemplaza el input numérico libre que tenía "Tubería y
// Flujo" (default 0.4, sin relación explícita con la norma) por un
// selector de Clase de Ubicación — ver poblarSelectFactorDiseno() en
// ui.js. Las tres primeras clases comparten F=0.50; se listan igual que la
// tabla oficial (no solo los valores únicos) para que el usuario elija por
// clase de ubicación real del proyecto, no por número de F.
export const TABLA_FACTOR_DISENO_F = [
  { clase: 'Clase 1, División 2', factor: 0.50 },
  { clase: 'Clase 2', factor: 0.50 },
  { clase: 'Clase 3', factor: 0.50 },
  { clase: 'Clase 4', factor: 0.40 },
];

// Tabla de derating por temperatura — ASME B31.12, Tabla PL-3.7.1(b)(8)
// "Temperature Derating Factor, T, for Steel Pipe" (provista por el
// usuario, 2026-09-02). AGREGADA a la fórmula de Barlow: Hidrogeno/CLAUDE.md
// ya documentaba `P=2·S·t·F·E·Hf·T/D` como la fórmula real de la norma,
// pero T no estaba implementado (el Excel fuente tampoco lo aplicaba). La
// tabla oficial está en °F; factorT() convierte desde la temperatura en
// °C que ya pide "Tubería y Flujo" (no se agrega ningún campo nuevo).
export const TABLA_FACTOR_TEMPERATURA_T = [
  { tempF: 250, factor: 1.000 },
  { tempF: 300, factor: 0.967 },
  { tempF: 350, factor: 0.933 },
  { tempF: 400, factor: 0.900 },
  { tempF: 450, factor: 0.867 },
];

// Interpolación lineal en temperatura (nota general de la Tabla
// PL-3.7.1(b)(8): "for intermediate temperatures, interpolate for derating
// factor") con saturación plana fuera de rango en ambos extremos — mismo
// criterio que factorHf() para la presión (arriba).
export function factorT({ temperaturaC }) {
  const tempF = temperaturaC * 9 / 5 + 32;
  const tabla = TABLA_FACTOR_TEMPERATURA_T;
  const ultimo = tabla.length - 1;
  if (tempF <= tabla[0].tempF) return tabla[0].factor;
  if (tempF >= tabla[ultimo].tempF) return tabla[ultimo].factor;
  for (let i = 0; i < ultimo; i++) {
    if (tempF >= tabla[i].tempF && tempF <= tabla[i + 1].tempF) {
      const t = (tempF - tabla[i].tempF) / (tabla[i + 1].tempF - tabla[i].tempF);
      return tabla[i].factor + t * (tabla[i + 1].factor - tabla[i].factor);
    }
  }
}
