// Propiedades del Gas Natural a partir de su composición molar.
// Fuente: MASTER DISEÑO.xlsm, hoja "Combustión Gas" (columnas E:F, B8:B54,
// celdas citadas por bloque). Analizado 2026-09-01.
//
// Nota fiel al Excel: el numerador de carbono (F36) usa las FRACCIONES DE
// MASA (metano/etano/propano/butano) mientras que el término de hidrógeno
// de la misma fórmula usa los PORCENTAJES MOLARES de entrada — no son
// consistentes entre sí en la hoja fuente. Se transcribe literal (no se
// "corrige"), verificado contra el valor cacheado del Excel.

export const METANO = { C: 1, H: 4, PM: 16.043, PCI: 55050 };  // B9:B13
export const ETANO = { C: 2, H: 6, PM: 30.07, PCI: 47520 };    // B17:B21
export const PROPANO_GN = { C: 3, H: 8, PM: 44.097, PCI: 46340 }; // B25:B29
export const BUTANO_GN = { C: 4, H: 10, PM: 58.124, PCI: 45370 }; // B33:B37
export const PM_CO2 = 44.009; // B41
export const PM_O2 = 31.999;  // B49
export const PM_N2 = 28.013;  // B53

export function propiedadesGN({ pctMetano, pctEtano, pctPropano, pctButano, pctDioxidoC, pctNitrogeno }) {
  // F28 = F22*B11+F23*B19+F24*B27+F25*B35+F26*B41+F27*B53
  const pm = pctMetano * METANO.PM + pctEtano * ETANO.PM + pctPropano * PROPANO_GN.PM
    + pctButano * BUTANO_GN.PM + pctDioxidoC * PM_CO2 + pctNitrogeno * PM_N2;

  const xMetanoMasa = (pctMetano * METANO.PM) / pm;       // F29
  const xEtanoMasa = (pctEtano * ETANO.PM) / pm;           // F30
  const xPropanoMasa = (pctPropano * PROPANO_GN.PM) / pm;  // F31
  const xButanoMasa = (pctButano * BUTANO_GN.PM) / pm;     // F32
  const xDioxidoCMasa = (pctDioxidoC * PM_CO2) / pm;       // F33
  const xNitrogenoMasa = (pctNitrogeno * PM_N2) / pm;      // F34

  const r = 8.31447 / pm; // F35
  const densidadNormal = 101.325 / r / 273.15; // F40

  // F36:F39 — puerto literal (ver nota arriba sobre la inconsistencia molar/masa del Excel fuente)
  const numCarbono = 12.011 * (
    xMetanoMasa * METANO.C + xEtanoMasa * ETANO.C + xPropanoMasa * PROPANO_GN.C
    + xButanoMasa * BUTANO_GN.C + xDioxidoCMasa
  );
  const numHidrogeno = 1.008 * (
    pctMetano * METANO.H + pctEtano * ETANO.H + pctPropano * PROPANO_GN.H + pctButano * BUTANO_GN.H
  );
  const numOxigeno = PM_O2 * xDioxidoCMasa;
  const numNitrogeno = xNitrogenoMasa * PM_N2;
  const denom = numCarbono + numHidrogeno + numOxigeno + numNitrogeno;

  const xCarbono = numCarbono / denom;
  const xHidrogeno = numHidrogeno / denom;
  const xOxigeno = numOxigeno / denom;
  const xNitrogeno = numNitrogeno / denom;

  // F45 — PCI por masa (metano/etano/propano/butano; CO2 y N2 no aportan)
  const pciMasa = xMetanoMasa * METANO.PCI + xEtanoMasa * ETANO.PCI
    + xPropanoMasa * PROPANO_GN.PCI + xButanoMasa * BUTANO_GN.PCI;

  return {
    pm, r, densidadNormal, xMetanoMasa, xEtanoMasa, xPropanoMasa, xButanoMasa,
    xDioxidoCMasa, xNitrogenoMasa, xCarbono, xHidrogeno, xOxigeno, xNitrogeno, pciMasa,
  };
}

export function densidadCondiciones({ presionKPa, temperaturaC, r }) {
  // Combustión Gas!F44 = (101.325+F42)/F35/(273.15+F43)
  return (101.325 + presionKPa) / r / (273.15 + temperaturaC);
}
