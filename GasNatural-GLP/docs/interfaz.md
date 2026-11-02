# Gas Natural / GLP: interfaz

Detalle de referencia: léelo solo al tocar esto. Las reglas vigentes están en `../CLAUDE.md`.

## Separador decimal flexible en cajas de ingreso manual (`ui.js`, 2026-09-02, a pedido del usuario)

Mismo cambio que en `Hidrogeno/js/ui.js` (ver su `CLAUDE.md`), copiado acá
sin dependencia cruzada: todos los `<input>` de ingreso manual de valores
continuos (Red de Gas, Combustión, Quemador, Almacenamiento GLP,
composición molar GLP/GN) pasaron de `type="number" step="any"` a
`type="text" inputmode="decimal"`, y sus lecturas (`num()`/`leerPresion()`
en cada cierre de `ui.js`) usan la función nueva `numeroFlexible()` en vez
de `Number(...)` directo — reemplaza "," por "." antes de convertir, y
trata lo no numérico como 0. Motivo: un `<input type="number">` aplica el
separador decimal según el locale del navegador/SO y descarta en silencio
el carácter que no coincide, lo que impedía tipear cualquier decimal (y
por lo tanto valores menores a 1, como varios de los porcentajes molares
de composición GLP/GN que traen default <1). Quedan como `type="number"`
los contadores enteros que no tienen ese problema: `cd-calefont`/
`cd-cocinas`/`cd-estufas` (Almacenamiento) y `qm-cant-perforaciones`/
`qm-cant-perforaciones-garganta` (Quemador).

## Unidades de presión (2026-09-02, a pedido del usuario)

Los 3 campos de ingreso manual de presión (`rg-presion-inicial` en Red de
Gas, `cb-presion-ref` en Combustión, `qm-presion-gas` en Quemador) y los 3
tiles de resultado en presión de Red de Gas (`Pérdida de presión
requerida`, `Pérdida de presión admisible`, `Presión final`) tienen **cada
uno su propio selector de unidad** (Pa/kPa/mbar/bar/psi) — no hay un
selector global. El selector "Régimen de presión" también tiene el suyo,
puramente para mostrar el umbral de 10 kPa en la unidad elegida (el
`value` interno `<10 kPa`/`>10 kPa` que usa `calc-red-gas.js` no cambia).

- `js/unidades-presion.js` — conversión pura (`aPa`/`desdePa`), sin tocar
  ningún motor de cálculo. Los motores (`calc-red-gas.js`,
  `calc-combustion.js`, `calc-quemador.js`) siguen esperando exactamente la
  misma unidad interna de siempre (Pa/kPa/mbar respectivamente); `ui.js` es
  la única capa que convierte, tanto al leer el formulario
  (`leerPresion(inputId, selectId, unidadDestino)`) como al mostrar
  resultados.
- Cambiar la unidad de un campo de ingreso **convierte el número mostrado**
  para conservar la presión física (1000 Pa → 10 mbar), no resetea el
  valor. Cambiar la unidad de un tile de resultado solo redibuja ese tile
  desde el valor en Pa ya calculado — no dispara un recálculo.
- Cada selector de unidad se guarda junto con el resto del formulario en
  localStorage (se agregó a los `querySelectorAll('input, select')` de
  guardado/restauración de Combustión y Quemador, que antes solo incluían
  `input` porque esos formularios no tenían ningún `<select>` propio).

## Auditoría UX/UI: agrupación de inputs y jerarquía de resultados (`index.html`/`css/styles.css`/`ui.js`, 2026-09-03, a pedido del usuario)

Mismo rediseño de estructura visual que `Hidrogeno` (ver su CLAUDE.md para
el detalle del patrón — acá solo lo específico de este módulo, más grande
por tener 5 pestañas). No toca fórmulas ni motores de cálculo, verificado
con `node GasNatural-GLP/tests/run-all.js`:

- **"Red de Gas"** agrupada en "Configuración de tubería" (régimen,
  material, diámetro) + "Condiciones de operación" (potencia, longitud,
  presión, temperatura) — mismas clases `.seccion`/`.seccion-titulo` que
  `Hidrogeno`. KPI: Tubería adecuada + Pérdida de presión requerida;
  Caudal objetivo/Velocidad/Volumen/Pérdida admisible/Presión final pasan
  a `.secundario` bajo "Detalle del cálculo".
