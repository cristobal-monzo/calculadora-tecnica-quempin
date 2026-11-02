# Hidrógeno: informe de Memoria de Cálculo

Detalle de referencia: léelo solo al tocar esto. Las reglas vigentes están en `../CLAUDE.md`.

## Informe formal de Memoria de Cálculo (`index.html`/`ui.js`/`css/styles.css`, 2026-09-03, a pedido del usuario)

La pestaña "Memoria de Cálculo" imprimía solo una tabla desnuda de tramos
(6 columnas, sin membrete). Se rediseñó `#memoria-informe-impresion` como
un documento formal completo, calcado del membrete real de QUEMPIN
(`ejemplo MC.pdf`, provisto por el usuario) — logo (`assets/LOGO
QUEMPIN.PNG`), datos de la empresa, título, cajetines de proyecto,
criterios de diseño, artefactos, tabla de tramos ampliada a 10 columnas
(agrega Potencia/Material/P.Parcial/V.flujo, que la tabla vieja omitía),
resumen, observaciones y firma. Decisiones:

- **Datos de la empresa (RUT 76.772.215-k, Giro, Dirección Carlos Fernando
  983) van hardcodeados** en el HTML del informe, no como cajetín — son
  fijos de QUEMPIN, no cambian por proyecto (a diferencia de la
  "Dirección"/"Comuna" del cajetín, que es la del proyecto/instalación, un
  dato distinto).
- **Nuevo estado `proyecto`** (objeto aparte de `tramos`, clave propia
  `memoria-proyecto` en localStorage — sin migrar el shape de `memoria`):
  fecha/proyecto/instalador/contacto/dirección/comuna, cargo y RUN del
  instalador (bloque de firma), N° de documento/revisión (default "01"/"1"),
  3 criterios de diseño opcionales, artefactos y observaciones.
- **"Velocidad máxima flujo de gas" / "Velocidad de erosión" / "Máxima
  pérdida de carga acumulada" del encabezado son cajetines manuales
  opcionales**, no calculados: son criterios/límites de diseño del
  proyecto, no un resultado de un tramo — la velocidad de erosión en
  particular depende de la presión, que varía tramo a tramo en una red
  ramificada, así que no hay un único valor "correcto" que derivar
  automáticamente (decisión confirmada con el usuario). Sin valor, se
  muestran como "- [unidad]", igual que el documento de ejemplo. Default
  20 m/s en velocidad máxima de flujo (mismo límite NFPA 2 usado en
  "Tubería y Flujo"). Distintos de "Pérdida acumulada máxima" / "Velocidad
  máxima de flujo" al pie del informe, que sí son calculados (máximo de
  `perdidaAcumuladaMbar`/`velocidadFlujoMS` entre los tramos ya
  resueltos).
- **Artefactos**: lista libre (nombre + potencia kW, agregar/quitar, mismo
  patrón que los tramos). "Potencia instalada" = suma siempre, con la nota
  fija "No se considera operación simultánea" — igual que el documento de
  ejemplo (confirmado con el usuario; sin interruptor de simultaneidad).
- **Exportar/Importar proyecto (.json)** pasa de un array plano de
  `tramos` a `{ tramos, proyecto }`. Importar sigue aceptando el formato
  viejo (`Array.isArray(datos)`) por compatibilidad con exports previos.
- **Impresión**: además de `.no-imprimir`, ahora se ocultan `.viz-header`
  (cromo del sitio — logo de texto, selector de gas) y `#memoria-arbol` (el
  diagrama de árbol es ayuda visual de edición, no parte del documento) —
  el informe es autocontenido y trae su propio membrete. Se agregó `@page
  { size: A4; margin: 14mm; }` y `html, body, .viz-root` forzados a fondo
  blanco puro (antes se colaba el beige de `--page-plane` del tema claro
  alrededor del informe).

## Rediseño visual del informe (`css/styles.css`/`index.html`, 2026-09-06, a pedido del usuario)

El informe original (sección anterior) tenía el contenido correcto pero un
tratamiento visual básico — sin títulos de sección, tablas con grilla
completa, colores de borde inconsistentes. Se refinó en una serie de
pasos, todos dentro de `@media print` en `css/styles.css` (sin tocar
`ui.js`, que sigue solo llenando `.textContent` por id):

- **Eyebrows de sección** (`.informe-eyebrow`, reutilizada en `<div>` y en
  `<caption>`): mayúscula + tracking + filete superior en `var(--gridline)`;
  antes las 6 secciones (datos/criterios/artefactos/tramos/resumen/
  observaciones) no tenían ningún título que las separara.
