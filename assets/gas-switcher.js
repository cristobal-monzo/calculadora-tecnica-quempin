// Selector "Cambiar de gas" para la cabecera de cada módulo — permite
// moverse entre herramientas sin pasar por el hub. Import y llamar
// initSelectorGas({ actualId, profundidad }) desde el ui.js de cada módulo.

import { GASES, enlaceGas } from './gases.js';

export function initSelectorGas({ actualId, profundidad }) {
  const select = document.getElementById('selector-gas');
  if (!select) return;

  select.innerHTML = GASES.map((gas) => {
    const esActual = gas.id === actualId;
    const deshabilitado = !gas.disponible && !esActual;
    const etiqueta = gas.disponible || esActual ? gas.nombre : `${gas.nombre} (próximamente)`;
    return `<option value="${gas.id}"${esActual ? ' selected' : ''}${deshabilitado ? ' disabled' : ''}>${gas.icono} ${etiqueta}</option>`;
  }).join('');

  select.addEventListener('change', () => {
    const gas = GASES.find((g) => g.id === select.value);
    if (!gas || gas.id === actualId) return;
    window.location.href = enlaceGas(gas, profundidad);
  });
}
