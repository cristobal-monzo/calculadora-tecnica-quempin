// Motor de cálculo de la pestaña "Almacenamiento" — puerto de
// Calculos H2.xlsx, hoja "Sheet3", CON UNA CORRECCIÓN DELIBERADA: la
// densidad real se calcula con la presión/temperatura PROPIAS de esta
// pestaña, no con las de la pestaña "Tubería y Flujo" (ver
// Hidrogeno/CLAUDE.md, sección "Discrepancias del Excel fuente").
//
// El PCI (119960 kJ/kg) usado acá es el propio de Sheet3 en el Excel
// fuente, intencionalmente distinto del de calc-flujo.js (120000 kJ/kg) —
// ver la misma sección del CLAUDE.md antes de "unificarlo".
//
// El factor Z, en cambio, SÍ se unificó (2026-09-08, a pedido del usuario):
// Sheet3!C7 era una función escalón (IFS(H4<50,1.02,H4<200,1.1,H4<300,1.2))
// que hacía saltar la masa almacenada ~9% de golpe al cruzar 200 bar. Ahora
// se usa la misma correlación continua de NIST que "Tubería y Flujo" — ver
// factorZHidrogeno en gas-h2.js y Hidrogeno/CLAUDE.md.

import { densidadReal, barAbsAPaAbs, celsiusAKelvin } from './physics.js';
import { H2, factorZDesdeBarAbs, buscarTuberia } from './gas-h2.js';

const PCI_ALMACENAMIENTO_KJ_KG = 119960; // Sheet3!C4
const CONSTANTE_R_BAR_CM3 = 83.14472;    // Sheet3!H6 (R en cm3·bar/(mol·K))
const MASA_MOLAR_G_MOL = 2.016;          // Sheet3!H6

// Valores por defecto de los dos datos AGREGADOS el 2026-09-25 (ver
// calcularAlmacenamiento):
//   - 4 Nm³/h: el caudal de llenado que el Excel tenía fijo dentro de las
//     fórmulas (Sheet3!G10 "Caudal real @4Nm³/h", H12 = H9/4).
//   - 10 bar abs: presión residual bajo la cual el estanque ya no alimenta
//     el consumo (el regulador necesita presión de entrada por sobre la de
//     salida). No viene del Excel — valor conservador por defecto,
//     confirmado por Cristóbal el 2026-09-25; editable, para ajustarlo a la
//     presión mínima de entrada del regulador real de cada proyecto.
export const CAUDAL_LLENADO_DEFECTO_NM3H = 4;
export const PRESION_RESIDUAL_DEFECTO_BAR_ABS = 10;

function masaEnEstanqueKg({ presionBarAbs, temperaturaC, volumenM3 }) {
  if (!(presionBarAbs > 0)) return { masaKg: 0, z: 1 };
  // Sheet3!C7 — presión ABSOLUTA (así la pide el formulario de esta
  // pestaña) y temperatura en °C; el adaptador convierte a MPa abs y K.
  const z = factorZDesdeBarAbs({ presionBarAbs, temperaturaC });
  // Sheet3!H6 — PV=ZnRT, puerto literal (validado contra el valor cacheado del Excel)
  const masaKg = (1000 * (presionBarAbs / 1000) * (volumenM3 * 1000) * MASA_MOLAR_G_MOL)
    / (z * (CONSTANTE_R_BAR_CM3 * celsiusAKelvin(temperaturaC)));
  return { masaKg, z };
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
    caudalLlenadoNm3H = CAUDAL_LLENADO_DEFECTO_NM3H,
    presionResidualBarAbs = PRESION_RESIDUAL_DEFECTO_BAR_ABS,
  } = inputs;

  const { masaKg: masaAlmacenadaKg, z: zAlmacenamiento } = masaEnEstanqueKg({ presionBarAbs, temperaturaC, volumenM3 });

  // Masa utilizable (AGREGADO 2026-09-25, auditoría de coherencia física):
  // el Excel calculaba la autonomía con TODA la masa del estanque, como si
  // se pudiera vaciar hasta 0 bar abs. Bajo la presión residual el
  // regulador ya no entrega; esa masa queda en el estanque. Con la presión
  // residual por sobre la de almacenamiento no hay masa utilizable.
  const presionResidualEfectiva = Math.min(Math.max(presionResidualBarAbs, 0), presionBarAbs);
  const masaResidualKg = masaEnEstanqueKg({ presionBarAbs: presionResidualEfectiva, temperaturaC, volumenM3 }).masaKg;
  const masaUtilizableKg = Math.max(masaAlmacenadaKg - masaResidualKg, 0);

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

  // Sheet3!H8 — sobre la masa UTILIZABLE (antes, la total)
  const autonomiaHoras = masaUtilizableKg / consumoKgH;

  // Sheet3!H9
  const volumenNormalizadoNm3 = masaAlmacenadaKg / H2.densidadNormalKgM3;
  const volumenUtilizableNm3 = masaUtilizableKg / H2.densidadNormalKgM3;

  // Sheet3!H10/H11 — caudal REAL de llenado a la presión del estanque y
  // velocidad en la línea Ø¼". CORREGIDO 2026-09-25:
  //   - El Excel usaba 360 g/h fijos: 4 Nm³/h × 0,089 kg/Nm³ ≈ 0,356 kg/h,
  //     redondeado, y dividía por 2,16 en vez de por la masa molar 2,016
  //     (+7 % de error) y sin factor Z. Ahora: masa = caudal de llenado ×
  //     densidad normal, volumen real = masa / densidad real (con Z).
  //   - El área usaba 6,35 mm, el diámetro EXTERIOR del tubing de ¼"; ahora
  //     el interior de la fila de ¼" de TABLA_TUBERIA (6,35 − 2·1,2 = 3,95 mm).
  const flujoMasicoLlenadoKgH = caudalLlenadoNm3H * H2.densidadNormalKgM3;
  const caudalLlenadoRealM3H = flujoMasicoLlenadoKgH / densidadRealKgM3;
  const caudalReferenciaM3H = unidadCaudalReferencia === '[L/min]' ? caudalLlenadoRealM3H * 1000 / 60 : caudalLlenadoRealM3H;
  const diametroCapilarM = buscarTuberia(0.25).diMm / 1000;
  const areaCapilarM2 = Math.PI * diametroCapilarM ** 2 / 4;
  const velocidadReferenciaMS = (caudalLlenadoRealM3H / 3600) / areaCapilarM2;

  // Sheet3!H12 — llenado desde la presión residual hasta la de
  // almacenamiento, al caudal de llenado ingresado (antes 4 Nm³/h fijos y
  // desde 0 bar).
  const tiempoLlenadoHoras = caudalLlenadoNm3H > 0 ? volumenUtilizableNm3 / caudalLlenadoNm3H : null;

  return {
    masaAlmacenadaKg, masaResidualKg, masaUtilizableKg, zAlmacenamiento, densidadRealKgM3, consumoKgH, consumoNm3H,
    consumoLMin, autonomiaHoras, volumenNormalizadoNm3, volumenUtilizableNm3, caudalReferenciaM3H,
    velocidadReferenciaMS, tiempoLlenadoHoras, diametroCapilarMm: diametroCapilarM * 1000,
  };
}
