// Motor de cálculo de la pestaña "Red de Gas" — dimensionamiento de
// tubería para GLP y GN. Fuente: Libro11111111.xlsx, hoja
// "Bases de Cálculo" (celdas citadas por bloque).
//
// Propiedades del gas DESDE LA COMPOSICIÓN (CORREGIDO 2026-09-25,
// auditoría de coherencia física): el Excel usaba valores fijos por gas
// (Bases de Cálculo!B18/B19 y la tabla I40:L47) — GLP con PC = 119,7 MJ/m³
// y densidad relativa 2, que son de butano casi puro, aunque el resto del
// módulo trabaja con la composición ingresada (70/30 propano/butano por
// defecto); además usaba DOS densidades relativas distintas para el mismo
// gas (2 en baja presión, 1,81 en el factor Cr). Ahora densidad relativa,
// poder calorífico volumétrico y pseudocríticas salen de la composición
// (gas-glp.js / gas-gn.js), con una sola densidad relativa por gas. El
// poder calorífico sigue en la base que tenía el Excel: PCS por m³ a
// 15 °C y 1 atm (con la composición de GN por defecto da 37,47 MJ/m³ contra
// los 37,54 fijos del Excel). La viscosidad sigue fija por gas (entra
// elevada a 0,152 en Cr: su efecto es marginal).
import { propiedadesGLP, presionRocioGLPPa } from './gas-glp.js';
import { propiedadesGN } from './gas-gn.js';
import {
  buscarTuberiaRedGas, perdidaAdmisiblePa, perdidaAdmisibleMediaPresionPa, factorZPengRobinson,
  factorSuperexpansion, factorCr, perdidaPresionBajaPresion, perdidaPresionMediaAltaPresion,
  P_ATMOSFERICA_PA,
} from './pipe-network.js';

// Composición por defecto del módulo (la misma que precargan los
// formularios de Combustión, Quemador y Estanque). Se usa también cuando
// un tramo o un proyecto guardado antes del 2026-09-25 no trae composición.
export const COMPOSICION_POR_DEFECTO = {
  GLP: { pctButano: 0.3, pctPropano: 0.7 },
  GN: { pctMetano: 0.97, pctEtano: 0.011, pctPropano: 0.001, pctButano: 0.001, pctDioxidoC: 0.01, pctNitrogeno: 0.007 },
};

// Bases de Cálculo!K45:K46 [cP]
export const VISCOSIDAD_CP = { GLP: 0.008, GN: 0.012 };

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

export function propiedadesRedGas(gas, composicion) {
  const comp = composicion ?? COMPOSICION_POR_DEFECTO[gas];
  const p = gas === 'GLP' ? propiedadesGLP(comp) : propiedadesGN(comp);
  return {
    pcsVolumetricoMJm3: p.pcsVolumetricoMJm3,
    densidadRelativa: p.densidadRelativa,
    viscosidadCp: VISCOSIDAD_CP[gas],
    temperaturaCriticaK: p.temperaturaCriticaK,
    presionCriticaBar: p.presionCriticaBar,
    factorAcentrico: p.factorAcentrico,
  };
}

export function calcularRedGas(inputs) {
  const {
    gas, composicion, regimenPresion, material, pulgadas, potenciaKw, longitudM, presionInicialPa, temperaturaC,
    tuberiaManual, desnivelM = 0,
  } = inputs;
  const comp = composicion ?? COMPOSICION_POR_DEFECTO[gas];
  const propiedades = propiedadesRedGas(gas, comp);
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

  // Bases de Cálculo!B21 = B20*B19/3.6, invertido: caudal objetivo = Potencia*3.6/PC
  // [m³/h a 15 °C y 1 atm, la base del poder calorífico volumétrico]
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
  const presionRocioAbsPa = gas === 'GLP' ? presionRocioGLPPa({ ...comp, temperaturaC }) : null;
  const riesgoCondensacion = presionRocioAbsPa !== null
    && presionInicialPa + P_ATMOSFERICA_PA >= presionRocioAbsPa;

  return {
    tuberia, diametroMm, caudalObjetivoM3H, caudalRealM3H, perdidaPresionRequeridaPa, presionFinalPa,
    desnivelM, variacionPresionAlturaPa: variacionAlturaPa, perdidaPresionTotalPa,
    alturaObligatoriaDS66: Math.abs(desnivelM) > DESNIVEL_OBLIGATORIO_M,
    velocidadMS, volumenTuberiaM3, perdidaAdmisiblePa: perdidaAdmisiblePaValor, tuberiaAdecuada,
    z, densidadRelativa: propiedades.densidadRelativa, pcsVolumetricoMJm3: propiedades.pcsVolumetricoMJm3,
    presionRocioAbsPa, riesgoCondensacion,
  };
}
