# Otros gases: teléfono y Memoria de Cálculo

Detalle de referencia: léelo solo al tocar esto. Las reglas vigentes están en `../CLAUDE.md`.

## Uso desde el teléfono (`css/styles.css`/`ui.js`, 2026-09-25, a pedido del usuario)

Mismo bloque CSS "Uso desde el teléfono" y mismas funciones
`centrarPestana()`/`initResumenMovil()` que Hidrógeno y GN/GLP (detalle y
porqué en `Hidrogeno/CLAUDE.md`): barra de resumen de KPI fija al pie bajo
960px, cajetines a 16px y áreas táctiles de 44px, tabla de tubería de
referencia con scroll propio. Las reglas de tarjetas de la Memoria del
bloque común aplican desde que el módulo tiene Memoria (2026-09-28,
verificado a 375 y 320 px: una tarjeta por tramo, sin desborde). Propio de
este módulo:

- Las reglas de `.selector-gas-activo` y `.segmentado` de este archivo van
  **después** del bloque común y le ganaban por orden: se repite ahí la
  variante táctil (16px / relleno mayor).
- `#gas-activo` con `max-width: 280px` + la etiqueta "Gas" se salía ~30px
  de una pantalla de 320px: bajo 600px ocupa el resto de su fila.

## Memoria de Cálculo (`calc-memoria.js`/`ui.js`/`index.html`/`css/styles.css`, 2026-09-28, a pedido del usuario)

