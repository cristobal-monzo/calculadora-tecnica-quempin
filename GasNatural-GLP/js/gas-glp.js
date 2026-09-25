// Propiedades del GLP (mezcla butano/propano) a partir de su composición.
// Fuente: MASTER DISEÑO.xlsm, hoja "Combustión Gas" (columnas E:K,
// celdas citadas por bloque). Analizado 2026-09-01.

// Tc [K], Pc [bar], ω: los que promedia Bases de Cálculo!J40:L40 (GLP
// 50/50 = 397,45 K / 40,23 bar / 0,176) — usados en las pseudocríticas de
// Kay (Peng-Robinson de Red de Gas) y en la presión de vapor (Lee-Kesler).
export const BUTANO = { C: 4, H: 10, PM: 58.124, PCI: 45370, PCS: 49150, Tc: 425.1, Pc: 37.98, w: 0.2 }; // Combustión Gas!B33:B38
export const PROPANO = { C: 3, H: 8, PM: 44.097, PCI: 46340, PCS: 50330, Tc: 369.8, Pc: 42.48, w: 0.152 }; // Combustión Gas!B25:B30

// Masa molar del aire seco y temperatura de referencia del m³ de Red de
// Gas — mismas constantes que gas-gn.js (ver ahí el porqué de 15 °C).
const PM_AIRE = 28.9647;
const T_REFERENCIA_VOLUMEN_K = 288.15;

// Combustión Gas!F4:F19 — propiedades derivadas de la composición molar (%butano/%propano)
export function propiedadesGLP({ pctButano, pctPropano }) {
  // F4 = 1.008*(F2*B34+F3*B26)+12.011*(F2*B33+F3*B25)
  const pm = 1.008 * (pctButano * BUTANO.H + pctPropano * PROPANO.H)
    + 12.011 * (pctButano * BUTANO.C + pctPropano * PROPANO.C);

  const r = 8.31447 / pm; // F7
  const densidadNormal = 101.325 / r / 273.15; // F10 [kg/Nm3]

  const xButanoMasa = (pctButano * BUTANO.PM) / pm; // F5
  const xPropanoMasa = (pctPropano * PROPANO.PM) / pm; // F6

  // F8, F9 — fracciones másicas de C/H para el aire estequiométrico.
  // CORREGIDO 2026-09-25: el Excel ponderaba los átomos por fracción de
  // MASA de cada componente; la masa de cada elemento por mol de mezcla se
  // pondera por fracción MOLAR (mismo criterio que gas-gn.js, ver ahí). En
  // GLP el efecto es chico (xCarbono 0,82116 → 0,82054 con 70/30) porque
  // propano y butano tienen casi la misma relación C/H.
  const numCarbono = 12.011 * (pctButano * BUTANO.C + pctPropano * PROPANO.C);
  const numHidrogeno = 1.008 * (pctPropano * PROPANO.H + pctButano * BUTANO.H);
  const xCarbono = numCarbono / (numCarbono + numHidrogeno);
  const xHidrogeno = numHidrogeno / (numCarbono + numHidrogeno);

  const pciMasa = xButanoMasa * BUTANO.PCI + xPropanoMasa * PROPANO.PCI; // F15
  const pcsMasa = xButanoMasa * BUTANO.PCS + xPropanoMasa * PROPANO.PCS; // F16

  // F45 — PCI simplificado [kWh/m3], usado solo en la emisión NOx admisible (J47)
  const pciSimplificadoKwhM3 = 25.3 * pctPropano + 34.3 * pctButano;

  // Red de Gas (AGREGADO 2026-09-25) — ver gas-gn.js.
  const suma = pctButano + pctPropano;
  const densidadReferencia = 101.325 / r / T_REFERENCIA_VOLUMEN_K;
  const kay = (campo) => (pctButano * BUTANO[campo] + pctPropano * PROPANO[campo]) / suma;

  return {
    pm, r, densidadNormal, xButanoMasa, xPropanoMasa, xCarbono, xHidrogeno,
    pciMasa, pcsMasa, pciSimplificadoKwhM3,
    densidadRelativa: pm / PM_AIRE,
    pcsVolumetricoMJm3: (pcsMasa * densidadReferencia) / 1000,
    temperaturaCriticaK: kay('Tc'),
    presionCriticaBar: kay('Pc'),
    factorAcentrico: kay('w'),
  };
}

export function densidadCondiciones({ presionKPa, temperaturaC, r }) {
  // Combustión Gas!F14 = (F12+101.325)/$F$7/(273.15+F13)
  return (presionKPa + 101.325) / r / (273.15 + temperaturaC);
}

// Presión de vapor de un componente puro — Lee & Kesler (1975), en la
// forma de Poling, Prausnitz & O'Connell, 5ª ed., ec. 7-4.1/7-4.2 (misma
// correlación que OtrosGases/js/termo.js, copiada: cada módulo es
// autocontenido). Contra NIST: propano 8,36 bar y butano 2,08 bar a 20 °C,
// dentro de ~1 %. null sobre la temperatura crítica.
export function presionVaporPa({ Tc, Pc, w }, temperaturaK) {
  const tr = temperaturaK / Tc;
  if (tr >= 1) return null;
  const f0 = 5.92714 - 6.09648 / tr - 1.28862 * Math.log(tr) + 0.169347 * tr ** 6;
  const f1 = 15.2518 - 15.6875 / tr - 13.4721 * Math.log(tr) + 0.43577 * tr ** 6;
  return Pc * 1e5 * Math.exp(f0 + w * f1);
}

// Presión de rocío de la mezcla (AGREGADO 2026-09-25): sobre ella el GLP
// empieza a condensar en la cañería a esa temperatura. Ley de Raoult
// (mezcla ideal, adecuada para propano/butano): 1/P_rocío = Σ yᵢ/Psatᵢ(T).
// Un componente sobre su Tc no condensa y no suma. Con 70 % propano /
// 30 % butano: 4,39 bar abs a 20 °C, 2,27 a 0 °C — o sea, en media presión
// un GLP rico en butano puede llegar líquido al regulador en invierno.
export function presionRocioGLPPa({ pctButano, pctPropano, temperaturaC }) {
  const temperaturaK = temperaturaC + 273.15;
  const suma = pctButano + pctPropano;
  if (!(suma > 0)) return null;
  let inversa = 0;
  for (const [y, componente] of [[pctButano, BUTANO], [pctPropano, PROPANO]]) {
    const psat = presionVaporPa(componente, temperaturaK);
    if (psat !== null && y > 0) inversa += (y / suma) / psat;
  }
  return inversa > 0 ? 1 / inversa : null;
}
