# CLAUDE.md — Calculadora Técnica QUEMPIN (maestro)

Dashboard estático de calculadoras de ingeniería de gases (dimensionamiento
de tuberías, volúmenes y presiones de almacenamiento, entre otros). Se
parte con hidrógeno; otros gases (Gas Natural, GLP) se agregan en ciclos de
diseño futuros. Diseño completo y decisiones registradas en
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
UI) salvo el sistema de marca, que siempre se comparte vía
`assets/brand.css`. La decisión de "un sitio por gas vs. un selector
compartido entre gases" se toma módulo por módulo — Hidrógeno tiene su
propio sitio; Gas Natural y GLP (cuando se construyan) compartirán uno con
selector interno, porque son más similares entre sí en normativa aplicable
(D.S. 66) que con hidrógeno (ASME B31.12 / NFPA 2).

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

## Herramientas dinámicas y datos

No aplica el mandato de "export estático saneado desde un Excel/JSON
gitignored" de `finanzas-quempin`: acá no hay datos financieros que sanear,
las tablas de propiedades de gases y tuberías se versionan directamente
como código (`js/gas-<gas>.js` en cada módulo). Sí aplica el mismo espíritu
de rigor con los datos: toda fórmula y constante debe citar su celda de
origen en el Excel fuente y estar cubierta por un test de regresión que
compare contra el valor cacheado del Excel (ver `<Gas>/CLAUDE.md` de cada
módulo para el comando exacto).

## CI

Sin pipeline de CI todavía (el repo es nuevo). Antes de publicar cualquier
cambio a un motor de cálculo, correr manualmente los tests de regresión del
módulo afectado (ver su `CLAUDE.md`) — son scripts Node planos, sin
dependencias, pensados para poder automatizarse en GitHub Actions más
adelante sin cambios.
