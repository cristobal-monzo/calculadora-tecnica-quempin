# CLAUDE.md — Calculadora de Gas Natural / GLP (contenido)

Ver primero el maestro: [`../CLAUDE.md`](../CLAUDE.md). Este archivo cubre
lo específico de este módulo: de dónde salen las fórmulas, qué se
reconstruyó a partir de hojas incompletas, y qué falta.

## Fuentes

- `Libro11111111.xlsx`, hoja `Bases de Cálculo` — red de gas (tubería) y
  cilindros GLP. Soporta GLP/GN/H2 vía selector, con Z real
  (Peng-Robinson) por gas.
- `MASTER DISEÑO.xlsm` — hojas `Estanque GLP`, `Combustión Gas`,
  `Diseño Quemador Atmosférico`, `Quem. Atm.`.

Ambos archivos analizados celda por celda el 2026-09-01. **Gitignored**:
tienen fórmulas propietarias y (`MASTER DISEÑO.xlsm`) una hoja
`Proveedores` con precios reales de proveedores — nunca se versionan ni se
publican. Diseño completo en
[`../docs/superpowers/specs/2026-09-01-calculadora-tecnica-glp-gn-design.md`](../docs/superpowers/specs/2026-09-01-calculadora-tecnica-glp-gn-design.md).

## Las 4 pestañas y su hoja de origen

| Pestaña | Hoja Excel | Motor |
|---|---|---|
| Red de Gas | `Bases de Cálculo` (izquierda) | `js/pipe-network.js` + `js/calc-red-gas.js` |
| Almacenamiento (solo GLP) | `Bases de Cálculo` (cilindros) + `Estanque GLP` | `js/calc-almacenamiento-glp.js` |
| Combustión | `Combustión Gas` (columnas GLP/GN) | `js/combustion.js` + `js/calc-combustion.js` |
| Quemador Atmosférico | `Quem. Atm.` + `Diseño Quemador Atmosférico` | `js/calc-quemador.js` |

Propiedades de gas: `js/gas-glp.js`, `js/gas-gn.js` (composición → PM, R,
densidad, fracciones de carbono/hidrógeno para combustión).

## Unidades de presión (2026-09-02, a pedido del usuario)

Los 3 campos de ingreso manual de presión (`rg-presion-inicial` en Red de
Gas, `cb-presion-ref` en Combustión, `qm-presion-gas` en Quemador) y los 3
tiles de resultado en presión de Red de Gas (`Pérdida de presión
requerida`, `Pérdida de presión admisible`, `Presión final`) tienen **cada
uno su propio selector de unidad** (Pa/kPa/mbar/bar/psi) — no hay un
selector global. El selector "Régimen de presión" también tiene el suyo,
puramente para mostrar el umbral de 10 kPa en la unidad elegida (el
`value` interno `<10 kPa`/`>10 kPa` que usa `calc-red-gas.js` no cambia).

- `js/unidades-presion.js` — conversión pura (`aPa`/`desdePa`), sin tocar
  ningún motor de cálculo. Los motores (`calc-red-gas.js`,
  `calc-combustion.js`, `calc-quemador.js`) siguen esperando exactamente la
  misma unidad interna de siempre (Pa/kPa/mbar respectivamente); `ui.js` es
  la única capa que convierte, tanto al leer el formulario
  (`leerPresion(inputId, selectId, unidadDestino)`) como al mostrar
  resultados.
- Cambiar la unidad de un campo de ingreso **convierte el número mostrado**
  para conservar la presión física (1000 Pa → 10 mbar), no resetea el
  valor. Cambiar la unidad de un tile de resultado solo redibuja ese tile
  desde el valor en Pa ya calculado — no dispara un recálculo.
- Cada selector de unidad se guarda junto con el resto del formulario en
  localStorage (se agregó a los `querySelectorAll('input, select')` de
  guardado/restauración de Combustión y Quemador, que antes solo incluían
  `input` porque esos formularios no tenían ningún `<select>` propio).

## Decisiones de reconciliación (no son bugs silenciados)

**Red de Gas — Goal Seek manual reemplazado por álgebra**: en el Excel,
la pérdida de presión (`Bases de Cálculo!B22`) es un valor pegado a mano
que el usuario ajustaba con Buscar Objetivo hasta que la potencia
resultante coincidiera con la potencia objetivo. Las dos fórmulas de
caudal (Renouard, baja y media/alta presión) son ambas invertibles en
`ΔP` sin iteración — la app resuelve `ΔP` directamente a partir de la
potencia objetivo. Ver el spec de diseño para el detalle algebraico.

**Quemador Atmosférico — síntesis de dos hojas borrador**: ninguna de las
dos hojas fuente (`Quem. Atm.`, `Diseño Quemador Atmosférico`) tiene la
cadena completa (inyector → aireación primaria → verificación de largo de
llama → garganta Venturi → tubo de mezclado) para los dos gases a la vez.
El motor usa el inyector/aireación/llama de `Quem. Atm.` (completo y
simétrico para GN y GLP) y la garganta Venturi/tubo de mezclado de
`Diseño Quemador Atmosférico` (con valores para ambos gases, aunque no
encadenados al mismo caso).

**Probable error de fórmula, no replicado**: `Diseño Quemador
Atmosférico!D38` (columna GN) calcula la "Relación área garganta/
perforaciones" como `(Dt/(Dh·N))²`, mientras que `H38` (columna GLP)
usa `(Dt/Dh)²/N` — solo esta última da dimensionalmente una razón de
áreas correcta (área garganta / área total de perforaciones). El motor
usa la fórmula de `H38` para ambos gases. Sigue siendo un buen candidato
para confirmar con Cristóbal (es la única corrección de esta lista que no
se pudo verificar contra un valor recalculado a mano de forma
independiente, solo por argumento dimensional), pero ya es el
comportamiento del código, no algo pendiente.

