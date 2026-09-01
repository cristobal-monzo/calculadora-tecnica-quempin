# Calculadora Técnica QUEMPIN — Hidrógeno (diseño)

Fecha: 2026-09-01
Estado: aprobado por el usuario (proceso de brainstorming en chat), pendiente de
revisión de este documento.

## Contexto y objetivo

QUEMPIN quiere un dashboard web, estático y publicado en GitHub Pages, con
calculadoras de ingeniería para distintos gases (diámetro de tuberías,
volúmenes/masas de almacenamiento, presiones de diseño). Se parte con
**hidrógeno**, migrando la lógica de `Calculos H2.xlsx` (hoja de cálculo de
Cristóbal Monzó, instalador de gas clase 1 y 5) a una app web. Gas Natural y
GLP se agregarán después, en un sitio separado que compartirá pestaña entre
ambos gases (decisión del usuario — ver sección "Fuera de alcance").

Repo nuevo y propio: `calculadora-tecnica-quempin`, público, GitHub Pages
sirviendo directo desde `main` (root) — no se necesita la rama huérfana
`gh-pages` del patrón de `finanzas-quempin`, porque acá no hay un export de
datos sensibles que mantener fuera del sitio: el repo completo es el sitio.
Sin gate de contraseña (herramienta de referencia de ingeniería, no expone
datos financieros ni de clientes).

## Fuente de verdad

`Calculos H2.xlsx` (hoja `Cálculo`, `MC`, `Sheet3`, `Antecedentes`) —
analizado celda por celda (fórmulas + valores cacheados) el 2026-09-01. Los
valores cacheados de esa fecha son la base de los tests de regresión (ver
"Testing").

## Estructura de carpetas

```
calculadora-tecnica-quempin/
├── CLAUDE.md                    # maestro: alcance multi-gas, marca, hosting
├── index.html                   # hub: tarjetas por gas
├── assets/
│   ├── LOGO QUEMPIN.PNG
│   └── OFICIAL MANUAL DE MARCA GRÁFICA QUEMPIN.pdf
└── Hidrogeno/
    ├── CLAUDE.md                # contenido: fórmulas, supuestos, discrepancias fuente
    ├── index.html                # app de una página, 3 pestañas
    ├── css/styles.css
    ├── js/
    │   ├── gas-h2.js             # constantes físicas H2 + tabla tubería + tabla ASME
    │   ├── physics.js            # funciones puras compartidas (Reynolds, fricción, Z, densidad real, Barlow)
    │   ├── calc-flujo.js         # motor: pestaña "Tubería y Flujo"
    │   ├── calc-almacenamiento.js# motor: pestaña "Almacenamiento"
    │   ├── calc-memoria.js       # motor: pestaña "Memoria de Cálculo" (red ramificada)
    │   ├── ui.js                 # bindings DOM, pestañas, formularios reactivos
    │   └── storage.js            # autoguardado localStorage + exportar/importar JSON
    └── tests/
        └── calc.test.js          # regresión contra valores cacheados del Excel (node, sin framework)
```

`_reference-finanzas-quempin/` (índice y CLAUDE.md del hub de Finanzas
QUEMPIN, dejados ahí solo como referencia visual local) y
`Calculos H2 - Acceso directo.lnk` quedan fuera del repo vía `.gitignore`.

## Arquitectura de cálculo

- `physics.js` contiene funciones puras, sin estado, gas-agnósticas en su
  forma matemática (reciben todos los parámetros físicos como argumentos):
  número de Reynolds, factor de fricción de Haaland, rugosidad relativa,
  densidad real de un gas vía `P·M / (Z·R·T)`, fórmula de Barlow para presión
  máxima de diseño (`10·(2·S·t/D)·F·E`), velocidad erosional estilo API
  RP 14E.
- `gas-h2.js` contiene lo específico de hidrógeno: masa molar, R, PCI/PCS,
  gravedad específica, la correlación de compresibilidad Z de 9 términos
  (coeficientes `ai/bi/ci` extraídos de la hoja `Cálculo!B84:D92`), la tabla
  de tubería (`H33:L38`: DI, espesor, límite elástico, rugosidad para 6
  diámetros nominales de ¼" a 1¼") y la tabla de referencia de factores de
  diseño ASME B31.12 por "location class" (`A55:I59`).
