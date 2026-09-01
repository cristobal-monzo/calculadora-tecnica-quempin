// Dimensionamiento de red de gas GLP/GN — fórmulas de Renouard (baja
// presión <10 kPa, media/alta presión >10 kPa) + factor de compresibilidad
// Z real (Peng-Robinson). Fuente: Libro11111111.xlsx, hoja
// "Bases de Cálculo" (celdas citadas por función). Analizado 2026-09-01.

// Tabla de tubería — Bases de Cálculo!I3:N13. Los valores de "Diámetro^5"
// son los que aparecen literalmente en el Excel (no siempre son DI^5 con
// precisión exacta — parecen valores nominales de una tabla de referencia
// de ingeniería, no recalculados a partir del DI de esta misma fila; se
// preservan tal cual, no se recalculan).
export const TABLA_TUBERIA_RED_GAS = [
  { pulgadas: 0.25,  diAceroMm: 10.4,  diCobreMm: 10.4,  d5Acero: 121665.29024000003, d5Cobre: 121665.29024000003, k: 1800 },
  { pulgadas: 0.375, diAceroMm: 12.53, diCobreMm: 10.92, d5Acero: 190000,             d5Cobre: 155279.1667295232,  k: 1800 },
  { pulgadas: 0.5,   diAceroMm: 15.8,  diCobreMm: 13.84, d5Acero: 630000,             d5Cobre: 507785.6816103424,  k: 1800 },
  { pulgadas: 0.75,  diAceroMm: 20.93, diCobreMm: 19.94, d5Acero: 2860000,            d5Cobre: 3152287.1372952233, k: 1800 },
  { pulgadas: 1,     diAceroMm: 26.64, diCobreMm: 26.04, d5Acero: 10100000,           d5Cobre: 11973052.848972902, k: 1800 },
  { pulgadas: 1.25,  diAceroMm: 35.05, diCobreMm: 32.12, d5Acero: 42000000,           d5Cobre: 34188313.91992247,  k: 1980 },
  { pulgadas: 1.5,   diAceroMm: 40.89, diCobreMm: 38.24, d5Acero: 94600000,           d5Cobre: 81769137.72173066,  k: 1980 },
  { pulgadas: 2,     diAceroMm: 52.5,  diCobreMm: 50.42, d5Acero: 338000000,          d5Cobre: 325847359.9923092,  k: 2160 },
  { pulgadas: 2.5,   diAceroMm: 62.71, diCobreMm: 62.62, d5Acero: 872000000,          d5Cobre: 962864813.6585747,  k: 2160 },
  { pulgadas: 3,     diAceroMm: 77.92, diCobreMm: 75.25, d5Acero: 2874000000,         d5Cobre: 2412862208.4970703, k: 2340 },
  { pulgadas: 4,     diAceroMm: 102.26, diCobreMm: 99.2, d5Acero: 11180000000,        d5Cobre: 9606349004.472322,  k: 2420 },
];

export function buscarTuberiaRedGas(pulgadas) {
  const fila = TABLA_TUBERIA_RED_GAS.find((f) => f.pulgadas === pulgadas);
  if (!fila) throw new Error(`Diámetro no encontrado en la tabla de red de gas: ${pulgadas}"`);
  return fila;
}

// Pérdida de presión admisible — Bases de Cálculo!B17 = IF(B5="GLP",150,120)
export function perdidaAdmisiblePa(gas) {
  return gas === 'GLP' ? 150 : 120;
}

// Factor de compresibilidad Z (Peng-Robinson), evaluado siempre a 293.15 K
// (20°C) igual que en el Excel fuente — Bases de Cálculo!N40:R41.
export function factorZPengRobinson({ presionBarG, temperaturaCriticaK, presionCriticaBar, factorAcentrico }) {
  const R = 0.08314;
  const a = 0.45724 * ((R ** 2 * temperaturaCriticaK ** 2) / presionCriticaBar)
    * (1 + (0.37464 + 1.54226 * factorAcentrico - 0.26992 * factorAcentrico ** 2) * (1 - Math.sqrt(293.15 / temperaturaCriticaK))) ** 2;
  const b = 0.0778 * (R * temperaturaCriticaK / presionCriticaBar);
  const presionBar = presionBarG; // Bases de Cálculo!M40 = $B$8/100000, con B8 ya en Pa manométrico
  const A = (a * presionBar) / (R ** 2 * 293.15 ** 2);
  const B = (b * presionBar) / (R * 293.15);
  return 1 + B - A;
}

export function factorSuperexpansion(z) {
  // Bases de Cálculo!B37 = 1/Z
  return 1 / z;
}

export function factorCr({ densidadRelativa, viscosidadCp, temperaturaC }) {
  // Bases de Cálculo!B38 = 0.00639*densidadRelativa*(T+273)*((viscosidad/densidadRelativa)^0.152)
  return 0.00639 * densidadRelativa * (temperaturaC + 273) * ((viscosidadCp / densidadRelativa) ** 0.152);
}

// --- Renouard: caudal <10 kPa, dado ΔP ---
export function caudalBajaPresion({ k, diametro5, perdidaPresionPa, densidadRelativa, longitudM }) {
  // Bases de Cálculo!B20 (rama <10kPa) = 9.65e-7.5*K*(D^5*ΔP/(SG*L))^0.5
  return 9.65 * 10 ** -7.5 * k * Math.sqrt((diametro5 * perdidaPresionPa) / (densidadRelativa * longitudM));
}

// --- Renouard: ΔP requerida <10kPa dado el caudal objetivo (inversión algebraica) ---
export function perdidaPresionBajaPresion({ k, diametro5, caudalM3H, densidadRelativa, longitudM }) {
  return ((caudalM3H / (9.65 * 10 ** -7.5 * k)) ** 2) * (densidadRelativa * longitudM) / diametro5;
}

// --- Renouard: caudal >10 kPa, dado ΔP ---
export function caudalMediaAltaPresion({ diametroMm, presionInicialPa, perdidaPresionPa, factorSuperexp, factorCr: cr, longitudM }) {
  // Bases de Cálculo!B20 (rama >10kPa) =
  //   0.12426*D^2.623*((P1/1e5)^2-((P1-ΔP)/1e5)^2)*(Fs/(Cr*L))^0.541
  const presionFinalPa = presionInicialPa - perdidaPresionPa;
  const terminoPresion = (presionInicialPa / 100000) ** 2 - (presionFinalPa / 100000) ** 2;
  const terminoGas = (factorSuperexp / (cr * longitudM)) ** 0.541;
  return 0.12426 * (diametroMm ** 2.623) * terminoPresion * terminoGas;
}

// --- Renouard: ΔP requerida >10kPa dado el caudal objetivo (inversión algebraica) ---
export function perdidaPresionMediaAltaPresion({ diametroMm, presionInicialPa, caudalM3H, factorSuperexp, factorCr: cr, longitudM }) {
  const terminoGas = (factorSuperexp / (cr * longitudM)) ** 0.541;
  const constante = 0.12426 * (diametroMm ** 2.623) * terminoGas;
  const p1Bar = presionInicialPa / 100000;
  const p2BarCuadrado = p1Bar ** 2 - caudalM3H / constante;
  if (p2BarCuadrado < 0) {
    throw new Error('El caudal objetivo excede lo que este diámetro puede entregar a la presión inicial dada.');
  }
  const p2Bar = Math.sqrt(p2BarCuadrado);
  return presionInicialPa - p2Bar * 100000;
}
