// Motor de cálculo de la pestaña "Red de Gas" — dimensionamiento de
// tubería para GLP y GN según el D.S. 66 (sección e, fórmulas f.1–f.5 y
// e.2). Fuente original: Libro11111111.xlsx, hoja "Bases de Cálculo"
// (celdas citadas por bloque).
//
// Propiedades del gas SEGÚN LA TABLA VI DEL D.S. 66 (2026-09-25): el
// decreto toma d, PCS y viscosidad "según Tabla VI", fijos por tipo de gas
// y región — no de la composición. Una primera versión de este mismo día
// los derivaba de la composición; con la tabla del decreto a la vista
// (provista por el usuario) se volvió a los valores normativos, que son
// los que el Excel ya usaba para GLP (Licuado: d 2,0 / 119,7 MJ/m³) y para
// el PCS del GN (37,54 MJ/m³). Una sola d por gas (el Excel usaba además
// 1,81/0,62 en el factor Cr; el decreto usa la misma S). Ver
// GasNatural-GLP/CLAUDE.md.
import { presionRocioGLPPa, PROPANO, BUTANO } from './gas-glp.js';
import { METANO, PM_AIRE } from './gas-gn.js';
import {
  buscarTuberiaRedGas, perdidaAdmisiblePa, perdidaAdmisibleMediaPresionPa, factorZPengRobinson,
  factorSuperexpansion, factorCr, perdidaPresionBajaPresion, perdidaPresionMediaAltaPresion,
  P_ATMOSFERICA_PA,
} from './pipe-network.js';

// D.S. 66, Tabla VI — propiedades físicas de los gases, condiciones de
// referencia 15 °C y 101,3 kPa (las mismas del m³S de f.3/f.5). Se omiten
// las filas de gas de Ciudad: no es GLP ni GN, y la tabla no les asigna
// viscosidad (necesaria para Cr en media presión).
export const TABLA_VI_DS66 = {
  GLP: [
    { id: 'licuado', nombre: 'Licuado (Iª a XIIª Región)', densidadRelativa: 2.0, pcsMJm3: 119.7, viscosidadCp: 0.008 },
    { id: 'licuado-catalitico', nombre: 'Licuado catalítico (Iª a XIIª Región)', densidadRelativa: 1.6, pcsMJm3: 95.04, viscosidadCp: 0.008 },
  ],
  GN: [
    { id: 'natural-v-rm', nombre: 'Natural — Vª y Metropolitana', densidadRelativa: 0.87, pcsMJm3: 37.54, viscosidadCp: 0.012 },
    { id: 'natural-viii', nombre: 'Natural — VIIIª Región', densidadRelativa: 0.89, pcsMJm3: 40.56, viscosidadCp: 0.012 },
    { id: 'natural-xii', nombre: 'Natural — XIIª Región', densidadRelativa: 0.88, pcsMJm3: 39.73, viscosidadCp: 0.012 },
  ],
};

export const GAS_TABLA_VI_POR_DEFECTO = { GLP: 'licuado', GN: 'natural-v-rm' };

export function buscarGasTablaVI(gas, id) {
  const filas = TABLA_VI_DS66[gas];
  return filas.find((f) => f.id === id) ?? filas.find((f) => f.id === GAS_TABLA_VI_POR_DEFECTO[gas]);
}

// Composición REAL del GLP por defecto (la misma que precargan Combustión,
// Quemador y Estanque). En Red de Gas se usa SOLO para verificar
// condensación: la Tabla VI es una convención de diseño para la pérdida de
// carga (d 2,0 = butano casi puro) y no dice qué condensa en la cañería.
export const COMPOSICION_POR_DEFECTO = {
  GLP: { pctButano: 0.3, pctPropano: 0.7 },
};

// Constantes críticas para Y = 1/Z (Peng-Robinson, f.3). El decreto no
// dice cómo obtener Z; se usan pseudocríticas de Kay coherentes con la d de
// la Tabla VI: en GLP, la mezcla propano/butano que tiene esa d (Licuado
// d 2,0 → ~99 % butano; catalítico d 1,6 → ~16 % butano); en GN, las del
// metano (Bases de Cálculo!J41:L41, las que usaba el Excel). A presiones de
// red Z vale 0,97–1,00 y entra elevado a 0,541.
function criticasParaZ(gas, densidadRelativa) {
  if (gas !== 'GLP') return { Tc: METANO.Tc, Pc: METANO.Pc, w: METANO.w };
  const yButano = Math.min(1, Math.max(0, (densidadRelativa * PM_AIRE - PROPANO.PM) / (BUTANO.PM - PROPANO.PM)));
  const kay = (campo) => yButano * BUTANO[campo] + (1 - yButano) * PROPANO[campo];
  return { Tc: kay('Tc'), Pc: kay('Pc'), w: kay('w') };
}

