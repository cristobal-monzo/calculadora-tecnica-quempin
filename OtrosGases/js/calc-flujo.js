// Motor de la pestaña "Tubería y Flujo" para un gas cualquiera. Misma
// secuencia de cálculo que Hidrogeno/js/calc-flujo.js (densidad real →
// caudal → velocidad → Reynolds → Haaland → Darcy-Weisbach → screening
// sónico; Barlow para la presión máxima), con estas diferencias:
//   - Z y densidad por Peng-Robinson con las constantes del gas (termo.js),
//     y un chequeo de fase previo: si a (P, T) el gas condensa, la línea
//     llevaría líquido y ningún resultado de gas aplica (aplica: false).
//   - Sin factor Hf: es el derating por fragilización de HIDRÓGENO de ASME
//     B31.12, no aplica a otros gases.
//   - Barlow con diámetro exterior (ver physics.js).
//   - El caudal se ingresa en kg/h, Nm³/h o kW (caudal.js), no solo kW.
//   - Velocidad erosional con la densidad real a la presión de operación,
//     sin el campo aparte de "presión mínima" de Hidrógeno.

import {
  barGaugeAPaAbs, reynolds, rugosidadRelativa, factorFriccionHaaland, perdidaCargaTramo,
  presionMaximaDiseno, factorT, velocidadErosional, chequeoCaidaPresion, K_ACCESORIOS,
} from './physics.js';
import { celsiusAKelvin, estadoFase, factorZ, densidadReal, densidadNormal } from './termo.js';
import { flujoMasicoKgH } from './caudal.js';

export function calcularFlujo(inputs) {
  const {
    gas, presionBarG, temperaturaC, caudal, unidadCaudal, largoM, tuberia,
    codos = 0, tees = 0, valvulas = 0, factorDiseno, factorUnion = 1,
  } = inputs;

  const presionAbsPa = barGaugeAPaAbs(presionBarG);
  const temperaturaK = celsiusAKelvin(temperaturaC);
  const fase = estadoFase({ gas, presionAbsPa, temperaturaK });

  // Barlow no depende del gas: se informa siempre, también con fase líquida.
  const factorTAplicado = factorT({ temperaturaC });
  const presionMaxDisenoBar = presionMaximaDiseno({
    limiteElasticoMPa: tuberia.limiteElasticoMPa, espesorMm: tuberia.espesorMm,
    diametroExteriorMm: tuberia.deMm, factorDiseno, factorUnion, factorT: factorTAplicado,
  });
  const tuberiaAdecuada = presionBarG <= presionMaxDisenoBar;
  const base = { fase, tuberia, factorTAplicado, presionMaxDisenoBar, tuberiaAdecuada };

  if (fase.estado === 'liquido') return { ...base, aplica: false };

  const normal = densidadNormal(gas);
  const masicoKgH = flujoMasicoKgH({
    caudal, unidad: unidadCaudal, densidadNormalKgM3: normal.densidadKgM3, pciMJkg: gas.pciMJkg,
  });

  const z = factorZ({ gas, presionAbsPa, temperaturaK });
  const densidadKgM3 = densidadReal({ gas, presionAbsPa, temperaturaK, z });

  const diametroM = tuberia.diMm / 1000;
  const areaM2 = (Math.PI * diametroM ** 2) / 4;
  const caudalRealM3H = masicoKgH / densidadKgM3;
  const caudalNormalNm3H = masicoKgH / normal.densidadKgM3;
  const velocidadFlujoMS = caudalRealM3H / 3600 / areaM2;
  const velocidadErosionalMS = velocidadErosional({ densidadKgM3 });

  const reynoldsNum = reynolds({
    densidad: densidadKgM3, velocidad: velocidadFlujoMS, diametroM, viscosidad: gas.viscosidadUPaS * 1e-6,
  });
  const rugosidadRel = rugosidadRelativa({ rugosidadMm: tuberia.rugosidadMm, diametroM });
  const factorFriccion = factorFriccionHaaland({ rugosidadRelativa: rugosidadRel, reynolds: reynoldsNum });

  const sumaCoeficientesLocales = codos * K_ACCESORIOS.codo + tees * K_ACCESORIOS.tee + valvulas * K_ACCESORIOS.valvula;
  const perdidaCargaMbar = perdidaCargaTramo({
    factorFriccion, longitudM: largoM, diametroM, densidad: densidadKgM3,
    velocidad: velocidadFlujoMS, sumaCoeficientesLocales,
  });

  // Aguas abajo = presión de operación menos la pérdida de la línea (mismo
  // mapeo que Hidrógeno, elegido allí por Cristóbal el 2026-09-08).
  const chequeoSonico = chequeoCaidaPresion({
    presionAguasArribaAbs: presionAbsPa,
    presionAguasAbajoAbs: presionAbsPa - perdidaCargaMbar * 100,
    gamma: gas.gamma,
  });

  return {
    ...base, aplica: true,
    z, densidadKgM3, densidadNormalKgM3: normal.densidadKgM3, densidadNormalIdeal: normal.ideal,
    flujoMasicoKgH: masicoKgH, caudalRealM3H, caudalNormalNm3H,
    velocidadFlujoMS, velocidadErosionalMS,
    reynolds: reynoldsNum, rugosidadRelativa: rugosidadRel, factorFriccion,
    perdidaCargaMbar, chequeoSonico,
  };
}
