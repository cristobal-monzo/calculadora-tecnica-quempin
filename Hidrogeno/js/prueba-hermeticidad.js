// Prueba de hermeticidad de tubería de H₂ (2026-11-19, a pedido del usuario).
//
// Fuente: ASME B31.12-2008, Parte IP (tubería industrial), Capítulo IP-10
// — copia en Documentación/Referencias/3 Normas y técnica/. El D.S. 13/2022
// (instalaciones de hidrógeno) no fija duración: su art. 43 remite a NFPA 2
// (2020) §7.1.6.4. El usuario eligió la Parte IP, no la PL (gasoductos:
// 1,5 × MAOP durante 2 h, PL-3.10.2).
//   - IP-10.6.2(b)(1): la prueba se mantiene al menos 10 min y se revisan
//     todas las uniones.
//   - IP-10.7.2(a): hidrostática ≥ 1,5 × presión de diseño. Si la
//     temperatura de diseño supera la de prueba, eq. (24) la sube a
//     1,5·P·ST/S; aquí no se modela (no hay S por temperatura).
//   - IP-10.8.4: neumática = 1,1 × presión de diseño. IP-10.8.5: se sube
//     por etapas y se baja a la presión de diseño para buscar fugas.
//   - IP-10.8.2: válvula de alivio calibrada a lo más en presión de prueba
//     + el menor entre 345 kPa y el 10 % de la presión de prueba.
//   - IP-10.8.3: el gas de prueba, si no es aire, no inflamable ni tóxico.
//
// Referencia QUEMPIN (no exigida para H₂): D.S. 66 f.11, tiempo [min] =
// volumen [m³] × 214, entre 15 min y 1 h — misma fórmula que
// GasNatural-GLP/js/calc-red-gas.js (copiada, no importada: módulos
// autocontenidos).

export const PRUEBA_IP = {
  duracionMinimaMin: 10,
  factorHidrostatica: 1.5,
  factorNeumatica: 1.1,
  alivioMaxBar: 3.45, // 345 kPa
  alivioFraccion: 0.10,
};

export const DS66_MIN_MIN = 15;
export const DS66_MAX_MIN = 60;

export function referenciaDS66(volumenM3) {
  const formulaMin = volumenM3 * 214;
  const duracionMin = Math.min(DS66_MAX_MIN, Math.max(DS66_MIN_MIN, formulaMin));
  const ajuste = formulaMin < DS66_MIN_MIN ? 'minimo' : formulaMin > DS66_MAX_MIN ? 'maximo' : null;
  return { formulaMin, duracionMin, ajuste };
}

export function volumenTuberiaM3({ diametroInteriorMm, longitudM }) {
  const d = diametroInteriorMm / 1000;
  return Math.PI * d * d / 4 * longitudM;
}

// presionDisenoBarG: manométrica [bar]. volumenM3: volumen interior.
export function pruebaHermeticidadIP({ presionDisenoBarG, volumenM3 }) {
  const neumaticaBarG = PRUEBA_IP.factorNeumatica * presionDisenoBarG;
  return {
    presionDisenoBarG,
    volumenM3,
    duracionMinimaMin: PRUEBA_IP.duracionMinimaMin,
    hidrostaticaBarG: PRUEBA_IP.factorHidrostatica * presionDisenoBarG,
    neumaticaBarG,
    alivioMaxBarG: neumaticaBarG + Math.min(PRUEBA_IP.alivioMaxBar, PRUEBA_IP.alivioFraccion * neumaticaBarG),
    ds66: referenciaDS66(volumenM3),
  };
}

// Toda la red de la Memoria: la presión de diseño es la mayor de los
// tramos (la Memoria no tiene un campo propio). El volumen probado es el de
// la tubería (suma de los tramos) MÁS el del estanque de almacenamiento
// (2026-11-19, a pedido del usuario): se prueban como un solo sistema.
export function pruebaHermeticidadRed(calculados, { volumenEstanqueM3 = 0 } = {}) {
  const volumenTuberiaM3 = calculados.reduce((suma, t) => suma + t.volumenTuberiaM3, 0);
  const estanque = Number.isFinite(volumenEstanqueM3) && volumenEstanqueM3 > 0 ? volumenEstanqueM3 : 0;
  return {
    ...pruebaHermeticidadIP({
      presionDisenoBarG: Math.max(...calculados.map((t) => t.presionMPa * 10)),
      volumenM3: volumenTuberiaM3 + estanque,
    }),
    volumenTuberiaM3,
    volumenEstanqueM3: estanque,
  };
}
