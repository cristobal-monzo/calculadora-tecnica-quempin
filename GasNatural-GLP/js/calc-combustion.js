// Motor de cálculo de la pestaña "Combustión" — orquesta gas-glp.js /
// gas-gn.js + combustion.js. Fuente: MASTER DISEÑO.xlsm, hoja
// "Combustión Gas" (columnas I:K para GLP, M:O para GN).
//
// Fuera de alcance v1 (ver spec): entalpía de gases de combustión / "calor
// disponible" (no existe para GN en el Excel fuente) y las columnas H2/
// Pellet (H2 tiene su propio sitio; Pellet no es un gas).

import { propiedadesGLP, densidadCondiciones as densidadCondicionesGLP } from './gas-glp.js';
import { propiedadesGN, densidadCondiciones as densidadCondicionesGN } from './gas-gn.js';
import {
  aireEstequiometrico, caudalAire, composicionGasesCombustion,
  propiedadesGasesCombustion, gasesEstequiometricosSecos, emisionesNoxAdmisibles,
  EMISION_CO_ADMISIBLE_PPM,
} from './combustion.js';

function calcularCombustionComun({ propiedades, potenciaKw, lambda, pciKjKg, concentracionO2Pct, volSecoTeorico, pciSimplificadoKwhM3, densidadRef }) {
  const flujoMasicoKgS = potenciaKw / pciKjKg;
  const caudalCombustibleNm3H = (flujoMasicoKgS / propiedades.densidadNormal) * 3600; // Nm3/h, condición normal
  const caudalCombustibleRefM3H = (flujoMasicoKgS / densidadRef) * 3600; // m3/h, condición de referencia (T/P dadas)

  const aireEsteq = aireEstequiometrico(propiedades); // Nm3/kg
  const caudalAireNm3H = caudalAire({ aireEsteq, lambda, flujoMasicoKgS });
  // "Caudal total": el Excel fuente suma el aire con el caudal de
  // combustible en condición NORMAL para GLP (Combustión Gas!J10=J9+J6)
  // pero en condición de REFERENCIA para GN (N9=N8+N6) — sin ninguna razón
  // física para que difiera según el gas. CORREGIDO respecto al Excel
  // (2026-09-01, a pedido del usuario): en vez de elegir una de las dos
  // arbitrariamente, se calculan y muestran ambas para los dos gases —
  // ver GasNatural-GLP/CLAUDE.md.
  const caudalTotalNormalNm3H = caudalAireNm3H + caudalCombustibleNm3H;
  const caudalTotalReferenciaM3H = caudalAireNm3H + caudalCombustibleRefM3H;

  const composicion = composicionGasesCombustion({ ...propiedades, aireEsteq, lambda });
  const gases = propiedadesGasesCombustion(composicion);

  const emisionNoxAdmisiblePpm = emisionesNoxAdmisibles({
    volSecoTeorico, pciKwhM3: pciSimplificadoKwhM3, concentracionO2Pct,
  });

  return {
    ...propiedades, flujoMasicoKgS, caudalCombustibleNm3H, caudalCombustibleRefM3H,
    aireEsteq, caudalAireNm3H, caudalTotalNormalNm3H, caudalTotalReferenciaM3H,
    composicion, gases, emisionNoxAdmisiblePpm,
    emisionCoAdmisiblePpm: EMISION_CO_ADMISIBLE_PPM, densidadRef,
  };
}

export function calcularCombustionGLP(inputs) {
  const {
    pctButano, pctPropano, potenciaKw, lambda, pciKjKg,
    presionReferenciaKPa, temperaturaReferenciaC, concentracionO2Pct,
  } = inputs;

  const propiedades = propiedadesGLP({ pctButano, pctPropano });
  const densidadRef = densidadCondicionesGLP({
    presionKPa: presionReferenciaKPa, temperaturaC: temperaturaReferenciaC, r: propiedades.r,
  });

  // Combustión Gas!J46 — SUM(K104,I104): mezcla butano/propano de ESTE gas
  const { volSecoTeorico } = gasesEstequiometricosSecos({ molesButano: pctButano, molesPropano: pctPropano });

  return calcularCombustionComun({
    propiedades, potenciaKw, lambda, pciKjKg, concentracionO2Pct,
    volSecoTeorico, pciSimplificadoKwhM3: propiedades.pciSimplificadoKwhM3,
    densidadRef,
  });
}

export function calcularCombustionGN(inputs) {
  const {
    pctMetano, pctEtano, pctPropano, pctButano, pctDioxidoC, pctNitrogeno,
    potenciaKw, lambda, pciKjKg, presionReferenciaKPa, temperaturaReferenciaC,
    concentracionO2Pct, pciSimplificadoKwhM3,
  } = inputs;

  const propiedades = propiedadesGN({ pctMetano, pctEtano, pctPropano, pctButano, pctDioxidoC, pctNitrogeno });
  const densidadRef = densidadCondicionesGN({
    presionKPa: presionReferenciaKPa, temperaturaC: temperaturaReferenciaC, r: propiedades.r,
  });

  // Combustión Gas!N46 — SUM(K105,I105): el Excel fuente simplifica el GN a
  // metano puro para este cálculo específico, sin importar la composición
  // real ingresada (ver Combustión Gas!C105=1, A105=B105=D105=0).
  const { volSecoTeorico } = gasesEstequiometricosSecos({ molesMetano: 1 });

  // El Excel fuente calculaba el flujo de GN SIEMPRE desde el PCI derivado
  // de su composición (Combustión Gas!N4 = N2/$F$45), sin un campo propio
  // editable como el que sí tiene GLP (J4). CORREGIDO (2026-09-01, a
  // pedido del usuario): acá `pciKjKg` es un input real, igual que en
  // GLP — la UI lo pre-completa con el valor derivado de la composición
  // (propiedades.pciMasa) pero el usuario puede editarlo.
  return calcularCombustionComun({
    propiedades, potenciaKw, lambda, pciKjKg, concentracionO2Pct,
    volSecoTeorico, pciSimplificadoKwhM3, densidadRef,
  });
}
