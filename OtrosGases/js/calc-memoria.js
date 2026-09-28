// Motor de la pestaña "Memoria de Cálculo" — red de tramos ramificada para
// un gas cualquiera (2026-09-28). Misma estructura que
// Hidrogeno/js/calc-memoria.js (cada tramo "continúa desde" otro, la
// pérdida acumulada se hereda del padre y un tramo con reseteaAcumulada
// arranca de 0, como aguas abajo de un regulador), pero cada tramo se
// resuelve con calcularFlujo() de este módulo — la misma cadena que
// "Tubería y Flujo": fase (Lee-Kesler) → Z y densidad (Peng-Robinson) →
// velocidad → Reynolds → Haaland → Darcy-Weisbach, más la velocidad
// erosional (API RP 14E) y la presión máxima de diseño (Barlow). Así una
// corrección de física en calc-flujo.js se hereda sola.
//
// Supuestos (los mismos de Hidrógeno salvo lo anotado):
//   - Presión de cada tramo manométrica [bar] (P_atm = 1,01325 bar).
//   - Cada tramo tiene su propia temperatura.
//   - Sin pérdidas locales por accesorios por tramo (Hidrógeno tampoco las
//     lleva en su Memoria).
//   - Un tramo en fase LÍQUIDA no tiene resultados de gas (aplica: false,
//     pérdidas null): su acumulada y la de todo lo que continúa desde él
//     quedan en null (salvo un reinicio aguas abajo), en vez de sumar un
//     número calculado con la raíz equivocada.

import { calcularFlujo } from './calc-flujo.js';
import { buscarTuberia, tuberiaDesdeManual } from './tuberias.js';

// tuberiaId: id de la tabla (p. ej. 'sch40-0.5') o 'manual' con
// tuberiaManual = { diMm, espesorMm, limiteElasticoMPa, rugosidadMm }.
export function tuberiaDeTramo(tramo) {
  return tramo.tuberiaId === 'manual' ? tuberiaDesdeManual(tramo.tuberiaManual) : buscarTuberia(tramo.tuberiaId);
}

function calcularTramoIndividual(tramo, { gas, unidadCaudal, factorDiseno }) {
  const r = calcularFlujo({
    gas, presionBarG: tramo.presionBarG, temperaturaC: tramo.temperaturaC,
    caudal: tramo.caudal, unidadCaudal, largoM: tramo.longitudM,
    tuberia: tuberiaDeTramo(tramo), factorDiseno,
  });
  return {
    ...tramo,
    aplica: r.aplica,
    fase: r.fase,
    presionMaxDisenoBar: r.presionMaxDisenoBar,
    tuberiaAdecuada: r.tuberiaAdecuada,
    flujoMasicoKgH: r.aplica ? r.flujoMasicoKgH : null,
    z: r.aplica ? r.z : null,
    densidadKgM3: r.aplica ? r.densidadKgM3 : null,
    velocidadFlujoMS: r.aplica ? r.velocidadFlujoMS : null,
    velocidadErosionalMS: r.aplica ? r.velocidadErosionalMS : null,
    perdidaParcialMbar: r.aplica ? r.perdidaCargaMbar : null,
  };
}

// opciones: { gas, unidadCaudal ('kg/h' | 'Nm3/h' | 'kW'), factorDiseno }.
// El gas debe venir validado (validarGas) — igual que en los otros motores.
export function calcularRed(tramos, opciones) {
  const calculados = tramos.map((t) => calcularTramoIndividual(t, opciones));
  const porId = new Map(calculados.map((t) => [t.id, t]));

  for (const t of calculados) {
    if (t.continuaDesdeId !== null && t.continuaDesdeId !== undefined && !porId.has(t.continuaDesdeId)) {
      throw new Error(`El tramo "${t.nombre}" continúa desde "${t.continuaDesdeId}", que no existe en la red.`);
    }
  }

  // Ciclos en "Continúa desde", recorriendo la cadena de padres — no solo
  // al sumar: en Hidrógeno el ciclo se detecta dentro de perdidaAcumulada(),
  // y un tramo con reinicio dentro del ciclo corta esa recursión, así que
  // A → B (reinicia) → A pasaba sin error. Una red de tramos es un árbol.
  for (const t of calculados) {
    const vistos = new Set([t.id]);
    for (let padre = porId.get(t.continuaDesdeId); padre; padre = porId.get(padre.continuaDesdeId)) {
      if (vistos.has(padre.id)) {
        throw new Error(`Ciclo en "Continúa desde": el tramo "${padre.nombre}" termina continuando desde sí mismo.`);
      }
      vistos.add(padre.id);
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
    const heredaBase = tramo.continuaDesdeId && !tramo.reseteaAcumulada;
    const base = heredaBase ? perdidaAcumulada(tramo.continuaDesdeId) : 0;
    const total = base === null || tramo.perdidaParcialMbar === null ? null : tramo.perdidaParcialMbar + base;
    enProgreso.delete(id);
    acumuladaCache.set(id, total);
    return total;
  }

  for (const t of calculados) {
    t.perdidaAcumuladaMbar = perdidaAcumulada(t.id);
  }

  return calculados;
}
