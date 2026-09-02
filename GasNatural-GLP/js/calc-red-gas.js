// Motor de cálculo de la pestaña "Red de Gas" — dimensionamiento de
// tubería para GLP y GN. Fuente: Libro11111111.xlsx, hoja
// "Bases de Cálculo" (celdas citadas por bloque).
//
// Nota: la hoja fuente usa DOS valores de "densidad relativa" distintos
// para el mismo gas en fórmulas distintas (B18=2 para GLP en la fórmula de
// caudal de baja presión, vs. la tabla J45=1.81 para GLP usada en el
// factor Cr de la rama de alta presión) — se preserva la distinción tal
// cual el Excel, no es un error de este puerto.
import {
  buscarTuberiaRedGas, perdidaAdmisiblePa, factorZPengRobinson, factorSuperexpansion,
  factorCr, caudalBajaPresion, perdidaPresionBajaPresion,
  caudalMediaAltaPresion, perdidaPresionMediaAltaPresion,
} from './pipe-network.js';

// Bases de Cálculo!B18 (baja presión), B19 (PCI volumétrico), y la tabla
// I44:K47 (densidad relativa / viscosidad para Cr) más I40:L41 (Peng-Robinson)
export const PROPIEDADES_RED_GAS = {
  GLP: {
    pciVolumetricoMJm3: 119.7, densidadRelativaBaja: 2,
    densidadRelativaAlta: 1.81, viscosidadCp: 0.008,
    temperaturaCriticaK: 397.45, presionCriticaBar: 40.23, factorAcentrico: 0.176,
  },
  GN: {
    pciVolumetricoMJm3: 37.54, densidadRelativaBaja: 0.59,
    densidadRelativaAlta: 0.62, viscosidadCp: 0.012,
    temperaturaCriticaK: 190.6, presionCriticaBar: 45.99, factorAcentrico: 0.011,
  },
};

export function calcularRedGas(inputs) {
  const { gas, regimenPresion, material, pulgadas, potenciaKw, longitudM, presionInicialPa, temperaturaC, tuberiaManual } = inputs;
  const propiedades = PROPIEDADES_RED_GAS[gas];

  // Diámetro manual [mm] (2026-09-02, a pedido del usuario, "listado más
  // amplio de tuberías... ingresar manualmente un valor de diámetro"): sin
  // fila de tabla no hay material (acero/cobre son solo dos DI distintos de
  // la misma fila) — el usuario da un único DI, y d5 se calcula directo
  // como DI^5 (no viene de la tabla de referencia que sí explica el resto,
  // ver pipe-network.js). k (factor de rugosidad, solo usado en baja
  // presión) también lo da el usuario, ya que no hay forma de derivarlo del
  // diámetro solo.
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

  // Bases de Cálculo!B21 = B20*B19/3.6, invertido: caudal objetivo = Potencia*3.6/PCI
  const caudalObjetivoM3H = (potenciaKw * 3.6) / propiedades.pciVolumetricoMJm3;

  let perdidaPresionRequeridaPa;
  let presionFinalPa = null;

  if (regimenPresion === '<10 kPa') {
    perdidaPresionRequeridaPa = perdidaPresionBajaPresion({
      k, diametro5, caudalM3H: caudalObjetivoM3H,
      densidadRelativa: propiedades.densidadRelativaBaja, longitudM,
    });
  } else {
    const z = factorZPengRobinson({
      presionBarG: presionInicialPa / 100000,
      temperaturaCriticaK: propiedades.temperaturaCriticaK,
      presionCriticaBar: propiedades.presionCriticaBar,
      factorAcentrico: propiedades.factorAcentrico,
    });
    const factorSuperexp = factorSuperexpansion(z);
    const cr = factorCr({
      densidadRelativa: propiedades.densidadRelativaAlta, viscosidadCp: propiedades.viscosidadCp, temperaturaC,
    });
    perdidaPresionRequeridaPa = perdidaPresionMediaAltaPresion({
      diametroMm, presionInicialPa, caudalM3H: caudalObjetivoM3H, factorSuperexp, factorCr: cr, longitudM,
    });
    presionFinalPa = presionInicialPa - perdidaPresionRequeridaPa;
  }

  const diametroM = diametroMm / 1000;
  const areaM2 = Math.PI * diametroM ** 2 / 4;
  const velocidadMS = (caudalObjetivoM3H / 3600) / areaM2;
  const volumenTuberiaM3 = areaM2 * longitudM;

  const perdidaAdmisiblePaValor = perdidaAdmisiblePa(gas);
  const tuberiaAdecuada = perdidaPresionRequeridaPa <= perdidaAdmisiblePaValor;

  return {
    tuberia, diametroMm, caudalObjetivoM3H, perdidaPresionRequeridaPa, presionFinalPa,
    velocidadMS, volumenTuberiaM3, perdidaAdmisiblePa: perdidaAdmisiblePaValor, tuberiaAdecuada,
  };
}
