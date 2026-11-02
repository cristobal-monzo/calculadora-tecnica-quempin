# Gas Natural / GLP: informe de Memoria de Cálculo

Detalle de referencia: léelo solo al tocar esto. Las reglas vigentes están en `../CLAUDE.md`.

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
  *(Desde el 2026-09-28 el límite del D.S. 66 — < 40 m/s en media/alta
  presión — se incluye aparte con un checkbox; el cajetín sigue vacío. Ver
  "Límites del D.S. 66 en la Memoria".)*
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
  trabajo aparte. **Hecho el 2026-09-25**, ver "Informe legible" más abajo.
- **Más espacio para la firma manuscrita**: como este módulo no tiene la
  etiqueta "FIRMA" que sí tiene Hidrógeno (tampoco portada), el espacio se
  agregó como `margin-top: 46px` en `.informe-firma-linea` directamente
  (mismo resultado visual — un área en blanco antes de la línea — sin
  agregar la etiqueta, que no se pidió acá).
- **N° de documento**: default de `numeroDoc` pasó de "01" a **"402604"**
  — mismo código `40XXXX`/fila 18 de `QUEMPIN_Control de Documentos
  2026.xlsx` que usa Hidrógeno (a pedido explícito del usuario, en vez del
  código más específico `41XXXX`/fila 19 "Memoria de cálculo de red de
  gas"), siguiente disponible después del `402603` que tomó Hidrógeno
  (OtrosGases tomó el `402605` el 2026-09-28, misma fila).
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
**Corregido el 2026-09-25**: igual salían 2 páginas por el padding
inferior de pantalla — ver "Informe legible" más abajo.

## Informe legible: verificación de criterios y notación técnica (`index.html`/`ui.js`/`css/styles.css`, 2026-09-25, a pedido del usuario)

Mismo cambio que `Hidrogeno` (ver su `CLAUDE.md` para el detalle y el
porqué de cada punto: sección de verificación con Cumple/No cumple y tramo
crítico, marcas `▲`/`R` con leyenda, unidades con su caja real, notación
SI, criterio y resultado en la misma unidad, presión manométrica
explícita, secciones numeradas, una sola fila de potencia instalada,
paleta fija y `print-color-adjust` en papel, fin de la 2ª hoja en blanco).
El bloque del informe en `@media print` de `css/styles.css` es ahora
**copia exacta** del de Hidrógeno — este módulo nunca había recibido el
rediseño visual del 2026-09-06 (ver pendiente arriba): tenía tablas con
grilla completa, sin títulos de sección, sin etiqueta "Firma" ni pie.
Motores sin cambios; `node GasNatural-GLP/tests/run-all.js` en verde.

Lo propio de este módulo:

- **Pérdida acumulada en una red mixta**: si la red mezcla tramos de baja
  (`<10 kPa`) y media/alta presión, el criterio de pérdida acumulada se
  evalúa **solo sobre los tramos de baja** y la fila lo dice ("Pérdida de
  carga acumulada (tramos de baja presión)"); si no, sobre todos. Motivo:
  el límite típico (D.S. 66: 150 Pa GLP / 120 Pa GN) es de baja presión,
  del regulador al artefacto. Medido con estanque a 150 kPa + regulador +
  3 tramos de baja: antes el máximo informado era 6.923 Pa (el tramo de
  media, un 4,6% de su presión inicial — irrelevante contra 150 Pa) y
  escondía el tramo de baja que de verdad no cumple (Calefont, 499,8 Pa).
  La velocidad sí se evalúa en todos los tramos.
- **Números del informe sin precisión espuria** (`formatearInforme()`/
  `formatearPresionInforme()`): hasta 2 decimales pero nunca menos de 3
  cifras significativas (`roundingPriority: 'morePrecision'`) — "150.000"
  en vez de "150.000,0 Pa" y "70" en vez de "70,00 kW térmicos", sin que
  un valor chico en una unidad grande (0,0028 MPa) se imprima como "0". La
  tabla en pantalla sigue con `formatearFijo`/`formatearPresionFija`.
- "Presión inicial" pasa a "P. inicial man." y "P. Requerida" a "ΔP
  tramo" (mismo nombre que en Hidrógeno para la misma magnitud).
- Título, "Tipo de red" y ahora también el pie ("Red de GLP"/"Red de Gas
  Natural") siguen al combustible vigente.