- `calc-flujo.js`, `calc-almacenamiento.js` y `calc-memoria.js` orquestan
  `physics.js` + `gas-h2.js` para cada pestaña. `calc-memoria.js` reutiliza
  las mismas funciones de `physics.js` por tramo (ver más abajo).
- Sin frameworks. HTML/CSS/JS simple, consistente con el resto de
  visualizadores QUEMPIN.

### Pestaña 1 — Tubería y Flujo (hoja `Cálculo`)

Puerto 1:1 de las fórmulas de la hoja, con estas notas:

- Inputs: presión manométrica [bar], temperatura [°C], potencia de
  combustión [kW], tubería utilizada (dropdown de 6 tamaños ¼"–1¼"),
  presión manométrica mínima [bar], largo de línea [m], cantidad de
  codos/tees/válvulas, factor de diseño F (ASME B31.12, input manual — en el
  Excel **no** hay fórmula que derive F de la tabla de location class, el
  usuario lo elige a mano; se replica igual, mostrando la tabla como
  referencia de consulta, no como cálculo automático) y factor de uniones
  longitudinales E.
- Outputs: presión máxima de diseño, densidad real, flujo volumétrico
  normalizado y de H₂ (con toggle de unidades, igual que los dropdowns
  `D11`/`D12` del Excel), flujo másico, velocidad de erosión (con
  chequeo visual si la velocidad de flujo se acerca o supera el límite),
  velocidad de flujo, pérdidas de carga (Darcy-Weisbach + Reynolds +
  factor de fricción de Haaland), factor Z de diseño y factor Z de
  erosión.
- Todas las fórmulas fuente quedan documentadas con su celda de origen en
  comentarios de `calc-flujo.js`, para poder auditar contra el Excel.

### Pestaña 2 — Almacenamiento (hoja `Sheet3`)

Puerto de la hoja con **una corrección deliberada**, documentada en
`Hidrogeno/CLAUDE.md`:

- El Excel tiene `H7 (Densidad real) = Cálculo!C20`, es decir, la hoja de
  almacenamiento muestra la densidad calculada con la presión/temperatura de
  la hoja de **flujo de tubería** (~0.8 bar), no con la presión/temperatura
  de **este** estanque (~200 bar). Es un acople cruzado que en el Excel
  original probablemente pasó inadvertido porque ambas hojas rara vez se
  miran a la vez. En una app con las dos pestañas visibles y editables en la
  misma sesión, mostrar la densidad equivocada sería un bug visible, así que
  la app calcula la densidad real de almacenamiento con `physics.js` usando
  la presión y temperatura **propias** de la pestaña de Almacenamiento.
- Se mantienen tal cual (sin "corregir") dos inconsistencias menores que no
  son bugs de acople sino elecciones numéricas propias de cada hoja:
  el PCI usado acá es 119960 kJ/kg (vs. 120000 kJ/kg en la hoja de Flujo) y
  el corte de la función escalón del factor Z (`IFS(P<50,1.02;P<200,1.1;
  P<300,1.2)`, sin el tramo `P<20→1` que sí tiene la hoja de Flujo). Quedan
  documentadas en `Hidrogeno/CLAUDE.md` para que Cristóbal decida si
  unificarlas en una futura revisión — no es algo que deba decidir la IA
  por su cuenta.
- Outputs: masa de H₂ almacenada (PV=ZnRT real, no gas ideal), volumen
  normalizado, autonomía (`hh:mm:ss`, a partir del consumo del quemador),
  caudal y velocidad de referencia en línea capilar Ø¼", tiempo de llenado.

### Pestaña 3 — Memoria de Cálculo (hoja `MC`, red ramificada)

Este es el módulo nuevo (en el Excel, la hoja `MC` es una tabla de resultados
pegados a mano, no fórmulas vivas — acá sí serán fórmulas vivas):

- Cada **tramo** es una fila: nombre, "continúa desde" (selector de otro
  tramo o "— raíz —"), presión de operación [MPa], longitud [m], potencia
  [kW], diámetro (mismo dropdown de la tabla de tubería), material (texto
  libre, informativo — la tabla de tubería no tiene variantes por material,
  así que el material no cambia la física, solo documenta qué se instaló).
  Un campo de temperatura por tramo (default 20 °C, editable) porque la hoja
  `MC` no registra temperatura por tramo y la física de densidad/Z la
  necesita — se documenta como supuesto explícito.
