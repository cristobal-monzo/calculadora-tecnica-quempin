// Motor de cálculo de la pestaña "Almacenamiento" — puerto de
// Calculos H2.xlsx, hoja "Sheet3", CON UNA CORRECCIÓN DELIBERADA: la
// densidad real se calcula con la presión/temperatura PROPIAS de esta
// pestaña, no con las de la pestaña "Tubería y Flujo" (ver
// Hidrogeno/CLAUDE.md, sección "Discrepancias del Excel fuente").
//
// El PCI (119960 kJ/kg) y el corte de la función escalón de Z usados acá
// son los propios de Sheet3 en el Excel fuente, intencionalmente distintos
// de los de calc-flujo.js (120000 kJ/kg) — ver la misma sección del
// CLAUDE.md antes de "unificarlos".

import { densidadReal, barAbsAPaAbs } from './physics.js';
import { H2 } from './gas-h2.js';

const PCI_ALMACENAMIENTO_KJ_KG = 119960; // Sheet3!C4
const CONSTANTE_R_BAR_CM3 = 83.14472;    // Sheet3!H6 (R en cm3·bar/(mol·K))
const MASA_MOLAR_G_MOL = 2.016;          // Sheet3!H6

function factorZAlmacenamiento(presionBarAbs) {
  // Sheet3!C7 = IFS(H4<50,1.02,H4<200,1.1,H4<300,1.2)
  if (presionBarAbs < 50) return 1.02;
  if (presionBarAbs < 200) return 1.1;
  if (presionBarAbs < 300) return 1.2;
  throw new Error('Presión de almacenamiento fuera del rango de la correlación Z (< 300 bar)');
}

export function formatearHoras(horasDecimal) {
  const totalSegundos = Math.round(horasDecimal * 3600);
  const h = Math.floor(totalSegundos / 3600);
  const m = Math.floor((totalSegundos % 3600) / 60);
  const s = totalSegundos % 60;
  const dosDigitos = (n) => String(n).padStart(2, '0');
  return `${dosDigitos(h)}:${dosDigitos(m)}:${dosDigitos(s)}`;
}

export function calcularAlmacenamiento(inputs) {
  const {
    potenciaKw, temperaturaC, presionBarAbs, volumenM3,
    unidadCaudalReferencia = '[m³/h]',
  } = inputs;

  // Sheet3!C7
  const zAlmacenamiento = factorZAlmacenamiento(presionBarAbs);

  // Sheet3!H6 — PV=ZnRT, puerto literal (validado contra el valor cacheado del Excel)
  const masaAlmacenadaKg =
    (1000 * (presionBarAbs / 1000) * (volumenM3 * 1000) * MASA_MOLAR_G_MOL) /
    (zAlmacenamiento * (CONSTANTE_R_BAR_CM3 * (temperaturaC + 273.15)));

  // Corrección deliberada respecto al Excel: densidad propia de esta pestaña
  const densidadRealKgM3 = densidadReal({
    presionAbsPa: barAbsAPaAbs(presionBarAbs), temperaturaC,
    masaMolar: H2.masaMolarKgMol, constanteR: H2.constanteR, z: zAlmacenamiento,
  });

  // Sheet3!C10:C14 — consumo del quemador
  const consumoKgS = potenciaKw / PCI_ALMACENAMIENTO_KJ_KG;
  const consumoKgH = consumoKgS * 3600;
  const consumoNm3H = consumoKgH / H2.densidadNormalKgM3;
  const consumoLMin = (consumoNm3H * 1000) / 60;

  // Sheet3!H8
  const autonomiaHoras = masaAlmacenadaKg / consumoKgH;

  // Sheet3!H9
  const volumenNormalizadoNm3 = masaAlmacenadaKg / H2.densidadNormalKgM3;

  // Sheet3!H10 — caudal de referencia en línea capilar Ø¼", puerto literal
  const baseCaudal = ((360 / 2.16) / 60) * (CONSTANTE_R_BAR_CM3 * (temperaturaC + 273.15)) / (presionBarAbs * 1000);
  const caudalReferenciaM3H = unidadCaudalReferencia === '[L/min]' ? baseCaudal : (baseCaudal * 60) / 1000;

  // Sheet3!H11 — velocidad en línea capilar Ø¼" (diámetro interno 6.35 mm), puerto literal
  const areaCapilarM2 = Math.PI * Math.pow(6.35 / 1000, 2);
  const baseVelocidad = (caudalReferenciaM3H * 4 / (60 * 1000)) / areaCapilarM2;
  const velocidadReferenciaMS = unidadCaudalReferencia === '[L/min]' ? baseVelocidad : (baseVelocidad * 1000) / 60;

  // Sheet3!H12
  const tiempoLlenadoHoras = volumenNormalizadoNm3 / 4;

  return {
    masaAlmacenadaKg, zAlmacenamiento, densidadRealKgM3, consumoKgH, consumoNm3H,
    consumoLMin, autonomiaHoras, volumenNormalizadoNm3, caudalReferenciaM3H,
    velocidadReferenciaMS, tiempoLlenadoHoras,
  };
}
