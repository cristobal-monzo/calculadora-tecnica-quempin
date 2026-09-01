// Motor de cálculo de la pestaña "Memoria de Cálculo" — red de tramos
// ramificada. En el Excel fuente (hoja "MC") esta tabla es de valores
// pegados a mano; acá son fórmulas vivas que reutilizan physics.js y
// gas-h2.js tramo por tramo. Supuestos explícitos frente al Excel:
//   - La presión de cada tramo [MPa] se trata como manométrica (mismo
//     criterio que calc-flujo.js), convertida a bar (*10).
//   - Cada tramo tiene su propia temperatura (default 20°C) — la hoja "MC"
//     no registra temperatura por tramo.
//   - No se incluyen pérdidas locales por accesorios por tramo (la hoja
//     "MC" tampoco las lista) — limitación conocida de v1, ver
//     Hidrogeno/CLAUDE.md.

import { barGaugeAPaAbs, densidadReal, reynolds, rugosidadRelativa, factorFriccionHaaland, perdidaCargaTramo } from './physics.js';
import { H2, buscarTuberia, factorZDiseno } from './gas-h2.js';

function calcularTramoIndividual(tramo) {
  const presionBarG = tramo.presionMPa * 10;
  const tuberia = buscarTuberia(tramo.tuberiaPulgadas);
  const diametroM = tuberia.diMm / 1000;

  const flujoMasicoKgH = (tramo.potenciaKw / H2.pciKjKg) * 3600;
  const zDiseno = factorZDiseno({ presionBarG, temperaturaC: tramo.temperaturaC });
  const densidadKgM3 = densidadReal({
    presionAbsPa: barGaugeAPaAbs(presionBarG), temperaturaC: tramo.temperaturaC,
    masaMolar: H2.masaMolarKgMol, constanteR: H2.constanteR, z: zDiseno,
  });

  const flujoVolM3H = flujoMasicoKgH / densidadKgM3;
  const areaM2 = Math.PI * Math.pow(diametroM, 2) / 4;
  const velocidadFlujoMS = (flujoVolM3H / 3600) / areaM2;

  const reynoldsNum = reynolds({ densidad: densidadKgM3, velocidad: velocidadFlujoMS, diametroM, viscosidad: H2.viscosidadPaS });
  const rugosidadRel = rugosidadRelativa({ rugosidadAbsoluta: tuberia.rugosidadMm, diametroM });
  const factorFriccion = factorFriccionHaaland({ rugosidadRelativa: rugosidadRel, reynolds: reynoldsNum });

  const perdidaParcialMbar = perdidaCargaTramo({
    factorFriccion, longitudM: tramo.longitudM, diametroM, densidad: densidadKgM3,
    velocidad: velocidadFlujoMS, sumaCoeficientesLocales: 0,
  });

  return { ...tramo, densidadKgM3, velocidadFlujoMS, perdidaParcialMbar };
}

export function calcularRed(tramos) {
  const calculados = tramos.map(calcularTramoIndividual);
  const porId = new Map(calculados.map((t) => [t.id, t]));

  for (const t of calculados) {
    if (t.continuaDesdeId !== null && t.continuaDesdeId !== undefined && !porId.has(t.continuaDesdeId)) {
      throw new Error(`El tramo "${t.nombre}" continúa desde "${t.continuaDesdeId}", que no existe en la red.`);
    }
  }

  const acumuladaCache = new Map();
  const enProgreso = new Set();

  function perdidaAcumulada(id) {
    if (acumuladaCache.has(id)) return acumuladaCache.get(id);
    if (enProgreso.has(id)) {
      throw new Error(`Ciclo detectado en la red de tramos, involucrando "${id}".`);
    }
    enProgreso.add(id);
    const tramo = porId.get(id);
    const base = tramo.continuaDesdeId ? perdidaAcumulada(tramo.continuaDesdeId) : 0;
    const total = tramo.perdidaParcialMbar + base;
    enProgreso.delete(id);
    acumuladaCache.set(id, total);
    return total;
  }

  for (const t of calculados) {
    t.perdidaAcumuladaMbar = perdidaAcumulada(t.id);
  }

  return calculados;
}
