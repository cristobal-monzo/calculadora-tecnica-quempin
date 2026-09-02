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

export function presionMaximaDiseno({ limiteElasticoMPa, espesorMm, diametroMm, factorDiseno, factorUnion, factorHf = 1 }) {
  // Cálculo!C10 = 10*((2*$K$3*$J$3)/$I$3)*$C$28*$C$29*1*1  (Barlow, ASME B31.12)
  // factorHf (Tabla IX-5A de ASME B31.12, derating por fragilización de
  // hidrógeno) AGREGADO respecto al Excel fuente (2026-09-02, a pedido del
  // usuario): el Excel no lo aplicaba en absoluto. Ver Hidrogeno/CLAUDE.md.
  return 10 * ((2 * limiteElasticoMPa * espesorMm) / diametroMm) * factorDiseno * factorUnion * factorHf;
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
  // Cálculo!C31 = L3/($I$3/1000) — CORREGIDO respecto al Excel fuente
  // (2026-09-02, a pedido del usuario): el Excel dividía la rugosidad
  // (rugosidadMm, en milímetros) por el diámetro ya convertido a METROS,
  // sin reconvertir — da una "rugosidad relativa" ~1000x más alta que la
  // real (ej. 0.157 en vez de 0.000157 para tubería estirada, físicamente
  // imposible: implicaría una rugosidad del 16% del diámetro). Acá se
  // reconvierte el diámetro a mm antes de dividir. Ver Hidrogeno/CLAUDE.md.
  return rugosidadAbsoluta / (diametroM * 1000);
}

export function factorFriccionHaaland({ rugosidadRelativa, reynolds }) {
  // Cálculo!C32 = 1/((-1.8*LOG(($C$31/3.7)^1.11)+(6.9/$C$30)))^2 —
  // CORREGIDO respecto al Excel fuente (2026-09-02, a pedido del usuario):
  // la ecuación de Haaland (1983) publicada suma ambos términos DENTRO del
  // logaritmo (1/√f = -1.8·log10[(ε/D/3.7)^1.11 + 6.9/Re]); el Excel sumaba
  // 6.9/Re fuera del logaritmo. Ver Hidrogeno/CLAUDE.md.
  const termino = -1.8 * Math.log10(Math.pow(rugosidadRelativa / 3.7, 1.11) + 6.9 / reynolds);
  return 1 / Math.pow(termino, 2);
}

export function perdidaCargaTramo({ factorFriccion, longitudM, diametroM, densidad, velocidad, sumaCoeficientesLocales = 0 }) {
  // Cálculo!C16 = (($C$32*$C$8)/(($I$3/1000))+(I6*0.7+J6*2+K6*0.1))*($C$20*($C$15^2)/2)/100
  const terminoFriccion = (factorFriccion * longitudM) / diametroM + sumaCoeficientesLocales;
  const presionDinamicaPa = (densidad * Math.pow(velocidad, 2)) / 2;
  return (terminoFriccion * presionDinamicaPa) / 100; // Pa -> mbar
}
