// Motor de cálculo de la pestaña "Tubería y Flujo" — puerto 1:1 de
// Calculos H2.xlsx, hoja "Cálculo". Cada valor cita su celda de origen.

import {
  barGaugeAPaAbs, densidadReal, presionMaximaDiseno, velocidadErosion,
  reynolds, rugosidadRelativa, factorFriccionHaaland, perdidaCargaTramo,
} from './physics.js';
import { H2, buscarTuberia, factorZDiseno, factorZErosion, factorHf } from './gas-h2.js';

const FACTOR_SL_MIN = 17.5817; // constante fuente (Cálculo!C11/C12/C15)

// Cálculo!C10, con el factor Hf (ASME B31.12 Tabla IX-5A) AGREGADO
// (2026-09-02, a pedido del usuario — ver Hidrogeno/CLAUDE.md). Hf depende
// de la presión de diseño del sistema, que es justamente lo que esta
// fórmula calcula, así que se resuelve por iteración con relajación (Hf es
// monótono no-creciente en presión: converge sin necesidad de más de unas
// pocas decenas de pasadas incluso en el peor caso).
function presionMaximaConHf({ limiteElasticoMPa, espesorMm, diametroMm, factorDiseno, factorUnion }) {
  let presionBarG = presionMaximaDiseno({ limiteElasticoMPa, espesorMm, diametroMm, factorDiseno, factorUnion, factorHf: 1 });
  let hf = 1;
  for (let i = 0; i < 100; i++) {
    hf = factorHf({ limiteFluenciaMPa: limiteElasticoMPa, presionDisenoBarG: presionBarG });
    const presionConHf = presionMaximaDiseno({ limiteElasticoMPa, espesorMm, diametroMm, factorDiseno, factorUnion, factorHf: hf });
    const siguiente = (presionBarG + presionConHf) / 2; // relajación, evita oscilación
    if (Math.abs(siguiente - presionBarG) < 1e-10) { presionBarG = siguiente; break; }
    presionBarG = siguiente;
  }
  hf = factorHf({ limiteFluenciaMPa: limiteElasticoMPa, presionDisenoBarG: presionBarG });
  return { presionMaxDisenoBar: presionBarG, factorHfAplicado: hf };
}

export function calcularFlujo(inputs) {
  const {
    presionBarG, temperaturaC, potenciaKw, tuberiaPulgadas, presionMinBarG,
    largoM, codos, tees, valvulas, factorDiseno, factorUnion, tuberiaManual,
    unidadNormalizado = '[Nm3/h]', unidadH2 = '[m3/h]', pciKjKg = H2.pciKjKg,
  } = inputs;

  // Tubería manual (2026-09-02, a pedido del usuario, "listado más amplio
  // de tuberías... ingresar manualmente un valor de diámetro"): sin fila de
  // tabla no hay espesor/límite elástico/rugosidad que buscar — a
  // diferencia de Red de Gas (GasNatural-GLP), acá esos tres datos SÍ
  // determinan un resultado de seguridad (presión máxima de diseño, Barlow)
  // y la fricción (Haaland), así que se piden explícitamente al usuario en
  // vez de asumir un valor — ver Hidrogeno/CLAUDE.md.
  const tuberia = tuberiaManual ?? buscarTuberia(tuberiaPulgadas);
  const diametroM = tuberia.diMm / 1000;

  // Cálculo!C10
  const { presionMaxDisenoBar, factorHfAplicado } = presionMaximaConHf({
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
    tuberia, presionMaxDisenoBar, factorHfAplicado, flujoMasicoKgH, zDiseno, densidadKgM3,
    flujoVolNormalizado, flujoVolH2, zErosion, velocidadErosionMS,
    velocidadFlujoMS, reynolds: reynoldsNum, rugosidadRelativa: rugosidadRel,
    factorFriccion, perdidaCargaMbar,
  };
}
