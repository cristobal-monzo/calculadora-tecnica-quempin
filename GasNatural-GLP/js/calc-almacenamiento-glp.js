// Motor de cálculo de la pestaña "Almacenamiento" (solo GLP — cilindros +
// estanque). Fuente: Libro11111111.xlsx!"Bases de Cálculo" (cilindros) y
// MASTER DISEÑO.xlsm!"Estanque GLP" (estanque). Celdas citadas por bloque.

import { propiedadesGLP } from './gas-glp.js';

// Bases de Cálculo!K26:Q35 — consumo de artefactos [kWh/día] por nivel de
// uso y temperatura ambiente.
//
// CORREGIDO respecto al Excel fuente (2026-09-01, a pedido del usuario):
// Cocina/Bajo a 10°C tenía K33=35, muy por encima del resto de la fila
// (4.6, 5.8, 5.8, 5.8, 5.8, 5.8) y del patrón de las filas Medio/Alto de
// la misma tabla (que parten más bajo a 10°C y suben o se aplanan hacia
// temperaturas menores) — se corrigió a 3.5, consistente con ese patrón
// (probable error de tipeo del "." en el Excel original: 3.5 → 35).
const TEMPERATURAS = [10, 5, 0, -5, -10, -15, -20];
const TABLA_CONSUMO_ARTEFACTOS = {
  estufa: {
    bajo: [1.7, 3.5, 7, 10.5, 14, 17.4, 20.9],
    medio: [3.5, 10.5, 20.9, 31.4, 41.9, 52.3, 62.8],
    alto: [3.5, 14, 27.9, 41.9, 55.8, 69.8, 83.7],
  },
  calefont: {
    bajo: [2.3, 3.5, 4.6, 4.6, 4.6, 4.6, 4.6],
    medio: [7, 10.5, 14, 14, 14, 14, 14],
    alto: [7, 14, 20.9, 20.9, 20.9, 20.9, 20.9],
  },
  cocina: {
    bajo: [3.5, 4.6, 5.8, 5.8, 5.8, 5.8, 5.8],
    medio: [4.6, 5.8, 7, 7, 7, 7, 7],
    alto: [7, 8.1, 9.3, 9.3, 9.3, 9.3, 9.3],
  },
};

export function consumoArtefacto({ artefacto, nivel, temperaturaC }) {
  const indice = TEMPERATURAS.indexOf(temperaturaC);
  if (indice === -1) throw new Error(`Temperatura no soportada por la tabla de consumo: ${temperaturaC}°C`);
  return TABLA_CONSUMO_ARTEFACTOS[artefacto][nivel][indice];
}

// Bases de Cálculo!F15:F16 — método por razón de vaporización
export function cilindrosPorVaporizacion({ potenciaTotalKw, razonVaporizacionKw }) {
  return Math.ceil(potenciaTotalKw / razonVaporizacionKw);
}

// Bases de Cálculo!F18:F20 — método por consumo diario
export function cilindrosPorConsumoDiario({ nCalefont, nCocinas, nEstufas, nivel, temperaturaC, pesoCilindroKg }) {
  const consumoDiarioKwh = nCalefont * consumoArtefacto({ artefacto: 'calefont', nivel, temperaturaC })
    + nCocinas * consumoArtefacto({ artefacto: 'cocina', nivel, temperaturaC })
    + nEstufas * consumoArtefacto({ artefacto: 'estufa', nivel, temperaturaC });
  const resultado = (consumoDiarioKwh * 20) / 13.96 / pesoCilindroKg;
  return { consumoDiarioKwh, nCilindros: Math.ceil(resultado) };
}

// Estanque GLP!B5:B9 — capacidad de vaporización natural del estanque.
// Las constantes (5, 26, 0.336, 0.0116, 0.11) son literales del Excel
// fuente (no hay celda de temperatura editable en esa hoja) — se
// preservan tal cual.
//
// CORREGIDO respecto al Excel fuente (2026-09-02, a pedido del usuario):
// B8/B9 convertían qKgH a kW/Mcal con la constante 52737 — que es el PCI de
// GAS NATURAL (ver pciMasa por defecto en gas-gn.js), no el de GLP, pese a
// que este módulo es exclusivamente GLP. Casi con certeza una referencia
// cruzada de hoja en el Excel fuente (Estanque GLP!B8 apuntando a la celda
// de PCI de GN de "Combustión Gas" en vez de la de GLP). Ahora usa el PCI
// real del GLP, derivado de la composición %butano/%propano ingresada (el
// mismo criterio que el resto del módulo usa vía el selector de gas) — ver
// GasNatural-GLP/CLAUDE.md.
export function calcularEstanqueGLP({ diametroM, alturaM, capacidadLitros, pctButano, pctPropano }) {
  const capacidadRealLitros = capacidadLitros * 0.8; // B5
  const superficieM2 = Math.PI * diametroM * alturaM + (2 * Math.PI * diametroM ** 2) / 4; // B6
  const qKgH = 0.336 * superficieM2 * 0.0116 * (5 + 26) / 0.11; // B7
  const pciKjKg = propiedadesGLP({ pctButano, pctPropano }).pciMasa;
  const qKw = (pciKjKg * qKgH) / 3600; // B8
  const qMcalH = (qKgH * pciKjKg) / 4.1858 / 1000; // B9
  return { capacidadRealLitros, superficieM2, qKgH, pciKjKg, qKw, qMcalH };
}
