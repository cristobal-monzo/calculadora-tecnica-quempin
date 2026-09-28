// Motor de "Diámetro de Tubería" (2026-09-28, a pedido del usuario): dado
// el gas, la potencia, el largo y la cantidad de codos, recorre la tabla de
// tubería de menor a mayor y devuelve el PRIMER diámetro nominal que cumple
// todos los criterios de diseño del gas.
//
// No reimplementa ninguna fórmula: cada diámetro candidato se resuelve con
// el motor del módulo de ese gas, importado (no copiado) — igual criterio
// que GasNatural-GLP/js/calc-memoria-red-gas.js: cualquier corrección futura
// a esos motores se hereda acá automáticamente.
//   - GLP y Gas Natural: calcularRedGas() de GasNatural-GLP (D.S. 66, f.1–f.5,
//     Tabla VI y Tabla IX).
//   - Hidrógeno: calcularFlujo() de Hidrogeno (Darcy-Weisbach + Haaland,
//     Z de NIST, Barlow con Hf y T de ASME B31.12).
// Ver DiametroTuberia/CLAUDE.md.

import { calcularRedGas, buscarGasTablaVI } from '../../GasNatural-GLP/js/calc-red-gas.js';
import { TABLA_TUBERIA_RED_GAS, VELOCIDAD_MAXIMA_DS66_MS } from '../../GasNatural-GLP/js/pipe-network.js';
import { calcularFlujo } from '../../Hidrogeno/js/calc-flujo.js';
import { TABLA_TUBERIA as TABLA_TUBERIA_H2 } from '../../Hidrogeno/js/gas-h2.js';

export const GASES_DIAMETRO = ['GLP', 'GN', 'H2'];

// Frontera baja/media presión del D.S. 66, la misma que usa Red de Gas
// ('<10 kPa' / '>10 kPa'). Acá el régimen se DEDUCE de la presión de
// suministro en vez de pedirse aparte: dos campos que pueden contradecirse
// (régimen "baja" con 150 kPa) son un error esperando a ocurrir.
export const UMBRAL_MEDIA_PRESION_PA = 10000;

export function regimenDesdePresion(presionPa) {
  return presionPa < UMBRAL_MEDIA_PRESION_PA ? '<10 kPa' : '>10 kPa';
}

// Longitud equivalente de un codo estándar de 90° = 30 diámetros interiores
// (Crane, Technical Paper 410, "Flow of Fluids through Valves, Fittings and
// Pipe": K = 30·fT). Con fT ≈ 0,023 (tubería de ~1") da K ≈ 0,7 — el mismo
// K por codo que usan Hidrógeno y Otros Gases (Calculos H2.xlsx), así que los
// tres módulos cuentan un codo con el mismo peso. El D.S. 66 trabaja con
// longitudes (f.1/f.3 reciben L), por eso en GLP/GN el codo entra como
// metros equivalentes; en H₂ el motor ya lo suma como ΣK·ρv²/2.
export const LD_CODO_POR_DEFECTO = 30;

// K por codo que suma Hidrogeno/js/calc-flujo.js (Cálculo!C16). Acá solo se
// usa para mostrarlo; el test verifica que coincida con lo que el motor suma.
export const K_CODO_H2 = 0.7;

// D.S. 66 Tabla IX cubre de 3/8" a 4" (kTablaIX en pipe-network.js). Fuera de
// ese rango el factor K de baja presión es extrapolado, y 1/8"–1/4" no son
// diámetros de red de artefactos: solo se proponen los de la tabla.
const TUBERIA_GLP_GN = TABLA_TUBERIA_RED_GAS.filter((f) => f.kTablaIX);

// Criterio de velocidad para H₂: el mismo valor por defecto que la Memoria
// de Cálculo de Hidrógeno ("Velocidad máxima flujo de gas", 20 m/s).
export const VELOCIDAD_MAX_H2_POR_DEFECTO = 20;

// Factor de diseño F para Barlow en H₂: Clase 4 (0,40), el más conservador
// de la Tabla PL-3.7.1(b)(6)-1 y el valor por defecto de Tubería y Flujo.
export const FACTOR_DISENO_H2 = 0.4;

// El caso límite de H₂ que pide el screening de flujo sónico (ΔP/P₁ ≤ 10 %):
// mismo umbral que chequeoCaidaPresion() de Hidrogeno/js/physics.js.
const CAIDA_MAX_H2 = 0.10;

