// Física de combustión compartida entre GLP y GN (gas-agnóstica: recibe las
// fracciones de carbono/hidrógeno/oxígeno/nitrógeno del combustible como
// parámetros). Fuente: MASTER DISEÑO.xlsm, hoja "Combustión Gas".
//
// La versión GN de estas fórmulas (Combustión Gas!N7, N15:N18) tiene
// términos extra de oxígeno/nitrógeno de combustible que la versión GLP
// (J8, J17:J20) no tiene — se verificó que la fórmula GN se reduce
// exactamente a la fórmula GLP cuando xOxigeno=xNitrogeno=0, así que acá
// se implementa una sola versión general (parámetros opcionales, default 0).

export function aireEstequiometrico({ xCarbono, xHidrogeno, xOxigeno = 0 }) {
  // Combustión Gas!N7 = 22.4/0.21*($F$36/12.011+$F$37/4.032-F38/31.999)  [Nm3 aire / kg combustible]
  return (22.4 / 0.21) * (xCarbono / 12.011 + xHidrogeno / 4.032 - xOxigeno / 31.999);
}

export function caudalAire({ aireEsteq, lambda, flujoMasicoKgS }) {
  // Combustión Gas!J9 = J8*J3*J5*3600
  return aireEsteq * lambda * flujoMasicoKgS * 3600; // Nm3/h
}

export function corregirCaudalTP({ caudalNm3H, temperaturaC, presionKPa }) {
  // Combustión Gas!J13 = J9*(J11+273.15)/273.15*101.325/(J12+101.325)
  return caudalNm3H * (temperaturaC + 273.15) / 273.15 * 101.325 / (presionKPa + 101.325);
}

// Combustión Gas!N15:N18 (%CO2, %H2O, %O2, %N2 en base húmeda)
export function composicionGasesCombustion({ xCarbono, xHidrogeno, xNitrogeno = 0, aireEsteq, lambda }) {
  const molCO2 = xCarbono / 12.01;
  const molH2O = xHidrogeno / 2.016;
  const molO2Exceso = ((lambda - 1) * 0.21 * aireEsteq) / 22.4;
  const molN2 = (lambda * (1 - 0.21) * aireEsteq) / 22.4 + xNitrogeno / 28.013;
  const total = molCO2 + molH2O + molO2Exceso + molN2;
  return {
    co2: molCO2 / total, h2o: molH2O / total, o2: molO2Exceso / total, n2: molN2 / total,
  };
}

const PM_CO2 = 44.009, PM_H2O = 18.015, PM_O2 = 31.999, PM_N2 = 28.013;

export function propiedadesGasesCombustion({ co2, h2o, o2, n2 }) {
  // Combustión Gas!J21:J23
  const pm = PM_CO2 * co2 + PM_H2O * h2o + PM_O2 * o2 + PM_N2 * n2;
  const r = 8.31447 / pm;
  const densidadNormal = 101.325 / r / 273.15;
  return { pm, r, densidadNormal };
}

// Combustión Gas!I102:L105 — CO2/H2O/N2 estequiométricos por mol de mezcla
// combustible (butano/propano/metano/H2). Los 3 casos que usa el Excel
// fuente (fila 103 = H2 puro, fila 104 = mezcla GLP butano/propano, fila
// 105 = GN simplificado a metano puro) son casos particulares de esta
// misma fórmula general (con los demás términos en cero).
export function gasesEstequiometricosSecos({ molesButano = 0, molesPropano = 0, molesMetano = 0, molesH2 = 0 }) {
  const co2 = 4 * molesButano + 3 * molesPropano + 1 * molesMetano;
  const h2o = 5 * molesButano + 4 * molesPropano + 2 * molesMetano + molesH2;
  const aireEsteqMolar = co2 + h2o / 2;
  const n2 = aireEsteqMolar * 3.76;
  return { co2, h2o, n2, volSecoTeorico: co2 + n2 };
}

export function emisionesNoxAdmisibles({ volSecoTeorico, pciKwhM3, concentracionO2Pct }) {
  // Combustión Gas!J47 = 170/((21/(21-(J44*100)))*2.05*((J46/J45)))
  return 170 / ((21 / (21 - concentracionO2Pct * 100)) * 2.05 * (volSecoTeorico / pciKwhM3));
}

export const EMISION_CO_ADMISIBLE_PPM = 93; // Combustión Gas!J48/N48/R48 — valor fijo, no calculado
