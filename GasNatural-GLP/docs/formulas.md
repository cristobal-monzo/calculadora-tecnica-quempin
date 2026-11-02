# Gas Natural / GLP: fórmulas, reconciliación y auditorías

Detalle de referencia: léelo solo al tocar esto. Las reglas vigentes están en `../CLAUDE.md`.

## Tabla de tuberías ampliada + diámetro manual (2026-09-02, a pedido del usuario)

`TABLA_TUBERIA_RED_GAS` (`js/pipe-network.js`) tenía 11 filas (1/4"–4"),
todas literales de `Bases de Cálculo!I3:N13`. Se agregaron 4 filas más
(1/8", 5", 6", 8") **que no vienen del Excel**: DI de acero desde ASME
B36.10 Schedule 40, DI de cobre desde ASTM B88 tipo L — normas publicadas
que, verificado, coinciden con las 11 filas del Excel dentro de ~0.5%
(confirma que esas 11 filas ya seguían esas mismas normas). Para las filas
nuevas, `d5 = DI^5` calculado directo. **Desde el 2026-09-25 `d5 = DI^5`
en todas las filas** (antes las filas de acero de 3/8" a 2-1/2" traían el
`d5` literal del Excel, que no era DI^5) y la fila de 1/4" se corrigió —
ver "Auditoría de coherencia física" más abajo. El factor
`k` de las 3 filas nuevas se dejó igual al de 4" (2420, el mayor conocido)
por no tener base para extrapolarlo — antes de diseñar en baja presión con
esos tamaños, confirmar `k` con Cristóbal.

El selector "Diámetro nominal" de Red de Gas también tiene una opción
**"Manual (ingresar mm)"**: revela un campo de diámetro interior [mm] y
uno de factor K (usado solo en baja presión); "Material de tubería" se
oculta porque deja de tener efecto (acero/cobre son solo dos DI de la
misma fila tabulada — con diámetro manual hay un único DI). `d5` se
calcula como DI^5 igual que en las filas nuevas de la tabla. Ver
`tuberiaManual` en `js/calc-red-gas.js`.

## Memoria de Cálculo (2026-09-02, a pedido del usuario)

Quinta pestaña, mirroring la de `Hidrogeno/js/calc-memoria.js` pero sobre
Red de Gas en vez de Barlow — ver
[`../docs/superpowers/specs/2026-09-02-memoria-calculo-glp-gn-design.md`](../../docs/superpowers/specs/2026-09-02-memoria-calculo-glp-gn-design.md)
para las dos decisiones de modelado confirmadas con el usuario:

- **El gas es de toda la red, no por tramo** — sigue el selector global
  de Combustible que ya gobierna las otras 4 pestañas. Cambiarlo
  recalcula toda la tabla.
- **Sin encadenar presión entre tramos** — cada tramo tiene su propia
  presión inicial como input manual; la "pérdida acumulada" solo suma
  hacia arriba para reportar, igual que en Hidrógeno.

`js/calc-memoria-red-gas.js` no reimplementa Renouard/Peng-Robinson: cada
tramo se resuelve llamando directamente a `calcularRedGas()` — cualquier
corrección futura a Red de Gas se hereda automáticamente acá.

Igual que Hidrógeno, **no hay indicador "Tubería adecuada" por tramo** en
la tabla (aunque `calcularRedGas` lo devuelve gratis) — Hidrógeno mismo
excluye el chequeo análogo (velocidad de erosión) de su propia Memoria,
mismo criterio acá para no agregar una columna más a una tabla ya ancha
(16 columnas: Tramo, Continúa desde, Reinicia acum., Régimen, Material,
Diámetro, Potencia, Longitud, Presión inicial, Temp., Caudal objetivo,
Velocidad, Pérdida requerida, Pérdida acumulada, Presión final, eliminar).

