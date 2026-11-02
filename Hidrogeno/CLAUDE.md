# CLAUDE.md — Calculadora de Hidrógeno

Ver primero el maestro: [`../CLAUDE.md`](../CLAUDE.md) (marca, hosting, estructura del repo).

| Si vas a tocar… | Lee antes |
|---|---|
| Una fórmula o constante: rugosidad, Haaland, Z (NIST), ASME B31.12 (Hf, F, T, E), velocidad, flujo sónico, reseteo de pérdida | [docs/formulas.md](docs/formulas.md), con cada discrepancia del Excel y su porqué |
| La pantalla: unidades, diámetro manual, decimales, formato, pestañas, teléfono, diagrama unifilar | [docs/interfaz.md](docs/interfaz.md) |
| El informe de Memoria de Cálculo: membrete, firma, una sola hoja, criterios | [docs/informe.md](docs/informe.md) |

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
de tubería, correlación de compresibilidad Z —fuente única, ecuación de
NIST, ver más abajo—, Tabla Hf de ASME B31.12).

## Reglas que se rompen sin que se note

- **Unidades de presión**: cada campo tiene su selector, no hay uno global. En la Memoria, la unidad es por columna y el dato
  canónico de `tramos` sigue siempre en MPa; cambiar la unidad solo redibuja. `js/unidades-presion.js` es una copia funcional de
  la de `GasNatural-GLP`, sin dependencia cruzada.
- **Decimales**: los campos manuales son `type="text" inputmode="decimal"`, no `type="number"`, para aceptar coma o punto.
- **Lo mostrado no es lo calculado**: los tiles pasan por `formatearNumero()` (`es-CL`, hasta 2 decimales); el cálculo sigue con
  precisión completa.
- **No reescribas el `innerHTML` de la tabla de tramos ni de artefactos en cada tecla**: cada tecla dejaba el campo sin foco.
- **Ids de tramo y artefacto**: los contadores parten del mayor id existente, no de la cantidad, o se repiten tras borrar y recargar.
- **El informe siempre entra en una sola hoja A4**, también medido desde el ancho de un teléfono.
- **`reseteaAcumulada`** no viene del Excel: modela un regulador, y reinicia la pérdida acumulada de ese tramo.
- **`TABLA_TUBERIA` no se amplió**: no se pudo confirmar contra ninguna norma qué serie es. Por eso existe el diámetro manual.
- **El rojo de estado crítico** (`#c62828`) es una extrapolación: el manual de marca no define un rojo.
- El screening sónico complementa, no sustituye, el chequeo de velocidad erosional de API RP 14E.

## Verificar cambios a una fórmula

Cualquier cambio a `physics.js`, `gas-h2.js`, `calc-flujo.js`,
`calc-almacenamiento.js` o `calc-memoria.js` debe seguir pasando la
regresión completa contra los valores cacheados del Excel:

```bash
node Hidrogeno/tests/run-all.js
```

Si el cambio es intencional (corrige algo del Excel fuente), actualizar el
fixture correspondiente en el `.test.js` del módulo y **documentarlo en
`docs/formulas.md`**, en la sección de discrepancias — no solo en el mensaje del commit.

## Fuera de alcance (v1)

- Gas Natural / GLP — sitio separado con selector de gas, otro ciclo de
  diseño (ver `../CLAUDE.md`).
- Pérdidas locales por accesorios (codos/tees/válvulas) por tramo en la
  Memoria de Cálculo — si existe en "Tubería y Flujo" (`Cálculo!I6:K6`),
  no en la red ramificada, porque la hoja `MC` tampoco las lista por tramo.
- Derivar el factor de diseño F automáticamente a partir de datos del
  proyecto — sigue siendo una elección manual del usuario (ahora un
  selector de Clase de Ubicación anclado a la Tabla PL-3.7.1(b)(6)-1, ver
  arriba, en vez de un número libre) — a diferencia de Hf (Tabla IX-5A) y T
  (Tabla PL-3.7.1(b)(8)), que sí se derivan automáticamente desde
  2026-09-02, ver arriba.
- Chequeo de velocidad de erosión por tramo en la Memoria de Cálculo (sí
  existe en "Tubería y Flujo").
- Autenticación / gate de acceso.
