// Tabla de tubería del módulo: acero al carbono sin costura, ASME B36.10M
// Schedule 40 y 80 (diámetro exterior y espesor nominal publicados; DI =
// DE − 2·espesor). Material de referencia ASTM A106 Gr. B / A53 Gr. B:
// límite elástico mínimo especificado 241 MPa (35 ksi). Rugosidad de acero
// comercial nuevo 0,045 mm (Moody).
//
// Por qué acero y no la tabla de Hidrógeno ni la de GN/GLP: el NH₃ ataca el
// cobre y sus aleaciones (no puede ir por cañería de cobre), y el cálculo de
// presión máxima (Barlow) necesita espesor y límite elástico que la tabla de
// GN/GLP no trae. Los DI de Schedule 40 de 3/8" a 8" coinciden con la
// columna de acero de GasNatural-GLP/js/pipe-network.js (verificada allí
// contra la misma norma; su fila de 1/4" viene del Excel y no calza).
// Otro material (inoxidable, tubing): opción "Manual" en la UI.

export const MATERIAL_TABLA = { nombre: 'Acero al carbono ASTM A106 Gr. B', limiteElasticoMPa: 241, rugosidadMm: 0.045 };

// [pulgadas nominales, DE mm, espesor Sch 40 mm, espesor Sch 80 mm]
const B36_10M = [
  [0.25, 13.7, 2.24, 3.02],
  [0.375, 17.1, 2.31, 3.20],
  [0.5, 21.3, 2.77, 3.73],
  [0.75, 26.7, 2.87, 3.91],
  [1, 33.4, 3.38, 4.55],
  [1.25, 42.2, 3.56, 4.85],
  [1.5, 48.3, 3.68, 5.08],
  [2, 60.3, 3.91, 5.54],
  [2.5, 73.0, 5.16, 7.01],
  [3, 88.9, 5.49, 7.62],
  [4, 114.3, 6.02, 8.56],
  [6, 168.3, 7.11, 10.97],
  [8, 219.1, 8.18, 12.70],
];

export const TABLA_TUBERIA = ['40', '80'].flatMap((cedula, i) => B36_10M.map(([pulgadas, deMm, e40, e80]) => {
  const espesorMm = i === 0 ? e40 : e80;
  return {
    id: `sch${cedula}-${pulgadas}`, cedula, pulgadas, deMm, espesorMm,
    diMm: Math.round((deMm - 2 * espesorMm) * 100) / 100,
    limiteElasticoMPa: MATERIAL_TABLA.limiteElasticoMPa, rugosidadMm: MATERIAL_TABLA.rugosidadMm,
  };
}));

export function buscarTuberia(id) {
  const fila = TABLA_TUBERIA.find((f) => f.id === id);
  if (!fila) throw new Error(`Tubería no encontrada en la tabla: ${id}`);
  return fila;
}

// Tubería manual: el usuario da DI, espesor, límite elástico y rugosidad
// (mismos 4 datos que pide Hidrógeno); el DE se deduce.
export function tuberiaDesdeManual({ diMm, espesorMm, limiteElasticoMPa, rugosidadMm }) {
  return { id: 'manual', cedula: null, pulgadas: null, deMm: diMm + 2 * espesorMm, espesorMm, diMm, limiteElasticoMPa, rugosidadMm };
}