- **"Almacenamiento" — el cambio más importante**: sus 3 calculadoras
  independientes (cilindros por vaporización, cilindros por consumo
  diario, estanque) vivían separadas solo por un `<p class="subtitulo">`,
  sin frontera visual — confundible, porque hay dos resultados llamados
  igual ("N° de cilindros necesarios") en dos calculadoras distintas. Cada
  una ahora vive en su propio `.bloque-calculo` (nueva clase, con borde
  propio — a diferencia de `.seccion`, acá sí se justifica una caja porque
  son herramientas independientes, no un grupo de campos de un mismo
  cálculo) dentro de `marcadoAlmacenamientoGLP()` en `ui.js`. El resultado
  principal de cada bloque (N° cilindros, N° cilindros, Capacidad de
  vaporización en kW) pasa a `.kpi`.
- **"Combustión"**: sin cambio de agrupación de inputs (ya usaba
  `.subtitulo` para separar Composición/Condiciones, un patrón que ya
  cumplía el objetivo) — solo jerarquía de resultados. 13 tiles → 5 KPI
  (caudal combustible/aire, CO₂, NOx/CO admisibles) + 8 `.secundario` bajo
  "Factores de verificación".
- **"Quemador Atmosférico"**: 9 tiles de resultado → 3 KPI (potencia
  inyector, largo de llama, tasa de quemado) + 6 `.secundario`. A
  diferencia de Combustión, sus 12 inputs sí se reagruparon (2026-09-06,
  segunda pasada de la misma auditoría): pasaron de una única
  `.fila-campos` plana a 3 `.seccion` según la cadena física real del
  motor (`calc-quemador.js`: inyector → aireación primaria → garganta
  Venturi) — "Condiciones de operación" (potencia, PCI, presión de gas,
  temperaturas), "Inyector y perforaciones" (diámetro inyector, relación
  de aire, cantidad/diámetro de perforaciones, coeficiente de descarga),
  "Garganta Venturi" (diámetro, perforaciones). El `<p class="subtitulo">
  Quemador</p>` que encabezaba el formulario se eliminó — los tres
  `<h3 class="seccion-titulo">` nuevos ya cumplen ese rol.
- **Etiquetas duplicadas en Estanque GLP** (2026-09-06): las 3 tiles
  "Capacidad de vaporización" (kg/h, kW, Mcal/h — misma magnitud física en
  3 unidades) compartían literalmente el mismo texto. La KPI (kW) mantiene
  la etiqueta simple; las dos secundarias pasan a "Capacidad de
  vaporización (másica)" [kg/h] y "Capacidad de vaporización (Mcal/h)" —
  solo texto, `calcularEstanqueGLP` no cambió.
- **Memoria de Cálculo reordenada** igual que Hidrogeno: tabla de tramos +
  árbol primero, cajetines de proyecto/informe a un `<details
  class="seccion-avanzada">` "Datos del informe" cerrado por defecto.
  `#memoria-error` (propio de este módulo, Hidrogeno no lo tiene) se dejó
  antes de la tabla, fuera del `<details>`, para que un error de cálculo
  siga siendo visible sin tener que expandir nada.
