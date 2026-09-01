// Registro único de módulos de gas del dashboard. El hub (index.html) y el
// selector de herramienta dentro de cada módulo (gas-switcher.js) leen de
// acá — agregar un gas nuevo es editar esta lista, no repetirla en cada
// página.

export const GASES = [
  {
    id: 'hidrogeno',
    nombre: 'Hidrógeno',
    icono: '🧪',
    ruta: 'Hidrogeno/',
    disponible: true,
    desc: 'Tubería y flujo (ASME B31.12), almacenamiento (PV=ZnRT) y memoria de cálculo de redes ramificadas.',
  },
  {
    id: 'gas-natural-glp',
    nombre: 'Gas Natural / GLP',
    icono: '🔥',
    ruta: 'GasNatural-GLP/',
    disponible: false,
    desc: 'Próximamente — selector de gas compartido entre Gas Natural y GLP.',
  },
];

// `profundidad` = cuántas carpetas hay entre la página actual y la raíz del
// repo (0 desde el hub, 1 desde Hidrogeno/index.html, etc.)
export function enlaceGas(gas, profundidad = 0) {
  return '../'.repeat(profundidad) + gas.ruta;
}
