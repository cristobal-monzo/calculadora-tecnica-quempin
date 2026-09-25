// Dimensionamiento de red de gas GLP/GN — fórmulas de Renouard (baja
// presión <10 kPa, media/alta presión >10 kPa) + factor de compresibilidad
// Z real (Peng-Robinson). Fuente: Libro11111111.xlsx, hoja
// "Bases de Cálculo" (celdas citadas por función). Analizado 2026-09-01.

// Presión atmosférica para pasar de manométrica a absoluta — la misma
// 101,325 kPa que ya usan densidadCondiciones() (gas-gn.js/gas-glp.js) y
// corregirCaudalTP() (combustion.js).
export const P_ATMOSFERICA_PA = 101325;

// Tabla de tubería — Bases de Cálculo!I3:N13 (DI de acero Sch 40 y de
// cobre tipo L) + filas agregadas.
//
// CORREGIDO respecto al Excel fuente (2026-09-25, auditoría de coherencia
// física): la columna "Diámetro^5" del Excel NO era DI^5 en las filas de
// acero de 3/8" a 2-1/2" (equivalía a un diámetro entre 5 y 10 % menor que
// el DI de la misma fila), así que baja presión (que usa d5) y media
// presión (que usa el DI) calculaban la misma tubería con dos diámetros
// distintos. Con d5 = DI^5 la fórmula de baja presión reproduce a Renouard
// clásico (ΔP = 23200·dr·L·Q^1,82·D^-4,82) y a Darcy-Weisbach dentro de
// ~1 % — ver GasNatural-GLP/CLAUDE.md. Ahora d5 se deriva siempre del DI
// (no se guarda aparte). La fila de 1/4" (DI 10,4 mm en acero y en cobre)
// no correspondía a ninguna de las dos normas: se reemplazó por Sch 40
// (0,364" = 9,25 mm, ASME B36.10) y cobre tipo L (0,315" = 8,00 mm,
// ASTM B88).
const FILAS_TUBERIA = [
  { pulgadas: 0.125, diAceroMm: 6.84,  diCobreMm: 4.57,  k: 1800 },
  { pulgadas: 0.25,  diAceroMm: 9.25,  diCobreMm: 8.0,   k: 1800 },
  { pulgadas: 0.375, diAceroMm: 12.53, diCobreMm: 10.92, k: 1800 },
  { pulgadas: 0.5,   diAceroMm: 15.8,  diCobreMm: 13.84, k: 1800 },
  { pulgadas: 0.75,  diAceroMm: 20.93, diCobreMm: 19.94, k: 1800 },
  { pulgadas: 1,     diAceroMm: 26.64, diCobreMm: 26.04, k: 1800 },
  { pulgadas: 1.25,  diAceroMm: 35.05, diCobreMm: 32.12, k: 1980 },
  { pulgadas: 1.5,   diAceroMm: 40.89, diCobreMm: 38.24, k: 1980 },
  { pulgadas: 2,     diAceroMm: 52.5,  diCobreMm: 50.42, k: 2160 },
  { pulgadas: 2.5,   diAceroMm: 62.71, diCobreMm: 62.62, k: 2160 },
  { pulgadas: 3,     diAceroMm: 77.92, diCobreMm: 75.25, k: 2340 },
  { pulgadas: 4,     diAceroMm: 102.26, diCobreMm: 99.2, k: 2420 },
  // 5" a 8": AGREGADAS (2026-09-02, a pedido del usuario, "listado más
  // amplio de tuberías") — el Excel fuente no cubre estos tamaños. DI de
  // acero desde ASME B36.10 Schedule 40 (OD/espesor publicados); DI de
  // cobre desde ASTM B88 tipo L. k se mantiene igual al de 4" (2420, el
  // único valor conocido más cercano) por no tener base para extrapolarlo —
  // antes de usar estos tamaños en baja presión (<10 kPa) para un diseño
  // real, confirmar k con Cristóbal.
  { pulgadas: 5, diAceroMm: 128.2,  diCobreMm: 122.05, k: 2420 },
  { pulgadas: 6, diAceroMm: 154.08, diCobreMm: 145.82, k: 2420 },
  { pulgadas: 8, diAceroMm: 202.74, diCobreMm: 192.61, k: 2420 },
];

// Factor K de baja presión: D.S. 66, Tabla IX — 3/8" a 1" = 1800,
// 1-1/4" a 1-1/2" = 1980, 2" a 2-1/2" = 2160, 3" = 2340, 4" = 2420
// (coincide con la columna del Excel). La tabla no cubre 1/8", 1/4" ni
// 5" a 8": ahí el K es extrapolado (kTablaIX: false) y la UI lo advierte.
const PULGADAS_TABLA_IX = [0.375, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];

export const TABLA_TUBERIA_RED_GAS = FILAS_TUBERIA.map((f) => ({
  ...f, d5Acero: f.diAceroMm ** 5, d5Cobre: f.diCobreMm ** 5,
  kTablaIX: PULGADAS_TABLA_IX.includes(f.pulgadas),
}));

export function buscarTuberiaRedGas(pulgadas) {
  const fila = TABLA_TUBERIA_RED_GAS.find((f) => f.pulgadas === pulgadas);
  if (!fila) throw new Error(`Diámetro no encontrado en la tabla de red de gas: ${pulgadas}"`);
  return fila;
}

// Pérdida de presión admisible — Bases de Cálculo!B17 = IF(B5="GLP",150,120).
// Es el límite de BAJA presión de D.S. 66 (del regulador al artefacto).
export function perdidaAdmisiblePa(gas) {
  return gas === 'GLP' ? 150 : 120;
}

