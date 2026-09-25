// Motor de cálculo de la pestaña "Tubería y Flujo" — puerto 1:1 de
// Calculos H2.xlsx, hoja "Cálculo". Cada valor cita su celda de origen.

import {
  barGaugeAPaAbs, densidadReal, presionMaximaDiseno, velocidadErosion,
  reynolds, rugosidadRelativa, factorFriccionHaaland, perdidaCargaTramo,
  chequeoCaidaPresion,
} from './physics.js';
import { H2, buscarTuberia, factorZDesdeBarG, factorHf, factorT, diametroExteriorMm } from './gas-h2.js';

const FACTOR_SL_MIN = 17.5817; // constante fuente (Cálculo!C11/C12/C15)
// m³/h -> L/min de un caudal REAL (a la P y T del gas): solo cambio de
// unidades. FACTOR_SL_MIN = 16,667 × 288,15/273,15 incluye además el paso
// de Nm³ (0 °C) a litros estándar (15 °C), que solo corresponde al caudal
// normalizado (CORREGIDO 2026-09-25: el Excel lo aplicaba también al caudal
// real de H₂, que en L/min salía 5,5 % alto).
const LITROS_MIN_POR_M3_H = 1000 / 60;

// Cálculo!C10, con el factor Hf (ASME B31.12 Tabla IX-5A) AGREGADO
// (2026-09-02, a pedido del usuario — ver Hidrogeno/CLAUDE.md). Hf depende
// de la presión de diseño del sistema, que es justamente lo que esta
// fórmula calcula, así que se resuelve por iteración con relajación (Hf es
// monótono no-creciente en presión: converge sin necesidad de más de unas
// pocas decenas de pasadas incluso en el peor caso).
function presionMaximaConHf({ limiteElasticoMPa, espesorMm, diametroExteriorMm, factorDiseno, factorUnion, factorTAplicado }) {
  let presionBarG = presionMaximaDiseno({ limiteElasticoMPa, espesorMm, diametroExteriorMm, factorDiseno, factorUnion, factorHf: 1, factorT: factorTAplicado });
  let hf = 1;
  for (let i = 0; i < 100; i++) {
    hf = factorHf({ limiteFluenciaMPa: limiteElasticoMPa, presionDisenoBarG: presionBarG });
    const presionConHf = presionMaximaDiseno({ limiteElasticoMPa, espesorMm, diametroExteriorMm, factorDiseno, factorUnion, factorHf: hf, factorT: factorTAplicado });
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

  // Cálculo!C10, con el factor T (ASME B31.12 Tabla PL-3.7.1(b)(8), derating
  // por temperatura) AGREGADO (2026-09-02, a pedido del usuario — ver
  // Hidrogeno/CLAUDE.md). A diferencia de Hf, T no depende de la presión de
  // diseño que se está resolviendo, así que se calcula una sola vez.
  const factorTAplicado = factorT({ temperaturaC });

  // Cálculo!C10
  const { presionMaxDisenoBar, factorHfAplicado } = presionMaximaConHf({
    limiteElasticoMPa: tuberia.limiteElasticoMPa, espesorMm: tuberia.espesorMm,
    // Barlow con el diámetro EXTERIOR (tubería manual: DI + 2·espesor) —
    // CORREGIDO 2026-09-25, ver TABLA_TUBERIA en gas-h2.js.
    diametroExteriorMm: diametroExteriorMm(tuberia), factorDiseno, factorUnion, factorTAplicado,
  });

  // Indicador "tubería adecuada" (AGREGADO 2026-09-02, a pedido del
  // usuario, mirroring el mismo indicador de GasNatural-GLP/js/calc-red-gas.js
  // "tuberiaAdecuada"): acá el criterio es estructural, no de pérdida de
  // carga — la tubería es adecuada si la presión de operación no supera la
  // presión máxima de diseño (Barlow, con F/E/Hf/T ya aplicados).
  const tuberiaAdecuada = presionBarG <= presionMaxDisenoBar;

  // Cálculo!C13
  const flujoMasicoKgH = (potenciaKw / pciKjKg) * 3600;

  // Cálculo!C26 — correlación NIST de Z, ahora alimentada con presión
  // ABSOLUTA en MPa y temperatura en K (2026-09-08, a pedido del usuario:
  // antes se le pasaba la presión manométrica y T+273). Ver gas-h2.js.
  const zDiseno = factorZDesdeBarG({ presionBarG, temperaturaC });

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
  const flujoVolH2M3H = flujoMasicoKgH / densidadKgM3;
  const flujoVolH2 = unidadH2 === '[m3/h]' ? flujoVolH2M3H : flujoVolH2M3H * LITROS_MIN_POR_M3_H;

  // Cálculo!C15 — velocidad a la presión de operación (independiente de la
  // unidad elegida para mostrar el caudal)
  const areaM2 = Math.PI * Math.pow(diametroM, 2) / 4;
  const velocidadFlujoMS = (flujoVolH2M3H / 3600) / areaM2;

  // Velocidad erosional — API RP 14E (Cálculo!C14/C27).
  // CORREGIDO 2026-09-25 (auditoría de coherencia física): el Excel evaluaba
  // la velocidad erosional a la presión MÍNIMA y la comparaba contra la
  // velocidad de flujo a la presión de OPERACIÓN — dos estados distintos
  // del gas. Con los valores por defecto (0,8 barG de operación, 29,5 barG
  // de "mínima") la mínima era además 37 veces MAYOR que la de operación.
  // API RP 14E compara la velocidad real con Ve = C/√ρ en el MISMO estado;
  // como v ∝ 1/ρ y Ve ∝ 1/√ρ, la razón v/Ve es peor a menor presión. Por
  // eso las dos se evalúan ahora en la presión mínima de la línea, y si la
  // "mínima" ingresada supera la de operación (dato incoherente) se usa la
  // de operación y se avisa (presionMinimaSobreOperacion).
  const presionMinimaSobreOperacion = presionMinBarG > presionBarG;
  const presionErosionBarG = Math.min(presionMinBarG, presionBarG);
  const zErosion = factorZDesdeBarG({ presionBarG: presionErosionBarG, temperaturaC });

  // Cálculo!C14
  const velocidadErosionMS = velocidadErosion({
    zErosion, temperaturaC, presionMinBarG: presionErosionBarG, gravedadEspecifica: H2.gravedadEspecifica,
  });

  const densidadErosionKgM3 = densidadReal({
    presionAbsPa: barGaugeAPaAbs(presionErosionBarG), temperaturaC,
    masaMolar: H2.masaMolarKgMol, constanteR: H2.constanteR, z: zErosion,
  });
  const velocidadFlujoErosionMS = (flujoMasicoKgH / densidadErosionKgM3 / 3600) / areaM2;

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

  // Screening de caída de presión / flujo sónico (AGREGADO 2026-09-08, a
  // pedido del usuario). ADICIONAL a la velocidad erosional de API RP 14E,
  // que queda intacta arriba. No pide ningún input nuevo: reutiliza la
  // presión de operación como aguas arriba, y esa misma presión menos la
  // pérdida de carga ya calculada como aguas abajo.
  //
  // La conversión manométrica -> ABSOLUTA ocurre acá, con el mismo
  // barGaugeAPaAbs() (y el mismo supuesto de 1 bar atmosférico) que ya usa
  // la densidad real más arriba — no se duplica la conversión.
  const presionAguasAbajoBarG = presionBarG - perdidaCargaMbar / 1000;
  const chequeoSonico = chequeoCaidaPresion({
    presionAguasArribaAbs: barGaugeAPaAbs(presionBarG),
    presionAguasAbajoAbs: barGaugeAPaAbs(presionAguasAbajoBarG),
    gamma: H2.gammaIdeal,
  });

  return {
    tuberia, presionMaxDisenoBar, factorHfAplicado, factorTAplicado, tuberiaAdecuada,
    flujoMasicoKgH, zDiseno, densidadKgM3,
    flujoVolNormalizado, flujoVolH2, zErosion, velocidadErosionMS,
    velocidadFlujoMS, velocidadFlujoErosionMS, presionErosionBarG, presionMinimaSobreOperacion, reynolds: reynoldsNum, rugosidadRelativa: rugosidadRel,
    factorFriccion, perdidaCargaMbar, chequeoSonico,
  };
}