function validarEntradas({ gas, potenciaKw, longitudM, codos, presionPa, temperaturaC }) {
  if (!GASES_DIAMETRO.includes(gas)) throw new Error(`Gas no soportado: ${gas}`);
  if (!(potenciaKw > 0)) throw new Error('Ingresa la potencia que alimenta la tubería (mayor que 0 kW).');
  if (!(longitudM > 0)) throw new Error('Ingresa el largo de la tubería (mayor que 0 m).');
  if (!Number.isInteger(codos) || codos < 0) throw new Error('La cantidad de codos debe ser un número entero (0 o más).');
  if (!Number.isFinite(presionPa) || presionPa <= 0) throw new Error('La presión de suministro debe ser mayor que 0.');
  if (!Number.isFinite(temperaturaC) || temperaturaC <= -273.15) throw new Error('Temperatura fuera de rango.');
}

// Un criterio evaluado: `uso` = valor/límite (≤ 1 cumple). Sirve para decir
// cuál criterio "manda" en el diámetro elegido (el de mayor uso).
// `estricto`: el límite no se alcanza (valor < límite), como la velocidad
// del D.S. 66 art. 45.2.9 d) ("deberá ser inferior a 40 m/s").
function criterio(id, nombre, valor, limite, unidad, estricto = false) {
  return {
    id, nombre, valor, limite, unidad, estricto,
    uso: valor / limite, cumple: estricto ? valor < limite : valor <= limite,
  };
}

function conResumen(candidato) {
  const cumple = candidato.criterios.length > 0 && candidato.criterios.every((c) => c.cumple);
  const gobernante = candidato.criterios.reduce((max, c) => (max === null || c.uso > max.uso ? c : max), null);
  return { ...candidato, cumple, gobernante };
}

/* ---------------------------------------------------------------------- */
/* GLP y Gas Natural — D.S. 66                                            */
/* ---------------------------------------------------------------------- */

function evaluarRedGas(entradas, fila) {
  const { gas, gasTablaVI, material, potenciaKw, longitudM, codos, ldCodo, presionPa, temperaturaC } = entradas;
  const diMm = material === 'Acero Sch40' ? fila.diAceroMm : fila.diCobreMm;
  const longitudCodosM = (codos * ldCodo * diMm) / 1000;
  const base = {
    gas, gasTablaVI, material, pulgadas: fila.pulgadas, potenciaKw, temperaturaC,
    regimenPresion: regimenDesdePresion(presionPa), presionInicialPa: presionPa,
  };
  const candidato = { pulgadas: fila.pulgadas, diMm, longitudCodosM, longitudCalculoM: longitudM + longitudCodosM };
  let r, sinCodos;
  try {
    r = calcularRedGas({ ...base, longitudM: candidato.longitudCalculoM });
    sinCodos = calcularRedGas({ ...base, longitudM });
  } catch (error) {
    // Media presión: el caudal no pasa por este diámetro a esta presión
    // (perdidaPresionMediaAltaPresion lanza en vez de devolver p2² < 0).
    return { ...candidato, excedeCapacidad: true, criterios: [], cumple: false, gobernante: null };
  }
  const criterios = [criterio('perdida', 'Pérdida de carga', r.perdidaPresionTotalPa, r.perdidaAdmisiblePa, 'Pa')];
  // D.S. 66 art. 45.2.9 d): sobre la presión de abastecimiento directo a los
  // artefactos (régimen >10 kPa), cualquier gas, velocidad < 40 m/s. Es la
  // velocidad de f.5, a la presión final del tramo (la más alta).
  if (base.regimenPresion !== '<10 kPa') {
    criterios.push(criterio('velocidad', 'Velocidad del gas (D.S. 66)', r.velocidadMS, VELOCIDAD_MAXIMA_DS66_MS, 'm/s', true));
  }
  return conResumen({
    ...candidato,
    perdidaPa: r.perdidaPresionTotalPa,
    perdidaCodosPa: r.perdidaPresionTotalPa - sinCodos.perdidaPresionTotalPa,
    velocidadMS: r.velocidadMS,
    presionFinalPa: presionPa - r.perdidaPresionTotalPa,
    criterios,
    detalle: r,
  });
}

function calcularGLPoGN(entradas) {
  const regimen = regimenDesdePresion(entradas.presionPa);
  const candidatos = TUBERIA_GLP_GN.map((fila) => evaluarRedGas(entradas, fila));
  // Datos que no dependen del diámetro: se leen del primer candidato
  // resuelto (en media presión el más chico puede no tener solución).
  const referencia = candidatos.find((c) => c.detalle)?.detalle
    ?? calcularRedGas({
      gas: entradas.gas, gasTablaVI: entradas.gasTablaVI, material: entradas.material,
      pulgadas: TUBERIA_GLP_GN[TUBERIA_GLP_GN.length - 1].pulgadas, potenciaKw: entradas.potenciaKw,
      longitudM: 1e-9, regimenPresion: regimen, presionInicialPa: entradas.presionPa, temperaturaC: entradas.temperaturaC,
    });
  const filaTablaVI = buscarGasTablaVI(entradas.gas, entradas.gasTablaVI);
  return {
    metodo: 'ds66',
    regimen,
    candidatos,
    caudalM3H: referencia.caudalObjetivoM3H,
    perdidaAdmisiblePa: referencia.perdidaAdmisiblePa,
    tablaVI: filaTablaVI,
    riesgoCondensacion: referencia.riesgoCondensacion,
    presionRocioAbsPa: referencia.presionRocioAbsPa,
  };
}