// Media/alta presión (AGREGADO 2026-09-25): el límite de 150/120 Pa de
// arriba es de baja presión, y comparado contra un tramo de media presión
// declaraba "No adecuada" cualquier tubería (mismo problema que ya se había
// corregido en el informe de la Memoria). En media presión se usa el mismo
// criterio de screening que Hidrógeno y Otros Gases ya aplican a la caída
// de presión (umbral provisto por el usuario el 2026-09-08): ΔP ≤ 10 % de
// la presión inicial ABSOLUTA. No es un valor de D.S. 66 (el decreto no
// fija una pérdida admisible de media presión en su sección e); criterio
// confirmado por Cristóbal el 2026-09-25.
export const FRACCION_CAIDA_ADMISIBLE_MEDIA_PRESION = 0.10;

export function perdidaAdmisibleMediaPresionPa(presionInicialPa) {
  return FRACCION_CAIDA_ADMISIBLE_MEDIA_PRESION * (presionInicialPa + P_ATMOSFERICA_PA);
}

// Factor de compresibilidad Z (Peng-Robinson truncado a Z = 1 + B − A,
// válido a las presiones de una red de distribución) — Bases de
// Cálculo!N40:R41.
//
// CORREGIDO respecto al Excel fuente (2026-09-25): el Excel evaluaba la
// ecuación con la presión MANOMÉTRICA (M40 = B8/100000) y a 293,15 K fijos
// sin importar la temperatura ingresada. Una ecuación de estado necesita
// presión absoluta; ahora recibe presión absoluta y la temperatura real.
// Con los mismos argumentos numéricos reproduce R40/R41 del Excel (la
// fórmula no cambió, solo cómo se la alimenta).
export function factorZPengRobinson({ presionAbsBar, temperaturaK, temperaturaCriticaK, presionCriticaBar, factorAcentrico }) {
  const R = 0.08314;
  const a = 0.45724 * ((R ** 2 * temperaturaCriticaK ** 2) / presionCriticaBar)
    * (1 + (0.37464 + 1.54226 * factorAcentrico - 0.26992 * factorAcentrico ** 2) * (1 - Math.sqrt(temperaturaK / temperaturaCriticaK))) ** 2;
  const b = 0.0778 * (R * temperaturaCriticaK / presionCriticaBar);
  const A = (a * presionAbsBar) / (R ** 2 * temperaturaK ** 2);
  const B = (b * presionAbsBar) / (R * temperaturaK);
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

// --- Caudal >10 kPa, dado ΔP ---
//   Q = 0,12426 · D^2,623 · [(P1² − P2²) · Fs / (Cr · L)]^0,541
//   P en bar ABSOLUTOS, D en mm, L en m, Q en m³/h.
//
// CORREGIDO respecto al Excel fuente (2026-09-25, auditoría de coherencia
// física). Bases de Cálculo!B20 (rama >10kPa) tenía dos errores:
//   1. El exponente 0,541 se aplicaba solo a Fs/(Cr·L), no a todo el
//      corchete — 2,623 = 4,848 × 0,541 muestra que el exponente es común
//      a (P1² − P2²) y al resto, como en toda ecuación de flujo de gas de
//      esta familia (Q ∝ ΔP^0,541, no ∝ ΔP).
//   2. P1 y P2 entraban MANOMÉTRICAS en P1² − P2², que exige absolutas.
// Juntos sobrestimaban la pérdida de presión entre 7 y 23 veces. Con las
// dos correcciones, GN 3/4" 150 kW 30 m a 50 kPa man. da 1.601 Pa, contra
// 1.602 Pa de Renouard clásico (P1²−P2² = 48600·dr·L·Q^1,82·D^-4,82) y
// 1.625 Pa de Darcy-Weisbach isotérmico — ver tests/pipe-network.test.js.
function terminoMediaPresion({ diametroMm, factorSuperexp, factorCr: cr, longitudM }) {
  return { constante: 0.12426 * (diametroMm ** 2.623), terminoGas: factorSuperexp / (cr * longitudM) };
}

export function caudalMediaAltaPresion({ diametroMm, presionInicialPa, perdidaPresionPa, factorSuperexp, factorCr: cr, longitudM }) {
  const { constante, terminoGas } = terminoMediaPresion({ diametroMm, factorSuperexp, factorCr: cr, longitudM });
  const p1Bar = (presionInicialPa + P_ATMOSFERICA_PA) / 100000;
  const p2Bar = (presionInicialPa - perdidaPresionPa + P_ATMOSFERICA_PA) / 100000;
  return constante * ((p1Bar ** 2 - p2Bar ** 2) * terminoGas) ** 0.541;
}

// --- ΔP requerida >10kPa dado el caudal objetivo (inversión algebraica) ---
export function perdidaPresionMediaAltaPresion({ diametroMm, presionInicialPa, caudalM3H, factorSuperexp, factorCr: cr, longitudM }) {
  const { constante, terminoGas } = terminoMediaPresion({ diametroMm, factorSuperexp, factorCr: cr, longitudM });
  const p1Bar = (presionInicialPa + P_ATMOSFERICA_PA) / 100000;
  const diferenciaCuadrados = (caudalM3H / constante) ** (1 / 0.541) / terminoGas;
  const p2BarCuadrado = p1Bar ** 2 - diferenciaCuadrados;
  if (p2BarCuadrado < 0) {
    throw new Error('El caudal objetivo excede lo que este diámetro puede entregar a la presión inicial dada.');
  }
  return (p1Bar - Math.sqrt(p2BarCuadrado)) * 100000;
}