Igual que Hidrógeno: reseteo de pérdida acumulada por tramo
(`reseteaAcumulada`, checkbox "Reinicia acum."), tubería manual por tramo
(mismo criterio que el tramo único de Red de Gas: sin fila de tabla,
"Material" se oculta y se piden diámetro interior + factor K), árbol SVG,
exportar/importar proyecto (`.json`, requirió agregar `exportarJSON`/
`importarJSON` a `js/storage.js`, portadas tal cual desde
`Hidrogeno/js/storage.js`), impresión con tabla recortada, y autoguardado
en localStorage (clave `memoria-red-gas`, distinta de `red-gas` para no
pisar el estado del tramo único).

Una diferencia deliberada del bloque de impresión (`@media print`) frente
al de Hidrógeno: también oculta `.selector-combustible`, que Hidrógeno no
tiene — es parte del chrome de la página, no del contenido de la memoria.

## Límites del D.S. 66 en la Memoria (`pipe-network.js`/`ui.js`/`index.html`/`css/styles.css`, 2026-09-28, a pedido del usuario)

Checkbox "Incluir los límites del D.S. 66 en la verificación" al inicio de
"Criterios de diseño" (dentro de "Datos del informe"), con una tabla
GLP | Gas Natural al lado (`renderLimitesDS66()`) que destaca la columna
del combustible vigente — la que se verifica. Se guarda como
`proyecto.incluirLimitesDS66` (se exporta con el proyecto; uno anterior sin
el campo queda sin incluir, igual que antes). Los límites salen de
`limitesDS66(gas)` en `pipe-network.js` (test en `pipe-network.test.js`):

| Límite | GLP | GN | Se evalúa en | Fuente |
|---|---|---|---|---|
| Pérdida de carga acumulada | ≤ 150 Pa | ≤ 120 Pa | tramos de baja presión | art. 45.2.9 c.1 y d) → Tabla VIII |
| Velocidad | < 40 m/s | < 40 m/s | tramos de media/alta presión | art. 45.2.9 d) |