## Correcciones aplicadas (2026-09-01, a pedido del usuario)

Estas cuatro eran inconsistencias del Excel fuente identificadas en el
análisis inicial. Se corrigieron explícitamente después de que el usuario
pidiera revisarlas — antes de esto quedaban solo documentadas, sin tocar
el comportamiento:

- **GN: carbono/hidrógeno ya no mezcla fracción molar con fracción de
  masa.** `Combustión Gas!F36` (X carbono de GN) ponderaba el término de
  carbono con fracciones de MASA pero el de hidrógeno con PORCENTAJES
  MOLARES de entrada — no correspondía a ninguna magnitud física
  coherente. `js/gas-gn.js` ahora pondera los dos términos con fracción de
  masa, igual que oxígeno y nitrógeno. Cambia `xCarbono` de 0.7039→0.7058
  y `xHidrogeno` de 0.2287→0.2267 (composición por defecto), y con eso
  `aireEsteq` y todo lo que depende de él en Combustión y en Quemador
  Atmosférico para GN (ver los comentarios en `calc-combustion.js` y en
  los tests, que documentan cada valor recalculado).
- **Tabla de consumo de artefactos GLP**: Cocina/Bajo a 10°C tenía
  `Bases de Cálculo!K33=35` kWh/día, un valor muchísimo más alto que el
  resto de la fila (3.5–5.8) y que el patrón de las filas Medio/Alto de la
  misma tabla — corregido a `3.5` en `js/calc-almacenamiento-glp.js`
  (probable error de tipeo del "." en el Excel original).
- **"Caudal total" en Combustión ya no depende de qué gas elegiste.** El
  Excel sumaba el aire con el caudal de combustible en condición normal
  para GLP (`J10=J9+J6`) pero en condición de referencia para GN
  (`N9=N8+N6`), sin ninguna razón física para que difiriera según el gas.
  En vez de elegir una de las dos arbitrariamente, `calc-combustion.js`
  ahora calcula y expone **las dos** (`caudalTotalNormalNm3H`,
  `caudalTotalReferenciaM3H`) para los dos gases — la UI muestra ambas.
- **PCI de GN en "Combustión" y "Quemador Atmosférico" ahora es un campo
  editable, como en GLP.** El Excel calculaba el flujo de GN siempre desde
  el PCI derivado de la composición (`Combustión Gas!N4=N2/$F$45`), sin
  mostrarlo ni dejarlo tocar — mientras que GLP sí tenía un input propio
  (`J4=48029`). `calcularCombustionGN` y la UI de Quemador ahora reciben
  `pciKjKg` como parámetro real para los dos gases; se sigue
  precompletando con el valor derivado de la composición al cambiar de
  gas, pero el usuario puede editarlo igual que en GLP.

## Discrepancias del Excel fuente que se dejaron como estaban

No todo lo que se ve distinto entre GLP y GN es un error — estas dos
quedaron así a propósito, porque no hay manera de saber cuál (si alguna)
está "mal" sin más contexto del Excel original:

- **Dos "densidades relativas" distintas para el mismo gas**:
  `Bases de Cálculo!B18` usa GLP=2 / GN=0.59 en la fórmula de caudal de
  baja presión, mientras que la tabla `Combustión Gas!I44:K47` usa
  GLP=1.81 / GN=0.62 para el factor Cr de la rama de alta presión. Son dos
  fórmulas empíricas distintas (Renouard baja presión vs. el factor Cr de
  la rama de alta presión) que bien pueden tener cada una su propia
  referencia de densidad por convención — no hay indicio de que una esté
  mal y la otra bien. Se preservan ambas, cada una en su fórmula original
  (`js/calc-red-gas.js`, `PROPIEDADES_RED_GAS.{densidadRelativaBaja,
  densidadRelativaAlta}`).
- **Estanque GLP**: la fórmula de capacidad de vaporización
  (`Estanque GLP!B7`) usa las constantes `5` y `26` literales (sin celda
  de temperatura editable en esa hoja) — se preservan como constantes fijas
  en `calcularEstanqueGLP`, no se inventó un input de temperatura que el
  Excel fuente no tiene.

## Fuera de alcance v1

- **Chimenea (tiro)** — la hoja `Chimenea Simple` tiene solo encabezados
  de coeficientes (norma tipo EN 13384), sin ningún caso resuelto.
- **Proveedores** — precios de materiales, información comercial privada.
- **H2 y Pellet dentro de "Combustión"** — H2 ya tiene su propio sitio
  (`../Hidrogeno/`); Pellet no es un gas. Las columnas de Pellet además
  tienen fórmulas `#REF!` rotas en el Excel fuente.
- **Entalpía de gases de combustión / "calor disponible"** — completa
  para GLP y H2 en el Excel, pero no existe para GN (columnas vacías,
  verificado). Se excluyó para no dejar la pestaña con un output que
  funciona para un gas y no para el otro.

## Verificar cambios a una fórmula

```bash
node GasNatural-GLP/tests/run-all.js
```

La rama de Red de Gas para GLP/GN no tiene caso cacheado en el Excel
(`Bases de Cálculo!B5` es un selector, el archivo quedó guardado en modo
H2) — sus tests verifican autoconsistencia algebraica (invertir el caudal
calculado debe devolver el `ΔP` de entrada) más el caso H2 sí cacheado
(misma fórmula, gas-agnóstica). El resto de los motores (cilindros,
estanque, combustión GLP/GN, quemador GLP/GN) sí tienen valores cacheados
reales del Excel como fixtures, independientes del selector de gas.
