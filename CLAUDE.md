# CLAUDE.md — Calculadora Técnica QUEMPIN (maestro)

Dashboard estático de calculadoras de ingeniería de gases (dimensionamiento
de tuberías, volúmenes y presiones de almacenamiento, entre otros). Tres
módulos: `Hidrogeno/`, `GasNatural-GLP/` y `OtrosGases/` (CO₂, NH₃ o
cualquier gas definido por sus constantes críticas, 2026-09-25). Diseño
original y decisiones registradas en
[`docs/superpowers/specs/2026-09-01-calculadora-tecnica-hidrogeno-design.md`](docs/superpowers/specs/2026-09-01-calculadora-tecnica-hidrogeno-design.md).

Repo independiente de `finanzas-quempin` (mismo dueño de GitHub,
`cristobal-monzo`, pero dominio de producto distinto: ingeniería de gas, no
finanzas). No compartas convenciones entre ambos repos por inercia — lee el
`CLAUDE.md` de cada uno.

## Manual de marca

Fuente de verdad para colores, tipografía y logo:
`assets/OFICIAL MANUAL DE MARCA GRÁFICA QUEMPIN.pdf`, más `assets/LOGO
QUEMPIN.PNG`. El sistema de marca ya extraído a CSS (fuente Lato embebida,
paleta de marca, tema claro/oscuro) vive en `assets/brand.css` y lo enlaza
cada página del sitio — no reextraer el PDF a mano, copiar de ahí. Nunca
inventar paleta, tipografía o variante de logo; si un caso puntual de UI no
está cubierto por el manual, extrapolar de forma conservadora y anotar la
decisión en el `CLAUDE.md` de contenido del módulo correspondiente
(`<Gas>/CLAUDE.md`).

## Estructura del repo

```
calculadora-tecnica-quempin/
├── CLAUDE.md              # este archivo
├── index.html             # hub: una tarjeta por gas/familia de gases
├── assets/
│   ├── brand.css          # sistema de marca compartido (fuentes, paleta, tema)
│   ├── LOGO QUEMPIN.PNG
│   └── OFICIAL MANUAL DE MARCA GRÁFICA QUEMPIN.pdf
└── <Gas o familia de gases>/
    ├── CLAUDE.md           # contenido: fórmulas, fuente, supuestos, discrepancias
    ├── index.html
    ├── css/styles.css      # estilos propios de ese módulo (no repite assets/brand.css)
    ├── js/
    └── tests/
```

Cada módulo de gas es autocontenido (su propio motor de cálculo, su propia
UI) salvo dos cosas que siempre se comparten desde `assets/`:
- `assets/brand.css` — sistema de marca (fuentes, paleta, tema).
- `assets/gases.js` + `assets/gas-switcher.js` — el registro único de
  módulos y el selector "Cambiar de gas" de la cabecera, que permite
  moverse entre herramientas sin volver al hub. Al agregar un módulo nuevo:
  agregarlo a `GASES` en `assets/gases.js` (una sola vez — el hub y el
  selector de cada módulo lo leen de ahí), con su lista `herramientas`
  (`id` = el `data-tab` de cada pestaña del módulo: el hub las enlaza
  directo como `<ruta>#<id>`), y en el `index.html` del módulo
  nuevo agregar `<select id="selector-gas">` en la cabecera + llamar
  `initSelectorGas({ actualId: '<id-del-gas>', profundidad: 1 })` desde su
  `ui.js` (ver `Hidrogeno/js/ui.js` como referencia). Copiar también
  `initTabs()` de ese `ui.js`: activa la pestaña desde el hash de la URL,
  que es lo que hace funcionar esos enlaces directos del hub.

## Patrón de UI de los módulos (rediseño UX/UI 2026-09-24)

Los tres módulos comparten la misma estructura de pantalla, copiada (no
importada) en cada `css/styles.css` — mantenerlas iguales al tocar una:
barra de pestañas fija (`.barra-pestanas`), cada calculadora en
`.calc-layout` = entradas (`.calc-entradas`) | resultados
(`.calc-resultados`, fijos al hacer scroll si caben), resultados armados
con `grupo()` en `ui.js` (un grupo `kpis` arriba + grupos con subtítulo),
tokens de estado `--estado-ok/alerta/critico` con variante propia en tema
oscuro, y `aria-invalid` en cajetines numéricos con texto no numérico. El
detalle y el porqué de cada decisión está en el `CLAUDE.md` de cada módulo. La decisión de "un sitio por gas vs. un selector
compartido entre gases" se toma módulo por módulo — Hidrógeno tiene su
propio sitio; Gas Natural y GLP comparten uno con selector interno, porque
son más similares entre sí en normativa aplicable (D.S. 66) que con
hidrógeno (ASME B31.12 / NFPA 2). `OtrosGases/` es el caso general: un solo
sitio con selector de gas (predefinidos + uno personalizado) y motores que
solo necesitan las constantes del gas (masa molar, Tc, Pc, ω) — agregar un
gas nuevo ahí es agregar un objeto a `OtrosGases/js/biblioteca-gases.js`,
no un módulo. Un gas pasa a tener módulo propio solo si necesita
correlaciones o normativa específicas (como la Z NIST y el factor Hf del
H₂).

