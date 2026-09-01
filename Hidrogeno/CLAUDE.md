# CLAUDE.md — Calculadora de Hidrógeno (contenido)

Ver primero el maestro: [`../CLAUDE.md`](../CLAUDE.md) (marca, hosting,
estructura del repo). Este archivo cubre lo específico del módulo de
hidrógeno: de dónde salen las fórmulas, qué se cambió a propósito respecto
al Excel fuente, y qué falta.

## Fuente

`Calculos H2.xlsx` (Cristóbal Monzó, instalador de gas clase 1 y 5),
analizado celda por celda el 2026-09-01 — hojas `Cálculo`, `Sheet3`, `MC`,
`Antecedentes`. Diseño completo en
[`../docs/superpowers/specs/2026-09-01-calculadora-tecnica-hidrogeno-design.md`](../docs/superpowers/specs/2026-09-01-calculadora-tecnica-hidrogeno-design.md).

## Las 3 pestañas y su hoja de origen

| Pestaña | Hoja Excel | Motor |
|---|---|---|
| Tubería y Flujo | `Cálculo` | `js/calc-flujo.js` |
| Almacenamiento | `Sheet3` | `js/calc-almacenamiento.js` |
| Memoria de Cálculo | `MC` (reimplementada como red de fórmulas vivas — en el Excel es una tabla de valores pegados a mano) | `js/calc-memoria.js` |

Compartido entre las tres: `js/physics.js` (funciones puras de mecánica de
fluidos, gas-agnósticas) y `js/gas-h2.js` (constantes de hidrógeno, tabla
de tubería, correlación de compresibilidad Z, tabla de referencia ASME
B31.12).

## Discrepancias del Excel fuente (decisiones tomadas, no bugs silenciados)

**Corregida en la app** — `js/calc-almacenamiento.js`, "Densidad real": el
Excel tiene `Sheet3!H7 = Cálculo!C20`, es decir, la hoja de almacenamiento
muestra la densidad calculada con la presión/temperatura de la hoja de
**tubería** (~0.8 bar), no con las de **este** estanque (~200 bar). En el
Excel probablemente pasó inadvertido porque las hojas rara vez se miran
juntas; en la app, con las tres pestañas editables en la misma sesión,
mostrar la densidad de otra pestaña sería un bug visible. Se calcula con la
presión/temperatura propias de Almacenamiento (verificado en navegador:
subir la presión de almacenamiento cambia la densidad mostrada ahí, no
copia el valor de Tubería y Flujo).

**NO corregidas, solo documentadas** — decisiones numéricas propias de cada
hoja del Excel, no acoples cruzados. Antes de "unificarlas" en una futura
revisión, decidirlo explícitamente con Cristóbal:
- PCI usado en Tubería y Flujo: 120000 kJ/kg (`Cálculo!C21`). PCI usado en
  Almacenamiento: 119960 kJ/kg (`Sheet3!C4`).
- Factor Z por presión mínima en Tubería y Flujo (`Cálculo!C27`):
  `<20→1, <50→1.02, <200→1.1, <300→1.2`. Factor Z en Almacenamiento
  (`Sheet3!C7`): `<50→1.02, <200→1.1, <300→1.2` (sin el tramo `<20→1`).

## Tabla ASME B31.12 (`TABLA_REFERENCIA_ASME_B31_12` en `gas-h2.js`)

Puerto literal de `Cálculo!A55:I59`. El Excel fuente **no** deriva el
factor de diseño F (`Cálculo!C28`, input de "Tubería y Flujo") de esta
tabla automáticamente — el usuario lo elige a mano mirando la tabla. La app
replica ese mismo comportamiento: F sigue siendo un campo editable, la
tabla es solo de consulta. El significado exacto de las 7 columnas
numéricas (`columnasBar`, valores 69–483 en la unidad "BAR" que indica
`Cálculo!J55`) no se pudo confirmar con certeza a partir del Excel solo —
antes de usar esta tabla para una decisión de diseño real, revisar contra
la hoja fuente o la norma ASME B31.12 directamente.

## Fuera de alcance (v1)

- Gas Natural / GLP — sitio separado con selector de gas, otro ciclo de
  diseño (ver `../CLAUDE.md`).
- Pérdidas locales por accesorios (codos/tees/válvulas) por tramo en la
  Memoria de Cálculo — si existe en "Tubería y Flujo" (`Cálculo!I6:K6`),
  no en la red ramificada, porque la hoja `MC` tampoco las lista por tramo.
- Derivar F automáticamente desde la tabla ASME B31.12 (input manual, igual
  que el Excel).
- Chequeo de velocidad de erosión por tramo en la Memoria de Cálculo (sí
  existe en "Tubería y Flujo").
- Autenticación / gate de acceso.

## Verificar cambios a una fórmula

Cualquier cambio a `physics.js`, `gas-h2.js`, `calc-flujo.js`,
`calc-almacenamiento.js` o `calc-memoria.js` debe seguir pasando la
regresión completa contra los valores cacheados del Excel:

```bash
node Hidrogeno/tests/run-all.js
```

Si el cambio es intencional (corrige algo del Excel fuente), actualizar el
fixture correspondiente en el `.test.js` del módulo y **documentarlo acá**,
en la sección de discrepancias — no solo en el mensaje del commit.
