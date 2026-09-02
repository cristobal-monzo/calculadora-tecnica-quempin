// Propiedades físicas y tablas de referencia específicas de hidrógeno.
// Fuente: Calculos H2.xlsx, hoja "Cálculo" (celdas citadas por bloque). Analizado 2026-09-01.

export const H2 = {
  masaMolarKgMol: 0.002016,     // Cálculo!C18
  constanteR: 8.314,             // Cálculo!C19  [J/mol·K]
  pciKjKg: 120000,               // Cálculo!C21
  pcsKjKg: 142000,                // Cálculo!C22
  gravedadEspecifica: 0.0695,     // Cálculo!C25
  densidadNormalKgM3: 0.089,      // Sheet3!C6 (0°C, 1 bar)
  viscosidadPaS: 0.00001,         // Cálculo!C30 (denominador fijo en el Excel)
};

// Tabla de tubería — Cálculo!H33:L38
export const TABLA_TUBERIA = [
  { pulgadas: 0.25,  diMm: 6.4,  espesorMm: 1.2, limiteElasticoMPa: 185, rugosidadMm: 0.002 },
  { pulgadas: 0.375, diMm: 9.5,  espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
  { pulgadas: 0.5,   diMm: 12.7, espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
  { pulgadas: 0.75,  diMm: 16,   espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
  { pulgadas: 1,     diMm: 23,   espesorMm: 1.2, limiteElasticoMPa: 170, rugosidadMm: 0.002 },
  { pulgadas: 1.25,  diMm: 42,   espesorMm: 2.7, limiteElasticoMPa: 130, rugosidadMm: 0.045 },
];

export function buscarTuberia(pulgadas) {
  const fila = TABLA_TUBERIA.find((f) => f.pulgadas === pulgadas);
  if (!fila) throw new Error(`Diámetro de tubería no encontrado en la tabla: ${pulgadas}"`);
  return fila;
}

// Correlación de compresibilidad Z (9 términos) — Cálculo!B84:D92, total en B93.
// Z = 1 + Σ ai · (100/(T+273))^bi · (P/10)^ci   [T en °C, P en bar manométrico]
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

export function factorZDiseno({ presionBarG, temperaturaC }) {
  const suma = COEFICIENTES_Z.reduce(
    (acc, { a, b, c }) => acc + a * Math.pow(100 / (temperaturaC + 273), b) * Math.pow(presionBarG / 10, c),
    0
  );
  return 1 + suma;
}

// Factor Z para velocidad de erosión — Cálculo!C27 = IFS(C7<20,1,C7<50,1.02,C7<200,1.1,C7<300,1.2)
export function factorZErosion(presionMinBarG) {
  if (presionMinBarG < 20) return 1;
  if (presionMinBarG < 50) return 1.02;
  if (presionMinBarG < 200) return 1.1;
  if (presionMinBarG < 300) return 1.2;
  throw new Error('Presión mínima fuera del rango de la correlación Z (< 300 bar)');
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
