# Hidrógeno: interfaz

Detalle de referencia: léelo solo al tocar esto. Las reglas vigentes están en `../CLAUDE.md`.

## Unidades de presión (2026-09-02, a pedido del usuario)

Mismo patrón que en `GasNatural-GLP` (ver su `CLAUDE.md`): cada campo/
resultado de presión tiene **su propio selector de unidad** (Pa/kPa/mbar/
bar/MPa/psi) — no hay un selector global. `js/unidades-presion.js` es una
copia funcional del de `GasNatural-GLP` (mismo contrato, sin dependencia
cruzada — igual que `storage.js`); se le agregó MPa a ambas copias porque
la Memoria de Cálculo lo necesita (el Excel fuente usa MPa en `MC`).

- Tubería y Flujo: `flujo-presion` y `flujo-presion-min`, más los tiles de
  resultado `Presión máxima de diseño` y `Pérdida de carga` — cada uno con
  su selector, default bar/bar/bar/mbar (unidad nativa del motor).
- Almacenamiento: `alm-presion`, default bar.
- Memoria de Cálculo: la tabla es dinámica (N filas), así que la unidad es
  **por columna**, no por fila — un selector en la cabecera de `Presión`
  (default MPa), `Pérdida parcial` (default mbar) y `Pérdida acumulada`
  (default mbar), aplicado a todas las filas de esa columna. El dato
  canónico en el estado `tramos` sigue siempre en MPa (lo que espera
  `calc-memoria.js`); cambiar la unidad de una columna solo redibuja la
  tabla — no toca `tramos`. La tabla de impresión (`window.print()`) usa
  las mismas unidades vigentes en pantalla, actualizando sus cabeceras y
  celdas al vuelo en `recalcularMemoria()`.

## Diámetro de tubería manual (2026-09-02, a pedido del usuario)

A diferencia de `GasNatural-GLP`, **no se amplió** `TABLA_TUBERIA` (sigue
con las 6 filas de 1/4" a 1-1/4" de `Cálculo!H33:L38`): a diferencia de la
tabla de Red de Gas, no se pudo confirmar contra ninguna norma publicada
qué serie de tubería es esta (ni ASME B36.10 Schedule 40 ni ASTM B88 tipo
L coinciden con sus DI) — inventar filas nuevas sin esa confirmación
habría sido fabricar espesor/límite elástico, que acá sí son datos de
seguridad (fórmula de Barlow). Si Cristóbal tiene la tabla/catálogo de
origen, se puede ampliar con confianza. *(2026-09-25: se identificó por
qué no calzaba — la columna "DI" mezclaba diámetros exteriores e
interiores; ver "Auditoría de coherencia física" más abajo. La tabla
ahora guarda DE y deriva DI.)*

