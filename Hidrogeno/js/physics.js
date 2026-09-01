// Funciones puras de mecánica de fluidos compresibles, gas-agnósticas.
// Cada función recibe explícitamente los parámetros físicos que necesita.
// Fuente: Calculos H2.xlsx, hoja "Cálculo" (celda de origen citada por función).

export function barGaugeAPaAbs(bar) {
  // Presión manométrica [bar] -> presión absoluta [Pa], asumiendo 1 bar de
  // presión atmosférica (simplificación usada en todo el Excel fuente).
  return (1 + bar) * 100000;
}

export function barAbsAPaAbs(bar) {
  return bar * 100000;
}

export function densidadReal({ presionAbsPa, temperaturaC, masaMolar, constanteR, z }) {
  // Cálculo!C20 = ((1+C3)*100000*C18)/(C26*C19*(C4+273.15))
  return (presionAbsPa * masaMolar) / (z * constanteR * (temperaturaC + 273.15));
}

export function presionMaximaDiseno({ limiteElasticoMPa, espesorMm, diametroMm, factorDiseno, factorUnion }) {
  // Cálculo!C10 = 10*((2*$K$3*$J$3)/$I$3)*$C$28*$C$29*1*1  (Barlow, ASME B31.12)
  return 10 * ((2 * limiteElasticoMPa * espesorMm) / diametroMm) * factorDiseno * factorUnion;
}

export function velocidadErosion({ zErosion, temperaturaC, presionMinBarG, gravedadEspecifica }) {
  // Cálculo!C14 — API RP 14E, unidades US convertidas a m/s
  const rankine = (temperaturaC + 273) * (9 / 5);
  const psia = (1 + presionMinBarG) * 14.5;
  const piesPorSegundo = 100 * Math.sqrt((zErosion * 10.73 * rankine) / (29 * gravedadEspecifica * psia));
  return piesPorSegundo * 0.3048;
}

export function reynolds({ densidad, velocidad, diametroM, viscosidad }) {
  // Cálculo!C30 = ($C$20*$C$15*($I$3/1000))/(0.00001)
  return (densidad * velocidad * diametroM) / viscosidad;
}

export function rugosidadRelativa({ rugosidadAbsoluta, diametroM }) {
  // Cálculo!C31 = L3/($I$3/1000) — puerto literal (rugosidadAbsoluta ya en
  // la misma escala numérica que la tabla fuente, no se reconvierte).
  return rugosidadAbsoluta / diametroM;
}

export function factorFriccionHaaland({ rugosidadRelativa, reynolds }) {
  // Cálculo!C32 = 1/((-1.8*LOG(($C$31/3.7)^1.11)+(6.9/$C$30)))^2
  const termino = -1.8 * Math.log10(Math.pow(rugosidadRelativa / 3.7, 1.11)) + 6.9 / reynolds;
  return 1 / Math.pow(termino, 2);
}

export function perdidaCargaTramo({ factorFriccion, longitudM, diametroM, densidad, velocidad, sumaCoeficientesLocales = 0 }) {
  // Cálculo!C16 = (($C$32*$C$8)/(($I$3/1000))+(I6*0.7+J6*2+K6*0.1))*($C$20*($C$15^2)/2)/100
  const terminoFriccion = (factorFriccion * longitudM) / diametroM + sumaCoeficientesLocales;
  const presionDinamicaPa = (densidad * Math.pow(velocidad, 2)) / 2;
  return (terminoFriccion * presionDinamicaPa) / 100; // Pa -> mbar
}