## Hosting — GitHub Pages desde `main`

Repo público `cristobal-monzo/calculadora-tecnica-quempin`, GitHub Pages
sirviendo directo desde la rama `main`, carpeta raíz. A diferencia de
`finanzas-quempin`, acá **no** hay una rama huérfana `gh-pages`: no existe
un export de datos sensibles que mantener fuera del sitio público (los
"datos" de este repo son constantes de ingeniería — masa molar, tablas de
tubería, correlaciones de compresibilidad — no información financiera ni de
clientes). El repo completo es el sitio; publicar es `git push` a `main`.

Sin gate de contraseña — es una herramienta de referencia de ingeniería,
menos sensible que los dashboards financieros que sí lo justifican.

### Caché del navegador y el `?v=` del módulo de entrada (2026-09-08)

GitHub Pages sirve los `.js` con `Cache-Control: max-age=600` y **no se
puede cambiar esa cabecera** desde el repo. Consecuencia real (nos costó
una sesión entera de depuración): después de publicar un arreglo, el
usuario seguía viendo el bug porque su navegador ejecutaba el `ui.js`
viejo — y una pestaña abierta desde antes del arreglo nunca vuelve a
pedir el archivo, así que se queda con el código viejo indefinidamente.

Por eso el `index.html` de cada módulo **no** carga `js/ui.js` con
`<script type="module" src>`, sino con un import dinámico con timestamp:

```html
<script type="module">
  import(`./js/ui.js?v=${Date.now()}`);
</script>
```

Así el módulo de entrada se trae fresco en cada carga de página. Cuesta
una request sin caché de un archivo chico — irrelevante para una
herramienta interna, y a cambio ningún arreglo queda escondido tras la
caché.

**Limitación conocida, a propósito**: el `?v=` NO se propaga a los
módulos que `ui.js` importa (`calc-*.js`, `physics.js`, `gas-*.js`,
`storage.js`, `unidades-presion.js`) — esos siguen sujetos al `max-age`
de 10 minutos. Se aceptó así porque la lógica de UI (donde aparecen los
bugs que solo se ven en el navegador) vive toda en `ui.js`; los motores
de cálculo cambian poco y están cubiertos por los tests de regresión. Si
alguna vez hay que forzar un motor, esperar 10 minutos o pedirle al
usuario un recargado forzado (Ctrl+Shift+R).

**Al depurar un "no se arregló"**: antes de tocar código, confirmar qué
código está corriendo realmente. Dos trampas ya vividas en este repo —
(1) servidores `python -m http.server` viejos quedados de sesiones
anteriores sirviendo una copia obsoleta del repo (llegó a haber 3
escuchando el mismo puerto a la vez, con snapshots de días distintos), y
(2) la caché del navegador de arriba. Verificar con
`curl -s <url>/js/ui.js | grep <función nueva>` y con `netstat -ano |
grep <puerto>` que haya un solo servidor.

## Herramientas dinámicas y datos

No aplica el mandato de "export estático saneado desde un Excel/JSON
gitignored" de `finanzas-quempin`: acá no hay datos financieros que sanear,
las tablas de propiedades de gases y tuberías se versionan directamente
como código (`js/gas-<gas>.js` en cada módulo). Sí aplica el mismo espíritu
de rigor con los datos: toda fórmula y constante debe citar su celda de
origen en el Excel fuente y estar cubierta por un test de regresión que
compare contra el valor cacheado del Excel (ver `<Gas>/CLAUDE.md` de cada
módulo para el comando exacto). `OtrosGases/` no tiene Excel fuente: ahí
cada constante cita su fuente publicada (NIST WebBook, 49 CFR, ASME) y los
tests comparan contra datos de referencia del NIST, con la tolerancia que
corresponde a la exactitud real de la correlación (ver su `CLAUDE.md`).

## CI

Sin pipeline de CI todavía (el repo es nuevo). Antes de publicar cualquier
cambio a un motor de cálculo, correr manualmente los tests de regresión del
módulo afectado (ver su `CLAUDE.md`) — son scripts Node planos, sin
dependencias, pensados para poder automatizarse en GitHub Actions más
adelante sin cambios.