- **Fuente**: texto oficial del decreto (BCN, publicado por SEC en
  `sec.cl/sitioweb/transparencia_activa/julio2010/Decreto_66.pdf`). La
  velocidad es literal: "Para las tuberías de gas que operen a presiones
  superiores a la de abastecimiento directo a los artefactos o equipos,
  cualquiera sea el tipo de gas, la velocidad de flujo deberá ser inferior
  a 40 (m/s)" — límite estricto (`<`, `estricto` en `evaluarCriterio()`), y
  "presiones superiores a la de abastecimiento directo" se lleva al régimen
  `>10 kPa` del tramo. **La Tabla VIII es una imagen en ese texto** (no se
  pudo leer): 150/120 Pa salen de `Bases de Cálculo!B17`, que ya usaba el
  módulo, y coinciden con el manual de cobre que los cita como "normadas
  por SEC" en baja presión (GC y GN 120 Pa, gas licuado 150 Pa).
  **Confirmar con Cristóbal** si la Tabla VIII trae también una fila de
  media presión (c.1 habla de la caída "hasta el equipo o al regulador de
  segunda etapa") — hoy la app no aplica ningún límite de pérdida del
  D.S. 66 a los tramos de media.
- **Informe**: sección 2 lista el límite normativo junto al propio del
  proyecto ("20 m/s; < 40 m/s en media/alta presión (D.S. 66)"), sección 5
  agrega una fila por límite, que nombra la tabla/artículo y el gas. Con los
  límites incluidos, un criterio propio SIN valor ya no aparece como fila
  "No evaluado". Si la red no tiene tramos del régimen de un límite, la
  fila dice "No aplica" (estado `no-aplica`, fuera del conteo de la
  conclusión) en vez de un "Cumple" sin tramos evaluados. Las marcas ▲ de la
  tabla y del diagrama salen de la `columna` de cada criterio.
- El área táctil de 44px del checkbox va en una regla propia junto a sus
  estilos, no en el bloque "Uso desde el teléfono" (idéntico en los tres
  módulos).
- La pestaña Red de Gas no cambió: su "Tubería adecuada" ya usa la Tabla
  VIII en baja presión; en media sigue con el 10 % de la presión inicial y
  no verifica los 40 m/s.

**Hallazgo pendiente, no tocado**: el mismo texto oficial dice en art.
45.2.9 f.2 que para tubos de acero "se deberán considerar los valores de
D5 prescritos en la Tabla X" (también imagen). La auditoría del
2026-09-25 reemplazó el `d5` literal del Excel en acero de 3/8" a 2-1/2"
por DI^5, porque "equivalía a un diámetro 5-10 % menor" — es posible que
ese `d5` del Excel fuera justamente la Tabla X. Revisar contra la tabla
antes de dar por cerrado ese cambio.

## Duración de la prueba de hermeticidad, D.S. 66 f.11 (`calc-red-gas.js`/`calc-memoria-red-gas.js`/`ui.js`/`index.html`, 2026-10-16, a pedido del usuario)

Texto del decreto (letra e, provisto por el usuario): "La duración de la
prueba depende del volumen de la red o del tramo de ésta a inspeccionar
... Tiempo de prueba (minuto) = Volumen de la tubería (m3) * 214 (f.11).
En todo caso, éste deberá ser de al menos quince (15) minutos, con un
máximo de una (1) hora."

- `duracionPruebaHermeticidad(volumenM3)` → `{ volumenM3, formulaMin,
  duracionMin, ajuste }`; `ajuste` = `'minimo'`/`'maximo'` si manda un
  tope (15 min / 60 min), `null` si manda la fórmula. Volumen = área
  interior × longitud (el `volumenTuberiaM3` que ya existía).
- **Red de Gas**: grupo "Prueba de hermeticidad (D.S. 66 f.11)" con la
  duración del tramo; la nota dice si se aplicó el mínimo o el máximo y
  cuánto daba la fórmula.
- **Memoria**: `pruebaHermeticidadRed()` suma el volumen de TODOS los
  tramos (la red completa); línea bajo la tabla de tramos y otra en el
  informe, bajo la leyenda de la sección 4.
- Tests en `calc-red-gas.test.js` y `calc-memoria-red-gas.test.js`.

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
  masa.** *(Reemplazada el 2026-09-25: la base correcta es la MOLAR, no la
  de masa — ver "Auditoría de coherencia física" más abajo.)* `Combustión Gas!F36` (X carbono de GN) ponderaba el término de
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

## Correcciones aplicadas (2026-09-02, a pedido del usuario)

Auditoría física de Combustión/Quemador y Almacenamiento contra
estequiometría de combustión y balances de energía. Dos correcciones,
verificadas con la regresión completa (`node GasNatural-GLP/tests/run-all.js`):

- **Quemador Atmosférico — caudal por perforación tenía temperatura y
  presión invertidas (`js/calc-quemador.js`, `caudalGasPorPerforacionM3S`,
  usado en la verificación de largo de llama).** La hoja fuente calculaba
  algebraicamente ṁ·P/(r·T) — masa × densidad — en vez del caudal
  volumétrico de gas ideal ṁ·r·T/P (masa ÷ densidad), el mismo patrón que
  `corregirCaudalTP` (`combustion.js`) y `caudalPremezcla1Nm3S` (unas
  líneas más arriba en el mismo archivo) ya calculaban bien. Esto
  subestimaba el largo de llama reportado (`largoLlamaMm`) en ~2x — un
  chequeo de seguridad contra impingement de llama, así que subestimarlo es
  la dirección insegura del error. Para el caso GN cacheado del Excel
  (`gnLlama` en `calc-quemador.test.js`): `caudalGasPorPerforacionM3S` pasó
  de 9.806733440184042e-7 a 1.982288998888557e-6 m³/s, `largoLlamaMm` de
  1.8543804220726559 a 3.7483611977934608 mm.
- **Estanque GLP — la conversión de capacidad de vaporización a kW/Mcal
  usaba el PCI de Gas Natural, no el de GLP (`js/calc-almacenamiento-glp.js`,
  `calcularEstanqueGLP`).** La hoja fuente (`Estanque GLP!B8`) usaba la
  constante `52737` kJ/kg — que es exactamente el PCI por defecto de GAS
  NATURAL en este mismo código (ver `pciMasa` en `gas-gn.test.js`), pese a
  que este módulo es exclusivamente GLP. Casi con certeza una referencia
  cruzada de hoja en el Excel fuente (`Estanque GLP!B8` apuntando a la
  celda de PCI de GN de `Combustión Gas` en vez de la de GLP). `qKgH` (la
  superficie de vaporización en kg/h) no estaba afectado, solo la
  conversión a kW/Mcal — que es justo lo que se compara contra la demanda
  térmica del proyecto para decidir si el estanque alcanza.
  `calcularEstanqueGLP` ahora recibe `pctButano`/`pctPropano` y deriva el
  PCI real de la composición vía `propiedadesGLP` (igual que el resto del
  módulo); la UI del formulario de Estanque agregó los campos de
  composición correspondientes (`es-pct-butano`, `es-pct-propano`). Para el
  caso cacheado del Excel (composición por defecto 30% butano / 70%
  propano): `qKw` pasó de 66.84853724682291 a 58.29596160247766,
  `qMcalH` de 57.493127738678986 a 50.13747951859133 (~13% más bajo).

## Auditoría de coherencia física (2026-09-25, a pedido del usuario)

Revisión de los resultados contra cálculos independientes (Darcy-Weisbach
isotérmico, Renouard clásico, cálculo directo de O₂ estequiométrico,
entalpías de combustión NIST, Lee-Kesler contra NIST WebBook). Se
revisaron también las celdas del Excel fuente para confirmar cada caso.
Verificado con `node GasNatural-GLP/tests/run-all.js` y en navegador.

**Red de Gas — media/alta presión (`pipe-network.js`)**. La fórmula de
`Bases de Cálculo!B20` tenía dos errores: el exponente 0,541 afectaba solo
a `Fs/(Cr·L)` y no a `(P1² − P2²)` (2,623 = 4,848 × 0,541 muestra que es
común a todo el corchete), y P1/P2 entraban manométricas en `P1² − P2²`.
Juntos sobrestimaban la caída entre 7 y 23 veces (GN 3/4", 150 kW, 30 m,
50 kPa man.: 26.368 Pa contra 1.602 de Renouard clásico y 1.625 de Darcy).
Ahora `Q = 0,12426·D^2,623·[(P1²−P2²)·Fs/(Cr·L)]^0,541` con P absolutas —
el test compara contra Renouard clásico (±5 %) y Darcy (±10 %). El test
anterior de "autoconsistencia algebraica" no podía detectarlo: invertir
una fórmula equivocada devuelve el mismo ΔP igual.

**Red de Gas — `d5` y fila de 1/4"**. `d5` del Excel no era DI^5 en acero
de 3/8" a 2-1/2" (equivalía a un diámetro 5-10 % menor), así que baja
presión (usa `d5`) y media (usa DI) calculaban la misma tubería con dos
diámetros. Con `d5 = DI^5` la fórmula de Pole del Excel reproduce a
Renouard clásico de baja presión (ΔP[mbar] = 23200·dr·L[m]·Q^1,82·D^-4,82)
al 0,02 %. La fila de 1/4" (10,4 mm en acero y cobre) pasó a Sch 40
9,25 mm / cobre tipo L 8,00 mm.

**Red de Gas — propiedades desde la composición** *(REEMPLAZADO el mismo
día por la Tabla VI del D.S. 66 — ver "Tablas VI y IX del D.S. 66" más
abajo; se conserva como registro)*. Los valores fijos del
Excel (GLP: PC 119,7 MJ/m³ y densidad relativa 2, que son de butano casi
puro; dos densidades relativas distintas por gas) se reemplazaron por
propiedades derivadas de la composición (`propiedadesGLP`/`propiedadesGN`):
PCS por m³ a 15 °C y 1 atm (la base con la que el Excel fijó sus valores:
GN por defecto da 37,47 contra 37,54; butano puro 120,8 contra 119,7),
densidad relativa = PM/28,9647 y pseudocríticas de Kay para
Peng-Robinson (con 50/50 reproducen `J40:L40`). La viscosidad sigue fija
por gas. Red de Gas tiene ahora su bloque de composición (guardado por gas
en `red-gas-composicion-GLP/GN`) y la Memoria guarda la composición de la
red en `proyecto.composicion[gas]` (se exporta con el proyecto; un
proyecto anterior sin composición usa la del módulo por defecto,
`COMPOSICION_POR_DEFECTO` en `calc-red-gas.js`). El informe muestra la
composición en "Tipo de red". Con GLP 70/30 el caudal sube ~17 % respecto
del valor "butano" del Excel.

**Red de Gas — Z, velocidad y criterio de media presión**.
- Peng-Robinson se evalúa con presión ABSOLUTA y la temperatura ingresada
  (el Excel usaba la manométrica y 293,15 K fijos).
- La velocidad es la REAL al final del tramo (caudal estándar llevado a
  P y T del gas, D.S. 66 f.5 — ver más abajo; en una primera versión de
  este mismo día incluía también Z); antes se dividía el caudal a 1 atm por el área, y en
  media presión eso la sobrestimaba ~2,5 veces a 150 kPa man. La Memoria
  compara esta velocidad contra sus criterios.
- En media presión "Tubería adecuada" usa ΔP ≤ 10 % de la presión inicial
  absoluta (el mismo umbral de screening que el usuario fijó en Hidrógeno
  el 2026-09-08), no los 150/120 Pa de baja presión de D.S. 66, que
  declaraban inadecuada cualquier tubería de media. **No es un valor de
  D.S. 66** (su sección e no fija una pérdida admisible de media
  presión); criterio confirmado por Cristóbal el 2026-09-25.
- GLP: aviso de condensación. Presión de rocío de la mezcla por Raoult con
  presión de vapor de Lee-Kesler (propano 8,41 / butano 2,08 bar a 20 °C,
  NIST 8,36 / 2,08). 70/30 condensa sobre 4,40 bar abs a 20 °C y 2,27 a
  0 °C. Tile crítico en Red de Gas; en la Memoria, aviso en pantalla y un
  criterio "Sin condensación del GLP" en la sección 5 del informe (no marca
  ▲ en la tabla: esas marcas son de velocidad y pérdida).

**Combustión — PCI del metano**. `Combustión Gas!B13` (PCI metano) = 55050
y `B14` (PCS) = 55053: el PCI quedó igual al PCS. PCI real 50.010 kJ/kg
(802,3 kJ/mol), PCS 55.510. PCI del GN por defecto: 52.737 → 48.021 kJ/kg
(−9 % de flujo de combustible y de aire con el valor anterior). Coincide
con el `48029` que el Excel tenía en `J4`. Los pares PCI/PCS de los cuatro
hidrocarburos se validan en el test por el calor de condensación del agua.

**Combustión — fracciones elementales en base molar** (GN y GLP). La
corrección del 2026-09-01 pasó C/H/O/N a fracción de masa; la masa de
cada elemento por mol de mezcla se pondera con fracción MOLAR. Aire
estequiométrico del GN por defecto 12,10 → 12,76 Nm³/kg (idéntico al
cálculo directo por O₂ requerido); en GLP el efecto es ~0,1 %.

**Combustión — caudal total de referencia**: sumaba aire en Nm³/h con
combustible en m³/h a la T/P de referencia; ahora el aire también se
convierte (`corregirCaudalTP`, que existía y no se usaba). El PCI por
defecto de GLP pasó de 48029 (ni el PCI ni el PCS de su composición) al
derivado de la composición, igual que ya se hacía con GN.

**Quemador — largo de llama**. La correlación de Roper (Turns ec. 9.59,
`1330·Q·(T∞/T_F)/ln(1+1/S)`) usa el caudal del fluido que sale por la
perforación — la premezcla gas + aire primario — y S ya estaba definido
por mol de premezcla. Con solo el caudal de gas el largo salía ~13 veces
menor (GLP por defecto: 1,4 mm en una perforación de 2 mm). Ahora 17,6 mm
(GLP) y 19,9 mm (caso GN del Excel). Además, `desviacionPotenciaInyector`:
si el inyector (calculado por geometría y presión) entrega más de ±10 %
distinto de la potencia del quemador, el tile se marca y se explica — con
los valores por defecto (los del Excel) entrega 4,8 kW para 25 kW; con un
inyector de 2,75 mm el aviso desaparece.

**Contraste con las fórmulas del D.S. 66 (sección e, provistas por el
usuario el 2026-09-25)**. f.1–f.5 implementadas literalmente en un script
aparte dan la misma ΔP que el motor (<0,2 %, por el redondeo de las
constantes del decreto: 2,68 vs 9,65/3,6, 1,013 bar vs 101.325 Pa). El
decreto confirma las correcciones de arriba: f.3 lleva el exponente 0,541
sobre todo el corchete con p1/p2 ABSOLUTAS; en f.1 D es el diámetro
interior (d5 = DI^5); el caudal es m³S a 15 °C y 1,013 bar (base del
PCS); una sola densidad relativa S; viscosidad 0,012/0,008 cP. Ajustes:
- **Velocidad = f.5 literal**, `V = 1,25·Q·T/(p2·D²)` (`velocidadDS66()`
  en `calc-red-gas.js`): real, a la presión absoluta final, sin Z (antes la
  app incluía Z — en GLP de media presión daba ~6 % menos que el decreto).
- **Variación de presión con la altura, e.2** (`variacionPresionAlturaPa()`):
  Δph = 12·(1 − d)·h. Campo "Desnivel del tramo [m]" en Red de Gas y
  columna "Desnivel [m]" en la Memoria (cota final − inicial, positivo si
  sube). El GLP pierde presión al subir (70/30: −80 Pa cada 10 m), el GN
  gana (+51 Pa cada 10 m). Entra en `perdidaPresionTotalPa` = fricción −
  Δph, que es lo que se compara con la admisible, lo que se acumula en la
  Memoria (columna renombrada "Pérdida del tramo", marca "h" en el
  informe) y lo que descuenta la presión final. `perdidaPresionRequeridaPa`
  sigue siendo solo la fricción. Se aplica con cualquier desnivel
  ingresado; `alturaObligatoriaDS66` indica si supera los 10 m desde los
  que el decreto la exige. Para GLP se muestra la nota del decreto (se
  puede despreciar si se compensa con el regulador, hasta 3,24 kPa).
- **Cr con T = °C + 273**, no el "+278" del texto del decreto: lo define
  como temperatura absoluta en K, casi seguro un error de tipeo (con 278
  la ΔP de media presión subiría ~1,8 %). Confirmado por Cristóbal el
  2026-09-25.
- **Tablas VI y IX**: resuelto, ver la sección siguiente.

**Tablas VI y IX del D.S. 66 (provistas por el usuario el 2026-09-25)**.
- **Tabla VI → Red de Gas y Memoria** (`TABLA_VI_DS66` en
  `calc-red-gas.js`): d, PCS y viscosidad salen de la tabla, por tipo de
  gas y región, y ya NO de la composición (el decreto dice "según Tabla
  VI"). Filas: GLP Licuado (d 2,0 · 119,7 MJ/m³) y Licuado catalítico
  (1,6 · 95,04); GN Vª y RM (0,87 · 37,54), VIIIª (0,89 · 40,56) y XIIª
  (0,88 · 39,73); viscosidad 0,008 / 0,012 cP; referencia 15 °C y
  101,3 kPa. Se omiten las de gas de Ciudad (no es GLP ni GN y la tabla no
  les da viscosidad). Selector "Tipo de gas y región" en Red de Gas
  (guardado por gas en `red-gas-composicion-GLP/GN`) y en la Memoria
  (`proyecto.gasTablaVI[gas]`, exportado con el proyecto; uno anterior sin
  el campo usa Licuado / Natural Vª y RM). El informe cita la fila usada en
  "Tipo de red". Con GLP Licuado el caudal vuelve a los 0,90226 m³/h del
  caso original del Excel (30 kW / 119,7).
- **Composición real del GLP: solo para condensación**. La Tabla VI
  "Licuado" (d 2,0) es butano casi puro — una convención de diseño para la
  pérdida de carga, no el producto real. Verificar condensación con esa d
  marcaría como condensante casi toda red de GLP en media presión, así que
  Red de Gas y Memoria piden además la composición real (70/30 por
  defecto; `proyecto.composicion.GLP`), rotulada "solo para verificar
  condensación". En GN ya no se pide composición en Red de Gas.
- **Z (Y = 1/Z de f.3)**: el decreto no dice cómo obtenerlo. Pseudocríticas
  de Kay coherentes con la d de la tabla: en GLP, la mezcla propano/butano
  con esa d (Licuado → ~99 % butano, catalítico → ~16 % butano); en GN, las
  del metano (las que usaba el Excel).
- **Ojo — d del GN**: la tabla trae 0,87 / 0,89 / 0,88 para gas natural,
  bastante más que la de un GN real (0,57–0,65; el Excel usaba 0,59). Se
  aplica tal cual porque es el valor normativo (el usuario confirmó la
  tabla), y es conservador: en baja presión la ΔP de GN sube ~47 % frente
  a d 0,59, y la ganancia por altura (e.2) baja a 1,56 Pa/m.
- **Tabla IX → factor K** (`kTablaIX` en `pipe-network.js`): coincide con
  la columna del Excel de 3/8" a 4". 1/8", 1/4" y 5"–8" quedan fuera de la
  tabla; en baja presión la app lo advierte (K extrapolado). Con diámetro
  manual el K lo ingresa el usuario.
- Tests: `calc-red-gas.test.js` contrasta el motor contra f.2, f.4 y f.5
  literales con los valores de la Tabla VI; `pipe-network.test.js` sigue
  comparando la fórmula contra Renouard clásico y Darcy con un GN típico
  (d 0,6) — con la d 0,87 de la tabla el D.S. 66 se separa ~8 % de
  Renouard clásico, porque escala con S^0,848 y Renouard con d^1.

**Revisado y dejado igual**: la tabla de consumo de estufas a 10 °C
(medio/alto = 3,5 kWh/día, rompe el patrón 3× y 4× del nivel bajo) es
literal del Excel (`Bases de Cálculo!K28:K29`) y no hay fuente para un
valor "correcto" — confirmar con Cristóbal.

## Discrepancias del Excel fuente que se dejaron como estaban

No todo lo que se ve distinto entre GLP y GN es un error — estas dos
quedaron así a propósito, porque no hay manera de saber cuál (si alguna)
está "mal" sin más contexto del Excel original:

- *(Resuelta el 2026-09-25: Red de Gas ahora deriva UNA densidad relativa
  de la composición — ver "Auditoría de coherencia física". Se conserva el
  texto original como registro.)* **Dos "densidades relativas" distintas
  para el mismo gas**:
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
