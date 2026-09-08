# CLAUDE.md — Calculadora de Gas Natural / GLP (contenido)

Ver primero el maestro: [`../CLAUDE.md`](../CLAUDE.md). Este archivo cubre
lo específico de este módulo: de dónde salen las fórmulas, qué se
reconstruyó a partir de hojas incompletas, y qué falta.

## Fuentes

- `Libro11111111.xlsx`, hoja `Bases de Cálculo` — red de gas (tubería) y
  cilindros GLP. Soporta GLP/GN/H2 vía selector, con Z real
  (Peng-Robinson) por gas.
- `MASTER DISEÑO.xlsm` — hojas `Estanque GLP`, `Combustión Gas`,
  `Diseño Quemador Atmosférico`, `Quem. Atm.`.

Ambos archivos analizados celda por celda el 2026-09-01. **Gitignored**:
tienen fórmulas propietarias y (`MASTER DISEÑO.xlsm`) una hoja
`Proveedores` con precios reales de proveedores — nunca se versionan ni se
publican. Diseño completo en
[`../docs/superpowers/specs/2026-09-01-calculadora-tecnica-glp-gn-design.md`](../docs/superpowers/specs/2026-09-01-calculadora-tecnica-glp-gn-design.md).

## Las 5 pestañas y su hoja de origen

| Pestaña | Hoja Excel | Motor |
|---|---|---|
| Red de Gas | `Bases de Cálculo` (izquierda) | `js/pipe-network.js` + `js/calc-red-gas.js` |
| Almacenamiento (solo GLP) | `Bases de Cálculo` (cilindros) + `Estanque GLP` | `js/calc-almacenamiento-glp.js` |
| Combustión | `Combustión Gas` (columnas GLP/GN) | `js/combustion.js` + `js/calc-combustion.js` |
| Quemador Atmosférico | `Quem. Atm.` + `Diseño Quemador Atmosférico` | `js/calc-quemador.js` |
| Memoria de Cálculo | (sin hoja fuente — no existe en el Excel) | `js/calc-memoria-red-gas.js` |

Propiedades de gas: `js/gas-glp.js`, `js/gas-gn.js` (composición → PM, R,
densidad, fracciones de carbono/hidrógeno para combustión).

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

## Tabla de tuberías ampliada + diámetro manual (2026-09-02, a pedido del usuario)

`TABLA_TUBERIA_RED_GAS` (`js/pipe-network.js`) tenía 11 filas (1/4"–4"),
todas literales de `Bases de Cálculo!I3:N13`. Se agregaron 4 filas más
(1/8", 5", 6", 8") **que no vienen del Excel**: DI de acero desde ASME
B36.10 Schedule 40, DI de cobre desde ASTM B88 tipo L — normas publicadas
que, verificado, coinciden con las 11 filas del Excel dentro de ~0.5%
(confirma que esas 11 filas ya seguían esas mismas normas). Para las filas
nuevas, `d5 = DI^5` calculado directo — a diferencia de las filas del
Excel, donde `d5` viene de otra tabla de referencia que el Excel no expone
y por eso NO es exactamente DI^5 (ver comentario en el archivo). El factor
`k` de las 3 filas nuevas se dejó igual al de 4" (2420, el mayor conocido)
por no tener base para extrapolarlo — antes de diseñar en baja presión con
esos tamaños, confirmar `k` con Cristóbal.

El selector "Diámetro nominal" de Red de Gas también tiene una opción
**"Manual (ingresar mm)"**: revela un campo de diámetro interior [mm] y
uno de factor K (usado solo en baja presión); "Material de tubería" se
oculta porque deja de tener efecto (acero/cobre son solo dos DI de la
misma fila tabulada — con diámetro manual hay un único DI). `d5` se
calcula como DI^5 igual que en las filas nuevas de la tabla. Ver
`tuberiaManual` en `js/calc-red-gas.js`.

## Memoria de Cálculo (2026-09-02, a pedido del usuario)