- **Fix de CSS real**: `.subseccion` (usada por los fieldsets "Firma y
  documento"/"Criterios de diseño"/"Observaciones" de Memoria de Cálculo)
  nunca se definió en este módulo — sí existía en `Hidrogeno/css/styles.css`
  desde el informe formal del 2026-09-03 (commit `a2ad060`), pero no se
  portó acá cuando se portó el resto del informe (commit `2cec801`). Sin
  ella, esos fieldsets no expandían a ancho completo dentro de
  `.fila-campos` (quedaban en ~200px, con "Observaciones" cortando texto).
  Portada tal cual desde `Hidrogeno`. De paso se agregó `details`/`summary`
  base (este módulo no usaba `<details>` para nada hasta ahora) y
  `.resultados-subtitulo` (usada en Hidrogeno para "Factores de
  verificación", tampoco estaba acá).
- **Etiqueta de régimen de presión sin ceros de más**: "Baja presión
  (<10.0000 kPa)" (`actualizarEtiquetasRegimen()` en `ui.js`) usaba
  `formatearPresion()` de `unidades-presion.js`, pensada para tiles
  numéricos con precisión fija — para texto de opción se ve como ruido.
  Nueva `formatearPresionEtiqueta()` en `ui.js` (recorta ceros vía
  `Number(...).toString()`) — no se tocó `unidades-presion.js` porque
  `unidades-presion.test.js` depende de su precisión fija actual.
- **Fix de overflow**: `min-width: 0` agregado a `.campo input, .campo
  select` en `css/styles.css` (mismo fix que en `Hidrogeno`, ver su
  CLAUDE.md) — acá no había un caso visible tan claro como el de "Tubería
  manual" de Hidrogeno, pero previene el mismo problema en cualquier
  `.fila-campos` angosto.
- **Accesibilidad de pestañas** (2026-09-06): mismo patrón que
  `Hidrogeno` (ver su CLAUDE.md para el detalle) — `aria-selected` +
  `aria-controls`/`aria-labelledby` entre cada botón `.tab` y su
  `role="tabpanel"`, sincronizado en `initTabs()`, más
  `.tab:focus-visible` en `css/styles.css`. Acá son 5 pestañas en vez de
  3, mismo criterio de nomenclatura (`id="tab-<nombre>"` /
  `aria-controls="panel-<nombre>"`).
- **Botones/selects de solo-ícono con nombre accesible + `escapeAttr()`**
  (2026-09-06): mismo cambio que `Hidrogeno` (ver su CLAUDE.md para el
  detalle, incluido el bug de la comilla literal en una etiqueta que
  motivó agregar `escapeAttr()`) — `aria-label` en `.mem-eliminar`,
  `.af-eliminar`, `af-nombre`/`af-potencia`, y en el `<select>` de unidad
  inline de `tilePresion()`.
- **Saneamiento de texto libre en Memoria de Cálculo** (2026-09-06, mismo
  día, pasada siguiente — mismo cambio que `Hidrogeno`, ver su CLAUDE.md
  para el detalle y el caso de prueba): nueva `escapeHtml()` junto a
  `escapeAttr()`, aplicadas a `t.nombre`/`a.nombre` en
  `renderTablaMemoria`, `renderArbolMemoria`, `renderArtefactos` y
  `renderInformeImpresion`. `t.material` acá **no** necesitó el mismo
  tratamiento — a diferencia de Hidrogeno, en este módulo el material de
  cada tramo es un `<select>` con dos opciones fijas ("Acero Sch40"/
  "Cobre tipo L"), no texto libre.

## Rediseño UX/UI de las pestañas (`index.html`/`css/styles.css`/`ui.js`, 2026-09-24, a pedido del usuario)

Mismo rediseño que `Hidrogeno` (ver su `CLAUDE.md` para el detalle y el
porqué de cada punto: layout entradas | resultados, barra de pestañas
fija, pestaña en el hash de la URL, `grupo()`, tokens de estado,
validación `aria-invalid`, barra de acciones de Memoria). El bloque común
de `css/styles.css` es copia del de `Hidrogeno`. No toca motores de
cálculo; `node GasNatural-GLP/tests/run-all.js` sigue en verde. Lo propio
de este módulo:

- **Formato numérico es-CL en todo lo que se muestra** (tiles, tabla de
  tramos, árbol, informe impreso): antes `toFixed()` con punto decimal, así
  que "2.087 Nm³/h" se leía como dos mil en un sitio que en Hidrógeno ya
  usaba coma decimal. `formatearFijo(valor, decimales)` conserva
  **exactamente** los decimales que tenía cada resultado (solo cambian los
  separadores); `formatearPresionFija()` hace lo mismo sobre
  `formatearPresion()` de `unidades-presion.js`, que no se tocó (su test
  depende de poder `Number()`-earla); `formatearLibre()` (hasta 4
  decimales, sin relleno) para valores tipeados que se repiten en el
  informe (longitud, potencia, criterios de diseño). Nunca se usan para el
  `value` de un `<input>`: `numeroFlexible()` leería "1.000" como 1.
- **Selector de combustible → control segmentado GLP | Gas Natural** en
  la barra de pestañas (radios `name="combustible"`, `establecerCombustible()`
  en `ui.js`). Antes un `<select>` dentro de una card a todo el ancho sobre
  las pestañas: se perdía al bajar por la página y pedía 2 clics. Bajo
  1020px pasa a su propia fila arriba de las pestañas. Se eliminó
  `#nota-combustible`, que nunca se llenaba.
- **Almacenamiento con Gas Natural**: el aviso suma un botón "Cambiar a
  GLP" en vez de pedir que el usuario busque el selector.
- **Almacenamiento GLP**: cada `.bloque-calculo` usa por dentro el mismo
  `.calc-layout` de 2 columnas (título `h3.bloque-titulo`); Estanque separa
  "Dimensiones" y "Composición GLP" en `.seccion`.
- **Combustión**: los mismos 5 KPI, repartidos en 2 grupos — caudales
  arriba, "Gases de combustión y emisiones" (CO₂, NOx, CO) debajo.
- `.subtitulo` desapareció: los títulos de composición/condiciones pasan a
  `.seccion-titulo` (mismo estilo que el resto de los bloques de entrada);
  `marcadoComposicionGLP/GN()` aceptan `nivel` (`h3`/`h4`).
- **Tabla de Memoria**: se mantiene más ancha que la pantalla con scroll
  horizontal (decisión del 2026-09-03), ahora dentro de `.tabla-contenedor`;
  Régimen/Material/Tramo/Continúa desde con ancho mínimo propio (se leían
  "Baja (<10 k"/"Acero S"). **En el teléfono (≤720px) pasa a tarjetas** —
  ver la sección siguiente.

## Uso desde el teléfono (`css/styles.css`/`ui.js`/`index.html`, 2026-09-25, a pedido del usuario)

Mismo cambio que en Hidrógeno, con el detalle y el porqué en
`Hidrogeno/CLAUDE.md` ("Uso desde el teléfono"): barra de resumen de KPI
fija al pie bajo 960px (`initResumenMovil()`), cajetines a 16px y áreas
táctiles de 44px, Memoria de Cálculo en tarjetas bajo 720px (`data-label`
por celda en `renderTablaMemoria()`, `.col-calculada` en las 5 columnas
calculadas), diagrama con scroll propio (`.arbol-contenedor`, `min-width`
en `renderArbolMemoria()`), pestaña activa centrada. Bloque CSS y
funciones JS idénticos en los tres módulos. Propio de este módulo:

- **Arreglo de desborde en Red de Gas**: los dos `.campo-ancho` (régimen
  de presión, diámetro manual) creaban una 2ª columna implícita en la
  grilla de 1 columna del teléfono y la página entera se podía arrastrar
  ~35px de lado. Bajo 600px pasan a `grid-column: 1 / -1`.
- **Material con diámetro manual**: en la tarjeta de tramo la celda
  "Material" queda sin control (el `<select>` se oculta) — se oculta la
  celda entera con `:has()`.
- **Almacenamiento**: con 3 calculadoras en la pestaña, la barra resume la
  del último campo tocado. `.bloque-calculo` con menos relleno en el
  teléfono.
- La barra sigue al combustible: al cambiar GLP ↔ GN se rearma (verificado:
  Red de Gas pasa de 18,9 Pa a 56,6 Pa en la barra).

## Diagrama de la red como unifilar (`ui.js`/`css/styles.css`, 2026-09-25, a pedido del usuario)

Mismo cambio que Hidrógeno (detalle en su `CLAUDE.md`): `dibujarDiagramaRed()`
y su CSS son copia idéntica; `renderArbolMemoria()` arma los datos de este
módulo (diámetro nominal o "DI x mm" manual, ΔP acumulada en la unidad de
su columna, velocidad; el tooltip agrega régimen, material y presión
final). Las marcas ▲ salen de `evaluarCriteriosRed()`, extraída de
`renderInformeImpresion()` — así respetan la regla de la red mixta (en la
pérdida acumulada solo cuentan los tramos de baja presión).

## Fix de ids de tramo/artefacto repetidos en la Memoria de Cálculo (`ui.js`, 2026-09-24, a pedido del usuario)

Mismo bug y mismo fix que `Hidrogeno` (ver su `CLAUDE.md`):
`contadorIdMemoria`/`contadorArtefactoId` partían de la cantidad de
elementos, así que borrar un tramo intermedio + recargar + agregar
repetía un id y editar una fila pisaba a la otra. Ahora parten de
`maxSufijoId()`, y `repararIdsDuplicados()` corrige al cargar/importar los
ids ya repetidos que hayan quedado guardados.