- **Ficha de campos** (`.informe-ficha`/`.informe-campo`) reemplaza la
  tabla etiqueta-izquierda/valor-derecha en Datos del proyecto y Criterios
  de diseño — esa tabla partía mal las etiquetas largas ("Máxima pérdida
  de carga acumulada" caía en 2 líneas y descuadraba la fila con su par).
- **Cajetín de N° Doc/Revisión/Página** con borde propio, estilo title
  block de plano técnico, en vez de texto suelto alineado a la derecha.
- **Tabla de tramos "reglada"** (`#memoria-tabla-impresion`): solo filetes
  horizontales + cebra, sin grilla completa (el aspecto por defecto de una
  planilla exportada); cabecera con tinte del naranja de marca
  (`rgba(255,81,0,0.06)`) y filete de 2px bajo la cabecera. Números con
  `font-variant-numeric: tabular-nums`.
- **Tarjetas de métrica** (`.informe-stat`) para "Pérdida acumulada
  máxima"/"Velocidad máxima de flujo" — mismo lenguaje visual que los
  tiles de resultado en pantalla (número grande + etiqueta chica), en vez
  de una fila de tabla más. "Potencia instalada" en Artefactos también se
  destaca (13px/900) frente a "Total" (paso intermedio).
- **Etiqueta "Firma" + pie de página de cierre** (RUT/nombre/"Memoria de
  Cálculo, Red de Gas Hidrógeno") — antes la línea de firma no explicaba
  qué iba ahí y el documento terminaba de golpe tras la firma.
- **Paleta de bordes unificada a los tokens de marca** (`var(--gridline)`
  para filetes finos, `var(--brand-gray-7)` para filetes de más peso,
  `var(--brand-gray-11)` para texto secundario) — se habían acumulado 5
  grises de borde ligeramente distintos entre los pasos anteriores.
  Esquinas rectas en todo el informe (se sacó el único `border-radius` que
  quedaba, en Observaciones) — un documento controlado se lee más formal
  sin esquinas de tarjeta de app.
- **Resiliencia de paginado**: `#memoria-tabla-impresion thead { display:
  table-header-group }` (repite la cabecera si la tabla pasa a una 2ª
  página) y `break-inside: avoid` en filas/tarjetas/firma/header/
  observaciones — el caso feliz de 1 página ya se veía bien sin esto, pero
  una red con muchos tramos puede desbordar a más de una página.

Verificado en cada paso con un viewport de ~700px (aprox. el área útil de
una A4 con márgenes de 14mm) en vez del ancho de escritorio, que
distorsiona el juicio sobre cómo se ve realmente el PDF impreso.

## Ajustes de membrete y firma (2026-09-07, a pedido del usuario)

- **Logo agrandado y recortado a su contenido visible** — el archivo
  oficial `assets/LOGO QUEMPIN.PNG` trae ~17-24% de margen transparente
  alrededor de la marca (confirmado inspeccionando el canal alfa), así que
  agrandar su altura en CSS no acercaba el trazo visible del logo al texto
  de al lado. Se generó `assets/logo-quempin-informe.png` (recorte al
  bounding box del canal alfa + ~2% de aire) específicamente para este uso
  — el archivo oficial NO se tocó, sigue siendo la fuente de verdad para
  cualquier otro uso del logo en el sitio. `.informe-logo` pasó de 50px a
  76px de alto y `.informe-header` de `align-items: center` a `flex-start`
  para que el borde superior del logo quede a la altura del texto de la
  derecha (RUT/Giro/Dirección) — a pedido explícito del usuario, ignorando
  a propósito el espacio de resguardo que exigiría el manual de marca para
  este uso puntual. **Ajustado de nuevo el mismo día tras revisión visual**:
  76px quedaba demasiado grande — bajó a **60px** (~20% menos) y
  `align-items` volvió a `center` (con el logo más chico, centrado se ve
  mejor que alineado por el borde superior).
- **Más espacio en blanco para la firma manuscrita**:
  `.informe-firma-etiqueta` (la etiqueta "FIRMA") pasó de `margin-bottom:
  22px` a `46px` antes de la línea.
- **N° de documento correlativo con el control de documentos QUEMPIN**:
  el default de `numeroDoc` pasó de "01" a **"402603"**. Fuente:
  `QUEMPIN_Control de Documentos 2026.xlsx` (vive en la raíz del repo,
  **gitignored** por `*.xlsx` — no se versiona, es una planilla de gestión
  externa al código, igual criterio que `Calculos H2.xlsx`/`Libro11111111.xlsx`),
  hoja "Chile", fila 18: código `40XXXX` ("Cálculo de ingeniería" /
  "Memoria de cálculo"), columna "Último Emitido" = `402602` al
  2026-09-07. Formato del código: `TT` (tipo de documento, 2 dígitos) +
  `AA` (año, 2 dígitos) + `NN` (correlativo del año, 2 dígitos) — ej.
  `402602` = tipo 40, año 2026, 2º emitido ese año; confirmado contra
  todas las demás filas de la planilla (el año del código coincide con el
  año real de emisión en cada fila salvo esta, que tiene la columna
  "Fecha"/"Nombre de Archivo" desactualizada un emitido respecto a
  "Último Emitido" — se confía en "Último Emitido" por ser la columna con
  ese nombre explícito). **GasNatural-GLP usa el mismo código 40XXXX**
  (a pedido explícito del usuario, aunque existe un código más específico
  — `41XXXX`, fila 19, "Memoria de cálculo de red de gas" — se decidió no
  usarlo para no fragmentar el correlativo en dos numeraciones paralelas).
  Como los dos módulos comparten una única numeración de la fila 18,
  Hidrógeno tomó `402603` y GasNatural-GLP `402604` (siguiente disponible
  después de asignar el de Hidrógeno) — ver el `CLAUDE.md` de
  `GasNatural-GLP` para el mismo detalle. **OtrosGases** (Memoria agregada
  el 2026-09-28) comparte la misma fila y tomó `402605` ("Último Emitido"
  seguía en `402602` ese día).
  **Mantenimiento**: este número NO se actualiza solo — la app es estática
  y no tiene forma de escribir en la planilla. Cada vez que el usuario
  confirme que emitió/entregó una memoria de cálculo real, hay que (1)
  actualizar "Último Emitido" en la planilla (y agregar la fila con
  autor/fecha/referencia si corresponde) y (2) subir el default de
  `numeroDoc` de los tres módulos al siguiente número disponible.

## El informe siempre entra en una sola hoja (`ui.js`, 2026-09-08, a pedido del usuario)

Con una red de muchos tramos, la tabla de `#memoria-informe-impresion`
puede crecer más alto que una A4 y desbordar a una 2ª página — la
"resiliencia de paginado" agregada en el rediseño visual (`thead {
display: table-header-group }`, `break-inside: avoid`, ver sección de
arriba) asumía que eso era aceptable como fallback. El usuario pidió que
el informe **siempre** quepa en una sola hoja, sin excepción.

`ajustarEscalaImpresion()` (nueva función en `ui.js`) mide el alto real
del informe ya renderizado con los estilos de `@media print` aplicados
(engachada a los eventos globales `beforeprint`/`afterprint` de la
ventana, no solo al botón "Imprimir/Guardar PDF" — así también cubre
Ctrl+P o el menú nativo del navegador) y, si no entra en el alto
disponible de una A4 con márgenes de 14mm (`(297 - 28) * 96/25.4 * 0.98`
px CSS, con 2% de margen de seguridad contra el redondeo de `zoom`,
medido empíricamente en ~0.3-0.5%), reduce todo el informe con la
propiedad CSS `zoom`. Se prefirió `zoom` sobre `transform: scale()`
porque `zoom` sí reduce el alto de **layout** de la caja (no solo el
pintado visual) — con `transform`, el motor de paginado de impresión
seguiría viendo el alto original sin escalar y podría igual cortar una 2ª
página aunque el contenido se vea más chico. `afterprint` resetea el zoom
a `''` para no dejar la vista en pantalla achicada. Sin piso mínimo de
escala a propósito — la instrucción es "siempre", no "salvo que haya
demasiados tramos". Verificado con 20 tramos (bastante más de lo que el
caso de uso típico necesita): factor ~0.76, cabe cómodo dentro de una A4.
**Corregido el 2026-09-25**: igual salían 2 páginas — ver la sección
siguiente (padding inferior de pantalla).

## Informe legible: verificación de criterios y notación técnica (`index.html`/`ui.js`/`css/styles.css`, 2026-09-25, a pedido del usuario)

Pedido: revisar visualmente el informe "con perspectiva de ingeniero de gas
y de diseñador de documentos senior" para que se lea claro y conciso.
Revisado sobre PDFs reales (`page.pdf()` de Chromium, A4, "Gráficos de
fondo" desactivado como viene por defecto) con una red de 4 tramos con
regulador. Mismo cambio en `GasNatural-GLP` (ver su `CLAUDE.md`). No toca
motores de cálculo; `node Hidrogeno/tests/run-all.js` sigue en verde.

- **Sección 5 "Verificación de criterios de diseño"** (reemplaza las 2
  tarjetas de "Resumen de resultados"): el informe declaraba los límites
  (sección 2) y mostraba los máximos, pero nunca decía si la red cumple —
  con 20 m/s de límite y 52,25 m/s calculados, no había ninguna señal. Ahora
  una fila por criterio definido (Criterio | Límite | Máximo calculado |
  Tramo crítico | Resultado "Cumple"/"No cumple · N de M tramos"/"No
  evaluado") y una conclusión de una línea con barra verde/roja.
  "Velocidad de erosión" solo aparece si tiene valor (compara la misma
  velocidad de flujo). `evaluarCriterio()`/`filaVerificacion()`/
  `textoConclusion()` en `ui.js`.
- **Valores fuera de límite marcados en la tabla de tramos** (`▲` + rojo +
  negrita, `.informe-excede`) con leyenda al pie — el estado se lee por
  forma, no solo por color (fotocopia en B/N).
- **Unidades con su caja real**: el `text-transform: uppercase` de las
  cabeceras convertía "MPa"/"mbar"/"m/s"/"kW" en "MPA"/"MBAR"/"M/S"/"KW" (en
  SI la caja es parte del símbolo: m = mili, M = mega). La unidad va en su
  propia línea (`thConUnidad()`, `.informe-unidad`).
- **Notación SI en los valores**: "20 m/s", no "20 [m/s]" (los corchetes
  quedan para rotular). Un criterio sin valor dice "No definida" en vez
  de "- [m/s]" — revierte a propósito la decisión del 2026-09-03 de
  copiar el guion del documento de ejemplo: en papel se leía como un dato
  faltante por error.
- **Criterio y resultado en la misma unidad**: la pérdida máxima se
  ingresa en Pa pero se imprime en la unidad de la columna "ΔP acumulada"
  (antes "5.000 [Pa]" arriba vs. "273,86 [mbar]" abajo).
- **Presión manométrica explícita**: "Presión man." — el motor la trata
  como manométrica (`calc-memoria.js`), y en H₂ la diferencia con absoluta
  es de 1 bar. "P. Parcial"/"P. Acumulada" pasan a "ΔP tramo"/"ΔP
  acumulada" ("P." se leía también como "presión").
- **Reinicio de acumulada como marca "R"** junto al nombre del tramo, con
  leyenda, en vez de "(reinicia acumulada)" dentro de la celda — ese texto
  ensanchaba la tabla ~20px más allá del margen derecho de la hoja.
  "— raíz —" (jerga de la app) pasa a "Inicio de red".
- **Secciones numeradas** (1 a 6, número en naranja de marca, título en
  negro — antes gris de 8,5px, indistinguible de una etiqueta de campo):
  permite citar "ver 4" al revisar.
- **Demanda de potencia** como tabla con cabecera (Artefacto | Potencia
  térmica kW), números a la derecha y **una sola fila de total**: "Total" y
  "Potencia instalada" repetían el mismo número (sin simultaneidad son
  iguales). La nota de no simultaneidad va en la misma fila.
- **Más compacto**: Datos del proyecto en 3 columnas (qué/dónde, cuándo/
  quién) y Criterios en 4 — 3 filas menos. Con la red de ejemplo de 4
  tramos, el informe entra en 1 hoja **a zoom 1** (antes lo reducía
  `ajustarEscalaImpresion()`). Pie con "Doc. N°, Rev." (el documento se
  identifica también abajo); "N°. Doc.:" pasa a "N° Doc.".
- **Paleta fija en papel**: `#memoria-informe-impresion` redefine
  `--gridline`/`--brand-gray-*`/`--estado-*` en `@media print`. En tema
  oscuro `--gridline` vale `#2c2c2a`, así que imprimir con la app en "Modo
  oscuro" dejaba todos los filetes casi negros (medido: `rgb(44,44,42)` →
  ahora `rgb(225,224,217)` en ambos temas).
- **`print-color-adjust: exact`**: Chrome no imprime fondos por defecto, y
  sin esto se perdían la cebra, el tinte de cabecera, el cajetín de N° Doc
  y los recuadros de estado. Verificado con `printBackground: false`.
- **Fin de la 2ª hoja en blanco**: `main` (60px) y `.viz-root` (48px)
  conservaban su padding inferior en papel, así que el PDF salía **siempre**
  con 2 páginas, a cualquier zoom (medido con 1; 0,97; 0,94; 0,9) — y a
  veces el pie del informe caía en la 2ª. `main, .viz-root {
  padding-bottom: 0 }` en `@media print`. Con 20 tramos: zoom 0,77, 1 hoja.

Verde de "Cumple" y rojo de "No cumple": los mismos `--estado-ok`
(`#2e7d32`) y `--estado-critico` (`#c62828`) ya extrapolados para los
tiles (ver "Rojo de estado crítico" arriba) — sin colores nuevos.
