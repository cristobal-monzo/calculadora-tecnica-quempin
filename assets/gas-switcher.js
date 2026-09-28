// Selector "Cambiar de calculadora" para la cabecera de cada módulo —
// permite moverse entre herramientas sin pasar por el hub. Import y llamar
// initSelectorGas({ actualId, profundidad }) desde el ui.js de cada módulo.
// Lista los módulos por gas y las calculadoras rápidas en dos grupos.

import { GASES, CALCULADORAS_RAPIDAS, enlaceGas } from './gases.js';

const GRUPOS = [
  { etiqueta: 'Por gas', lista: GASES },
  { etiqueta: 'Cálculo rápido', lista: CALCULADORAS_RAPIDAS },
];

export function initSelectorGas({ actualId, profundidad }) {
  const select = document.getElementById('selector-gas');
  if (!select) return;

  const opcion = (gas) => {
    const esActual = gas.id === actualId;
    const deshabilitado = !gas.disponible && !esActual;
    const etiqueta = gas.disponible || esActual ? gas.nombre : `${gas.nombre} (próximamente)`;
    return `<option value="${gas.id}"${esActual ? ' selected' : ''}${deshabilitado ? ' disabled' : ''}>${gas.icono} ${etiqueta}</option>`;
  };
  select.innerHTML = GRUPOS.filter((g) => g.lista.length)
    .map((g) => `<optgroup label="${g.etiqueta}">${g.lista.map(opcion).join('')}</optgroup>`).join('');

  select.addEventListener('change', () => {
    const gas = [...GASES, ...CALCULADORAS_RAPIDAS].find((g) => g.id === select.value);
    if (!gas || gas.id === actualId) return;
    window.location.href = enlaceGas(gas, profundidad);
  });
}
