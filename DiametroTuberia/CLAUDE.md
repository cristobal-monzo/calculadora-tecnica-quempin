# CLAUDE.md — Diámetro de Tubería (contenido)

Ver primero el maestro: [`../CLAUDE.md`](../CLAUDE.md) (marca, hosting,
estructura del repo, patrón de UI). Este archivo cubre lo específico de
esta calculadora: qué pregunta, de dónde sale cada número y qué no cubre.

## Origen y alcance (2026-09-28, a pedido del usuario)

Pedido: "utiliza esta misma calculadora para generar otra calculadora que
pregunte: gas utilizado, largo de la tubería, cantidad de codos, y que
entregue el diámetro", desde buenas prácticas UX/UI.

Es una **calculadora rápida de una sola pantalla**, no un módulo por gas:
su primera pregunta es el gas. Por eso vive en `CALCULADORAS_RAPIDAS` de
`assets/gases.js` (no en `GASES`): el hub la muestra en su propia sección
"Cálculo rápido" y el selector de cabecera en el grupo del mismo nombre.

**Se agregó una cuarta pregunta: la potencia [kW].** Sin la carga no hay
diámetro que calcular (el mismo largo y los mismos codos piden ½" para una
cocina y 1¼" para una caldera). Todo lo demás tiene un valor por defecto
razonable y vive en "Supuestos del cálculo", cerrado por defecto.

## No duplica fórmulas: importa los motores de los módulos de gas

Excepción deliberada a "cada módulo es autocontenido" (ver maestro):
`js/calc-diametro.js` **importa** los motores, no los copia. Una copia de
la física se desincronizaría con la primera corrección (las auditorías del
2026-09-25 cambiaron ΔP de media presión 7-23 veces y la velocidad de H₂
1,5 veces); importando, cualquier corrección se hereda. Mismo criterio que
`GasNatural-GLP/js/calc-memoria-red-gas.js` con `calcularRedGas()`.

| Gas | Motor importado | Tabla de tubería | Criterios (todos deben cumplir) |
|---|---|---|---|
| GLP, Gas natural | `calcularRedGas()` (`GasNatural-GLP/js/calc-red-gas.js`): D.S. 66 f.1–f.5, Tabla VI, Tabla IX | `TABLA_TUBERIA_RED_GAS`, solo 3/8"–4" (el rango de la Tabla IX) | Baja presión: ΔP ≤ 150 Pa (GLP) / 120 Pa (GN) (Tabla VIII). Media: velocidad < 40 m/s (art. 45.2.9 d) y ΔP ≤ 10 % de la presión absoluta inicial |
| Hidrógeno | `calcularFlujo()` (`Hidrogeno/js/calc-flujo.js`): Darcy-Weisbach + Haaland, Z NIST, Barlow con Hf y T | `TABLA_TUBERIA` de `gas-h2.js` (¼"–1¼") | Velocidad ≤ 20 m/s (editable) · ΔP ≤ 10 % de P abs · velocidad ≤ erosional (API RP 14E) · presión ≤ máxima de diseño (F = 0,40) |

También se importan de otros módulos, solo para la UI: `TABLA_VI_DS66` /
`GAS_TABLA_VI_POR_DEFECTO` (opciones del selector) y `aPa`/`desdePa` de
`Hidrogeno/js/unidades-presion.js`. `storage.js` sí es copia (prefijo
propio `quempin-diametro-tuberia::`).

**Algoritmo**: cada diámetro de la tabla se resuelve con el motor de su gas
y se elige el **primero (el menor) que cumple todos los criterios**. No se
asume monotonía: si un criterio fallara en un diámetro mayor, igual se
propone el menor que cumple. Por cada criterio se guarda `uso` =
valor/límite; el de mayor uso es el que "manda" (`gobernante`) y es el
segundo KPI ("Pérdida de carga · 71 % del límite (150 Pa)").

## Decisiones

- **Régimen deducido de la presión**: < 10 kPa → baja, ≥ 10 kPa → media
  (`regimenDesdePresion`). Red de Gas pide régimen y presión por separado;
  acá eran dos campos que podían contradecirse (régimen "baja" con
  150 kPa).
- **Codos en GLP/GN como largo equivalente**: 30 diámetros interiores por
  codo de 90° (Crane TP-410, codo estándar: K = 30·fT). El D.S. 66 trabaja
  con L, así que el codo entra como metros: L de cálculo = L + n·30·DI —
  depende del diámetro, por eso se calcula por candidato. Con fT ≈ 0,023
  equivale a K ≈ 0,7, el mismo K por codo que Hidrógeno y Otros Gases
  (`Calculos H2.xlsx`), así que los tres módulos pesan igual un codo. En H₂
  el motor ya los suma como ΣK·ρv²/2 con K = 0,7 (`K_CODO_H2` es solo para
  mostrarlo; el test verifica que coincida). L/D es editable en Supuestos.
- **Solo 3/8"–4" en GLP/GN**: la Tabla IX del D.S. 66 no da K para 1/8",
  1/4" ni 5"–8" (en la app son extrapolados) y 1/8"–1/4" no son diámetros de
  red de artefactos. Si 4" no alcanza, se dice y se sugiere qué hacer.
- **Supuestos por defecto** = los de la herramienta completa de cada gas:
  GLP/GN 1 kPa y 15 °C (Red de Gas), H₂ 0,8 barG y 20 °C (Tubería y
  Flujo). Material por defecto **cobre tipo L** (Red de Gas usa acero):
  es el de redes interiores y, con el DI más chico por nominal, el
  conservador. Tabla VI: Licuado / Natural Vª y RM (los por defecto del
  módulo).
- **Supuestos guardados por gas** (`supuestos[gas]` en localStorage);
  potencia, largo y codos son comunes — cambiar de gas con la misma
  instalación es la comparación que interesa.
- **Velocidad máxima de H₂ 20 m/s**: el valor por defecto de "Velocidad
  máxima flujo de gas" de la Memoria de Cálculo de Hidrógeno.
- **Velocidad en GLP/GN, solo en media presión: < 40 m/s** (D.S. 66 art.
  45.2.9 d), "cualquiera sea el tipo de gas", sobre la presión de
  abastecimiento directo a los artefactos). Se importa
  `VELOCIDAD_MAXIMA_DS66_MS` de `pipe-network.js` (agregado el mismo
  2026-09-28 para los límites D.S. 66 de la Memoria, ver
  `GasNatural-GLP/CLAUDE.md`). Límite **estricto** (`estricto` en
  `criterio()`: 40,0 no cumple; la lista muestra "<"). Velocidad de f.5, a
  la presión final. A diferencia de la pestaña Red de Gas, que no la
  verifica, acá sí entra: es un criterio de dimensionamiento. En baja
  presión el decreto no fija velocidad; se informa.
