// Propiedades del Gas Natural a partir de su composición molar.
// Fuente: MASTER DISEÑO.xlsm, hoja "Combustión Gas" (columnas E:F, B8:B54,
// celdas citadas por bloque). Analizado 2026-09-01.
//
// Fracciones másicas de C/H/O/N (F36:F39) — historia de dos correcciones:
//   - El Excel ponderaba el carbono con FRACCIONES DE MASA de cada
//     componente y el hidrógeno con los PORCENTAJES MOLARES de entrada.
//   - 2026-09-01 se unificó todo a fracción de masa. Eso tampoco es
//     correcto: la masa de un elemento por mol de mezcla es
//     Σ yᵢ·(átomos del elemento en i)·(masa atómica), con yᵢ MOLAR —
//     ponderar por fracción de masa le da peso extra a los componentes
//     pesados y a los inertes.
//   - CORREGIDO 2026-09-25 (auditoría de coherencia física): base molar en
//     los cuatro elementos. Con la composición por defecto xCarbono pasa de
//     0,7058 a 0,7287 y el aire estequiométrico de 12,10 a 12,77 Nm³/kg,
//     que coincide con el cálculo directo por O₂ requerido
//     (Σ yᵢ·(Cᵢ + Hᵢ/4) / 0,21 · 22,414 / PM). Ver GasNatural-GLP/CLAUDE.md.

// PCI y PCS [kJ/kg]: Combustión Gas!B13/B14, B21/B22, B29/B30, B37/B38.
// CORREGIDO 2026-09-25: el Excel tenía PCI metano = 55050 y PCS metano =
// 55053 — el PCI quedó igual al PCS. PCI real del metano: 802,3 kJ/mol /
// 16,043 = 50.010 kJ/kg; PCS: 890,6 kJ/mol → 55.510 kJ/kg (entalpías de
// combustión NIST). La diferencia PCS − PCI de cada componente coincide
// con el calor de condensación de su agua (44,0 kJ/mol H₂O), lo que valida
// los cuatro pares. Con el valor anterior el PCI del GN por defecto salía
// 52.737 kJ/kg en vez de 48.021 (+9,8 %).
//
// Tc [K], Pc [bar], ω: constantes críticas para las pseudocríticas de Kay
// que usa Peng-Robinson en Red de Gas. Metano = Bases de Cálculo!J41:L41;
// propano y butano = los que promedia Bases de Cálculo!J40:L40 (GLP 50/50);
// etano, CO₂ y N₂: Poling, Prausnitz & O'Connell, "The Properties of Gases
// and Liquids", 5ª ed., Apéndice A.
export const METANO = { C: 1, H: 4, PM: 16.043, PCI: 50010, PCS: 55510, Tc: 190.6, Pc: 45.99, w: 0.011 };  // B9:B14
export const ETANO = { C: 2, H: 6, PM: 30.07, PCI: 47520, PCS: 51900, Tc: 305.3, Pc: 48.72, w: 0.099 };    // B17:B22
export const PROPANO_GN = { C: 3, H: 8, PM: 44.097, PCI: 46340, PCS: 50330, Tc: 369.8, Pc: 42.48, w: 0.152 }; // B25:B30
export const BUTANO_GN = { C: 4, H: 10, PM: 58.124, PCI: 45370, PCS: 49150, Tc: 425.1, Pc: 37.98, w: 0.2 }; // B33:B38
export const PM_CO2 = 44.009; // B41
export const PM_O2 = 31.999;  // B49
export const PM_N2 = 28.013;  // B53
export const CRITICAS_CO2 = { Tc: 304.1, Pc: 73.77, w: 0.225 };
export const CRITICAS_N2 = { Tc: 126.2, Pc: 33.98, w: 0.037 };

// Masa molar del aire seco [kg/kmol], para la densidad relativa.
export const PM_AIRE = 28.9647;
// Condición de referencia del poder calorífico volumétrico de Red de Gas:
// 15 °C y 1 atm (m³ estándar). Es la base con que el Excel fuente fijaba
// sus valores (Bases de Cálculo!B19: GN 37,54 MJ/m³ ≈ PCS del GN por
// defecto a 15 °C, 37,47; GLP 119,7 ≈ PCS del butano puro a 15 °C, 120,8).
export const T_REFERENCIA_VOLUMEN_K = 288.15;

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

  // F36:F39 — masa de cada elemento por mol de mezcla, en base MOLAR (ver
  // nota al inicio del archivo).
  const numCarbono = 12.011 * (
    pctMetano * METANO.C + pctEtano * ETANO.C + pctPropano * PROPANO_GN.C
    + pctButano * BUTANO_GN.C + pctDioxidoC
  );
  const numHidrogeno = 1.008 * (
    pctMetano * METANO.H + pctEtano * ETANO.H + pctPropano * PROPANO_GN.H + pctButano * BUTANO_GN.H
  );
  const numOxigeno = PM_O2 * pctDioxidoC;
  const numNitrogeno = PM_N2 * pctNitrogeno;
  const denom = numCarbono + numHidrogeno + numOxigeno + numNitrogeno;

  const xCarbono = numCarbono / denom;
  const xHidrogeno = numHidrogeno / denom;
  const xOxigeno = numOxigeno / denom;
  const xNitrogeno = numNitrogeno / denom;

  // F45 — PCI por masa (metano/etano/propano/butano; CO2 y N2 no aportan)
  const pciMasa = xMetanoMasa * METANO.PCI + xEtanoMasa * ETANO.PCI
    + xPropanoMasa * PROPANO_GN.PCI + xButanoMasa * BUTANO_GN.PCI;
  const pcsMasa = xMetanoMasa * METANO.PCS + xEtanoMasa * ETANO.PCS
    + xPropanoMasa * PROPANO_GN.PCS + xButanoMasa * BUTANO_GN.PCS;

  // Red de Gas (AGREGADO 2026-09-25): densidad relativa, PCS volumétrico a
  // 15 °C/1 atm y pseudocríticas de Kay (promedio molar), en vez de los
  // valores fijos por gas que el Excel usaba sin mirar la composición.
  const densidadReferencia = 101.325 / r / T_REFERENCIA_VOLUMEN_K;
  const kay = (campo, co2, n2) => (
    pctMetano * METANO[campo] + pctEtano * ETANO[campo] + pctPropano * PROPANO_GN[campo]
    + pctButano * BUTANO_GN[campo] + pctDioxidoC * co2 + pctNitrogeno * n2
  ) / (pctMetano + pctEtano + pctPropano + pctButano + pctDioxidoC + pctNitrogeno);

  return {
    pm, r, densidadNormal, xMetanoMasa, xEtanoMasa, xPropanoMasa, xButanoMasa,
    xDioxidoCMasa, xNitrogenoMasa, xCarbono, xHidrogeno, xOxigeno, xNitrogeno, pciMasa, pcsMasa,
    densidadRelativa: pm / PM_AIRE,
    pcsVolumetricoMJm3: (pcsMasa * densidadReferencia) / 1000,
    temperaturaCriticaK: kay('Tc', CRITICAS_CO2.Tc, CRITICAS_N2.Tc),
    presionCriticaBar: kay('Pc', CRITICAS_CO2.Pc, CRITICAS_N2.Pc),
    factorAcentrico: kay('w', CRITICAS_CO2.w, CRITICAS_N2.w),
  };
}

export function densidadCondiciones({ presionKPa, temperaturaC, r }) {
  // Combustión Gas!F44 = (101.325+F42)/F35/(273.15+F43)
  return (101.325 + presionKPa) / r / (273.15 + temperaturaC);
}
