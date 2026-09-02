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
de tubería, correlación de compresibilidad Z, Tabla Hf de ASME B31.12).

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

## Discrepancias del Excel fuente (decisiones tomadas, no bugs silenciados)

**Corregidas en la app (2026-09-02, a pedido del usuario)** — auditoría
física del motor de "Tubería y Flujo" / "Memoria de Cálculo" contra fuentes
externas (ecuación de Haaland publicada, ASME B31.12). Tres correcciones,
todas en `js/physics.js` / `js/gas-h2.js`, verificadas con la regresión
completa (`node Hidrogeno/tests/run-all.js`):

- **Rugosidad relativa (`rugosidadRelativa`, `Cálculo!C31`) tenía un error
  de unidades ×1000.** El Excel dividía la rugosidad de la tabla de tubería
  (en milímetros) por el diámetro ya convertido a **metros**, sin
  reconvertir — para la tubería de ½" (rugosidad 0.002 mm, DI 12.7 mm) daba
  ε/D=0.157, que implicaría una rugosidad del 16% del diámetro (físicamente
  imposible para tubería estirada; el valor correcto con unidades
  consistentes es ε/D≈0.000157). Corregido reconvirtiendo el diámetro a mm
  antes de dividir.
- **Ecuación de Haaland (`factorFriccionHaaland`, `Cálculo!C32`) sumaba un
  término fuera del logaritmo.** La ecuación de Haaland (1983) publicada es
  `1/√f = -1.8·log10[(ε/D/3.7)^1.11 + 6.9/Re]` — ambos términos dentro de
  un mismo `log10`. El Excel sumaba `6.9/Re` fuera. Corregido.
- **Impacto combinado de las dos correcciones anteriores**: para el caso
  por defecto de "Tubería y Flujo" (60 kW, tubería ½", 20 m, sin
  accesorios), la pérdida de carga pasó de 109.75 mbar (con los dos
  errores) a 31.17 mbar (contrastado independientemente con la
  aproximación de Blasius, f=0.316/Re^0.25, que da 0.0376 — coincide con el
  0.0378 de Haaland ya corregido). Antes de esta corrección la app
  sobrestimaba la caída de presión calculada en ~3.5x.
- **Factor Hf de ASME B31.12 (Tabla IX-5A, derating por fragilización de
  hidrógeno) faltaba por completo en la fórmula de Barlow
  (`presionMaximaDiseno`, `Cálculo!C10`).** El Excel solo aplicaba F
  (factor de diseño) y E (factor de unión); la fórmula real de ASME B31.12
  es `P = 2·S·t·F·E·Hf·T/D`. Con la tabla oficial de la norma (Tabla IX-5A,
  provista por el usuario — ver sección siguiente), se agregó `factorHf`
  como parámetro de `presionMaximaDiseno` (por defecto 1, retrocompatible)
  y `calc-flujo.js` lo resuelve por iteración con relajación: Hf depende de
  la presión de diseño del sistema, que es justamente lo que la fórmula
  calcula. Para el caso por defecto de la app (F=0.4, tubería ½") la
  presión de diseño cae en la zona plana de la tabla (Hf=1 hasta 2000
  psig), así que el resultado numérico no cambia — pero para diseños con F
  más alto o tuberías de mayor diámetro/espesor que superen esa presión,
  Hf reduce la presión máxima admisible, como corresponde a la norma.

**Corregida en la app (2026-09-01)** — `js/calc-almacenamiento.js`, "Densidad real": el
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

## Tabla Hf de ASME B31.12 (`TABLA_HF_ASME_B31_12` en `gas-h2.js`)

Puerto original de `Cálculo!A55:I59` (renombrada `TABLA_REFERENCIA_ASME_B31_12`
→ `TABLA_HF_ASME_B31_12` el 2026-09-02). El Excel fuente rotulaba las 7
columnas como presión en bar (69–483, equivalente a 1000–7000 psi en pasos
redondos de 1000 psi) y las trataba como una tabla de consulta libre — el
usuario elegía F (`Cálculo!C28`) a mano mirándola, sin relación clara con
la norma. Confirmado el 2026-09-02 (tabla oficial de ASME B31.12, Tabla
IX-5A "Carbon Steel Pipeline Materials Performance Factor, Hf", provista
por Cristóbal) que es exactamente esa tabla — **pero con las columnas mal
etiquetadas**: la Tabla IX-5A real llega solo hasta 3000 psig, en pasos de
200 psi por encima de 2000 (1000, 2000, 2200, 2400, 2600, 2800, 3000). Los
factores de cada fila no cambiaron — coincidían exactamente con la tabla
real (los límites de fluencia de las filas, convertidos de ksi a MPa,
también calzan exacto: 52/60/70/80 ksi). Ahora `factorHf()` la usa
directamente (fila por límite de fluencia mínimo especificado, nota (b) de
la tabla; interpolación lineal en presión, nota (c)) — ver la corrección de
Barlow arriba y `factorHf` / `presionMaximaConHf` en `calc-flujo.js`.

La tabla solo cubre acero al carbono ("Carbon Steel Pipeline Materials") —
la Tabla TABLA_TUBERIA de este módulo no registra el material de cada
tramo, así que `factorHf` selecciona la fila únicamente por límite elástico
(MPa); si en una revisión futura se agregan materiales de otra familia
(p.ej. acero inoxidable, con sus propias Tablas IX-5B/IX-5C de la norma),
habrá que extender la selección de fila con el material, no solo el
límite elástico.

## Fuera de alcance (v1)

- Gas Natural / GLP — sitio separado con selector de gas, otro ciclo de
  diseño (ver `../CLAUDE.md`).
- Pérdidas locales por accesorios (codos/tees/válvulas) por tramo en la
  Memoria de Cálculo — si existe en "Tubería y Flujo" (`Cálculo!I6:K6`),
  no en la red ramificada, porque la hoja `MC` tampoco las lista por tramo.
- Derivar el factor de diseño F automáticamente (sigue siendo un input
  manual, igual que el Excel) — a diferencia de Hf (Tabla IX-5A), que sí se
  deriva automáticamente desde 2026-09-02, ver arriba.
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
