// Registro único de módulos de gas del dashboard. El hub (index.html) y el
// selector de herramienta dentro de cada módulo (gas-switcher.js) leen de
// acá — agregar un gas nuevo es editar esta lista, no repetirla en cada
// página.

//
// `herramientas`: las pestañas del módulo, en orden — el hub las lista como
// enlaces directos (`<ruta>#<id>`). Cada `id` debe coincidir con el
// `data-tab` del botón de pestaña en el index.html del módulo (initTabs()
// del ui.js de cada módulo activa la pestaña desde el hash de la URL).
// `normas`: referencia normativa principal, se muestra como etiqueta en la
// tarjeta del hub.

export const GASES = [
  {
    id: 'hidrogeno',
    nombre: 'Hidrógeno',
    icono: '🧪',
    ruta: 'Hidrogeno/',
    disponible: true,
    normas: 'ASME B31.12 · NFPA 2',
    desc: 'Tubería y flujo (ASME B31.12), almacenamiento (PV=ZnRT) y memoria de cálculo de redes ramificadas.',
    herramientas: [
      { id: 'flujo', nombre: 'Tubería y Flujo' },
      { id: 'almacenamiento', nombre: 'Almacenamiento' },
      { id: 'memoria', nombre: 'Memoria de Cálculo' },
    ],
  },
  {
    id: 'gas-natural-glp',
    nombre: 'Gas Natural / GLP',
    icono: '🔥',
    ruta: 'GasNatural-GLP/',
    disponible: true,
    normas: 'D.S. N°66',
    desc: 'Red de gas, cilindros y estanque GLP, combustión y quemador atmosférico — un selector alterna entre GLP y GN.',
    herramientas: [
      { id: 'red-gas', nombre: 'Red de Gas' },
      { id: 'almacenamiento', nombre: 'Almacenamiento GLP' },
      { id: 'combustion', nombre: 'Combustión' },
      { id: 'quemador', nombre: 'Quemador Atmosférico' },
      { id: 'memoria', nombre: 'Memoria de Cálculo' },
    ],
  },
];

// `profundidad` = cuántas carpetas hay entre la página actual y la raíz del
// repo (0 desde el hub, 1 desde Hidrogeno/index.html, etc.)
export function enlaceGas(gas, profundidad = 0) {
  return '../'.repeat(profundidad) + gas.ruta;
}