export function propiedadesRedGas(gas, gasTablaVI) {
  const fila = buscarGasTablaVI(gas, gasTablaVI);
  const criticas = criticasParaZ(gas, fila.densidadRelativa);
  return {
    gasTablaVI: fila.id,
    nombreTablaVI: fila.nombre,
    pcsVolumetricoMJm3: fila.pcsMJm3,
    densidadRelativa: fila.densidadRelativa,
    viscosidadCp: fila.viscosidadCp,
    temperaturaCriticaK: criticas.Tc,
    presionCriticaBar: criticas.Pc,
    factorAcentrico: criticas.w,
  };
}

// D.S. 66, e.2 — variación de la presión con la altura:
//   Δph = 12·(1 − d)·h   [Pa], d = densidad relativa (aire = 1), h [m]
// Positiva = el gas GANA presión al subir (GN, más liviano que el aire);
// negativa = la PIERDE (GLP, más pesado). El decreto la exige cuando los
// artefactos están más de 10 m sobre el punto de abastecimiento; para GLP
// permite despreciarla si se compensa subiendo la presión del regulador
// (hasta 3,24 kPa). La app la aplica siempre que se ingrese un desnivel.
export function variacionPresionAlturaPa({ densidadRelativa, desnivelM }) {
  // (sin desnivel devuelve 0 exacto, no −0 — se mostraría "−0" en pantalla)
  return desnivelM ? 12 * (1 - densidadRelativa) * desnivelM : 0;
}
export const DESNIVEL_OBLIGATORIO_M = 10;

// D.S. 66, f.5 — velocidad del flujo [m/s]:
//   V = 1,25 · Q · T / (p2 · D²)
// Q [m³S/h, a 15 °C y 1,013 bar], T [K], p2 presión ABSOLUTA final [bar],
// D diámetro interior [mm]. El 1,25 resume 1,013·4·10⁶/(288·3600·π): es la
// velocidad real a p2 y T, sin factor Z.
export function velocidadDS66({ caudalM3H, temperaturaK, presionFinalAbsBar, diametroMm }) {
  return 1.25 * caudalM3H * temperaturaK / (presionFinalAbsBar * diametroMm ** 2);
}

