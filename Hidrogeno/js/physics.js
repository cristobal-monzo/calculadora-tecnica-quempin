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

export function celsiusAKelvin(temperaturaC) {
  // Único lugar del módulo donde vive la conversión a temperatura absoluta
  // (2026-09-08): la correlación de compresibilidad Z y la densidad real la
  // necesitan, y antes cada una repetía el `+ 273.15` (o peor, `+ 273` —
  // ver factorZHidrogeno en gas-h2.js).
  return temperaturaC + 273.15;
}

export function densidadReal({ presionAbsPa, temperaturaC, masaMolar, constanteR, z }) {
  // Cálculo!C20 = ((1+C3)*100000*C18)/(C26*C19*(C4+273.15))
  return (presionAbsPa * masaMolar) / (z * constanteR * celsiusAKelvin(temperaturaC));
}

export function presionMaximaDiseno({ limiteElasticoMPa, espesorMm, diametroExteriorMm, factorDiseno, factorUnion, factorHf = 1, factorT = 1 }) {
  // Cálculo!C10 = 10*((2*$K$3*$J$3)/$I$3)*$C$28*$C$29*1*1  (Barlow, ASME B31.12)
  // factorHf (Tabla IX-5A de ASME B31.12, derating por fragilización de
  // hidrógeno) y factorT (Tabla PL-3.7.1(b)(8), derating por temperatura)
  // AGREGADOS respecto al Excel fuente (2026-09-02, a pedido del usuario):
  // el Excel no aplicaba ninguno de los dos. Fórmula completa de la norma:
  // P = 2·S·t·F·E·Hf·T/D. Ver Hidrogeno/CLAUDE.md.
  // D es el diámetro EXTERIOR (PL-3.7.1). El Excel dividía por su columna
  // "DI", que en 3/4" y 1" era el interior (corregido 2026-09-25, ver
  // TABLA_TUBERIA en gas-h2.js).
  return 10 * ((2 * limiteElasticoMPa * espesorMm) / diametroExteriorMm) * factorDiseno * factorUnion * factorHf * factorT;
}

export function velocidadErosion({ zErosion, temperaturaC, presionMinBarG, gravedadEspecifica }) {
  // Cálculo!C14 — API RP 14E, unidades US convertidas a m/s
  const rankine = (temperaturaC + 273) * (9 / 5);
  const psia = (1 + presionMinBarG) * 14.5;
  const piesPorSegundo = 100 * Math.sqrt((zErosion * 10.73 * rankine) / (29 * gravedadEspecifica * psia));
  return piesPorSegundo * 0.3048;
}

// Screening simplificado de caída de presión / proximidad a flujo sónico
// (AGREGADO 2026-09-08, a pedido del usuario — no está en el Excel fuente).
//
// Es un chequeo ADICIONAL e independiente de velocidadErosion() / API RP 14E:
// no lo reemplaza ni modifica su criterio. Responde una pregunta distinta —
// no "¿la velocidad erosiona la pared?" sino "¿la caída de presión es lo
// bastante grande como para que alguna restricción esté cerca de estrangular
// el flujo?".
//
//   x                      = (P1_abs - P2_abs) / P1_abs
//   relacionPresionCritica = (2/(gamma+1))^(gamma/(gamma-1))   [gas ideal]
//   caidaPresionCritica    = 1 - relacionPresionCritica
//
// Para gamma=1.40 (H₂ ideal) la relación crítica vale 0.5283 y la caída
// crítica 0.4717 (~47.2%). Es una aproximación de GAS IDEAL: una válvula
// real estrangula a otra relación de presión según su geometría y su xT.
// Deliberadamente NO se pide Cv, xT ni datos del fabricante — por eso es un
// screening conservador y no un dimensionamiento de válvula.
//
// Agnóstica de unidad: P1 y P2 pueden venir en cualquier unidad mientras
// ambas sean ABSOLUTAS y la misma (los ratios son adimensionales). Quien
// llama es responsable de convertir desde manométrica (ver barGaugeAPaAbs).
export function chequeoCaidaPresion({ presionAguasArribaAbs, presionAguasAbajoAbs, gamma }) {
  const relacionPresionCritica = Math.pow(2 / (gamma + 1), gamma / (gamma - 1));
  const caidaPresionCritica = 1 - relacionPresionCritica;

  // Fuera de dominio: sin P1 positiva no hay ratio que calcular, y con
  // P2 > P1 esto no es una caída de presión (el screening no aplica).
  const aplica = Number.isFinite(presionAguasArribaAbs) && Number.isFinite(presionAguasAbajoAbs)
    && presionAguasArribaAbs > 0 && presionAguasAbajoAbs >= 0
    && presionAguasAbajoAbs <= presionAguasArribaAbs;

  if (!aplica) {
    return {
      aplica: false, estado: 'no-aplica',
      x: null, caidaPresionPorcentaje: null, relacionPresion: null,
      relacionPresionCritica, caidaPresionCritica,
    };
  }

  const x = (presionAguasArribaAbs - presionAguasAbajoAbs) / presionAguasArribaAbs;
  const relacionPresion = presionAguasAbajoAbs / presionAguasArribaAbs;

  // Umbral de 0.10 provisto por el usuario; el umbral crítico es el valor
  // calculado arriba, no el 0.472 redondeado, para que la frontera sea
  // consistente con relacionPresionCritica.
  let estado;
  if (x <= 0.10) estado = 'ok';
  else if (x < caidaPresionCritica) estado = 'advertencia';
  else estado = 'critico';

  return {
    aplica: true, estado,
    x, caidaPresionPorcentaje: x * 100, relacionPresion,
    relacionPresionCritica, caidaPresionCritica,
  };
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