Con tubería manual se ingresa el **diámetro interior**; el exterior para
Barlow se deduce como DI + 2·espesor (`diametroExteriorMm()` en
`gas-h2.js`, desde el 2026-09-25). Default del DI manual: 10,3 mm (el DI
real de la fila de 1/2").

En cambio, tanto el selector de "Tubería y Flujo" como el de cada tramo de
"Memoria de Cálculo" tienen una opción **"Manual (ingresar mm)"** que pide
los 4 datos que la tabla normalmente provee — diámetro interior, espesor
de pared, límite elástico y rugosidad — en vez de asumir un valor
(a diferencia de Red de Gas en GasNatural-GLP, acá la presión máxima de
diseño depende directamente del espesor/límite elástico, así que no hay
manera segura de adivinarlos). En Memoria de Cálculo la unidad es por
tramo (cada fila puede tener su propia tubería, tabulada o manual), con un
sub-bloque de 4 campos compactos que aparece en la celda "Diámetro" al
elegir manual — ver `tuberiaManual` en `js/calc-flujo.js` y
`js/calc-memoria.js`, y `etiquetaTuberia()` en `js/ui.js` (usada también en
la tabla de impresión).

## Separador decimal flexible en cajas de ingreso manual (`ui.js`, 2026-09-02, a pedido del usuario)

Todos los `<input>` de ingreso manual de valores continuos (presión,
temperatura, potencia, largo, tubería manual, y las filas de la Memoria de
Cálculo) pasaron de `type="number" step="any"` a `type="text"
inputmode="decimal"`. Motivo: un `<input type="number">` aplica el
separador decimal según el locale del navegador/SO y descarta en silencio
el carácter que no coincide — en la práctica eso impedía tipear cualquier
decimal (y por lo tanto cualquier valor menor a 1) según cómo estuviera
configurado el navegador. `numeroFlexible()` (nueva función en `ui.js`)
reemplaza "," por "." antes de `Number(...)` y trata lo no numérico como 0
(mismo fallback que tenía un `type="number"` vacío/inválido); reemplaza a
`Number(...)` en todos los sitios que leen esas cajas (`leerFlujoForm`,
`leerAlmacenamientoForm`, `leerFilaMemoria`, `leerPresion`,
`initSelectorUnidadCampo`). Los contadores enteros (Codos/Tee/Válvulas)
quedan como `type="number"` — no tienen el problema de separador decimal.
No afecta cómo se muestran los resultados (`formatearNumero()`, sección
siguiente) ni los valores que la propia UI escribe de vuelta al campo
(conversión de unidad, siempre con punto — `numeroFlexible()` los lee bien
igual).

## Formato numérico y unidades en los resultados (`ui.js`, 2026-09-02, a pedido del usuario)

Todos los números mostrados en tiles de resultado (las 3 pestañas) pasan
por `formatearNumero()` (`Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 })`):
coma decimal, punto de miles, hasta 2 decimales (recorta ceros de más). El
cálculo interno sigue con precisión completa — esto solo cambia cómo se
muestran. Nota: esto aplana factores adimensionales de verificación como
"Factor de fricción" (`0,03782` → `0,04`) a una resolución más gruesa que
antes; si en el futuro hace falta más precisión visible para contrastar
contra el Excel, esos tiles puntuales son buenos candidatos a una
excepción explícita. **El factor Z ya es una de esas excepciones**
(2026-09-08): usa `formatearZ()` con 3-4 decimales, ver la sección del
factor Z unificado más arriba.
`unidades-presion.js` NO se tocó (sigue con `formatearPresion()`, string
de precisión fija) porque `unidades-presion.test.js` depende de poder
`Number()`-earlo; `ui.js` tiene su propio `formatearPresionBonita()` que
envuelve `desdePa()` + `formatearNumero()` para mostrar, y es lo único que
cambió de `formatearPresion` a esto en las 3 pestañas.

Los selectores de unidad que alimentan un resultado del motor (a
diferencia de los de presión, que solo redibujan un valor ya calculado)
—`flujo-unidad-normalizado`/`flujo-unidad-h2` en Tubería y Flujo,
`alm-unidad-caudal` en Almacenamiento— se movieron del formulario de
ingreso manual a un `<select>` inline dentro del tile del resultado que
afectan (mismo patrón visual que los selectores de presión, pero SÍ
disparan un recálculo al cambiar, ya que el motor recibe la unidad
elegida). Como viven fuera del `<form>` (se regeneran en cada render, dentro
de `#resultados-flujo`/`#resultados-almacenamiento`), se seleccionan por
`id` y se cablean con un listener de delegación aparte en el contenedor de
resultados — no se suman a `form.querySelectorAll('input, select')`, así
que el guardado en localStorage los agrega a mano (ver
`unidadNormalizadoFlujo`/`unidadH2Flujo`/`unidadCaudalAlm` en `ui.js`).

## Otros ajustes de UI (2026-09-02, a pedido del usuario)

- Los 3 campos "Codos"/"Tee"/"Válvulas" de "Tubería y Flujo" ahora viven
  dentro de un `<fieldset class="subseccion">` propio (misma pestaña, sin
  ser una pestaña aparte) — clase nueva en `css/styles.css`, sin cambio de
  comportamiento.
- La etiqueta "Potencia quemador [kW]" de Almacenamiento (`alm-potencia`)
  pasó a "Potencia de consumo [kW]" — es la única ocurrencia de esa frase
  en el módulo; no confundir con "Potencia combustión [kW]" de Tubería y
  Flujo (`flujo-potencia`), que es un campo distinto y no cambió de nombre.
- El selector "Factor de diseño F" pasó a etiqueta corta "Factor de diseño
  F (ASME B31.12)" (antes citaba la tabla completa) y sus opciones a
  "Clase 1, División 2"/"Clase 2"/"Clase 3"/"Clase 4" (antes "Clase de
  Ubicación N") — mismo `factor` por opción, solo texto más compacto.
- **Reordenados y recategorizados los tiles de "Tubería y Flujo"**
  (`renderResultadosFlujo` en `ui.js`): primero los resultados relevantes
  para la decisión de dimensionamiento, en este orden — Presión máxima
  diseño + Tubería adecuada, Flujo volum. Norm., Flujo volum. de H₂, Flujo
  másico de H₂, Velocidad erosión, Velocidad de flujo, Pérdidas de carga:
  luego, bajo un subtítulo "Factores de verificación" (`.resultados-subtitulo`
  en `css/styles.css`, spanea toda la fila de la grilla), Densidad real y
  los factores Hf/T/Z/Reynolds/fricción, en ese orden. Algunas etiquetas se
  acortaron con la cita de norma que pidió el usuario: "Presión máxima
  diseño (PL-3.7.1)" (antes "...(Barlow, ASME B31.12)") y "Velocidad
  erosión (I-3.4.5)" (antes "...(límite)") — provistas por el usuario, no
  verificadas independientemente contra el texto de la norma.

## Auditoría UX/UI: agrupación de inputs y jerarquía de resultados (`index.html`/`css/styles.css`/`ui.js`, 2026-09-03, a pedido del usuario)

Rediseño de estructura visual (no de fórmulas ni de motores de cálculo,
verificado con `node Hidrogeno/tests/run-all.js`) sobre las 3 pestañas:

- **Inputs agrupados por concepto** en vez de una grilla plana: nueva clase
  `.seccion`/`.seccion-titulo` (sin caja/borde — jerarquía por tipografía y
  un hairline entre bloques, a propósito para no sumar más cards). "Tubería
  y Flujo" pasa a "Condiciones de operación" + "Tubería y diseño normativo"
  (con "Accesorios" ya existente adentro); "Red de Gas" en GLP recibe el
  mismo tratamiento ("Configuración de tubería" + "Condiciones de
  operación", ver su CLAUDE.md).
- **Jerarquía KPI/secundario en resultados**: nuevo modificador
  `.resultado-tile.kpi` (2 por pestaña, texto más grande) y `.secundario`
  (factores de verificación, texto más chico) sobre el mismo componente —
  `tile()`/`tilePresion()` ya aceptaban un string de clase libre en su
  parámetro `variante`, así que no cambió su firma. "Tubería y Flujo":
  Presión máxima diseño + Tubería adecuada como KPI, caudales/velocidades
  sin cambio de peso, Hf/T/Z/Reynolds/fricción demovidos a `.secundario`
  bajo "Factores de verificación" (ya existía el subtítulo, se generalizó
  el patrón). "Almacenamiento": Masa de H₂ almacenada + Autonomía como KPI,
  resto bajo "Detalle del cálculo".
- **Memoria de Cálculo reordenada**: la tabla de tramos + árbol SVG (lo que
  se edita todo el rato) pasan primero; los cajetines de proyecto/informe
  (fecha, instalador, firma, criterios, observaciones, artefactos) se
  movieron a un `<details class="seccion-avanzada">` "Datos del informe"
  cerrado por defecto — nueva clase en `css/styles.css`, ya existía
  `<details>` para la tabla de tubería de referencia. No afecta impresión:
  `renderInformeImpresion()` sigue leyendo del objeto `proyecto` en JS, no
  del DOM visible, y el bloque sigue con `.no-imprimir`.
- **Fix de overflow en "Tubería manual"** (`#campo-flujo-tuberia-manual`):
  el sub-grid de 4 campos (DI/espesor/límite elástico/rugosidad) se salía
  de su contenedor porque `grid-template-columns:repeat(4, 1fr)` con
  `<input>` sin `width` explícito usa el ancho intrínseco del input como
  mínimo de cada columna. Cambiado a `repeat(4, minmax(0, 1fr))` en
  `index.html` + `min-width: 0` agregado a `.campo input, .campo select`
  en `css/styles.css` (deja que cualquier input se achique a su columna,
  no solo este caso — no había un `width:100%` de base como sí tiene
  `.campo-con-unidad`).
- **Accesibilidad del patrón de pestañas** (2026-09-06, segunda pasada de
  la misma auditoría): `role="tab"`/`role="tablist"` ya estaba, pero sin
  `aria-selected` ni vínculo `aria-controls`/`aria-labelledby` entre botón
  y panel, así que un lector de pantalla no anunciaba cuál pestaña estaba
  activa. Cada botón ahora tiene `id="tab-<nombre>"` +
  `aria-controls="panel-<nombre>"`; cada `<section class="tab-panel">`
  tiene `role="tabpanel"` + `aria-labelledby="tab-<nombre>"`;
  `initTabs()` en `ui.js` sincroniza `aria-selected` al hacer clic. También
  se agregó `.tab:focus-visible` en `css/styles.css` (antes dependía del
  outline por defecto del navegador — ahora usa el mismo naranja de marca
  que `.campo input:focus-visible`). No se implementó navegación con
  flechas del patrón ARIA APG completo (roving tabindex) — los botones ya
  son nativamente enfocables con Tab, y agregar eso habría sido un cambio
  de comportamiento mayor para un beneficio marginal.
- **Botones/selects de solo-ícono con nombre accesible** (2026-09-06,
  tercera pasada): los botones "✕" de eliminar tramo/artefacto
  (`.mem-eliminar`/`.af-eliminar`) y los `<select>` de unidad inline
  dentro de un tile de resultado no tenían texto accesible — un lector de
  pantalla solo anunciaba "✕" o "select". Se agregó `aria-label` dinámico
  (nombre del tramo/artefacto, o "Unidad de &lt;etiqueta del tile&gt;") en
  `ui.js`. Los campos `af-nombre`/`af-potencia` (dependían solo de
  `placeholder`) suman `aria-label` fijo.
  **Bug encontrado de paso**: la etiqueta "Caudal de referencia (línea
  capilar Ø¼")" lleva una comilla literal — interpolarla sin escapar en un
  atributo `aria-label="..."` corta el atributo a mitad de camino y rompe
  el `<select>`. Nueva función `escapeAttr()` en `ui.js` (escapa `&` y
  `"`), usada en los 4 puntos nuevos de esta pasada. En ese momento no se
  aplicó retroactivamente a las interpolaciones ya existentes de nombre de
  tramo/artefacto/material en atributos y contenido — ver el punto
  siguiente, donde sí se cerró.
- **Saneamiento de texto libre en toda Memoria de Cálculo** (2026-09-06,
  cuarta pasada, cierra el pendiente del punto anterior): nombre de tramo
  (`t.nombre`), material libre (`t.material` — este módulo no tiene un
  `<select>` de material como Red de Gas en GLP) y nombre de artefacto
  (`a.nombre`) son texto libre que el usuario tipea o que llega vía
  "Importar proyecto (.json)", y se interpolaban sin escapar en varios
  `render*()`: `value="${t.nombre}"` de la tabla, las `<option>` del
  selector "Continúa desde", `<text>`/`<title>` del árbol SVG, y las
  celdas de artefactos/tramos de la tabla impresa. Un nombre con `"`
  cortaba el atributo a mitad de camino (mismo bug que motivó
  `escapeAttr()`); uno con `<algo>` se interpretaba como HTML real en vez
  de texto literal (ej. `<b>` en un nombre de tramo aparecía en negrita en
  vez de mostrarse tal cual). Nueva `escapeHtml()` (escapa `&`/`<`/`>`,
  para contenido de etiqueta) junto a la `escapeAttr()` ya existente (para
  atributos) — aplicadas en `renderTablaMemoria`, `renderArbol`,
  `renderArtefactos` y `renderInformeImpresion`. Verificado con un nombre
  de tramo `Tramo <b>"bold"</b> & mas`: antes de este fix habría creado un
  `<b>` real en el DOM del árbol/tabla impresa; después, el texto se
  muestra literal en los tres lugares. No es un vector entre usuarios (no
  hay backend ni datos compartidos) sino un caso de "self-XSS" vía un
  .json importado a mano o un nombre escrito sin querer con esos
  caracteres — igual vale la pena cerrarlo porque antes rompía el layout
  con solo escribir una comilla.

## Fix de foco al escribir en la Memoria de Cálculo (`ui.js`, 2026-09-08, a pedido del usuario)

Bug reportado por el usuario: en la tabla de tramos y en la lista de
artefactos de "Memoria de Cálculo" solo se podía tipear **un carácter a la
vez** (y nunca la coma decimal) — cada tecla dejaba el cajetín sin foco y
había que volver a hacer clic para seguir escribiendo. Causa raíz:
`recalcularMemoria()`, disparada por el listener de `'input'` delegado en
`#memoria-tabla-cuerpo` y en `#memoria-artefactos-cuerpo`, reescribía el
`innerHTML` completo de esos contenedores en **cada tecla** — destruye y
recrea los `<input>` (pierde el foco) y vuelve a serializar el valor ya
convertido a número vía `numeroFlexible()` (descarta cualquier "," recién
tipeada antes del siguiente carácter).

Este mismo bug ya se había corregido en `GasNatural-GLP/js/ui.js` el
2026-09-03 (ver su `CLAUDE.md`) pero explícitamente **no se portó acá** en
esa sesión, para no interferir con el informe formal que se mergeaba en
paralelo — quedó documentado como pendiente. Portado ahora, mismo patrón:

- **`recalcularMemoriaLigero()`** (nueva función): recalcula la red
  (`calcularRed(tramos)`) pero solo actualiza las celdas de **resultado**
  de cada fila (de solo lectura, identificadas con las clases nuevas
  `.mem-densidad`/`.mem-velocidad`/`.mem-perdida-parcial`/
  `.mem-perdida-acumulada` agregadas en `renderTablaMemoria()`) vía
  `textContent`, más el árbol SVG y el informe impreso — nunca toca ningún
  `<input>`/`<select>` de la fila, así que el foco y lo que el usuario ya
  escribió se conservan. El listener de `'input'` en
  `#memoria-tabla-cuerpo` ahora decide por `evento.target.tagName`: un
  `<select>` (tubería, padre — cambia estructura de la fila) sigue
  llamando `recalcularMemoria()` completo; cualquier `<input>` de
  texto/checkbox (incluido el checkbox "Reinicia acum.", que no cambia
  estructura) llama `recalcularMemoriaLigero()`.
- **Artefactos**: el listener de `'input'` en `#memoria-artefactos-cuerpo`
  ya no llama a `recalcularMemoria()` completo (que a su vez llamaba
  `renderArtefactos()`, reescribiendo la lista entera) — ahora solo llama
  `actualizarTotalArtefactos()` (nueva función, extraída de
  `renderArtefactos()`) y `renderInformeImpresion(ultimoResultadoMemoria)`.
  Agregar/quitar un artefacto sigue regenerando la lista completa vía
  `renderArtefactos()` (no tiene el problema, no es tecla a tecla).
- **Cajetines de proyecto** (`#form-memoria-proyecto`, fecha/instalador/
  criterios/observaciones): tampoco se regeneran vía `innerHTML`, así que
  no tenían el problema de foco en sí — pero el listener llamaba
  `recalcularMemoria()` completo igual (recalculaba y redibujaba toda la
  tabla de tramos sin necesidad). Cambiado a llamar solo
  `renderInformeImpresion(ultimoResultadoMemoria)`, igual que
  `GasNatural-GLP`.
- **`ultimoResultadoMemoria`** (nueva variable de módulo, mismo nombre que
  en `GasNatural-GLP`): cachea el último resultado de `calcularRed(tramos)`
  para que los cajetines de artefactos/proyecto puedan refrescar el
  informe impreso sin recalcular la red entera.

Verificado en navegador (no solo con la regresión de fórmulas, que no
cubre `ui.js`): escribir un decimal completo con coma
("12,5") carácter por carácter en Longitud, Nombre, y en Nombre/Potencia
de un artefacto, sin perder el foco ni ningún carácter. Los `<select>`
(unidad de columna, tubería manual, padre) y el checkbox de reseteo siguen
actualizando la tabla/estructura correctamente. `node
Hidrogeno/tests/run-all.js` sigue en verde (este fix es solo de `ui.js`,
no toca ningún motor de cálculo).

## Rediseño UX/UI de las pestañas (`index.html`/`css/styles.css`/`ui.js`, 2026-09-24, a pedido del usuario)

Pedido abierto ("mejora el UX/UI de los dashboards"). No toca motores de
cálculo ni el diseño del informe impreso; `node Hidrogeno/tests/run-all.js`
sigue en verde. Mismo cambio en `GasNatural-GLP` (ver su `CLAUDE.md`).

- **Layout entradas | resultados** (`.calc-layout`, ≥960px): antes los
  resultados iban debajo del formulario y había que bajar para ver el
  efecto de cada cambio. La columna de resultados es `position: sticky`
  — solo actúa cuando es más corta que la de entradas. Encabezado
  "Resultados · Se actualizan al escribir" porque no hay botón Calcular.
- **Ancho de contenido = cabecera** (1180px, antes 1100px): el borde del
  logo y el de los formularios no calzaban.
- **Barra de pestañas fija** (`.barra-pestanas`, sticky) y, en móvil,
  pestañas con scroll horizontal en vez de partirse en 2 líneas. Al
  cambiar de pestaña estando abajo, `initTabs()` vuelve al inicio del
  panel.
- **Pestaña activa en el hash** (`#flujo`/`#almacenamiento`/`#memoria`):
  recargar ya no vuelve a la primera pestaña, y el hub enlaza directo a
  cada herramienta (`herramientas` en `assets/gases.js`). `replaceState`,
  no un paso de historial por clic.
- **Resultados en grupos** (`grupo()` en `ui.js`): cada grupo tiene su
  propia grilla auto-fit, así los 2 KPI llenan el ancho en vez de dejar
  columnas vacías. Mismos KPI/secundarios y mismo orden que la auditoría
  del 2026-09-03, salvo en el screening de flujo sónico: el tile **Estado**
  pasa primero y a fila completa (`.ancho`), con ΔP/P₁, P₂/P₁ y el límite
  crítico debajo — el veredicto antes que los números que lo respaldan.
  "Caudal de referencia" pasa a `.secundario` como el resto de su grupo
  (`tileConUnidad()` acepta ahora `variante`).
- **Tokens de estado** `--estado-ok/-alerta/-critico` (+ `-tinte`) en
  `.viz-root`: en tema oscuro, verde Material 400 (`#66bb6a`) en vez del
  800 (quedaba ~3:1 sobre `#221f1c`) y el rojo `#ef5350` que ya existía.
  Se declaran en los mismos 3 selectores de tema que `assets/brand.css`
  — **arregla un bug**: `.critico` oscuro usaba solo
  `@media (prefers-color-scheme: dark)` e ignoraba el botón "Modo
  oscuro/claro". Los tiles de estado suman barra lateral + tinte suave
  del mismo color (el estado se lee también por forma, no solo por color).
  Extrapolación de marca conservadora, igual que el verde/rojo originales.
- **Etiquetas de tile** en `--text-secondary` (antes `--text-muted`, ~3,5:1
  sobre la card blanca). Selector de unidad inline sin caja hasta hover.
- **Validación visible**: `initValidacionNumerica()` pone `aria-invalid`
  (borde rojo + tooltip) en un `inputmode="decimal"` con texto no numérico
  — `numeroFlexible()` lo calcula como 0 y antes eso pasaba sin aviso.
  Vacío no cuenta (hay campos opcionales).
- **Tubería manual**: los 4 cajetines (DI/espesor/límite elástico/
  rugosidad) pasan de una fila sin rótulos bajo una etiqueta larga a un
  `<fieldset class="subseccion">` con etiqueta visible por campo. Mismos
  `id`, `ui.js` no cambió. Accesorios en 3 columnas (`.fila-campos.compacta`).
- **Memoria de Cálculo**: barra de acciones con jerarquía (Imprimir como
  botón primario naranja), "Importar" como botón (`<label>` de un
  `<input type=file>` visualmente oculto) en vez del control nativo sin
  estilo, línea de estado `#memoria-estado` que confirma exportar/importar
  y avisa si el `.json` es inválido (antes la promesa rechazada fallaba en
  silencio), el `<input>` se vacía tras importar para poder reimportar el
  mismo archivo, foco al nombre del tramo recién agregado, títulos
  "Diagrama de la red"/"Tramos" (`.no-imprimir`), columnas calculadas
  sombreadas (`--tinte-calculado`) y anchos mínimos en Tramo/Continúa
  desde/Material (se veían "Tramc"/"AISI 31"). `.tabla-contenedor` lleva
  `position: relative` a propósito: sin eso, el texto `.visualmente-oculto`
  (absoluto) de la cabecera escapaba del scroll y ensanchaba la página.
- **Móvil (≤600px)**: 2 tiles por fila (la pestaña Tubería y Flujo medía
  ~3000px de alto con 1 por fila, ahora ~2350px), subtítulo de la cabecera
  oculto, desvanecido a la derecha de las pestañas como pista de scroll.

## Uso desde el teléfono (`css/styles.css`/`ui.js`/`index.html`, 2026-09-25, a pedido del usuario)

Pedido: "que los dashboards sean responsivos y se puedan usar desde el
teléfono". Auditado con Playwright a 320/375/414px (y 800px tablet, 1366px
escritorio para confirmar que escritorio no cambia). No toca motores ni el
informe impreso (sigue en 1 hoja A4, medido desde ancho de teléfono y de
escritorio). El bloque CSS "Uso desde el teléfono" y las funciones
`centrarPestana()`/`initResumenMovil()` son **idénticos en los tres
módulos** — mantenerlos iguales. Todas las reglas van con `@media screen
and …` a propósito: una A4 impresa mide ~690px de ancho y activaría las
reglas de pantalla angosta sobre el informe.

- **Barra de resumen fija al pie** (`initResumenMovil()`, `.resumen-movil`,
  <960px): con entradas y resultados apilados, los KPI quedaban ~800px bajo
  el campo que se edita. La barra copia los tiles del grupo `kpis` de la
  calculadora en uso (la del último campo tocado; si no, la primera de la
  pestaña activa) y se muestra solo mientras esos resultados no están a la
  vista (IntersectionObserver, descontando 120px del alto de la barra).
  Tocarla hace scroll a `.calc-resultados` (`scroll-margin-top` descuenta
  la barra de pestañas fija). Se rearma desde el DOM con un
  MutationObserver: no conoce ningún motor, así que un KPI nuevo aparece
  solo si va en `grupo(…, 'kpis')`. Máx. 3 KPI, 2 bajo 420px. Sin
  `aria-live` propio (`.calc-resultados` ya lo tiene). Sin barra en
  Memoria de Cálculo (no tiene `.calc-resultados`).
- **16px en cajetines y 44px de área táctil** (`max-width: 600px` o
  `pointer: coarse`): bajo 16px Safari de iPhone hace zoom a la página al
  tocar un cajetín y no vuelve. Se descartó `maximum-scale=1` en el
  viewport: en Android bloquea también el zoom con los dedos (WCAG 1.4.4).
  Botones, ✕ de eliminar, control segmentado y selectores de unidad de los
  tiles suben a ≥36-44px.
- **Memoria de Cálculo en tarjetas** (≤720px): una tarjeta por tramo en
  vez de la tabla de 14 columnas con scroll horizontal (en 360px se veían
  3 columnas a la vez). CSS puro sobre la misma tabla: cada `<td>` lleva
  `data-label` con el encabezado y su unidad (`renderTablaMemoria()`), que
  `::before` muestra como etiqueta; del `<thead>` quedan solo los `<th>`
  con selector de unidad, como barra "Unidades". Las celdas calculadas
  llevan también `.col-calculada` (tinte). No cambia `leerFilaMemoria()`
  ni el fix de foco: se verificó escribir "12,5" en una tarjeta sin perder
  el foco ni la coma.
- **Diagrama de la red** dentro de `.arbol-contenedor` (overflow-x: auto);
  `renderArbol()` fija `min-width` del `<svg>` al nodo más a la derecha +
  su nombre, así se desplaza en vez de quedar cortado desde el 2º nivel.
- **Pestaña activa centrada** en la barra (`centrarPestana()` en
  `activar()`): al llegar desde el hub a `#memoria` la pestaña quedaba
  cortada fuera de pantalla.
- **Arreglos de desborde horizontal**: `.campo-ancho` (span 2) creaba una
  2ª columna implícita en grillas de 1 columna (Red de Gas de GN/GLP se
  podía arrastrar de lado); tablas de referencia dentro de `<details>` con
  scroll propio; celdas calculadas con `nowrap` que no dejaban partir
  "Pérdida acumulada [mbar]" en la tarjeta.
- Menores: Codos/Tee/Válvulas en 3 columnas también en el teléfono (antes
  2 + 1), barra de acciones de la Memoria en grilla de 2 con Imprimir a lo
  ancho, cabecera más baja, 96px de aire bajo `main` para la barra.

## Diagrama de la red como unifilar (`ui.js`/`css/styles.css`, 2026-09-25, a pedido del usuario)

Pedido: "mejora visualmente el diagrama de la red". Antes era un punto por
tramo con la fila asignada por orden de aparición dentro de cada nivel: un
hijo podía quedar en otra fila que su padre (líneas diagonales que se
cruzaban), el nombre largo se montaba sobre el nodo siguiente y no había
ningún dato del tramo. Ahora `dibujarDiagramaRed()` lo dibuja como un
unifilar:

- Cada tramo es un trozo de cañería horizontal; el primer hijo sigue en
  línea recta con su padre y los demás bajan en codo — sin cruces por
  construcción. Cada tramo final ocupa una fila; cada nivel es tan ancho
  como su texto más largo (medido con canvas, porque con la pestaña oculta
  `getComputedTextLength()` da 0; nombres de más de 240px se recortan con
  "…" y el nombre completo queda en el tooltip).
- Nombre arriba; tubería · longitud · potencia y "ΔP acum. · velocidad"
  abajo (ΔP en la unidad de la columna "Pérdida acumulada"). Grosor de la
  línea según el diámetro nominal (pista visual, el diámetro va escrito).
- Un valor fuera de un criterio de diseño va en rojo con ▲ y la cañería en
  rojo: son **las mismas marcas que la tabla del informe** —
  `evaluarCriteriosRed()` se extrajo de `renderInformeImpresion()` y la
  usan los dos. Por eso el listener de "Datos del informe" ahora también
  redibuja el diagrama.
- "Reinicia acum." = símbolo de regulador (válvula + domo) al inicio del
  tramo, en vez del anillo. Inicio de red = cuadrado. Leyenda solo de los
  símbolos presentes. Hover resalta el tramo en naranja; tooltip con ΔP
  del tramo, acumulada y velocidad.
- Colores por tokens (`--text-muted` cañería, `--brand-orange` nodos,
  `--estado-critico`), así que respeta el tema oscuro. Red vacía: texto
  "Agrega un tramo…". Ciclos de "Continúa desde" no cuelgan el dibujo.

`dibujarDiagramaRed()` y su bloque CSS son **idénticos** en Hidrógeno y
GN/GLP (copiados, no importados); cada `renderArbol*()` solo traduce su
resultado a `elementos`. Las fuentes de `DIAGRAMA.fuente*` deben coincidir
con las de `.arbol-nombre`/`.arbol-dato` en el CSS. Sigue sin imprimirse.

## Fix de ids de tramo/artefacto repetidos en la Memoria de Cálculo (`ui.js`, 2026-09-24, a pedido del usuario)

Al cargar (localStorage) o importar un proyecto, los contadores
`contadorId`/`contadorArtefactoId` partían de la **cantidad** de
elementos. Tras borrar uno intermedio (quedaban `t1`,`t3`) y recargar, el
contador quedaba en 2 y "Agregar tramo" volvía a crear `t3`: dos filas con
el mismo `data-id`, y como `tramos.map()` reemplaza por id, editar una
pisaba a la otra en el modelo (se veía al recargar: ambas con el mismo
nombre/valores); eliminar una borraba las dos. Mismo problema con los
artefactos (`a<N>`) y por la vía de "Importar proyecto".

- `maxSufijoId()` — los contadores parten del **mayor** sufijo numérico
  existente, no de la cantidad.
- `repararIdsDuplicados()` — al cargar e importar, la 2ª aparición de un
  id repetido (datos ya corruptos por el bug, en el navegador de alguien o
  en un `.json` exportado) recibe uno nuevo; un "Continúa desde" que
  apuntaba a ese id queda colgado del primero.

Verificado en navegador (borrar intermedio + recargar + agregar, importar
con ids salteados, y localStorage con ids ya repetidos). Mismo fix en
`GasNatural-GLP/js/ui.js`.
