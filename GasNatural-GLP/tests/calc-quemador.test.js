import assert from 'node:assert/strict';
import { calcularQuemador } from '../js/calc-quemador.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Tolerancia ampliada (1e-4) para los valores que dependen de PM/densidad
// del gas: el Excel fuente usa versiones REDONDEADAS de esas propiedades
// como inputs sueltos (p.ej. PM=16.63 en vez de 16.630882 exacto de la
// composición), mientras que este motor las deriva siempre con precisión
// completa desde gas-glp.js/gas-gn.js — la pequeña diferencia es
// justamente esa, no un error de fórmula (verificado con tolerancia
// estricta en los campos que NO dependen de la composición).
const TOL_REDONDEO_FUENTE = 1e-4;

const composicionGN = { pctMetano: 0.97, pctEtano: 0.011, pctPropano: 0.001, pctButano: 0.001, pctDioxidoC: 0.01, pctNitrogeno: 0.007 };
const composicionGLP = { pctButano: 0.3, pctPropano: 0.7 };

// Fixtures: MASTER DISEÑO.xlsm, "Diseño Quemador Atmosférico", columna GN (D), 2026-09-01
const gnDiseno = calcularQuemador({
  gas: 'GN', composicion: composicionGN, potenciaKw: 5, pciKjKg: 52737,
  cantidadPerforaciones: 68, diametroPerforacionMm: 2,
  coeficienteDescarga: 0.8, diametroInyectorMm: 1.778, presionGasMbar: 8,
  relacionAire: 0.45, temperaturaGasC: 15, temperaturaAmbienteC: 15,
  diametroGargantaMm: 15, cantidadPerforacionesGarganta: 10,
});
cerca(gnDiseno.areaTotalPerforacionesMm2, 213.62830044410595); // D18
cerca(gnDiseno.tasaQuemadoWMm2, 23.405138689984607);            // D21
cerca(gnDiseno.areaInyectorIn2, 0.003848451000647497);          // D27
cerca(gnDiseno.presionGasInWC, 3.21168);                         // D28
cerca(gnDiseno.densidadRelativaGasAire, 0.5743034055727554, TOL_REDONDEO_FUENTE); // D29
cerca(gnDiseno.caudalInyectorM3H, 0.3419257042261245, TOL_REDONDEO_FUENTE);       // D31
cerca(gnDiseno.potenciaInyectorKw, 3.7166235585887946, TOL_REDONDEO_FUENTE);      // D32

// Fixtures: "Diseño Quemador Atmosférico", columna GLP (H), 2026-09-01
const glpDiseno = calcularQuemador({
  gas: 'GLP', composicion: composicionGLP, potenciaKw: 25, pciKjKg: 45990,
  cantidadPerforaciones: 400, diametroPerforacionMm: 2,
  coeficienteDescarga: 0.8, diametroInyectorMm: 1.2, presionGasMbar: 29,
  relacionAire: 0.45, temperaturaGasC: 15, temperaturaAmbienteC: 15,
  diametroGargantaMm: 28, cantidadPerforacionesGarganta: 420,
});
cerca(glpDiseno.areaTotalPerforacionesMm2, 1256.6370614359173); // H18
cerca(glpDiseno.tasaQuemadoWMm2, 19.89436788648692);             // H21
cerca(glpDiseno.areaInyectorIn2, 0.0017530122067275179);        // H27
cerca(glpDiseno.presionGasInWC, 11.642339999999999);             // H28
cerca(glpDiseno.densidadRelativaGasAire, 1.6680340557275541, TOL_REDONDEO_FUENTE); // H29
cerca(glpDiseno.caudalInyectorM3H, 0.1740014925258661, TOL_REDONDEO_FUENTE);       // H31
cerca(glpDiseno.potenciaInyectorKw, 4.790505126330362, TOL_REDONDEO_FUENTE);       // H32
// H38 = (Dt/Dh)^2/N — la fórmula que este motor usa para ambos gases (ver
// comentario en calc-quemador.js sobre el probable error en la columna GN)
cerca(glpDiseno.relacionAreaGargantaPerforaciones, 0.4666666666666667); // H38

// Fixtures: "Quem. Atm.", columnas GN (D) y GLP (H), 2026-09-01 — mismos
// inputs de potencia/PCI/relación de aire/temperaturas que "Diseño..." para
// GN (confirmado celda por celda), pero con 68 perforaciones (no 2 más
// perforaciones/diámetro distinto de esa hoja, que no afecta esta cadena).
const gnLlama = calcularQuemador({
  gas: 'GN', composicion: composicionGN, potenciaKw: 5, pciKjKg: 52737,
  cantidadPerforaciones: 68, diametroPerforacionMm: 2,
  coeficienteDescarga: 0.8, diametroInyectorMm: 1.778, presionGasMbar: 8,
  relacionAire: 0.45, temperaturaGasC: 15, temperaturaAmbienteC: 15,
  diametroGargantaMm: 15, cantidadPerforacionesGarganta: 10,
});
// molesAirePremezcla1/racEstequiometricaMasica/flujoAirePremezcla1/
// largoLlama dependen de aireEsteq, que a su vez depende de xCarbono/
// xHidrogeno — con la corrección de gas-gn.js (2026-09-01) se alejan del
// D23/D26/D27/D40 cacheados del Excel más de lo que explica el redondeo
// de PM/densidad (ver TOL_REDONDEO_FUENTE arriba), así que acá van los
// valores recalculados con la fórmula corregida, no los del Excel.
cerca(gnLlama.molesAirePremezcla1, 0.24312970766631023, TOL_REDONDEO_FUENTE);
cerca(gnLlama.racEstequiometricaMasica, 15.636373874731445, TOL_REDONDEO_FUENTE);
cerca(gnLlama.flujoAirePremezcla1KgS, 0.0006671187442999365, TOL_REDONDEO_FUENTE);
cerca(gnLlama.caudalGasPorPerforacionM3S, 9.806733440184042e-7); // D39 (no depende de PM/densidad ni de xCarbono/xHidrogeno)
cerca(gnLlama.largoLlamaMm, 1.8543804220726559, TOL_REDONDEO_FUENTE);

console.log('calc-quemador.test.js: OK');