Quinta pestaña, mirroring la de `Hidrogeno/js/calc-memoria.js` pero sobre
Red de Gas en vez de Barlow — ver
[`../docs/superpowers/specs/2026-09-02-memoria-calculo-glp-gn-design.md`](../docs/superpowers/specs/2026-09-02-memoria-calculo-glp-gn-design.md)
para las dos decisiones de modelado confirmadas con el usuario:

- **El gas es de toda la red, no por tramo** — sigue el selector global
  de Combustible que ya gobierna las otras 4 pestañas. Cambiarlo
  recalcula toda la tabla.
- **Sin encadenar presión entre tramos** — cada tramo tiene su propia
  presión inicial como input manual; la "pérdida acumulada" solo suma
  hacia arriba para reportar, igual que en Hidrógeno.

`js/calc-memoria-red-gas.js` no reimplementa Renouard/Peng-Robinson: cada
tramo se resuelve llamando directamente a `calcularRedGas()` — cualquier
corrección futura a Red de Gas se hereda automáticamente acá.

Igual que Hidrógeno, **no hay indicador "Tubería adecuada" por tramo** en
la tabla (aunque `calcularRedGas` lo devuelve gratis) — Hidrógeno mismo
excluye el chequeo análogo (velocidad de erosión) de su propia Memoria,
mismo criterio acá para no agregar una columna más a una tabla ya ancha
(16 columnas: Tramo, Continúa desde, Reinicia acum., Régimen, Material,
Diámetro, Potencia, Longitud, Presión inicial, Temp., Caudal objetivo,
Velocidad, Pérdida requerida, Pérdida acumulada, Presión final, eliminar).

Igual que Hidrógeno: reseteo de pérdida acumulada por tramo
(`reseteaAcumulada`, checkbox "Reinicia acum."), tubería manual por tramo
(mismo criterio que el tramo único de Red de Gas: sin fila de tabla,
"Material" se oculta y se piden diámetro interior + factor K), árbol SVG,
exportar/importar proyecto (`.json`, requirió agregar `exportarJSON`/
`importarJSON` a `js/storage.js`, portadas tal cual desde
`Hidrogeno/js/storage.js`), impresión con tabla recortada, y autoguardado
en localStorage (clave `memoria-red-gas`, distinta de `red-gas` para no
pisar el estado del tramo único).

Una diferencia deliberada del bloque de impresión (`@media print`) frente
al de Hidrógeno: también oculta `.selector-combustible`, que Hidrógeno no
tiene — es parte del chrome de la página, no del contenido de la memoria.

## Informe formal + corrección de foco al escribir (2026-09-03, a pedido del usuario)

