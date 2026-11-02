# CLAUDE.md — Calculadora de Otros Gases

Ver primero el maestro: [`../CLAUDE.md`](../CLAUDE.md) (marca, hosting, estructura del repo, patrón de UI).

| Si vas a tocar… | Lee antes |
|---|---|
| Constantes, Peng-Robinson, Lee-Kesler, fases, exactitud contra NIST | [docs/modelo.md](docs/modelo.md) |
| El teléfono o la Memoria de Cálculo y su informe | [docs/memoria.md](docs/memoria.md) |

## Origen y alcance (2026-09-25, a pedido del usuario)

Pedido: "una nueva pestaña para otros gases, en la que se ingresen algunos
parámetros propios del gas y así poder realizar los cálculos — CO₂ y NH₃
por ahora, pero con flexibilidad". **No hay Excel fuente** (a diferencia de
Hidrógeno y GN/GLP): las fórmulas son de literatura publicada y las
constantes vienen del NIST, citadas en el código.

La flexibilidad está en que **todo se calcula desde las constantes del
gas**: masa molar, temperatura y presión críticas, factor acéntrico ω (para
compresibilidad y condensación), viscosidad y γ (para flujo), y
opcionalmente PCI y grado de llenado. Hay gases predefinidos de solo
lectura y **un** gas personalizado editable (se guarda en `localStorage`).

## Las 4 pestañas

| Pestaña | Motor | Qué calcula |
|---|---|---|
| Propiedades del gas | `js/termo.js` | Densidad normal, curva de presión de vapor, propiedades derivadas, notas de seguridad |
| Tubería y Flujo | `js/calc-flujo.js` | Fase, Barlow, caudales, velocidad vs. erosional, Darcy-Weisbach, screening sónico |
| Almacenamiento | `js/calc-almacenamiento.js` | Masa y autonomía, en modo **licuado** o **comprimido** |
| Memoria de Cálculo | `js/calc-memoria.js` (sobre `calc-flujo.js`) | Red ramificada de tramos + informe A4 imprimible (ver sección propia) |

El gas activo se elige en la barra de pestañas (`#gas-activo`) y afecta a
las cuatro — mismo criterio que el selector GLP/GN de `GasNatural-GLP`, pero
como `<select>` (la lista crece) en vez de control segmentado.

## Archivos del motor

- `js/biblioteca-gases.js` — `GASES_PREDEFINIDOS` (CO₂, NH₃), el shape de
  un gas, `validarGas()`, `copiaPersonalizada()`. **Agregar un gas = agregar
  un objeto acá**, con la fuente de cada constante en un comentario; la UI y
  los motores no cambian. `tests/biblioteca-gases.test.js` valida que todo
  predefinido pase `validarGas()`.
- `js/termo.js` — Peng-Robinson completo, Lee-Kesler, estado de fase.
- `js/physics.js` — funciones gas-agnósticas **copiadas** (no importadas) de
  `Hidrogeno/js/physics.js`, con dos cambios deliberados (ver abajo).
- `js/tuberias.js` — tabla ASME B36.10M Sch 40/80.
- `js/caudal.js` — kg/h ↔ Nm³/h ↔ kW.
- `js/calc-memoria.js` — red de tramos de la Memoria de Cálculo: cada tramo
  se resuelve con `calcularFlujo()` y se acumula la pérdida por la cadena de
  "Continúa desde" (ver "Memoria de Cálculo" abajo).
- `js/unidades-presion.js`, `js/storage.js` — copias de Hidrógeno
  (`storage.js` con prefijo propio `quempin-otros-gases::`; desde el
  2026-09-28 también `exportarJSON`/`importarJSON`, para el proyecto de la
  Memoria).

## Verificar cambios

```bash
node OtrosGases/tests/run-all.js
```

Sin Excel, los baselines de `calc-flujo.test.js` y
`calc-almacenamiento.test.js` son los del motor el 2026-09-25, **más** una
relación física independiente por bloque (Reynolds a mano, conservación de
masa, ΔP de accesorios = ΣK·ρv²/2, masa licuada = V × llenado) para que el
baseline no sea circular. Un cambio intencional de fórmula: actualizar el
baseline y documentarlo en `docs/modelo.md`.

Verificado en navegador 2026-09-25 (escritorio 1360 px y móvil 390 px,
claro y oscuro): CO₂ a 60 barG marca líquido; NH₃ en kW; kg/h → kW
convierte el número (50 kg/h de NH₃ → 258,3 kW) y al pasar a CO₂ (sin PCI)
kW se deshabilita y vuelve a kg/h; gas personalizado tipeado carácter a
carácter con coma decimal sin perder foco, con errores listados mientras
está incompleto.

## Fuera de alcance (v1)

- Pérdidas locales por accesorios **por tramo** en la Memoria de Cálculo
  (sí están en "Tubería y Flujo"; `calcularFlujo()` ya las acepta, faltaría
  la columna) — mismo alcance que la Memoria de Hidrógeno.
- Más de un gas personalizado guardado a la vez, y exportar/importar gases
  sueltos (el `.json` de la Memoria sí lleva el gas del proyecto).
- Flujo de **líquido** (CO₂/NH₃ en fase líquida): el módulo solo detecta el
  caso y no calcula.
- Mezclas de gases (se puede ingresar una como gas personalizado con
  pseudo-constantes críticas, bajo responsabilidad del usuario).
- Viscosidad dependiente de P y T.