Pedido: "agregar la pestaña de memoria de cálculo para los Otros gases —
necesito poder generar los informes para estos gases". Port de la Memoria
de Hidrógeno (tabla editable de tramos, diagrama unifilar, "Datos del
informe", exportar/importar `.json`, informe A4 de una hoja) — mismas
funciones de `ui.js` y mismo CSS, copiados, con estas diferencias:

- **Motor**: `calcularRed(tramos, { gas, unidadCaudal, factorDiseno })`
  resuelve cada tramo con `calcularFlujo()` (sin accesorios, como la
  Memoria de Hidrógeno), así que un tramo da exactamente lo mismo que
  "Tubería y Flujo" con las mismas entradas (`tests/calc-memoria.test.js`
  lo comprueba contra el baseline de 62,14 mbar). Presión canónica en bar
  manométricos (Hidrógeno: MPa), unidad de columna a elección.
- **Tramo en fase líquida**: sin resultados de gas (celda "Líquido", "—" en
  el resto); su pérdida acumulada y la de todo lo que continúa desde él
  quedan en `null` — salvo un "Reinicia acum." aguas abajo, que corta la
  cadena — en vez de sumar un número hecho con la raíz equivocada.
- **Ciclos en "Continúa desde"** se detectan recorriendo la cadena de
  padres. En Hidrógeno la detección está dentro de la suma de acumuladas,
  y un tramo con reinicio dentro del ciclo la corta: A → B (reinicia) → A
  pasa sin error allá (verificado en su motor; no se tocó).
- **Error de la red** (gas incompleto, ciclo, kW sin PCI): la tabla sigue
  editable con los cálculos en "—" y el motivo en el aviso sobre la tabla
  (Hidrógeno reemplaza la tabla por el mensaje, y un ciclo solo se deshace
  editando justamente la tabla).
- **Caudal por tramo** en kg/h, Nm³/h o kW (kW solo con PCI), elegido en la
  cabecera de la columna y guardado en `proyecto.unidadCaudal`. Los
  números de `tramos` y de los consumos están **en esa unidad**: cambiarla
  convierte conservando el flujo másico; cambiar de gas conserva los
  números en su unidad (lo escrito en Nm³/h sigue en Nm³/h, como el
  cajetín de "Tubería y Flujo"). Excepción: en kW con un gas nuevo sin PCI,
  pasan a kg/h con el PCI del último gas calculado (`gasMemoriaAnterior`) y
  se avisa, en vez de leer "50 kW" como "50 kg/h".
- **Sin deriva de unidades**: los valores se guardan con precisión completa
  y el cajetín muestra 6 cifras (`valorMostrado()`); si el texto del
  cajetín no cambió, `leerMostrado()` conserva el valor guardado. Antes,
  cada ida y vuelta kg/h → kW → kg/h dejaba "49,9999". Aplica a caudal,
  consumos y presión.
- **Verificación de criterios** (sección 5 del informe y marcas ▲ en tabla
  impresa y diagrama): además de velocidad máxima y pérdida acumulada
  (límites manuales, como Hidrógeno), se verifican solos, tramo por tramo:
  velocidad bajo la erosional (API RP 14E, v/Ve ≤ 100 %), presión de
  operación bajo la máxima de diseño (Barlow con el F de "Datos del
  informe", E = 1 y factor T; F vacío = no evaluado) y fase gaseosa con
  margen ≥ 10 °C sobre la condensación (`MARGEN_CONDENSACION_K`). En la
  tabla impresa, marcas "L" (líquido) y "C" (cerca de condensar) junto al
  nombre, con leyenda. Se reemplazó el cajetín manual "Velocidad de erosión"
  de Hidrógeno: acá se calcula por tramo con la densidad real.
- **Informe**: título "Red de <gas> (<fórmula>)"; la sección 2 imprime las
  constantes del gas (M, Tc, Pc, ω, viscosidad, densidad normal, PCI) —
  sin un gas fijo, la memoria no es reproducible sin ellas —, y la 3 es
  "Demanda de gas" con los puntos de consumo en la unidad del caudal. Tabla
  de tramos con 11 columnas (suma Temperatura). "ω" va en
  `.informe-simbolo`: el uppercase del rótulo lo convertía en "Ω".
- **`.json` exportado** = `{ tramos, proyecto, gas }`. Al importar, un gas
  predefinido se selecciona; uno personalizado reemplaza al guardado previa
  confirmación. Un `.json` de Hidrógeno (tramos sin `presionBarG`) se
  rechaza con un mensaje en vez de importarse con otro significado.
- **N° Documento por defecto `402605`** — misma fila `40XXXX` del control de
  documentos que Hidrógeno (`402603`) y GN/GLP (`402604`); "Último Emitido"
  seguía en `402602` el 2026-09-28. Ver `Hidrogeno/CLAUDE.md` para el
  mantenimiento del correlativo.

### El informe en una sola hoja: medición fuera de pantalla

Medido con `page.pdf()` de Chromium (sin emulación de medio): Chrome
dispara `beforeprint` **con los estilos de pantalla todavía activos** —
`matchMedia('print')` = false y el informe, oculto con `display:none`, mide
0 px —, así que `ajustarEscalaImpresion()` de Hidrógeno nunca llega a
achicarlo. Una red de 5 tramos acá salía en 2 hojas (firma y pie en la 2ª),
y lo mismo pasa en Hidrógeno con 13 tramos (verificado; no se tocó ese
módulo). Acá:

- Las reglas visuales del informe viven **fuera** de `@media print`
  (invisibles en pantalla porque el informe va con `style="display:none"`);
  `@media print` solo lo muestra y quita el relleno lateral de `main`, así
  el informe mide en papel exactamente el ancho útil de la hoja (182 mm).
- `ajustarEscalaImpresion()` lo muestra un instante fuera de pantalla con
  ese ancho y lo mide. Con 182 mm, el alto medido coincide con el de papel
  al píxel (1199,5 px en ambos).
- Con `zoom` el informe sigue ocupando el ancho de la hoja, así que por
  dentro se ensancha (182/z mm) y el alto baja más que proporcionalmente:
  disponible/natural dejaba ~11 mm libres al pie (z = 0,83). Ese cociente
  es la cota inferior (siempre cabe) y una búsqueda binaria de 8 pasos
  encuentra el mayor z que entra (0,876 en la red de prueba), midiendo con
  el mismo ancho visual que en papel.

### Verificado (2026-09-28)

`node OtrosGases/tests/run-all.js` en verde (más los de los otros 3
módulos). En navegador, con caché desactivada (el motor es un import de
`ui.js`, fuera del `?v=`): red de 5 tramos de CO₂ con regulador (acumuladas
20,71 → 123,39 → 168,41/153,02 mbar = sumas exactas), un tramo a 60 barG
marcado "Líquido"; NH₃ en kW (50 kg/h = 258,333 kW) y vuelta a CO₂ con
aviso; 4 idas y vueltas kg/h → kW → Nm³/h → kg/h editando otras celdas sin
deriva; gas personalizado incompleto y ciclo con la tabla aún editable;
exportar/importar con gas personalizado (pide confirmar), rechazo de un
`.json` de Hidrógeno y de uno inválido; PDF A4 real de 1 hoja; 1360 px sin
desborde de la tabla, 375 y 320 px en tarjetas; tema oscuro; enlace del hub
a `OtrosGases/#memoria`.
