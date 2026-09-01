// Propiedades del GLP (mezcla butano/propano) a partir de su composición.
// Fuente: MASTER DISEÑO.xlsm, hoja "Combustión Gas" (columnas E:K,
// celdas citadas por bloque). Analizado 2026-09-01.

export const BUTANO = { C: 4, H: 10, PM: 58.124, PCI: 45370, PCS: 49150 }; // Combustión Gas!B33:B38
export const PROPANO = { C: 3, H: 8, PM: 44.097, PCI: 46340, PCS: 50330 }; // Combustión Gas!B25:B30

// Combustión Gas!F4:F19 — propiedades derivadas de la composición molar (%butano/%propano)
export function propiedadesGLP({ pctButano, pctPropano }) {
  // F4 = 1.008*(F2*B34+F3*B26)+12.011*(F2*B33+F3*B25)
  const pm = 1.008 * (pctButano * BUTANO.H + pctPropano * PROPANO.H)
    + 12.011 * (pctButano * BUTANO.C + pctPropano * PROPANO.C);

  const r = 8.31447 / pm; // F7
  const densidadNormal = 101.325 / r / 273.15; // F10 [kg/Nm3]

  const xButanoMasa = (pctButano * BUTANO.PM) / pm; // F5
  const xPropanoMasa = (pctPropano * PROPANO.PM) / pm; // F6

  // F8, F9 — fracciones usadas para aire estequiométrico (puerto literal del Excel)
  const numCarbono = 12.011 * (xButanoMasa * BUTANO.C + xPropanoMasa * PROPANO.C);
  const numHidrogeno = 1.008 * (xPropanoMasa * PROPANO.H + xButanoMasa * BUTANO.H);
  const xCarbono = numCarbono / (numCarbono + numHidrogeno);
  const xHidrogeno = numHidrogeno / (numCarbono + numHidrogeno);

  const pciMasa = xButanoMasa * BUTANO.PCI + xPropanoMasa * PROPANO.PCI; // F15
  const pcsMasa = xButanoMasa * BUTANO.PCS + xPropanoMasa * PROPANO.PCS; // F16

  // F45 — PCI simplificado [kWh/m3], usado solo en la emisión NOx admisible (J47)
  const pciSimplificadoKwhM3 = 25.3 * pctPropano + 34.3 * pctButano;

  return {
    pm, r, densidadNormal, xButanoMasa, xPropanoMasa, xCarbono, xHidrogeno,
    pciMasa, pcsMasa, pciSimplificadoKwhM3,
  };
}

export function densidadCondiciones({ presionKPa, temperaturaC, r }) {
  // Combustión Gas!F14 = (F12+101.325)/$F$7/(273.15+F13)
  return (presionKPa + 101.325) / r / (273.15 + temperaturaC);
}