- Por tramo se calcula, reutilizando `physics.js`: densidad real, velocidad
  de flujo, pérdida de carga **de ese tramo** (fricción de Darcy-Weisbach
  sobre su propia longitud y diámetro; **sin** pérdidas locales por
  accesorios en v1 — la hoja `MC` tampoco las lista por tramo, a diferencia
  de la hoja `Cálculo` que sí tiene codos/tees/válvulas globales — se
  documenta como limitación conocida de v1).
- La **pérdida acumulada** de un tramo = su propia pérdida + la acumulada
  del tramo del que "continúa" (0 si es raíz). Esto reproduce exactamente
  la topología de árbol de la hoja `MC` (ej. el tramo `D-X` continúa desde
  `C-D`, y tanto `D-E` como `D-X` parten del mismo padre).
- UI: diagrama de árbol interactivo (SVG, tooltip por nodo con
  presión/velocidad/pérdida acumulada) + tabla ordenable/filtrable/con
  buscador de todos los tramos debajo. Hoja de estilos `@media print` con
  membrete QUEMPIN para poder Ctrl+P → Guardar como PDF (sin dependencias
  JS nuevas).

## Persistencia

- Autoguardado en `localStorage` (clave por pestaña: inputs de Flujo,
  inputs de Almacenamiento, red de tramos de Memoria) — se recupera el
  estado al recargar la página.
- Memoria de Cálculo además tiene "Exportar proyecto" (descarga un `.json`
  con la red de tramos completa) e "Importar proyecto" (carga un `.json`
  previamente exportado). Permite guardar/versionar/compartir un proyecto
  real (ej. `H2V-LAB.json`) fuera del navegador.

## Diseño visual

Se reutiliza el sistema de marca ya validado en el hub de Finanzas QUEMPIN
(`_reference-finanzas-quempin/index.html`, que a su vez viene del manual de
marca oficial): tipografía Lato embebida, cabecera negra con filete
naranjo (`#ff5100`, Pantone Orange 021 C), variables CSS para tema
claro/oscuro (`prefers-color-scheme` + toggle manual vía `data-theme`),
tarjetas para el hub. Favicon propio para este proyecto (🧪, distinto a los
usados por los módulos de Finanzas QUEMPIN).

## Testing

`Hidrogeno/tests/calc.test.js`: script plano ejecutable con `node` (sin
framework), que llama a las funciones de `calc-flujo.js` y
`calc-almacenamiento.js` con los inputs conocidos del Excel y compara
contra los valores cacheados extraídos el 2026-09-01 (tolerancia relativa
~1e-9), por ejemplo:

- `presionMaximaDiseno({S:170, t:1.2, DI:12.7, F:0.4, E:1}) ≈ 128.50393700787401`
- `densidadReal({P:0.8, T:20, Z:1.0004759430898928}) ≈ 0.14881834275071656`
- `factorZ_H2({P:0.8, T:20}) ≈ 1.0004759430898928`
- `masaAlmacenada({T:20, P:200, V:0.19, Z:1.2}) ≈ 2.619197844806117`

Esto es la garantía de que el puerto a JS es matemáticamente fiel al Excel
(el objetivo de "que todo tenga coherencia" del usuario). Se ejecuta antes
de dar el trabajo por terminado.

Verificación manual en navegador (Playwright): cargar cada pestaña, ingresar
los valores de ejemplo del Excel y confirmar visualmente que los outputs
coinciden con los mismos valores cacheados.

## Fuera de alcance (v1)

- Gas Natural / GLP (sitio separado, con selector de gas compartiendo
  pestaña entre ambos — se construye en un ciclo de diseño futuro, no
  ahora).
- Pérdidas locales por accesorios (codos/tees/válvulas) en la Memoria de
  Cálculo por tramo.
- Derivar automáticamente el factor de diseño F desde la tabla de location
  class de ASME B31.12 (se mantiene como input manual, igual que en el
  Excel).
- Autenticación/gate de acceso.
