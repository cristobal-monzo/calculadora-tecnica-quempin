# CLAUDE.md — Calculadora Técnica QUEMPIN (maestro)

Sitio estático de cálculos de ingeniería de gases. Módulos: `Hidrogeno/`, `GasNatural-GLP/`, `OtrosGases/` (CO₂, NH₃ o cualquier
gas por sus constantes críticas) y una calculadora rápida transversal, `DiametroTuberia/`. Cada uno tiene su `CLAUDE.md` con las
reglas y sus fórmulas en `docs/`. Diseño original: `docs/superpowers/specs/`.

Repo independiente de `finanzas-quempin` y de otro dominio: no compartas convenciones por inercia.

## Marca

Fuente de verdad: `assets/OFICIAL MANUAL DE MARCA GRÁFICA QUEMPIN.pdf` y `assets/LOGO QUEMPIN.PNG`. El sistema ya extraído (Lato
embebida, paleta, tema claro/oscuro) está en `assets/brand.css`, que enlaza cada página: copia de ahí, no reextraigas el PDF. Nunca
inventes paleta, tipografía ni variante de logo; un caso no cubierto se extrapola de forma conservadora y se anota en el `CLAUDE.md`
del módulo.

## Estructura

```
├── index.html             # hub: una tarjeta por gas o familia
├── assets/                # brand.css, gases.js, gas-switcher.js, logos y manual
├── <Gas>/                 # CLAUDE.md, docs/, index.html, css/styles.css, js/, tests/
└── DiametroTuberia/       # misma estructura; importa motores de los módulos
```

Cada módulo es autocontenido (su motor y su UI), salvo lo que se comparte desde `assets/`: la marca y el registro único de módulos
(`assets/gases.js`) con el selector «Cambiar de calculadora» (`assets/gas-switcher.js`).

- **Módulo nuevo**: agrégalo a `GASES` en `assets/gases.js`, una sola vez, con su lista `herramientas` (`id` = `data-tab` de cada
  pestaña; el hub enlaza `<ruta>#<id>`). En su `index.html`, `<select id="selector-gas">` en la cabecera y `initSelectorGas({
  actualId: '<id>', profundidad: 1 })` en su `ui.js`, más `initTabs()`, que activa la pestaña desde el hash (referencia:
  `Hidrogeno/js/ui.js`).
- **Calculadora rápida** (una pantalla que atraviesa gases): va en `CALCULADORAS_RAPIDAS` de `assets/gases.js`. Es la **única
  excepción**: **importa** los motores de los módulos para heredar cada corrección de física. Al tocar `calc-red-gas.js`,
  `pipe-network.js`, `calc-flujo.js` o `gas-h2.js`, corre también `node DiametroTuberia/tests/run-all.js`.
- **Un gas nuevo** es un objeto en `OtrosGases/js/biblioteca-gases.js`. Solo tiene módulo propio si necesita correlaciones o
  normativa específicas (la Z NIST y el Hf del H₂). GN y GLP comparten sitio porque comparten normativa (D.S. 66).

## Patrón de UI: copiado, no importado

Los tres módulos comparten la misma estructura en cada `css/styles.css`: **al tocar una, mantenlas iguales**. Barra de pestañas fija
(`.barra-pestanas`), `.calc-layout` = `.calc-entradas` | `.calc-resultados`, resultados con `grupo()` en `ui.js` (un grupo `kpis`
arriba y grupos con subtítulo), tokens `--estado-ok/alerta/critico` con variante en oscuro y `aria-invalid` en cajetines con texto no
numérico.

**Teléfono**: el bloque CSS «Uso desde el teléfono» y `centrarPestana()` e `initResumenMovil()` son idénticos en los tres. Bajo
960 px, barra de KPI fija al pie (lee el grupo `kpis`: un resultado que deba verse ahí va en ese grupo); cajetines de 16 px (Safari de
iPhone hace zoom con menos); áreas táctiles de 44 px; Memoria en tarjetas bajo 720 px (`data-label` en cada `<td>`). Revisa cada
pantalla a 320 y 375 px además de escritorio.

## Hosting: GitHub Pages desde `main`

Repo público `cristobal-monzo/calculadora-tecnica-quempin`. **El repo completo es el sitio y publicar es `git push` a `main`.** Sin
`gh-pages` ni contraseña: sus datos son constantes de ingeniería.

**Caché**: Pages sirve los `.js` con `max-age=600` y no se puede cambiar. Por eso cada `index.html` carga `ui.js` con un import
dinámico: `` import(`./js/ui.js?v=${Date.now()}`) ``. El `?v=` **no se propaga** a lo que `ui.js` importa (`calc-*.js`, `physics.js`,
`gas-*.js`, `storage.js`, `unidades-presion.js`): para forzar un motor, espera 10 minutos o recarga con Ctrl+Shift+R.

**Ante un «no se arregló», confirma primero qué código corre**: ya hubo servidores `python -m http.server` viejos (hasta 3 en el mismo
puerto, con copias de días distintos) y caché del navegador. `curl -s <url>/js/ui.js | grep <función nueva>` y `netstat -ano | grep
<puerto>`.

## Datos y pruebas

Las tablas de gases y tuberías se versionan como código (`js/gas-<gas>.js`). **Toda fórmula y constante cita su celda de origen en el
Excel fuente** y tiene una prueba de regresión contra el valor cacheado; `OtrosGases/`, sin Excel, cita su fuente publicada (NIST WebBook,
49 CFR, ASME) y compara contra NIST. Sin CI: antes de publicar un cambio de motor, corre a mano `node <Modulo>/tests/run-all.js`.