Dos cambios en la misma sesión, mirroring y corrigiendo respectivamente el
informe de `Hidrogeno/js/ui.js` (commit `a2ad060`, "informe formal de
Memoria de Cálculo con membrete QUEMPIN").

**Informe formal**: se portaron los cajetines de proyecto (fecha,
proyecto, instalador, contacto, dirección, comuna, firma/documento,
criterios de diseño opcionales, observaciones), la lista de artefactos y
el rediseño completo de `#memoria-informe-impresion` (membrete QUEMPIN,
tabla de datos, criterios, artefactos, detalle de tramos a 10 columnas,
resumen, firma). Estado `proyecto` nuevo, persistido aparte
(`memoria-proyecto`); exportar/importar pasa a `{ tramos, proyecto }` con
compatibilidad hacia atrás (array plano). Adaptaciones respecto al
original de Hidrógeno, no copia literal:

- **Observaciones por defecto reescritas**: el texto de Hidrógeno cita
  Darcy-Weisbach/Reynolds/ASME B31.12/NFPA 2 — metodología de Barlow, no
  aplicable acá. El texto de este módulo (`OBSERVACIONES_DEFECTO` en
  `ui.js`) cita Renouard + Peng-Robinson + D.S. N°66, que es lo que
  `calc-red-gas.js`/`pipe-network.js` realmente implementan.
- **"Velocidad máxima flujo de gas" sin precompletar**: Hidrógeno la deja
  en 20 m/s (límite NFPA 2 ya usado en "Tubería y Flujo"). Acá no hay una
  norma de referencia ya usada en el módulo de la que tomar ese número, así
  que el cajetín queda vacío ("—") hasta que el usuario lo complete.
- **Título y "Tipo de red" dinámicos**: Hidrógeno los deja fijos
  ("Hidrógeno gas") porque es mono-gas; acá `#informe-subtitulo` y
  `#informe-tipo-red` se recalculan según el combustible vigente ("RED DE
  GLP"/"GLP" o "RED DE GAS NATURAL"/"Gas Natural") en cada
  `renderInformeImpresion()`.
- **Tabla de tramos impresa**: mismo recuento de 10 columnas que Hidrógeno
  y el mismo orden posicional (Tramo/Continúa desde primero, Diámetro/
  Material en las posiciones 6/7) para poder reusar tal cual las reglas
  CSS `:nth-child` de alineación — pero con los campos propios de Red de
  Gas (Presión inicial en vez de Presión de tramo, Pérdida requerida en
  vez de Pérdida parcial, Velocidad en vez de Densidad+Velocidad).

**Corrección de foco al escribir** (bug reportado por el usuario: "solo se
me permite ingresar 1 solo dígito... tampoco me permite ingresar el
carácter para agregar decimales"): `recalcularMemoria()` reescribía el
`innerHTML` completo de `#memoria-tabla-cuerpo` en cada tecla —
destruía el foco del cajetín y volvía a serializar el valor ya convertido
a número, descartando cualquier "," o "." recién tipeado antes del
siguiente carácter. Se agregó `recalcularMemoriaLigero()`
(`js/ui.js`): para un `<input>` de texto, actualiza solo las celdas de
resultado de cada fila vía `textContent` (identificadas con las clases
nuevas `.mem-caudal`/`.mem-velocidad`/`.mem-perdida-requerida`/
`.mem-perdida-acumulada`/`.mem-presion-final`) y sincroniza la etiqueta de
"Continúa desde" en las demás filas si el nombre cambió — nunca toca
ningún `<input>`/`<select>`, así que el foco y el texto a medio escribir
se conservan. Los `<select>`/checkbox de la fila (régimen, material,
diámetro, padre, reseteo) siguen disparando el `recalcularMemoria()`
completo — no tienen el problema de "escribir carácter a carácter", así
que un re-render completo ahí es seguro y más simple. Ver el listener de
`'input'` en `#memoria-tabla-cuerpo` dentro de `initMemoria()`, que
decide la rama según `evento.target.tagName`. Este mismo bug muy
probablemente existe también en `Hidrogeno/js/ui.js` (mismo patrón de
`recalcularMemoria()` reescribiendo la tabla en cada tecla) — no se tocó
ese módulo en esta sesión para no interferir con el trabajo concurrente
del informe formal que se estaba mergeando en paralelo; queda pendiente
decidir si se porta la misma corrección allá.

Se aprovechó el mismo cambio para ensanchar los cajetines de la tabla
(`css/styles.css`): `#memoria-tabla` pasa de `width:100%` (que con 16
columnas dejaba cada cajetín muy angosto) a `width:auto; min-width:100%`
con un `min-width` propio en cada `<input>`/`<select>` — la tabla se
desborda con scroll horizontal (ya vive en un contenedor con
`overflow-x:auto`) en vez de encoger columnas para caber.

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

## Ajustes de membrete, firma y numeración de documento (2026-09-07, a pedido del usuario)

Mismos 3 ajustes que en `Hidrogeno` (ver su `CLAUDE.md` para el detalle
completo, acá solo lo específico de este módulo):

- **Logo agrandado y recortado a su contenido visible** — usa
  `assets/logo-quempin-informe.png` (el recorte al canal alfa del logo
  oficial, generado para el informe de Hidrógeno, reutilizado tal cual
  acá — no es específico de un módulo). Pasó por 56px→76px→**60px** (el
  mismo ajuste que Hidrógeno, revertido ~20% el mismo día tras revisión
  visual — 76px quedaba muy grande) y `.informe-header` de
  `align-items: flex-start` (como quedó al portar el informe) a
  **`center`**, igual criterio que Hidrógeno: con el logo ya en un tamaño
  comedido, centrado se ve mejor que alineado por el borde superior.
  **Pendiente, no pedido hoy**: este módulo no tiene el resto del
  rediseño visual del informe de Hidrógeno (eyebrows de sección, ficha de
  campos, tabla reglada, tarjetas de métrica, cajetín de N° Doc con
  borde) — su informe sigue en el estado del port original
  (`2cec801`). Si se quiere emparejar visualmente con Hidrógeno, es un
  trabajo aparte.
- **Más espacio para la firma manuscrita**: como este módulo no tiene la
  etiqueta "FIRMA" que sí tiene Hidrógeno (tampoco portada), el espacio se
  agregó como `margin-top: 46px` en `.informe-firma-linea` directamente
  (mismo resultado visual — un área en blanco antes de la línea — sin
  agregar la etiqueta, que no se pidió acá).
- **N° de documento**: default de `numeroDoc` pasó de "01" a **"402604"**
  — mismo código `40XXXX`/fila 18 de `QUEMPIN_Control de Documentos
  2026.xlsx` que usa Hidrógeno (a pedido explícito del usuario, en vez del
  código más específico `41XXXX`/fila 19 "Memoria de cálculo de red de
  gas"), siguiente disponible después del `402603` que tomó Hidrógeno.
  Ver el `CLAUDE.md` de `Hidrogeno` para el detalle del formato del código
  y el criterio de mantenimiento (hay que subir el default a mano cada vez
  que se emite una memoria real — la app no puede escribir en la
  planilla).

## El informe siempre entra en una sola hoja (`ui.js`, 2026-09-08, a pedido del usuario)

Mismo mecanismo que `Hidrogeno` (ver su `CLAUDE.md` para el detalle
completo): `ajustarEscalaImpresion()`, enganchada a `beforeprint`/
`afterprint`, mide el alto real del informe ya renderizado con `@media
print` aplicado y lo reduce con `zoom` (no `transform: scale()`, que no
reduce el alto de layout de la caja) si no entra en una A4 con márgenes
de 14mm. Sin piso mínimo de escala — la instrucción es "siempre".

## Decisiones de reconciliación (no son bugs silenciados)

**Red de Gas — Goal Seek manual reemplazado por álgebra**: en el Excel,
la pérdida de presión (`Bases de Cálculo!B22`) es un valor pegado a mano
que el usuario ajustaba con Buscar Objetivo hasta que la potencia
resultante coincidiera con la potencia objetivo. Las dos fórmulas de
caudal (Renouard, baja y media/alta presión) son ambas invertibles en
`ΔP` sin iteración — la app resuelve `ΔP` directamente a partir de la
potencia objetivo. Ver el spec de diseño para el detalle algebraico.

**Quemador Atmosférico — síntesis de dos hojas borrador**: ninguna de las
dos hojas fuente (`Quem. Atm.`, `Diseño Quemador Atmosférico`) tiene la
cadena completa (inyector → aireación primaria → verificación de largo de
llama → garganta Venturi → tubo de mezclado) para los dos gases a la vez.
El motor usa el inyector/aireación/llama de `Quem. Atm.` (completo y
simétrico para GN y GLP) y la garganta Venturi/tubo de mezclado de
`Diseño Quemador Atmosférico` (con valores para ambos gases, aunque no
encadenados al mismo caso).

**Probable error de fórmula, no replicado**: `Diseño Quemador
Atmosférico!D38` (columna GN) calcula la "Relación área garganta/
perforaciones" como `(Dt/(Dh·N))²`, mientras que `H38` (columna GLP)
usa `(Dt/Dh)²/N` — solo esta última da dimensionalmente una razón de
áreas correcta (área garganta / área total de perforaciones). El motor
usa la fórmula de `H38` para ambos gases. Sigue siendo un buen candidato
para confirmar con Cristóbal (es la única corrección de esta lista que no
se pudo verificar contra un valor recalculado a mano de forma
independiente, solo por argumento dimensional), pero ya es el
comportamiento del código, no algo pendiente.

## Correcciones aplicadas (2026-09-01, a pedido del usuario)

Estas cuatro eran inconsistencias del Excel fuente identificadas en el
análisis inicial. Se corrigieron explícitamente después de que el usuario
pidiera revisarlas — antes de esto quedaban solo documentadas, sin tocar
el comportamiento:

- **GN: carbono/hidrógeno ya no mezcla fracción molar con fracción de
  masa.** `Combustión Gas!F36` (X carbono de GN) ponderaba el término de
  carbono con fracciones de MASA pero el de hidrógeno con PORCENTAJES
  MOLARES de entrada — no correspondía a ninguna magnitud física
  coherente. `js/gas-gn.js` ahora pondera los dos términos con fracción de
  masa, igual que oxígeno y nitrógeno. Cambia `xCarbono` de 0.7039→0.7058
  y `xHidrogeno` de 0.2287→0.2267 (composición por defecto), y con eso
  `aireEsteq` y todo lo que depende de él en Combustión y en Quemador
  Atmosférico para GN (ver los comentarios en `calc-combustion.js` y en
  los tests, que documentan cada valor recalculado).
- **Tabla de consumo de artefactos GLP**: Cocina/Bajo a 10°C tenía
  `Bases de Cálculo!K33=35` kWh/día, un valor muchísimo más alto que el
  resto de la fila (3.5–5.8) y que el patrón de las filas Medio/Alto de la
  misma tabla — corregido a `3.5` en `js/calc-almacenamiento-glp.js`
  (probable error de tipeo del "." en el Excel original).
- **"Caudal total" en Combustión ya no depende de qué gas elegiste.** El
  Excel sumaba el aire con el caudal de combustible en condición normal
  para GLP (`J10=J9+J6`) pero en condición de referencia para GN
  (`N9=N8+N6`), sin ninguna razón física para que difiriera según el gas.
  En vez de elegir una de las dos arbitrariamente, `calc-combustion.js`
  ahora calcula y expone **las dos** (`caudalTotalNormalNm3H`,
  `caudalTotalReferenciaM3H`) para los dos gases — la UI muestra ambas.
- **PCI de GN en "Combustión" y "Quemador Atmosférico" ahora es un campo
  editable, como en GLP.** El Excel calculaba el flujo de GN siempre desde
  el PCI derivado de la composición (`Combustión Gas!N4=N2/$F$45`), sin
  mostrarlo ni dejarlo tocar — mientras que GLP sí tenía un input propio
  (`J4=48029`). `calcularCombustionGN` y la UI de Quemador ahora reciben
  `pciKjKg` como parámetro real para los dos gases; se sigue
  precompletando con el valor derivado de la composición al cambiar de
  gas, pero el usuario puede editarlo igual que en GLP.

## Correcciones aplicadas (2026-09-02, a pedido del usuario)

Auditoría física de Combustión/Quemador y Almacenamiento contra
estequiometría de combustión y balances de energía. Dos correcciones,
verificadas con la regresión completa (`node GasNatural-GLP/tests/run-all.js`):

- **Quemador Atmosférico — caudal por perforación tenía temperatura y
  presión invertidas (`js/calc-quemador.js`, `caudalGasPorPerforacionM3S`,
  usado en la verificación de largo de llama).** La hoja fuente calculaba
  algebraicamente ṁ·P/(r·T) — masa × densidad — en vez del caudal
  volumétrico de gas ideal ṁ·r·T/P (masa ÷ densidad), el mismo patrón que
  `corregirCaudalTP` (`combustion.js`) y `caudalPremezcla1Nm3S` (unas
  líneas más arriba en el mismo archivo) ya calculaban bien. Esto
  subestimaba el largo de llama reportado (`largoLlamaMm`) en ~2x — un
  chequeo de seguridad contra impingement de llama, así que subestimarlo es
  la dirección insegura del error. Para el caso GN cacheado del Excel
  (`gnLlama` en `calc-quemador.test.js`): `caudalGasPorPerforacionM3S` pasó
  de 9.806733440184042e-7 a 1.982288998888557e-6 m³/s, `largoLlamaMm` de
  1.8543804220726559 a 3.7483611977934608 mm.
- **Estanque GLP — la conversión de capacidad de vaporización a kW/Mcal
  usaba el PCI de Gas Natural, no el de GLP (`js/calc-almacenamiento-glp.js`,
  `calcularEstanqueGLP`).** La hoja fuente (`Estanque GLP!B8`) usaba la
  constante `52737` kJ/kg — que es exactamente el PCI por defecto de GAS
  NATURAL en este mismo código (ver `pciMasa` en `gas-gn.test.js`), pese a
  que este módulo es exclusivamente GLP. Casi con certeza una referencia
  cruzada de hoja en el Excel fuente (`Estanque GLP!B8` apuntando a la
  celda de PCI de GN de `Combustión Gas` en vez de la de GLP). `qKgH` (la
  superficie de vaporización en kg/h) no estaba afectado, solo la
  conversión a kW/Mcal — que es justo lo que se compara contra la demanda
  térmica del proyecto para decidir si el estanque alcanza.
  `calcularEstanqueGLP` ahora recibe `pctButano`/`pctPropano` y deriva el
  PCI real de la composición vía `propiedadesGLP` (igual que el resto del
  módulo); la UI del formulario de Estanque agregó los campos de
  composición correspondientes (`es-pct-butano`, `es-pct-propano`). Para el
  caso cacheado del Excel (composición por defecto 30% butano / 70%
  propano): `qKw` pasó de 66.84853724682291 a 58.29596160247766,
  `qMcalH` de 57.493127738678986 a 50.13747951859133 (~13% más bajo).

## Discrepancias del Excel fuente que se dejaron como estaban

No todo lo que se ve distinto entre GLP y GN es un error — estas dos
quedaron así a propósito, porque no hay manera de saber cuál (si alguna)
está "mal" sin más contexto del Excel original:

- **Dos "densidades relativas" distintas para el mismo gas**:
  `Bases de Cálculo!B18` usa GLP=2 / GN=0.59 en la fórmula de caudal de
  baja presión, mientras que la tabla `Combustión Gas!I44:K47` usa
  GLP=1.81 / GN=0.62 para el factor Cr de la rama de alta presión. Son dos
  fórmulas empíricas distintas (Renouard baja presión vs. el factor Cr de
  la rama de alta presión) que bien pueden tener cada una su propia
  referencia de densidad por convención — no hay indicio de que una esté
  mal y la otra bien. Se preservan ambas, cada una en su fórmula original
  (`js/calc-red-gas.js`, `PROPIEDADES_RED_GAS.{densidadRelativaBaja,
  densidadRelativaAlta}`).
- **Estanque GLP**: la fórmula de capacidad de vaporización
  (`Estanque GLP!B7`) usa las constantes `5` y `26` literales (sin celda
  de temperatura editable en esa hoja) — se preservan como constantes fijas
  en `calcularEstanqueGLP`, no se inventó un input de temperatura que el
  Excel fuente no tiene.

## Fuera de alcance v1

- **Chimenea (tiro)** — la hoja `Chimenea Simple` tiene solo encabezados
  de coeficientes (norma tipo EN 13384), sin ningún caso resuelto.
- **Proveedores** — precios de materiales, información comercial privada.
- **H2 y Pellet dentro de "Combustión"** — H2 ya tiene su propio sitio
  (`../Hidrogeno/`); Pellet no es un gas. Las columnas de Pellet además
  tienen fórmulas `#REF!` rotas en el Excel fuente.
- **Entalpía de gases de combustión / "calor disponible"** — completa
  para GLP y H2 en el Excel, pero no existe para GN (columnas vacías,
  verificado). Se excluyó para no dejar la pestaña con un output que
  funciona para un gas y no para el otro.

## Verificar cambios a una fórmula

```bash
node GasNatural-GLP/tests/run-all.js
```

La rama de Red de Gas para GLP/GN no tiene caso cacheado en el Excel
(`Bases de Cálculo!B5` es un selector, el archivo quedó guardado en modo
H2) — sus tests verifican autoconsistencia algebraica (invertir el caudal
calculado debe devolver el `ΔP` de entrada) más el caso H2 sí cacheado
(misma fórmula, gas-agnóstica). El resto de los motores (cilindros,
estanque, combustión GLP/GN, quemador GLP/GN) sí tienen valores cacheados
reales del Excel como fixtures, independientes del selector de gas.