/* ---------------------------------------------------------------------- */
/* Hidrógeno — Darcy-Weisbach (motor de Tubería y Flujo)                  */
/* ---------------------------------------------------------------------- */

function evaluarH2(entradas, fila) {
  const { potenciaKw, longitudM, codos, presionPa, temperaturaC, velocidadMaxMS } = entradas;
  const presionBarG = presionPa / 1e5;
  const base = {
    presionBarG, temperaturaC, potenciaKw, tuberiaPulgadas: fila.pulgadas,
    // Presión mínima = la de suministro: velocidad de flujo y erosional se
    // evalúan en el mismo estado (ver Hidrogeno/CLAUDE.md, 2026-09-25).
    presionMinBarG: presionBarG,
    largoM: longitudM, tees: 0, valvulas: 0, factorDiseno: FACTOR_DISENO_H2, factorUnion: 1,
  };
  const r = calcularFlujo({ ...base, codos });
  const sinCodos = calcularFlujo({ ...base, codos: 0 });
  const perdidaPa = r.perdidaCargaMbar * 100;
  const presionAbsPa = presionPa + 1e5; // mismo 1 bar atmosférico del módulo Hidrógeno
  return conResumen({
    pulgadas: fila.pulgadas,
    diMm: fila.diMm,
    perdidaPa,
    perdidaCodosPa: perdidaPa - sinCodos.perdidaCargaMbar * 100,
    velocidadMS: r.velocidadFlujoMS,
    presionFinalPa: presionPa - perdidaPa,
    criterios: [
      criterio('velocidad', 'Velocidad del gas', r.velocidadFlujoMS, velocidadMaxMS, 'm/s'),
      criterio('perdida', 'Pérdida de carga', perdidaPa, CAIDA_MAX_H2 * presionAbsPa, 'Pa'),
      criterio('erosion', 'Velocidad de erosión (API RP 14E)', r.velocidadFlujoErosionMS, r.velocidadErosionMS, 'm/s'),
      criterio('presion-diseno', 'Presión máxima de diseño (Barlow)', presionBarG, r.presionMaxDisenoBar, 'bar'),
    ],
    detalle: r,
  });
}

function calcularH2(entradas) {
  const candidatos = TABLA_TUBERIA_H2.map((fila) => evaluarH2(entradas, fila));
  return {
    metodo: 'darcy',
    regimen: null,
    candidatos,
    caudalM3H: candidatos[0].detalle.flujoVolNormalizado, // Nm³/h (0 °C, 1 bar)
    perdidaAdmisiblePa: CAIDA_MAX_H2 * (entradas.presionPa + 1e5),
  };
}

/* ---------------------------------------------------------------------- */

// entradas: { gas: 'GLP'|'GN'|'H2', potenciaKw, longitudM, codos,
//   presionPa (manométrica), temperaturaC,
//   GLP/GN: material ('Cobre tipo L'|'Acero Sch40'), gasTablaVI, ldCodo,
//   H2: velocidadMaxMS }
export function calcularDiametro(entradas) {
  const e = {
    ldCodo: LD_CODO_POR_DEFECTO, velocidadMaxMS: VELOCIDAD_MAX_H2_POR_DEFECTO, material: 'Cobre tipo L',
    ...entradas,
  };
  validarEntradas(e);
  if (e.gas !== 'H2' && !(e.ldCodo >= 0)) throw new Error('La longitud equivalente por codo no puede ser negativa.');
  if (e.gas === 'H2' && !(e.velocidadMaxMS > 0)) throw new Error('La velocidad máxima debe ser mayor que 0 m/s.');

  const resultado = e.gas === 'H2' ? calcularH2(e) : calcularGLPoGN(e);
  const indiceRecomendado = resultado.candidatos.findIndex((c) => c.cumple);
  return {
    gas: e.gas,
    ...resultado,
    indiceRecomendado,
    recomendado: indiceRecomendado === -1 ? null : resultado.candidatos[indiceRecomendado],
    mayor: resultado.candidatos[resultado.candidatos.length - 1],
  };
}