export function calcularRedGas(inputs) {
  const {
    gas, gasTablaVI, composicion, regimenPresion, material, pulgadas, potenciaKw, longitudM, presionInicialPa,
    temperaturaC, tuberiaManual, desnivelM = 0,
  } = inputs;
  const propiedades = propiedadesRedGas(gas, gasTablaVI);
  const temperaturaK = temperaturaC + 273.15;

  // Diámetro manual [mm] (2026-09-02, a pedido del usuario, "listado más
  // amplio de tuberías... ingresar manualmente un valor de diámetro"): sin
  // fila de tabla no hay material (acero/cobre son solo dos DI distintos de
  // la misma fila) — el usuario da un único DI, y d5 = DI^5 (igual que en
  // toda la tabla desde 2026-09-25, ver pipe-network.js). k (factor de
  // rugosidad, solo usado en baja presión) también lo da el usuario, ya
  // que no hay forma de derivarlo del diámetro solo.
  let tuberia = null;
  let diametroMm, diametro5, k;
  if (tuberiaManual) {
    diametroMm = tuberiaManual.diametroMm;
    diametro5 = diametroMm ** 5;
    k = tuberiaManual.k;
  } else {
    tuberia = buscarTuberiaRedGas(pulgadas);
    diametroMm = material === 'Acero Sch40' ? tuberia.diAceroMm : tuberia.diCobreMm;
    diametro5 = material === 'Acero Sch40' ? tuberia.d5Acero : tuberia.d5Cobre;
    k = tuberia.k;
  }

  // D.S. 66 f.2/f.4 (P = Q·PCS/3,6), despejado: caudal = Potencia·3,6/PCS
  // [m³S/h, a 15 °C y 101,3 kPa, la base del PCS de la Tabla VI]
  const caudalObjetivoM3H = (potenciaKw * 3.6) / propiedades.pcsVolumetricoMJm3;

  // Z a la presión inicial ABSOLUTA y la temperatura real (pipe-network.js)
  const z = factorZPengRobinson({
    presionAbsBar: (presionInicialPa + P_ATMOSFERICA_PA) / 100000,
    temperaturaK,
    temperaturaCriticaK: propiedades.temperaturaCriticaK,
    presionCriticaBar: propiedades.presionCriticaBar,
    factorAcentrico: propiedades.factorAcentrico,
  });

  let perdidaPresionRequeridaPa;
  let presionFinalPa = null;
  const mediaPresion = regimenPresion !== '<10 kPa';

  if (!mediaPresion) {
    perdidaPresionRequeridaPa = perdidaPresionBajaPresion({
      k, diametro5, caudalM3H: caudalObjetivoM3H,
      densidadRelativa: propiedades.densidadRelativa, longitudM,
    });
  } else {
    const cr = factorCr({
      densidadRelativa: propiedades.densidadRelativa, viscosidadCp: propiedades.viscosidadCp, temperaturaC,
    });
    perdidaPresionRequeridaPa = perdidaPresionMediaAltaPresion({
      diametroMm, presionInicialPa, caudalM3H: caudalObjetivoM3H,
      factorSuperexp: factorSuperexpansion(z), factorCr: cr, longitudM,
    });
    presionFinalPa = presionInicialPa - perdidaPresionRequeridaPa;
  }

  // Variación de presión por altura (D.S. 66 e.2, AGREGADA 2026-09-25):
  // `desnivelM` = cota final − cota inicial del tramo (positivo si sube).
  // La pérdida TOTAL del tramo es la de fricción (Renouard) menos lo que
  // se gana por altura (o más lo que se pierde); es la que se compara con
  // la admisible y la que se acumula en la Memoria. perdidaPresionRequeridaPa
  // sigue siendo solo la de fricción.
  const variacionAlturaPa = variacionPresionAlturaPa({ densidadRelativa: propiedades.densidadRelativa, desnivelM });
  const perdidaPresionTotalPa = perdidaPresionRequeridaPa - variacionAlturaPa;
  if (mediaPresion) presionFinalPa = presionInicialPa - perdidaPresionTotalPa;

  // Velocidad del flujo — D.S. 66 f.5 (ALINEADA 2026-09-25): real, a la
  // presión absoluta FINAL del tramo (la más baja = la velocidad más alta)
  // y a la temperatura del gas, sin factor Z, con la constante 1,25 del
  // decreto. Se aplica en los dos regímenes (en baja presión p2 ≈ 1 atm).
  const presionFinalAbsPa = presionInicialPa - perdidaPresionTotalPa + P_ATMOSFERICA_PA;
  const velocidadMS = velocidadDS66({
    caudalM3H: caudalObjetivoM3H, temperaturaK, presionFinalAbsBar: presionFinalAbsPa / 100000, diametroMm,
  });
  const diametroM = diametroMm / 1000;
  const areaM2 = Math.PI * diametroM ** 2 / 4;
  const caudalRealM3H = velocidadMS * areaM2 * 3600;
  const volumenTuberiaM3 = areaM2 * longitudM;

  const perdidaAdmisiblePaValor = mediaPresion
    ? perdidaAdmisibleMediaPresionPa(presionInicialPa)
    : perdidaAdmisiblePa(gas);
  const tuberiaAdecuada = perdidaPresionTotalPa <= perdidaAdmisiblePaValor;

  // Condensación del GLP (AGREGADO 2026-09-25): si la presión absoluta de
  // la línea alcanza la presión de rocío de la mezcla a esa temperatura, el
  // GLP condensa en la cañería y el cálculo de gas deja de aplicar. Se
  // evalúa a la presión inicial (la más alta del tramo). El GN no condensa
  // a presiones de distribución.
  const comp = composicion ?? COMPOSICION_POR_DEFECTO.GLP;
  const presionRocioAbsPa = gas === 'GLP' ? presionRocioGLPPa({ ...comp, temperaturaC }) : null;
  const riesgoCondensacion = presionRocioAbsPa !== null
    && presionInicialPa + P_ATMOSFERICA_PA >= presionRocioAbsPa;

  return {
    tuberia, diametroMm, caudalObjetivoM3H, caudalRealM3H, perdidaPresionRequeridaPa, presionFinalPa,
    desnivelM, variacionPresionAlturaPa: variacionAlturaPa, perdidaPresionTotalPa,
    alturaObligatoriaDS66: Math.abs(desnivelM) > DESNIVEL_OBLIGATORIO_M,
    velocidadMS, volumenTuberiaM3, perdidaAdmisiblePa: perdidaAdmisiblePaValor, tuberiaAdecuada,
    z, densidadRelativa: propiedades.densidadRelativa, pcsVolumetricoMJm3: propiedades.pcsVolumetricoMJm3,
    gasTablaVI: propiedades.gasTablaVI, nombreTablaVI: propiedades.nombreTablaVI,
    // D.S. 66 Tabla IX cubre de 3/8" a 4": fuera de ese rango el K de la
    // tabla de la app es extrapolado (solo importa en baja presión).
    kFueraDeTablaIX: !mediaPresion && tuberia !== null && !tuberia.kTablaIX,
    presionRocioAbsPa, riesgoCondensacion,
  };
}
