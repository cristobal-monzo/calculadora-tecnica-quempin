// Motor de cálculo de la pestaña "Quemador Atmosférico" — dimensionamiento
// de inyector, aireación primaria, verificación de largo de llama, garganta
// Venturi y tubo de mezclado. Fuente: MASTER DISEÑO.xlsm, hojas
// "Quem. Atm." (inyector, aireación, largo de llama — completo y simétrico
// para GN y GLP) y "Diseño Quemador Atmosférico" (garganta Venturi, tubo
// de mezclado — con valores para ambos gases, pero sin encadenar con la
// verificación de llama). Ninguna hoja del Excel fuente tiene esta cadena
// completa para los dos gases a la vez; ver el spec de diseño para el
// detalle de la reconciliación.
//
// Nota sobre un probable error en el Excel fuente: "Relación área
// garganta/perforaciones" usa fórmulas DISTINTAS en la columna GN
// (Diseño Quemador Atmosférico!D38 = (Dt/(Dh·N))²) y en la columna GLP
// (H38 = (Dt/Dh)²/N). Solo la versión GLP da dimensionalmente una razón
// de áreas correcta (área garganta / área total de perforaciones); acá se
// usa esa fórmula para ambos gases. Confirmar con Cristóbal antes de
// tomar esto como referencia de diseño real.

import { propiedadesGLP } from './gas-glp.js';
import { propiedadesGN } from './gas-gn.js';
import { aireEstequiometrico } from './combustion.js';

const DENSIDAD_AIRE_NORMAL = 1.292; // kg/Nm3 — constante usada en ambas hojas fuente

function propiedadesQuemador(gas, composicion) {
  if (gas === 'GLP') {
    const p = propiedadesGLP(composicion);
    return { pm: p.pm, r: p.r, densidadNormal: p.densidadNormal, aireEsteq: aireEstequiometrico(p) };
  }
  const p = propiedadesGN(composicion);
  return { pm: p.pm, r: p.r, densidadNormal: p.densidadNormal, aireEsteq: aireEstequiometrico(p) };
}

export function calcularQuemador(inputs) {
  const {
    gas, composicion, potenciaKw, pciKjKg,
    cantidadPerforaciones, diametroPerforacionMm,
    coeficienteDescarga, diametroInyectorMm, presionGasMbar,
    relacionAire, temperaturaGasC, temperaturaAmbienteC,
    diametroGargantaMm, cantidadPerforacionesGarganta,
  } = inputs;

  const gasProps = propiedadesQuemador(gas, composicion);

  // Tasa de quemado — Quem. Atm.!D17:D18
  const areaTotalPerforacionesMm2 = (Math.PI * diametroPerforacionMm ** 2 / 4) * cantidadPerforaciones;
  const tasaQuemadoWMm2 = (potenciaKw * 1000) / areaTotalPerforacionesMm2;

  // Inyector de gas — Diseño Quemador Atmosférico!D24:D32
  const areaInyectorIn2 = Math.PI * (diametroInyectorMm / 25.4) ** 2 / 4;
  const presionGasInWC = presionGasMbar * 0.40146;
  const densidadRelativaGasAire = gasProps.densidadNormal / DENSIDAD_AIRE_NORMAL;
  const caudalInyectorFt3H = 1658.5 * coeficienteDescarga * areaInyectorIn2 * Math.sqrt(presionGasInWC / densidadRelativaGasAire);
  const caudalInyectorM3H = caudalInyectorFt3H * (381 / 1250) ** 3;
  const potenciaInyectorKw = (caudalInyectorM3H * gasProps.densidadNormal / 3600) * pciKjKg;

  // Premezcla primaria (aireación primaria) — Quem. Atm.!D22:D31
  const flujoCombustibleKgS = potenciaKw / pciKjKg;
  const molesGas = 1 / gasProps.pm;
  const molesAirePremezcla1 = (gasProps.aireEsteq / 22.4) * relacionAire;
  const fraccionMolarGas = molesGas / (molesGas + molesAirePremezcla1);
  const fraccionMolarAire1 = molesAirePremezcla1 / (molesGas + molesAirePremezcla1);
  const racEstequiometricaMasica = gasProps.aireEsteq * DENSIDAD_AIRE_NORMAL;
  const flujoAirePremezcla1KgS = flujoCombustibleKgS * racEstequiometricaMasica * relacionAire;
  const pmPremezcla1 = gasProps.pm * fraccionMolarGas + 28.97 * fraccionMolarAire1;
  const densidadPremezcla1 = gasProps.densidadNormal * fraccionMolarGas + DENSIDAD_AIRE_NORMAL * fraccionMolarAire1;
  const flujoPremezcla1KgS = flujoAirePremezcla1KgS + flujoCombustibleKgS;
  const caudalPremezcla1Nm3S = flujoPremezcla1KgS / densidadPremezcla1;

  // Verificación de límites de tamaño de llama — Quem. Atm.!D34:D40
  const caudalPerforacionPremezcla1Nm3S = caudalPremezcla1Nm3S / cantidadPerforaciones;
  const molesAire2 = (gasProps.aireEsteq / 22.4) * (1 - relacionAire);
  const racMolarEstequiometrica = molesAire2 / (molesGas + molesAirePremezcla1);
  const caudalGasPorPerforacionM3S = (flujoCombustibleKgS * 101.325) / gasProps.r / (temperaturaGasC + 273.15) / cantidadPerforaciones;
  const largoLlamaMm = 1330 * caudalGasPorPerforacionM3S * (temperaturaAmbienteC + 273.15) / (temperaturaGasC + 273.15)
    / Math.log(1 + 1 / racMolarEstequiometrica) * 1000;

  // Garganta Venturi — Diseño Quemador Atmosférico!D38 / H38 (ver nota arriba).
  // Usa su propia cantidad de perforaciones (H37=420), distinta de las
  // perforaciones del quemador (H16=400) — son dos conteos independientes
  // en el Excel fuente, no el mismo valor reutilizado.
  const relacionAreaGargantaPerforaciones = (diametroGargantaMm / diametroPerforacionMm) ** 2 / cantidadPerforacionesGarganta;

  return {
    areaTotalPerforacionesMm2, tasaQuemadoWMm2,
    areaInyectorIn2, presionGasInWC, densidadRelativaGasAire, caudalInyectorM3H, potenciaInyectorKw,
    flujoCombustibleKgS, molesGas, molesAirePremezcla1, fraccionMolarGas, fraccionMolarAire1,
    racEstequiometricaMasica, flujoAirePremezcla1KgS, pmPremezcla1, densidadPremezcla1,
    flujoPremezcla1KgS, caudalPremezcla1Nm3S, caudalPerforacionPremezcla1Nm3S,
    racMolarEstequiometrica, caudalGasPorPerforacionM3S, largoLlamaMm,
    relacionAreaGargantaPerforaciones,
  };
}