- **Pendiente heredado — acero y Tabla X**: `GasNatural-GLP/CLAUDE.md`
  anota que el D.S. 66 (f.2) pide para acero los D5 de su Tabla X, y que el
  `d5` del Excel reemplazado por DI^5 el 2026-09-25 podría ser esa tabla.
  Si se corrige allá, esta calculadora lo hereda (solo afecta a "Acero
  Sch 40"; el cobre por defecto no).
- **Condensación del GLP**: la verifica `calcularRedGas()` con la mezcla
  70/30 por defecto; si hay riesgo, tile crítico sobre los resultados.
- **No incluye**: desnivel (D.S. 66 e.2), tees, válvulas, varios tramos.
  La nota del método enlaza a Red de Gas / Tubería y Flujo / Memoria.

## UX/UI

- **Preguntas numeradas** (1 Gas · 2 Consumo · 3 Recorrido) en vez de una
  planilla de campos; gas como control segmentado de 3 opciones a lo ancho
  (visibles sin abrir un desplegable, un toque).
- **Contador − / + para los codos** (sin abrir el teclado en el teléfono),
  el cajetín sigue aceptando un número tipeado. El − usa `aria-disabled`
  en 0, no `disabled` (perdería el foco justo al llegar a 0).
- **Divulgación progresiva**: los supuestos van en un `<details>` cerrado,
  con el resumen de sus valores vigentes en el mismo `<summary>`
  ("Baja presión 1 kPa · 15 °C · cobre tipo L") para saber qué se asumió
  sin abrirlo.
- **Resultado**: KPI 1 = diámetro nominal (+ material y DI), KPI 2 = el
  criterio que manda con su % de uso — el margen, no solo el sí/no. Debajo,
  el detalle (caudal, largo de cálculo = largo + codos, aporte de los
  codos, velocidad, régimen), en H₂ la lista de los 4 criterios con ✓/✗, y
  una tabla con los 2 diámetros vecinos por lado: por qué el anterior no
  sirve y cuánto margen da el siguiente.
- Sin barra de pestañas (una sola herramienta): el panel se marca
  `.tab-panel.active` para que `initResumenMovil()` — copia idéntica — lo
  encuentre, y `--alto-barra-pestanas` vale 0.
- Errores de entrada (potencia 0, codos 2,5) como tile crítico dentro del
  grupo `kpis`, para que la barra del teléfono también los muestre.

## Verificar cambios

```bash
node DiametroTuberia/tests/run-all.js
```

Sin Excel fuente. `tests/calc-diametro.test.js` contrasta contra la
fórmula f.1 del D.S. 66 escrita a mano en el test (no contra el motor):
GLP 30 kW / 10 m → ½" (3/8" da 347 Pa > 150); 12 codos → ¾"; GN misma
instalación → ¾"; GN 300 kW por 1 m a 20 kPa → ¾" por velocidad (3/8"
cumple la pérdida pero va a ~76 m/s; velocidad contrastada con f.5 a
mano); más ΔP ∝ L en baja presión, ΔP de codos = ΣK·ρv²/2 en H₂,
conservación de masa, diámetro sin capacidad, ningún diámetro alcanza y
entradas inválidas. Como importa los motores, correr
también los tests de `GasNatural-GLP` y `Hidrogeno` al tocarlos.
