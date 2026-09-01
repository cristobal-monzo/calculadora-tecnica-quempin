// Motor de cálculo de la pestaña "Tubería y Flujo" — puerto 1:1 de
// Calculos H2.xlsx, hoja "Cálculo". Cada valor cita su celda de origen.

import {
  barGaugeAPaAbs, densidadReal, presionMaximaDiseno, velocidadErosion,
  reynolds, rugosidadRelativa, factorFriccionHaaland, perdidaCargaTramo,
} from './physics.js';
import { H2, buscarTuberia, factorZDiseno, factorZErosion } from './gas-h2.js';

const FACTOR_SL_MIN = 17.5817; // constante fuente (Cálculo!C11/C12/C15)

export function calcularFlujo(inputs) {
  const {
    presionBarG, temperaturaC, potenciaKw, tuberiaPulgadas, presionMinBarG,
    largoM, codos, tees, valvulas, factorDiseno, factorUnion,
    unidadNormalizado = '[Nm3/h]', unidadH2 = '[m3/h]', pciKjKg = H2.pciKjKg,
  } = inputs;

  const tuberia = buscarTuberia(tuberiaPulgadas);
  const diametroM = tuberia.diMm / 1000;

  // Cálculo!C10
  const presionMaxDisenoBar = presionMaximaDiseno({
    limiteElasticoMPa: tuberia.limiteElasticoMPa, espesorMm: tuberia.espesorMm,
    diametroMm: tuberia.diMm, factorDiseno, factorUnion,
  });

  // Cálculo!C13
  const flujoMasicoKgH = (potenciaKw / pciKjKg) * 3600;

  // Cálculo!C26
  const zDiseno = factorZDiseno({ presionBarG, temperaturaC });

  // Cálculo!C20
  const densidadKgM3 = densidadReal({
    presionAbsPa: barGaugeAPaAbs(presionBarG), temperaturaC,
    masaMolar: H2.masaMolarKgMol, constanteR: H2.constanteR, z: zDiseno,
  });

  // Cálculo!C11
  const flujoVolNormalizado = unidadNormalizado === '[Nm3/h]'
    ? flujoMasicoKgH / H2.densidadNormalKgM3
    : (FACTOR_SL_MIN * flujoMasicoKgH) / H2.densidadNormalKgM3;

  // Cálculo!C12
  const flujoVolH2 = unidadH2 === '[m3/h]'
    ? flujoMasicoKgH / densidadKgM3
    : (FACTOR_SL_MIN * flujoMasicoKgH) / densidadKgM3;

  // Cálculo!C27
  const zErosion = factorZErosion(presionMinBarG);

  // Cálculo!C14
  const velocidadErosionMS = velocidadErosion({
    zErosion, temperaturaC, presionMinBarG, gravedadEspecifica: H2.gravedadEspecifica,
  });

  // Cálculo!C15
  const areaM2 = Math.PI * Math.pow(diametroM, 2) / 4;
  const velocidadFlujoMS = unidadH2 === '[m3/h]'
    ? (flujoVolH2 / 3600) / areaM2
    : (flujoVolH2 / 3600) / (areaM2 * FACTOR_SL_MIN);

  // Cálculo!C30, C31, C32
  const reynoldsNum = reynolds({
    densidad: densidadKgM3, velocidad: velocidadFlujoMS, diametroM, viscosidad: H2.viscosidadPaS,
  });
  const rugosidadRel = rugosidadRelativa({ rugosidadAbsoluta: tuberia.rugosidadMm, diametroM });
  const factorFriccion = factorFriccionHaaland({ rugosidadRelativa: rugosidadRel, reynolds: reynoldsNum });

  // Cálculo!C16
  const sumaCoeficientesLocales = codos * 0.7 + tees * 2 + valvulas * 0.1;
  const perdidaCargaMbar = perdidaCargaTramo({
    factorFriccion, longitudM: largoM, diametroM, densidad: densidadKgM3,
    velocidad: velocidadFlujoMS, sumaCoeficientesLocales,
  });

  return {
    tuberia, presionMaxDisenoBar, flujoMasicoKgH, zDiseno, densidadKgM3,
    flujoVolNormalizado, flujoVolH2, zErosion, velocidadErosionMS,
    velocidadFlujoMS, reynolds: reynoldsNum, rugosidadRelativa: rugosidadRel,
    factorFriccion, perdidaCargaMbar,
  };
}
