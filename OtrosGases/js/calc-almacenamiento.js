// Motor de la pestaña "Almacenamiento" para un gas cualquiera, en dos modos
// porque CO₂ y NH₃ a temperatura ambiente casi siempre se guardan
// LICUADOS, y ahí PV=ZnRT no dice nada útil:
//
//   'comprimido' — el recipiente contiene solo gas: m = ρ(P,T)·V con ρ de
//                  Peng-Robinson (el equivalente de Hidrógeno/Almacenamiento).
//                  Si a (P, T) el gas condensaría, no se calcula (aplica: false).
//   'licuado'    — líquido + vapor: la masa la fija el grado de llenado
//                  reglamentario (kg por litro de capacidad de agua), no la
//                  presión; la presión es la de vapor a esa temperatura.

import { celsiusAKelvin, estadoFase, factorZ, densidadReal, densidadNormal, presionVaporPa } from './termo.js';
import { flujoMasicoKgH } from './caudal.js';
import { P_ATMOSFERICA_PA } from './physics.js';

function consumoYAutonomia({ gas, masaKg, consumo, unidadConsumo, densidadNormalKgM3 }) {
  const consumoKgH = flujoMasicoKgH({ caudal: consumo, unidad: unidadConsumo, densidadNormalKgM3, pciMJkg: gas.pciMJkg });
  return {
    consumoKgH,
    consumoNm3H: consumoKgH / densidadNormalKgM3,
    autonomiaHoras: consumoKgH > 0 ? masaKg / consumoKgH : null,
  };
}

export function calcularAlmacenamiento(inputs) {
  const { gas, modo, temperaturaC, volumenM3, consumo = 0, unidadConsumo = 'kg/h' } = inputs;
  const temperaturaK = celsiusAKelvin(temperaturaC);
  const normal = densidadNormal(gas);

  if (modo === 'licuado') {
    const { gradoLlenadoKgL } = inputs;
    const presionVapor = presionVaporPa({ gas, temperaturaK });
    // Sobre Tc no hay líquido ni presión de vapor: la presión depende de la
    // densidad de llenado y sube rápido con T — no se estima (Peng-Robinson
    // yerra hasta ~10 % en densidad justo en esa zona, ver CLAUDE.md).
    const supercritico = presionVapor === null;
    const masaKg = volumenM3 * 1000 * gradoLlenadoKgL;
    return {
      modo, aplica: true, supercritico, masaKg,
      presionVaporAbsBar: supercritico ? null : presionVapor / 1e5,
      presionVaporManBar: supercritico ? null : (presionVapor - P_ATMOSFERICA_PA) / 1e5,
      volumenNormalNm3: masaKg / normal.densidadKgM3,
      densidadNormalKgM3: normal.densidadKgM3, densidadNormalIdeal: normal.ideal,
      ...consumoYAutonomia({ gas, masaKg, consumo, unidadConsumo, densidadNormalKgM3: normal.densidadKgM3 }),
    };
  }

  const { presionBarAbs } = inputs;
  const presionAbsPa = presionBarAbs * 1e5;
  const fase = estadoFase({ gas, presionAbsPa, temperaturaK });
  if (fase.estado === 'liquido') return { modo, aplica: false, fase };

  const z = factorZ({ gas, presionAbsPa, temperaturaK });
  const densidadKgM3 = densidadReal({ gas, presionAbsPa, temperaturaK, z });
  const masaKg = densidadKgM3 * volumenM3;
  return {
    modo, aplica: true, fase, z, densidadKgM3, masaKg,
    volumenNormalNm3: masaKg / normal.densidadKgM3,
    densidadNormalKgM3: normal.densidadKgM3, densidadNormalIdeal: normal.ideal,
    ...consumoYAutonomia({ gas, masaKg, consumo, unidadConsumo, densidadNormalKgM3: normal.densidadKgM3 }),
  };
}

export function formatearHoras(horasDecimal) {
  const totalSegundos = Math.round(horasDecimal * 3600);
  const h = Math.floor(totalSegundos / 3600);
  const m = Math.floor((totalSegundos % 3600) / 60);
  const s = totalSegundos % 60;
  const dosDigitos = (n) => String(n).padStart(2, '0');
  return `${dosDigitos(h)}:${dosDigitos(m)}:${dosDigitos(s)}`;
}
