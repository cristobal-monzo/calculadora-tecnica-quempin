// Conversión de unidades de presión para los selectores independientes de
// cada campo/resultado (Pa, kPa, mbar, bar, psi). No depende de ningún
// motor de cálculo — estos siguen esperando la unidad interna de siempre
// (Pa/kPa/mbar según el caso); la conversión ocurre solo en ui.js al leer
// el formulario y al mostrar resultados.

export const UNIDADES_PRESION = ['Pa', 'kPa', 'mbar', 'bar', 'psi'];

const FACTORES_A_PA = { Pa: 1, kPa: 1000, mbar: 100, bar: 100000, psi: 6894.757293168361 };

export function aPa(valor, unidad) {
  return valor * FACTORES_A_PA[unidad];
}

export function desdePa(valorPa, unidad) {
  return valorPa / FACTORES_A_PA[unidad];
}

// Decimales por unidad para que el número mostrado tenga una precisión
// razonable sin importar la magnitud (p.ej. bar necesita más decimales que Pa).
const DECIMALES_POR_UNIDAD = { Pa: 1, kPa: 4, mbar: 3, bar: 6, psi: 4 };

export function formatearPresion(valorPa, unidad) {
  return desdePa(valorPa, unidad).toFixed(DECIMALES_POR_UNIDAD[unidad] ?? 3);
}

export function opcionesUnidadPresion(seleccionada) {
  return UNIDADES_PRESION
    .map((u) => `<option value="${u}"${u === seleccionada ? ' selected' : ''}>${u}</option>`)
    .join('');
}
