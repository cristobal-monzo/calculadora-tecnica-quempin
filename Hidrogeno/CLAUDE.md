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
de tubería, correlación de compresibilidad Z —fuente única, ecuación de
NIST, ver más abajo—, Tabla Hf de ASME B31.12).

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

## Diámetro de tubería manual (2026-09-02, a pedido del usuario)

A diferencia de `GasNatural-GLP`, **no se amplió** `TABLA_TUBERIA` (sigue
con las 6 filas de 1/4" a 1-1/4" de `Cálculo!H33:L38`): a diferencia de la
tabla de Red de Gas, no se pudo confirmar contra ninguna norma publicada
qué serie de tubería es esta (ni ASME B36.10 Schedule 40 ni ASTM B88 tipo
L coinciden con sus DI) — inventar filas nuevas sin esa confirmación
habría sido fabricar espesor/límite elástico, que acá sí son datos de
seguridad (fórmula de Barlow). Si Cristóbal tiene la tabla/catálogo de
origen, se puede ampliar con confianza. *(2026-09-25: se identificó por
qué no calzaba — la columna "DI" mezclaba diámetros exteriores e
interiores; ver "Auditoría de coherencia física" más abajo. La tabla
ahora guarda DE y deriva DI.)*

Con tubería manual se ingresa el **diámetro interior**; el exterior para
Barlow se deduce como DI + 2·espesor (`diametroExteriorMm()` en
`gas-h2.js`, desde el 2026-09-25). Default del DI manual: 10,3 mm (el DI
real de la fila de 1/2").

En cambio, tanto el selector de "Tubería y Flujo" como el de cada tramo de
"Memoria de Cálculo" tienen una opción **"Manual (ingresar mm)"** que pide
los 4 datos que la tabla normalmente provee — diámetro interior, espesor
de pared, límite elástico y rugosidad — en vez de asumir un valor
(a diferencia de Red de Gas en GasNatural-GLP, acá la presión máxima de
diseño depende directamente del espesor/límite elástico, así que no hay
manera segura de adivinarlos). En Memoria de Cálculo la unidad es por
tramo (cada fila puede tener su propia tubería, tabulada o manual), con un
sub-bloque de 4 campos compactos que aparece en la celda "Diámetro" al
elegir manual — ver `tuberiaManual` en `js/calc-flujo.js` y
`js/calc-memoria.js`, y `etiquetaTuberia()` en `js/ui.js` (usada también en
la tabla de impresión).

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
- **Factor T (Tabla PL-3.7.1(b)(8), derating por temperatura) AGREGADO
  2026-09-02, a pedido del usuario, completando la fórmula de Barlow**
  (`P = 2·S·t·F·E·Hf·T/D` — el Excel tampoco lo aplicaba, igual que Hf
  arriba). A diferencia de Hf, T no depende de la presión que se está
  resolviendo (solo de la temperatura, que ya pedía el formulario), así
  que `factorT()` se calcula una sola vez en `calcularFlujo` y se pasa
  como parámetro adicional a `presionMaximaDiseno` (por defecto 1,
  retrocompatible). Ver la tabla oficial en la sección siguiente. Para el
  caso por defecto de la app (20°C = 68°F) T=1 (tabla plana hasta 250°F),
  así que el resultado numérico no cambia respecto a antes de este
  agregado — pero para diseños a mayor temperatura, T reduce la presión
  máxima admisible.

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

**Corregida en la app (2026-09-08, a pedido del usuario)** — **factor de
compresibilidad Z unificado**. Había tres cálculos distintos de Z para el
mismo gas, y dos de ellos eran funciones escalón con los mismos valores
mágicos:

| Dónde | Antes | Ahora |
|---|---|---|
| Tubería y Flujo, densidad (`Cálculo!C26`) | correlación de 9 términos, pero evaluada con presión **manométrica** y `T+273` | `factorZDesdeBarG` → correlación con presión **absoluta** en MPa y `T+273.15` K |
| Tubería y Flujo, velocidad de erosión (`Cálculo!C27`) | escalón `<20→1, <50→1.02, <200→1.1, <300→1.2` | la misma correlación, evaluada en la presión mínima del tramo |
| Almacenamiento (`Sheet3!C7`) | escalón `<50→1.02, <200→1.1, <300→1.2` | la misma correlación, evaluada en la presión absoluta del estanque |
| Memoria de Cálculo (por tramo) | misma correlación mal alimentada que Flujo | la misma correlación, por tramo |

`factorZHidrogeno({ presionAbsMPa, temperaturaK })` en `gas-h2.js` es ahora
la **única** implementación; `factorZDesdeBarG` / `factorZDesdeBarAbs` son
adaptadores de unidades (el único lugar donde se traduce bar manométrico o
absoluto + °C a MPa absolutos + K, reutilizando `barGaugeAPaAbs` /
`barAbsAPaAbs` / `celsiusAKelvin` de `physics.js` y `desdePa` de
`unidades-presion.js` — no se agregó ninguna conversión nueva ni ningún
campo al formulario).

Los coeficientes del Excel (`Cálculo!B84:D92`) resultaron ser exactamente
los de la ecuación estandarizada de NIST (Lemmon, Huber & Leachman, *J.
Res. NIST* **113**(6), 2008): reproducen los 5 puntos de validación de la
Tabla 2 de esa publicación con diferencias de ~1e-9, limitadas por las 9
cifras significativas con que la publicación entrega los `ai`. Lo que
estaba mal no eran los coeficientes sino cómo se los alimentaba. Es una
ecuación para **densidad de hidrógeno gaseoso** (rango publicado 220-1000 K
y hasta 200 MPa), no una EOS universal — cubre de sobra el almacenamiento
de H₂ comprimido de 100-700 bar, donde el escalón anterior directamente
tiraba error sobre 300 bar.

**Impacto numérico** (casos por defecto, re-baselineados en los tests):

- Almacenamiento, 200 bar abs / 20°C: Z 1.2 → 1.1247527, masa 2.6192 →
  2.7944 kg (+6.7%). El escalón sobrestimaba Z justo en el valor por
  defecto de la app y por lo tanto subestimaba la masa; además saltaba
  ~9% de golpe al cruzar 200 bar, que es lo que motivó el cambio.
- Tubería y Flujo, 0.8 barG / 20°C: Z 1.0004759 → 1.0010703, densidad
  0.148818 → 0.148730 kg/m³, pérdida de carga 31.173 → 31.191 mbar.
  Velocidad de erosión 77.564 → 77.495 m/s (Z de erosión 1.02 → 1.0181923).
  El número de Reynolds **no** cambia: `Re = ρ·v·D/µ` con `v = ṁ/(ρ·A)`, o
  sea `ρ·v` no depende de Z — sirve de verificación cruzada.
- `ui.js` muestra Z con 3-4 decimales (`formatearZ`), no con los 2
  decimales del resto de los resultados: con 2 el Z de Flujo se mostraba
  como "1" y el de Almacenamiento perdía justamente el detalle que hace
  visible que ya no hay escalones. El cálculo interno siempre va con
  precisión completa.

Tests: `tests/factor-z-h2.test.js` (los 5 puntos NIST, continuidad de Z y
de la masa almacenada en 199.9/200.0/200.1 bar, igualdad exacta del Z entre
Tubería y Flujo y Almacenamiento para el mismo estado, y barrido monótono
100-700 bar sin excepciones).

## Auditoría de coherencia física (2026-09-25, a pedido del usuario)

Revisión de los resultados contra cálculos independientes y contra las
celdas del Excel fuente (`Calculos H2.xlsx`, leído de nuevo para cada
caso). Mismo trabajo en `GasNatural-GLP` (ver su `CLAUDE.md`). Verificado
con `node Hidrogeno/tests/run-all.js` y en navegador.

**Tabla de tubería (`TABLA_TUBERIA`, `gas-h2.js`)**. La columna "DI [mm]"
de `Cálculo!I33:I38` mezclaba diámetros exteriores e interiores: 1/4",
3/8" y 1/2" = 6,4 / 9,5 / 12,7 mm son el **exterior** del tubing; 3/4" y
1" = 16 / 23 mm ≈ exterior − 2·espesor, o sea el **interior**; 1-1/4" =
42 mm es el exterior de un tubo NPS 1-1/4" (42,2 mm), con pared de 2,7 mm
(≈ Sch 10). Consecuencias: en flujo, usar el exterior como interior
subestimaba la velocidad ~1,5x y la pérdida de carga ~2,7x en 1/2"; en
Barlow (que va con el **exterior**, PL-3.7.1), usar el interior en 3/4" y
1" sobrestimaba la presión máxima de diseño. Ahora cada fila guarda DE y
espesor (los del Excel) y deriva DI = DE − 2·espesor, igual que
`OtrosGases/js/tuberias.js`; Barlow recibe `diametroExteriorMm`. Límite
elástico y rugosidad sin cambios. El selector y la tabla de referencia
muestran DE y DI. Caso por defecto (1/2", 60 kW, 20 m): presión máxima de
diseño sin cambio (128,5 bar — 12,7 ya era el exterior), velocidad 26,5 →
40,3 m/s, pérdida de carga 31,2 → 83,6 mbar. Ojo: 40 m/s supera los 20 m/s
(NFPA 2) que la Memoria usa por defecto como criterio — es el resultado
físico real de 60 kW de H₂ a 0,8 barG por 1/2".

**Velocidad de erosión en el mismo estado del gas (`calc-flujo.js`)**. El
Excel calculaba la velocidad erosional (API RP 14E, `Cálculo!C14`) a la
presión mínima y la comparaba con la velocidad de flujo a la presión de
operación; además, sus valores por defecto tenían mínima 29,5 barG sobre
una operación de 0,8 barG. Como v ∝ 1/ρ y Ve ∝ 1/√ρ, la comparación vale
solo en un mismo estado y es más exigente a menor presión: ahora ambas se
evalúan a la **presión mínima de la línea** (`velocidadFlujoErosionMS`,
`presionErosionBarG`), y si la "mínima" supera la de operación se usa la
de operación y se avisa (`presionMinimaSobreOperacion`, nota en pantalla).
Default de "Presión manométrica mínima de la línea" 29,5 → 0,8 barG (igual
a la de operación). Los resultados muestran la velocidad a la presión de
operación junto al caudal y un grupo aparte "Velocidad de erosión — API RP
14E, a la presión mínima" con Ve y la velocidad a esa presión (naranja si
supera el 80 % de Ve, mismo criterio de antes). El screening de flujo
sónico no cambia.

**Caudal real de H₂ en L/min**. `Cálculo!C12` multiplicaba el caudal real
por 17,5817, que es m³/h → L/min (16,667) × 288,15/273,15 (Nm³ a 0 °C →
litros estándar a 15 °C) — esa corrección solo corresponde al caudal
normalizado. En L/min el caudal real salía 5,5 % alto; ahora × 1000/60.
La velocidad ya no depende de la unidad mostrada.

**Almacenamiento (`calc-almacenamiento.js`)**:
- `Sheet3!G10` se llama "Caudal real @4Nm³/h": los 360 g/h fijos de
  `H10` eran el caudal de **llenado** de 4 Nm³/h (4 × 0,089 ≈ 0,356 kg/h,
  redondeado), dividido por 2,16 en vez de 2,016 (+7 %) y sin Z. Ahora el
  caudal de llenado es un campo (`alm-caudal-llenado`, default 4 Nm³/h) y
  el caudal real es masa/densidad real con Z: 0,0203 → 0,0242 m³/h.
- `H11` (velocidad en la línea Ø¼") usaba 6,35 mm, el diámetro exterior;
  ahora el DI de la fila de 1/4" (3,95 mm): 0,18 → 0,55 m/s.
- Autonomía: el Excel usaba toda la masa, como si el estanque se vaciara
  hasta 0 bar. Nuevo campo "Presión residual mínima [abs]"
  (`alm-presion-residual`, default **10 bar abs**, valor conservador que
  NO viene del Excel, confirmado por Cristóbal el 2026-09-25 — en cada
  proyecto se ajusta a la presión mínima de entrada del regulador real). Autonomía sobre la masa utilizable: 01:33:07 →
  01:27:55. El tiempo de llenado va desde la presión residual al caudal de
  llenado ingresado. Con presión residual 0 se recupera el cálculo del
  Excel.

**Revisado y dejado igual — Hf en tubing inoxidable**. Las filas de 1/4" a
1" son, por su límite elástico (170-185 MPa) y rugosidad (0,002 mm),
tubing inoxidable; la Tabla IX-5A (Hf) es de acero al carbono. Aplicarla
es **conservador** (Hf ≤ 1 reduce la presión máxima; con estas presiones
suele valer 1). Cambiarlo exige agregar el material a la tabla y los
factores de la norma para inoxidable (Tablas IX-5B/IX-5C, no disponibles
en el repo) — ver la sección siguiente, que ya lo dejaba como pendiente.

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

## Factor de diseño F y factor de temperatura T (`gas-h2.js`, 2026-09-02, a pedido del usuario)

`TABLA_FACTOR_DISENO_F` — puerto de la Tabla PL-3.7.1(b)(6)-1 "Basic
Design Factor, F (Used With Option A)" de ASME B31.12 (provista por el
usuario). Reemplaza el input numérico libre que tenía "Tubería y Flujo"
(un número cualquiera, default 0.4, sin relación explícita con la norma)
por un `<select>` de Clase de Ubicación (`poblarSelectFactorDiseno()` en
`ui.js`): 1 División 2 / 2 / 3 → F=0.50, Clase 4 → F=0.40. El `value` de
cada opción es directamente el factor F (varias clases comparten 0.50,
igual que la tabla oficial); default Clase 4, igual que el input anterior.
Elegir la clase de ubicación correcta del proyecto sigue siendo criterio
del usuario — lo que cambia es que ahora está anclado a la tabla de la
norma en vez de a un número arbitrario.

`TABLA_FACTOR_TEMPERATURA_T` / `factorT()` — puerto de la Tabla
PL-3.7.1(b)(8) "Temperature Derating Factor, T, for Steel Pipe" (provista
por el usuario). No agrega ningún campo nuevo: `factorT()` convierte la
temperatura en °C que ya pedía "Tubería y Flujo" a °F y busca/interpola en
la tabla (nota general de la norma: interpolación lineal en temperaturas
intermedias). Mismo criterio de saturación plana en los extremos que
`factorHf` (por debajo de 250°F, T=1; por encima de 450°F, se satura en el
último factor de la tabla en vez de lanzar error — la norma no dice qué
hacer fuera de rango, y lanzar error ahí rompería la app para cualquier
diseño a alta temperatura sin aviso previo del usuario).

## Indicador "Tubería adecuada" y factor E (`calc-flujo.js`/`ui.js`, 2026-09-02, a pedido del usuario)

Mirroring el indicador de `GasNatural-GLP` (`calcularRedGas`,
`tuberiaAdecuada`): "Tubería y Flujo" ahora expone `tuberiaAdecuada` en el
resultado de `calcularFlujo`, con su propio tile verde ("Sí")/naranja
("No — usar tubería de mayor espesor o menor diámetro") en `ui.js` — se
agregó la clase CSS `.resultado-tile.ok` (antes solo existía `.alerta`) al
stylesheet del módulo, copiada de `GasNatural-GLP`. El criterio acá es
**estructural, no de pérdida de carga** (a diferencia de Red de Gas): la
tubería es adecuada si la presión de operación (`presionBarG`) no supera
la presión máxima de diseño (Barlow, con F/E/Hf/T ya aplicados,
`presionMaxDisenoBar`). El chequeo de velocidad de erosión existente
(tile "Velocidad de flujo" en naranja si supera el 80% del límite) sigue
siendo una advertencia aparte, no se fusionó con este indicador.

Factor E de uniones longitudinales: **siempre 1**, ya no es un input
editable ni se muestra en la UI (a pedido explícito del usuario — el
Excel fuente y `calc-flujo.js`/`physics.js` seguían aceptándolo como
parámetro, pero `ui.js` ahora lo pasa hardcodeado en vez de leerlo de un
campo). No cambia ningún resultado, porque el input eliminado ya tenía 1
como único valor usado en la práctica.

## Separador decimal flexible en cajas de ingreso manual (`ui.js`, 2026-09-02, a pedido del usuario)

Todos los `<input>` de ingreso manual de valores continuos (presión,
temperatura, potencia, largo, tubería manual, y las filas de la Memoria de
Cálculo) pasaron de `type="number" step="any"` a `type="text"
inputmode="decimal"`. Motivo: un `<input type="number">` aplica el
separador decimal según el locale del navegador/SO y descarta en silencio
el carácter que no coincide — en la práctica eso impedía tipear cualquier
decimal (y por lo tanto cualquier valor menor a 1) según cómo estuviera
configurado el navegador. `numeroFlexible()` (nueva función en `ui.js`)
reemplaza "," por "." antes de `Number(...)` y trata lo no numérico como 0
(mismo fallback que tenía un `type="number"` vacío/inválido); reemplaza a
`Number(...)` en todos los sitios que leen esas cajas (`leerFlujoForm`,
`leerAlmacenamientoForm`, `leerFilaMemoria`, `leerPresion`,
`initSelectorUnidadCampo`). Los contadores enteros (Codos/Tee/Válvulas)
quedan como `type="number"` — no tienen el problema de separador decimal.
No afecta cómo se muestran los resultados (`formatearNumero()`, sección
siguiente) ni los valores que la propia UI escribe de vuelta al campo
(conversión de unidad, siempre con punto — `numeroFlexible()` los lee bien
igual).

## Formato numérico y unidades en los resultados (`ui.js`, 2026-09-02, a pedido del usuario)

Todos los números mostrados en tiles de resultado (las 3 pestañas) pasan
por `formatearNumero()` (`Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 })`):
coma decimal, punto de miles, hasta 2 decimales (recorta ceros de más). El
cálculo interno sigue con precisión completa — esto solo cambia cómo se
muestran. Nota: esto aplana factores adimensionales de verificación como
"Factor de fricción" (`0,03782` → `0,04`) a una resolución más gruesa que
antes; si en el futuro hace falta más precisión visible para contrastar
contra el Excel, esos tiles puntuales son buenos candidatos a una
excepción explícita. **El factor Z ya es una de esas excepciones**
(2026-09-08): usa `formatearZ()` con 3-4 decimales, ver la sección del
factor Z unificado más arriba.
`unidades-presion.js` NO se tocó (sigue con `formatearPresion()`, string
de precisión fija) porque `unidades-presion.test.js` depende de poder
`Number()`-earlo; `ui.js` tiene su propio `formatearPresionBonita()` que
envuelve `desdePa()` + `formatearNumero()` para mostrar, y es lo único que
cambió de `formatearPresion` a esto en las 3 pestañas.

Los selectores de unidad que alimentan un resultado del motor (a
diferencia de los de presión, que solo redibujan un valor ya calculado)
—`flujo-unidad-normalizado`/`flujo-unidad-h2` en Tubería y Flujo,
`alm-unidad-caudal` en Almacenamiento— se movieron del formulario de
ingreso manual a un `<select>` inline dentro del tile del resultado que
afectan (mismo patrón visual que los selectores de presión, pero SÍ
disparan un recálculo al cambiar, ya que el motor recibe la unidad
elegida). Como viven fuera del `<form>` (se regeneran en cada render, dentro
de `#resultados-flujo`/`#resultados-almacenamiento`), se seleccionan por
`id` y se cablean con un listener de delegación aparte en el contenedor de
resultados — no se suman a `form.querySelectorAll('input, select')`, así
que el guardado en localStorage los agrega a mano (ver
`unidadNormalizadoFlujo`/`unidadH2Flujo`/`unidadCaudalAlm` en `ui.js`).

## Otros ajustes de UI (2026-09-02, a pedido del usuario)

- Los 3 campos "Codos"/"Tee"/"Válvulas" de "Tubería y Flujo" ahora viven
  dentro de un `<fieldset class="subseccion">` propio (misma pestaña, sin
  ser una pestaña aparte) — clase nueva en `css/styles.css`, sin cambio de
  comportamiento.
- La etiqueta "Potencia quemador [kW]" de Almacenamiento (`alm-potencia`)
  pasó a "Potencia de consumo [kW]" — es la única ocurrencia de esa frase
  en el módulo; no confundir con "Potencia combustión [kW]" de Tubería y
  Flujo (`flujo-potencia`), que es un campo distinto y no cambió de nombre.
- El selector "Factor de diseño F" pasó a etiqueta corta "Factor de diseño
  F (ASME B31.12)" (antes citaba la tabla completa) y sus opciones a
  "Clase 1, División 2"/"Clase 2"/"Clase 3"/"Clase 4" (antes "Clase de
  Ubicación N") — mismo `factor` por opción, solo texto más compacto.
- **Reordenados y recategorizados los tiles de "Tubería y Flujo"**
  (`renderResultadosFlujo` en `ui.js`): primero los resultados relevantes
  para la decisión de dimensionamiento, en este orden — Presión máxima
  diseño + Tubería adecuada, Flujo volum. Norm., Flujo volum. de H₂, Flujo
  másico de H₂, Velocidad erosión, Velocidad de flujo, Pérdidas de carga:
  luego, bajo un subtítulo "Factores de verificación" (`.resultados-subtitulo`
  en `css/styles.css`, spanea toda la fila de la grilla), Densidad real y
  los factores Hf/T/Z/Reynolds/fricción, en ese orden. Algunas etiquetas se
  acortaron con la cita de norma que pidió el usuario: "Presión máxima
  diseño (PL-3.7.1)" (antes "...(Barlow, ASME B31.12)") y "Velocidad
  erosión (I-3.4.5)" (antes "...(límite)") — provistas por el usuario, no
  verificadas independientemente contra el texto de la norma.

## Punto de reseteo de pérdida acumulada (`calc-memoria.js`/`ui.js`, 2026-09-02, a pedido del usuario)

No viene del Excel fuente (la hoja `MC` no modela reguladores de presión).
Cada tramo tiene ahora un campo `reseteaAcumulada` (checkbox "Reinicia
acum." en la tabla, con tooltip); si está activo, `perdidaAcumulada()` en
`calc-memoria.js` ignora la acumulada heredada del padre y arranca en 0
para ese tramo, igual que un regulador de presión reinicia la referencia
aguas abajo. Como el cálculo es recursivo por `continuaDesdeId`, todo lo
que continúa desde un tramo con reseteo hereda automáticamente desde ese
nuevo punto de partida — no hace falta ningún cambio adicional en la
propagación. Se refleja en la tabla de impresión (`(reinicia acumulada)`
junto a "Continúa desde") y en el diagrama de árbol (anillo alrededor del
nodo). Ver el caso de prueba de cadena A-B-C-D con reseteo en C en
`calc-memoria.test.js`.

## Auditoría UX/UI: agrupación de inputs y jerarquía de resultados (`index.html`/`css/styles.css`/`ui.js`, 2026-09-03, a pedido del usuario)

Rediseño de estructura visual (no de fórmulas ni de motores de cálculo,
verificado con `node Hidrogeno/tests/run-all.js`) sobre las 3 pestañas:

- **Inputs agrupados por concepto** en vez de una grilla plana: nueva clase
  `.seccion`/`.seccion-titulo` (sin caja/borde — jerarquía por tipografía y
  un hairline entre bloques, a propósito para no sumar más cards). "Tubería
  y Flujo" pasa a "Condiciones de operación" + "Tubería y diseño normativo"
  (con "Accesorios" ya existente adentro); "Red de Gas" en GLP recibe el
  mismo tratamiento ("Configuración de tubería" + "Condiciones de
  operación", ver su CLAUDE.md).
- **Jerarquía KPI/secundario en resultados**: nuevo modificador
  `.resultado-tile.kpi` (2 por pestaña, texto más grande) y `.secundario`
  (factores de verificación, texto más chico) sobre el mismo componente —
  `tile()`/`tilePresion()` ya aceptaban un string de clase libre en su
  parámetro `variante`, así que no cambió su firma. "Tubería y Flujo":
  Presión máxima diseño + Tubería adecuada como KPI, caudales/velocidades
  sin cambio de peso, Hf/T/Z/Reynolds/fricción demovidos a `.secundario`
  bajo "Factores de verificación" (ya existía el subtítulo, se generalizó
  el patrón). "Almacenamiento": Masa de H₂ almacenada + Autonomía como KPI,
  resto bajo "Detalle del cálculo".
- **Memoria de Cálculo reordenada**: la tabla de tramos + árbol SVG (lo que
  se edita todo el rato) pasan primero; los cajetines de proyecto/informe
  (fecha, instalador, firma, criterios, observaciones, artefactos) se
  movieron a un `<details class="seccion-avanzada">` "Datos del informe"
  cerrado por defecto — nueva clase en `css/styles.css`, ya existía
  `<details>` para la tabla de tubería de referencia. No afecta impresión:
  `renderInformeImpresion()` sigue leyendo del objeto `proyecto` en JS, no
  del DOM visible, y el bloque sigue con `.no-imprimir`.
- **Fix de overflow en "Tubería manual"** (`#campo-flujo-tuberia-manual`):
  el sub-grid de 4 campos (DI/espesor/límite elástico/rugosidad) se salía
  de su contenedor porque `grid-template-columns:repeat(4, 1fr)` con
  `<input>` sin `width` explícito usa el ancho intrínseco del input como
  mínimo de cada columna. Cambiado a `repeat(4, minmax(0, 1fr))` en
  `index.html` + `min-width: 0` agregado a `.campo input, .campo select`
  en `css/styles.css` (deja que cualquier input se achique a su columna,
  no solo este caso — no había un `width:100%` de base como sí tiene
  `.campo-con-unidad`).
- **Accesibilidad del patrón de pestañas** (2026-09-06, segunda pasada de
  la misma auditoría): `role="tab"`/`role="tablist"` ya estaba, pero sin
  `aria-selected` ni vínculo `aria-controls`/`aria-labelledby` entre botón
  y panel, así que un lector de pantalla no anunciaba cuál pestaña estaba
  activa. Cada botón ahora tiene `id="tab-<nombre>"` +
  `aria-controls="panel-<nombre>"`; cada `<section class="tab-panel">`
  tiene `role="tabpanel"` + `aria-labelledby="tab-<nombre>"`;
  `initTabs()` en `ui.js` sincroniza `aria-selected` al hacer clic. También
  se agregó `.tab:focus-visible` en `css/styles.css` (antes dependía del
  outline por defecto del navegador — ahora usa el mismo naranja de marca
  que `.campo input:focus-visible`). No se implementó navegación con
  flechas del patrón ARIA APG completo (roving tabindex) — los botones ya
  son nativamente enfocables con Tab, y agregar eso habría sido un cambio
  de comportamiento mayor para un beneficio marginal.
- **Botones/selects de solo-ícono con nombre accesible** (2026-09-06,
  tercera pasada): los botones "✕" de eliminar tramo/artefacto
  (`.mem-eliminar`/`.af-eliminar`) y los `<select>` de unidad inline
  dentro de un tile de resultado no tenían texto accesible — un lector de
  pantalla solo anunciaba "✕" o "select". Se agregó `aria-label` dinámico
  (nombre del tramo/artefacto, o "Unidad de &lt;etiqueta del tile&gt;") en
  `ui.js`. Los campos `af-nombre`/`af-potencia` (dependían solo de
  `placeholder`) suman `aria-label` fijo.
  **Bug encontrado de paso**: la etiqueta "Caudal de referencia (línea
  capilar Ø¼")" lleva una comilla literal — interpolarla sin escapar en un
  atributo `aria-label="..."` corta el atributo a mitad de camino y rompe
  el `<select>`. Nueva función `escapeAttr()` en `ui.js` (escapa `&` y
  `"`), usada en los 4 puntos nuevos de esta pasada. En ese momento no se
  aplicó retroactivamente a las interpolaciones ya existentes de nombre de
  tramo/artefacto/material en atributos y contenido — ver el punto
  siguiente, donde sí se cerró.
- **Saneamiento de texto libre en toda Memoria de Cálculo** (2026-09-06,
  cuarta pasada, cierra el pendiente del punto anterior): nombre de tramo
  (`t.nombre`), material libre (`t.material` — este módulo no tiene un
  `<select>` de material como Red de Gas en GLP) y nombre de artefacto
  (`a.nombre`) son texto libre que el usuario tipea o que llega vía
  "Importar proyecto (.json)", y se interpolaban sin escapar en varios
  `render*()`: `value="${t.nombre}"` de la tabla, las `<option>` del
  selector "Continúa desde", `<text>`/`<title>` del árbol SVG, y las
  celdas de artefactos/tramos de la tabla impresa. Un nombre con `"`
  cortaba el atributo a mitad de camino (mismo bug que motivó
  `escapeAttr()`); uno con `<algo>` se interpretaba como HTML real en vez
  de texto literal (ej. `<b>` en un nombre de tramo aparecía en negrita en
  vez de mostrarse tal cual). Nueva `escapeHtml()` (escapa `&`/`<`/`>`,
  para contenido de etiqueta) junto a la `escapeAttr()` ya existente (para
  atributos) — aplicadas en `renderTablaMemoria`, `renderArbol`,
  `renderArtefactos` y `renderInformeImpresion`. Verificado con un nombre
  de tramo `Tramo <b>"bold"</b> & mas`: antes de este fix habría creado un
  `<b>` real en el DOM del árbol/tabla impresa; después, el texto se
  muestra literal en los tres lugares. No es un vector entre usuarios (no
  hay backend ni datos compartidos) sino un caso de "self-XSS" vía un
  .json importado a mano o un nombre escrito sin querer con esos
  caracteres — igual vale la pena cerrarlo porque antes rompía el layout
  con solo escribir una comilla.

## Informe formal de Memoria de Cálculo (`index.html`/`ui.js`/`css/styles.css`, 2026-09-03, a pedido del usuario)

La pestaña "Memoria de Cálculo" imprimía solo una tabla desnuda de tramos
(6 columnas, sin membrete). Se rediseñó `#memoria-informe-impresion` como
un documento formal completo, calcado del membrete real de QUEMPIN
(`ejemplo MC.pdf`, provisto por el usuario) — logo (`assets/LOGO
QUEMPIN.PNG`), datos de la empresa, título, cajetines de proyecto,
criterios de diseño, artefactos, tabla de tramos ampliada a 10 columnas
(agrega Potencia/Material/P.Parcial/V.flujo, que la tabla vieja omitía),
resumen, observaciones y firma. Decisiones:

- **Datos de la empresa (RUT 76.772.215-k, Giro, Dirección Carlos Fernando
  983) van hardcodeados** en el HTML del informe, no como cajetín — son
  fijos de QUEMPIN, no cambian por proyecto (a diferencia de la
  "Dirección"/"Comuna" del cajetín, que es la del proyecto/instalación, un
  dato distinto).
- **Nuevo estado `proyecto`** (objeto aparte de `tramos`, clave propia
  `memoria-proyecto` en localStorage — sin migrar el shape de `memoria`):
  fecha/proyecto/instalador/contacto/dirección/comuna, cargo y RUN del
  instalador (bloque de firma), N° de documento/revisión (default "01"/"1"),
  3 criterios de diseño opcionales, artefactos y observaciones.
- **"Velocidad máxima flujo de gas" / "Velocidad de erosión" / "Máxima
  pérdida de carga acumulada" del encabezado son cajetines manuales
  opcionales**, no calculados: son criterios/límites de diseño del
  proyecto, no un resultado de un tramo — la velocidad de erosión en
  particular depende de la presión, que varía tramo a tramo en una red
  ramificada, así que no hay un único valor "correcto" que derivar
  automáticamente (decisión confirmada con el usuario). Sin valor, se
  muestran como "- [unidad]", igual que el documento de ejemplo. Default
  20 m/s en velocidad máxima de flujo (mismo límite NFPA 2 usado en
  "Tubería y Flujo"). Distintos de "Pérdida acumulada máxima" / "Velocidad
  máxima de flujo" al pie del informe, que sí son calculados (máximo de
  `perdidaAcumuladaMbar`/`velocidadFlujoMS` entre los tramos ya
  resueltos).
- **Artefactos**: lista libre (nombre + potencia kW, agregar/quitar, mismo
  patrón que los tramos). "Potencia instalada" = suma siempre, con la nota
  fija "No se considera operación simultánea" — igual que el documento de
  ejemplo (confirmado con el usuario; sin interruptor de simultaneidad).
- **Exportar/Importar proyecto (.json)** pasa de un array plano de
  `tramos` a `{ tramos, proyecto }`. Importar sigue aceptando el formato
  viejo (`Array.isArray(datos)`) por compatibilidad con exports previos.
- **Impresión**: además de `.no-imprimir`, ahora se ocultan `.viz-header`
  (cromo del sitio — logo de texto, selector de gas) y `#memoria-arbol` (el
  diagrama de árbol es ayuda visual de edición, no parte del documento) —
  el informe es autocontenido y trae su propio membrete. Se agregó `@page
  { size: A4; margin: 14mm; }` y `html, body, .viz-root` forzados a fondo
  blanco puro (antes se colaba el beige de `--page-plane` del tema claro
  alrededor del informe).

## Rediseño visual del informe (`css/styles.css`/`index.html`, 2026-09-06, a pedido del usuario)

El informe original (sección anterior) tenía el contenido correcto pero un
tratamiento visual básico — sin títulos de sección, tablas con grilla
completa, colores de borde inconsistentes. Se refinó en una serie de
pasos, todos dentro de `@media print` en `css/styles.css` (sin tocar
`ui.js`, que sigue solo llenando `.textContent` por id):

- **Eyebrows de sección** (`.informe-eyebrow`, reutilizada en `<div>` y en
  `<caption>`): mayúscula + tracking + filete superior en `var(--gridline)`;
  antes las 6 secciones (datos/criterios/artefactos/tramos/resumen/
  observaciones) no tenían ningún título que las separara.
- **Ficha de campos** (`.informe-ficha`/`.informe-campo`) reemplaza la
  tabla etiqueta-izquierda/valor-derecha en Datos del proyecto y Criterios
  de diseño — esa tabla partía mal las etiquetas largas ("Máxima pérdida
  de carga acumulada" caía en 2 líneas y descuadraba la fila con su par).
- **Cajetín de N° Doc/Revisión/Página** con borde propio, estilo title
  block de plano técnico, en vez de texto suelto alineado a la derecha.
- **Tabla de tramos "reglada"** (`#memoria-tabla-impresion`): solo filetes
  horizontales + cebra, sin grilla completa (el aspecto por defecto de una
  planilla exportada); cabecera con tinte del naranja de marca
  (`rgba(255,81,0,0.06)`) y filete de 2px bajo la cabecera. Números con
  `font-variant-numeric: tabular-nums`.
- **Tarjetas de métrica** (`.informe-stat`) para "Pérdida acumulada
  máxima"/"Velocidad máxima de flujo" — mismo lenguaje visual que los
  tiles de resultado en pantalla (número grande + etiqueta chica), en vez
  de una fila de tabla más. "Potencia instalada" en Artefactos también se
  destaca (13px/900) frente a "Total" (paso intermedio).
- **Etiqueta "Firma" + pie de página de cierre** (RUT/nombre/"Memoria de
  Cálculo, Red de Gas Hidrógeno") — antes la línea de firma no explicaba
  qué iba ahí y el documento terminaba de golpe tras la firma.
- **Paleta de bordes unificada a los tokens de marca** (`var(--gridline)`
  para filetes finos, `var(--brand-gray-7)` para filetes de más peso,
  `var(--brand-gray-11)` para texto secundario) — se habían acumulado 5
  grises de borde ligeramente distintos entre los pasos anteriores.
  Esquinas rectas en todo el informe (se sacó el único `border-radius` que
  quedaba, en Observaciones) — un documento controlado se lee más formal
  sin esquinas de tarjeta de app.
- **Resiliencia de paginado**: `#memoria-tabla-impresion thead { display:
  table-header-group }` (repite la cabecera si la tabla pasa a una 2ª
  página) y `break-inside: avoid` en filas/tarjetas/firma/header/
  observaciones — el caso feliz de 1 página ya se veía bien sin esto, pero
  una red con muchos tramos puede desbordar a más de una página.

Verificado en cada paso con un viewport de ~700px (aprox. el área útil de
una A4 con márgenes de 14mm) en vez del ancho de escritorio, que
distorsiona el juicio sobre cómo se ve realmente el PDF impreso.

## Ajustes de membrete y firma (2026-09-07, a pedido del usuario)

- **Logo agrandado y recortado a su contenido visible** — el archivo
  oficial `assets/LOGO QUEMPIN.PNG` trae ~17-24% de margen transparente
  alrededor de la marca (confirmado inspeccionando el canal alfa), así que
  agrandar su altura en CSS no acercaba el trazo visible del logo al texto
  de al lado. Se generó `assets/logo-quempin-informe.png` (recorte al
  bounding box del canal alfa + ~2% de aire) específicamente para este uso
  — el archivo oficial NO se tocó, sigue siendo la fuente de verdad para
  cualquier otro uso del logo en el sitio. `.informe-logo` pasó de 50px a
  76px de alto y `.informe-header` de `align-items: center` a `flex-start`
  para que el borde superior del logo quede a la altura del texto de la
  derecha (RUT/Giro/Dirección) — a pedido explícito del usuario, ignorando
  a propósito el espacio de resguardo que exigiría el manual de marca para
  este uso puntual. **Ajustado de nuevo el mismo día tras revisión visual**:
  76px quedaba demasiado grande — bajó a **60px** (~20% menos) y
  `align-items` volvió a `center` (con el logo más chico, centrado se ve
  mejor que alineado por el borde superior).
- **Más espacio en blanco para la firma manuscrita**:
  `.informe-firma-etiqueta` (la etiqueta "FIRMA") pasó de `margin-bottom:
  22px` a `46px` antes de la línea.
- **N° de documento correlativo con el control de documentos QUEMPIN**:
  el default de `numeroDoc` pasó de "01" a **"402603"**. Fuente:
  `QUEMPIN_Control de Documentos 2026.xlsx` (vive en la raíz del repo,
  **gitignored** por `*.xlsx` — no se versiona, es una planilla de gestión
  externa al código, igual criterio que `Calculos H2.xlsx`/`Libro11111111.xlsx`),
  hoja "Chile", fila 18: código `40XXXX` ("Cálculo de ingeniería" /
  "Memoria de cálculo"), columna "Último Emitido" = `402602` al
  2026-09-07. Formato del código: `TT` (tipo de documento, 2 dígitos) +
  `AA` (año, 2 dígitos) + `NN` (correlativo del año, 2 dígitos) — ej.
  `402602` = tipo 40, año 2026, 2º emitido ese año; confirmado contra
  todas las demás filas de la planilla (el año del código coincide con el
  año real de emisión en cada fila salvo esta, que tiene la columna
  "Fecha"/"Nombre de Archivo" desactualizada un emitido respecto a
  "Último Emitido" — se confía en "Último Emitido" por ser la columna con
  ese nombre explícito). **GasNatural-GLP usa el mismo código 40XXXX**
  (a pedido explícito del usuario, aunque existe un código más específico
  — `41XXXX`, fila 19, "Memoria de cálculo de red de gas" — se decidió no
  usarlo para no fragmentar el correlativo en dos numeraciones paralelas).
  Como los dos módulos comparten una única numeración de la fila 18,
  Hidrógeno tomó `402603` y GasNatural-GLP `402604` (siguiente disponible
  después de asignar el de Hidrógeno) — ver el `CLAUDE.md` de
  `GasNatural-GLP` para el mismo detalle.
  **Mantenimiento**: este número NO se actualiza solo — la app es estática
  y no tiene forma de escribir en la planilla. Cada vez que el usuario
  confirme que emitió/entregó una memoria de cálculo real, hay que (1)
  actualizar "Último Emitido" en la planilla (y agregar la fila con
  autor/fecha/referencia si corresponde) y (2) subir el default de
  `numeroDoc` de ambos módulos al siguiente número disponible.

## El informe siempre entra en una sola hoja (`ui.js`, 2026-09-08, a pedido del usuario)

Con una red de muchos tramos, la tabla de `#memoria-informe-impresion`
puede crecer más alto que una A4 y desbordar a una 2ª página — la
"resiliencia de paginado" agregada en el rediseño visual (`thead {
display: table-header-group }`, `break-inside: avoid`, ver sección de
arriba) asumía que eso era aceptable como fallback. El usuario pidió que
el informe **siempre** quepa en una sola hoja, sin excepción.

`ajustarEscalaImpresion()` (nueva función en `ui.js`) mide el alto real
del informe ya renderizado con los estilos de `@media print` aplicados
(engachada a los eventos globales `beforeprint`/`afterprint` de la
ventana, no solo al botón "Imprimir/Guardar PDF" — así también cubre
Ctrl+P o el menú nativo del navegador) y, si no entra en el alto
disponible de una A4 con márgenes de 14mm (`(297 - 28) * 96/25.4 * 0.98`
px CSS, con 2% de margen de seguridad contra el redondeo de `zoom`,
medido empíricamente en ~0.3-0.5%), reduce todo el informe con la
propiedad CSS `zoom`. Se prefirió `zoom` sobre `transform: scale()`
porque `zoom` sí reduce el alto de **layout** de la caja (no solo el
pintado visual) — con `transform`, el motor de paginado de impresión
seguiría viendo el alto original sin escalar y podría igual cortar una 2ª
página aunque el contenido se vea más chico. `afterprint` resetea el zoom
a `''` para no dejar la vista en pantalla achicada. Sin piso mínimo de
escala a propósito — la instrucción es "siempre", no "salvo que haya
demasiados tramos". Verificado con 20 tramos (bastante más de lo que el
caso de uso típico necesita): factor ~0.76, cabe cómodo dentro de una A4.
**Corregido el 2026-09-25**: igual salían 2 páginas — ver la sección
siguiente (padding inferior de pantalla).

## Informe legible: verificación de criterios y notación técnica (`index.html`/`ui.js`/`css/styles.css`, 2026-09-25, a pedido del usuario)

Pedido: revisar visualmente el informe "con perspectiva de ingeniero de gas
y de diseñador de documentos senior" para que se lea claro y conciso.
Revisado sobre PDFs reales (`page.pdf()` de Chromium, A4, "Gráficos de
fondo" desactivado como viene por defecto) con una red de 4 tramos con
regulador. Mismo cambio en `GasNatural-GLP` (ver su `CLAUDE.md`). No toca
motores de cálculo; `node Hidrogeno/tests/run-all.js` sigue en verde.

- **Sección 5 "Verificación de criterios de diseño"** (reemplaza las 2
  tarjetas de "Resumen de resultados"): el informe declaraba los límites
  (sección 2) y mostraba los máximos, pero nunca decía si la red cumple —
  con 20 m/s de límite y 52,25 m/s calculados, no había ninguna señal. Ahora
  una fila por criterio definido (Criterio | Límite | Máximo calculado |
  Tramo crítico | Resultado "Cumple"/"No cumple · N de M tramos"/"No
  evaluado") y una conclusión de una línea con barra verde/roja.
  "Velocidad de erosión" solo aparece si tiene valor (compara la misma
  velocidad de flujo). `evaluarCriterio()`/`filaVerificacion()`/
  `textoConclusion()` en `ui.js`.
- **Valores fuera de límite marcados en la tabla de tramos** (`▲` + rojo +
  negrita, `.informe-excede`) con leyenda al pie — el estado se lee por
  forma, no solo por color (fotocopia en B/N).
- **Unidades con su caja real**: el `text-transform: uppercase` de las
  cabeceras convertía "MPa"/"mbar"/"m/s"/"kW" en "MPA"/"MBAR"/"M/S"/"KW" (en
  SI la caja es parte del símbolo: m = mili, M = mega). La unidad va en su
  propia línea (`thConUnidad()`, `.informe-unidad`).
- **Notación SI en los valores**: "20 m/s", no "20 [m/s]" (los corchetes
  quedan para rotular). Un criterio sin valor dice "No definida" en vez
  de "- [m/s]" — revierte a propósito la decisión del 2026-09-03 de
  copiar el guion del documento de ejemplo: en papel se leía como un dato
  faltante por error.
- **Criterio y resultado en la misma unidad**: la pérdida máxima se
  ingresa en Pa pero se imprime en la unidad de la columna "ΔP acumulada"
  (antes "5.000 [Pa]" arriba vs. "273,86 [mbar]" abajo).
- **Presión manométrica explícita**: "Presión man." — el motor la trata
  como manométrica (`calc-memoria.js`), y en H₂ la diferencia con absoluta
  es de 1 bar. "P. Parcial"/"P. Acumulada" pasan a "ΔP tramo"/"ΔP
  acumulada" ("P." se leía también como "presión").
- **Reinicio de acumulada como marca "R"** junto al nombre del tramo, con
  leyenda, en vez de "(reinicia acumulada)" dentro de la celda — ese texto
  ensanchaba la tabla ~20px más allá del margen derecho de la hoja.
  "— raíz —" (jerga de la app) pasa a "Inicio de red".
- **Secciones numeradas** (1 a 6, número en naranja de marca, título en
  negro — antes gris de 8,5px, indistinguible de una etiqueta de campo):
  permite citar "ver 4" al revisar.
- **Demanda de potencia** como tabla con cabecera (Artefacto | Potencia
  térmica kW), números a la derecha y **una sola fila de total**: "Total" y
  "Potencia instalada" repetían el mismo número (sin simultaneidad son
  iguales). La nota de no simultaneidad va en la misma fila.
- **Más compacto**: Datos del proyecto en 3 columnas (qué/dónde, cuándo/
  quién) y Criterios en 4 — 3 filas menos. Con la red de ejemplo de 4
  tramos, el informe entra en 1 hoja **a zoom 1** (antes lo reducía
  `ajustarEscalaImpresion()`). Pie con "Doc. N°, Rev." (el documento se
  identifica también abajo); "N°. Doc.:" pasa a "N° Doc.".
- **Paleta fija en papel**: `#memoria-informe-impresion` redefine
  `--gridline`/`--brand-gray-*`/`--estado-*` en `@media print`. En tema
  oscuro `--gridline` vale `#2c2c2a`, así que imprimir con la app en "Modo
  oscuro" dejaba todos los filetes casi negros (medido: `rgb(44,44,42)` →
  ahora `rgb(225,224,217)` en ambos temas).
- **`print-color-adjust: exact`**: Chrome no imprime fondos por defecto, y
  sin esto se perdían la cebra, el tinte de cabecera, el cajetín de N° Doc
  y los recuadros de estado. Verificado con `printBackground: false`.
- **Fin de la 2ª hoja en blanco**: `main` (60px) y `.viz-root` (48px)
  conservaban su padding inferior en papel, así que el PDF salía **siempre**
  con 2 páginas, a cualquier zoom (medido con 1; 0,97; 0,94; 0,9) — y a
  veces el pie del informe caía en la 2ª. `main, .viz-root {
  padding-bottom: 0 }` en `@media print`. Con 20 tramos: zoom 0,77, 1 hoja.

Verde de "Cumple" y rojo de "No cumple": los mismos `--estado-ok`
(`#2e7d32`) y `--estado-critico` (`#c62828`) ya extrapolados para los
tiles (ver "Rojo de estado crítico" arriba) — sin colores nuevos.

## Fix de foco al escribir en la Memoria de Cálculo (`ui.js`, 2026-09-08, a pedido del usuario)

Bug reportado por el usuario: en la tabla de tramos y en la lista de
artefactos de "Memoria de Cálculo" solo se podía tipear **un carácter a la
vez** (y nunca la coma decimal) — cada tecla dejaba el cajetín sin foco y
había que volver a hacer clic para seguir escribiendo. Causa raíz:
`recalcularMemoria()`, disparada por el listener de `'input'` delegado en
`#memoria-tabla-cuerpo` y en `#memoria-artefactos-cuerpo`, reescribía el
`innerHTML` completo de esos contenedores en **cada tecla** — destruye y
recrea los `<input>` (pierde el foco) y vuelve a serializar el valor ya
convertido a número vía `numeroFlexible()` (descarta cualquier "," recién
tipeada antes del siguiente carácter).

Este mismo bug ya se había corregido en `GasNatural-GLP/js/ui.js` el
2026-09-03 (ver su `CLAUDE.md`) pero explícitamente **no se portó acá** en
esa sesión, para no interferir con el informe formal que se mergeaba en
paralelo — quedó documentado como pendiente. Portado ahora, mismo patrón:

- **`recalcularMemoriaLigero()`** (nueva función): recalcula la red
  (`calcularRed(tramos)`) pero solo actualiza las celdas de **resultado**
  de cada fila (de solo lectura, identificadas con las clases nuevas
  `.mem-densidad`/`.mem-velocidad`/`.mem-perdida-parcial`/
  `.mem-perdida-acumulada` agregadas en `renderTablaMemoria()`) vía
  `textContent`, más el árbol SVG y el informe impreso — nunca toca ningún
  `<input>`/`<select>` de la fila, así que el foco y lo que el usuario ya
  escribió se conservan. El listener de `'input'` en
  `#memoria-tabla-cuerpo` ahora decide por `evento.target.tagName`: un
  `<select>` (tubería, padre — cambia estructura de la fila) sigue
  llamando `recalcularMemoria()` completo; cualquier `<input>` de
  texto/checkbox (incluido el checkbox "Reinicia acum.", que no cambia
  estructura) llama `recalcularMemoriaLigero()`.
- **Artefactos**: el listener de `'input'` en `#memoria-artefactos-cuerpo`
  ya no llama a `recalcularMemoria()` completo (que a su vez llamaba
  `renderArtefactos()`, reescribiendo la lista entera) — ahora solo llama
  `actualizarTotalArtefactos()` (nueva función, extraída de
  `renderArtefactos()`) y `renderInformeImpresion(ultimoResultadoMemoria)`.
  Agregar/quitar un artefacto sigue regenerando la lista completa vía
  `renderArtefactos()` (no tiene el problema, no es tecla a tecla).
- **Cajetines de proyecto** (`#form-memoria-proyecto`, fecha/instalador/
  criterios/observaciones): tampoco se regeneran vía `innerHTML`, así que
  no tenían el problema de foco en sí — pero el listener llamaba
  `recalcularMemoria()` completo igual (recalculaba y redibujaba toda la
  tabla de tramos sin necesidad). Cambiado a llamar solo
  `renderInformeImpresion(ultimoResultadoMemoria)`, igual que
  `GasNatural-GLP`.
- **`ultimoResultadoMemoria`** (nueva variable de módulo, mismo nombre que
  en `GasNatural-GLP`): cachea el último resultado de `calcularRed(tramos)`
  para que los cajetines de artefactos/proyecto puedan refrescar el
  informe impreso sin recalcular la red entera.

Verificado en navegador (no solo con la regresión de fórmulas, que no
cubre `ui.js`): escribir un decimal completo con coma
("12,5") carácter por carácter en Longitud, Nombre, y en Nombre/Potencia
de un artefacto, sin perder el foco ni ningún carácter. Los `<select>`
(unidad de columna, tubería manual, padre) y el checkbox de reseteo siguen
actualizando la tabla/estructura correctamente. `node
Hidrogeno/tests/run-all.js` sigue en verde (este fix es solo de `ui.js`,
no toca ningún motor de cálculo).

## Screening de caída de presión / flujo sónico (`physics.js`/`calc-flujo.js`/`ui.js`, 2026-09-08, a pedido del usuario)

Chequeo **adicional** en "Tubería y Flujo", complementario —no sustituto—
del de velocidad erosional de API RP 14E. Responde otra pregunta: no "¿la
velocidad erosiona la pared?" sino "¿la caída de presión es lo bastante
grande como para que alguna restricción esté cerca de estrangular el
flujo?".

**API RP 14E quedó intacto**: `velocidadErosion()` en `physics.js`, el tile
"Velocidad erosión (I-3.4.5)" y el umbral del 80% del tile "Velocidad de
flujo" no se tocaron ni se fusionaron con este chequeo. Son dos criterios
que conviven, cada uno con su propio estado.

`chequeoCaidaPresion({ presionAguasArribaAbs, presionAguasAbajoAbs, gamma })`
en `physics.js` (pura, gas-agnóstica, agnóstica de unidad mientras ambas
presiones sean absolutas y la misma unidad):

```
x                      = (P1_abs - P2_abs) / P1_abs
relacionPresion        = P2_abs / P1_abs
relacionPresionCritica = (2/(gamma+1))^(gamma/(gamma-1))   [gas ideal]
caidaPresionCritica    = 1 - relacionPresionCritica
```

Clasificación: `x <= 0.10` → `ok`; `0.10 < x < caidaPresionCritica` →
`advertencia`; `x >= caidaPresionCritica` → `critico`. La frontera superior
usa el valor **calculado** (0.4717182…), no el 0.472 redondeado, para que
sea consistente con `relacionPresionCritica` (0.5282817…) que se muestra en
pantalla como 0,528.

### Decisiones de mapeo (por qué estas variables y no otras)

- **No se agregó ningún input al formulario.** El requisito explícito era
  reutilizar variables existentes: sin Cv, sin xT, sin geometría de válvula
  ni diámetro de asiento.
- **P1 = `presionBarG`** (presión de operación) y **P2 = P1 menos
  `perdidaCargaMbar`**, la pérdida de carga de la línea que el motor ya
  calcula. Elegido explícitamente por Cristóbal el 2026-09-08 entre tres
  mapeos posibles. La alternativa descartada era usar `presionMinBarG`
  (29,5 barG por defecto en ese momento; 0,8 desde el 2026-09-25) como aguas arriba, interpretando el par como
  entrada/salida de un regulador — se descartó porque `presionMinBarG` es
  un parámetro de API RP 14E, no una presión aguas arriba.
  **Consecuencia conocida y aceptada:** como las pérdidas de carga están en
  mbar sobre presiones en bar, el screening da `ok` en casi toda línea
  realista; el estado `critico` solo aparece en líneas muy largas o muy
  finas a baja presión. No detecta reguladores ni válvulas.
- **γ = 1.40** vive como `H2.gammaIdeal` en `gas-h2.js`, junto al resto de
  las constantes del gas. **No es un input editable** (requisito explícito).
  No viene del Excel fuente; el valor real del H₂ es ~1.405 a 20 °C.
- **La conversión manométrica → absoluta** se hace una sola vez en
  `calc-flujo.js`, con el mismo `barGaugeAPaAbs()` (y el mismo supuesto de
  1 bar atmosférico) que ya usa la densidad real. No se duplicó ninguna
  conversión existente.
- **Fuera de dominio** (`P1_abs <= 0`, `P2_abs < 0`, `P2_abs > P1_abs`):
  devuelve `aplica: false`, `estado: 'no-aplica'` y los ratios en `null` —
  no inventa un número. Se alcanza de verdad cuando la pérdida de carga
  supera la presión absoluta disponible (p.ej. 1/4", 60 m a 0,8 barG).

### Alcance del resultado — cómo NO leerlo

La UI lo rotula "screening simplificado, no reemplaza API RP 14E" en el
subtítulo, y cada estado lleva su texto auxiliar. Es deliberado: un `ok`
acá **no** certifica que una válvula o regulador sea apto para H₂, y el
límite de 47,2 % es una aproximación de **gas ideal** — una válvula real
estrangula a otra relación de presión según su geometría y su `xT`. Ningún
estado de este bloque es una certificación general de seguridad.

### Rojo de estado crítico — extrapolación de marca

El manual de marca **no define un rojo**. Como `.resultado-tile.ok` ya
había extrapolado con Material green 800 (`#2e7d32`), `.resultado-tile.critico`
extrapola en la misma línea con Material red 800 (`#c62828`), más `#ef5350`
bajo `prefers-color-scheme: dark` para conservar contraste sobre la
superficie oscura. Anotado acá según manda el `CLAUDE.md` raíz. También se
agregó `.resultados-nota` (texto auxiliar a ancho completo dentro de la
grilla de resultados, espejo de `.resultados-subtitulo`).

### Tests

`tests/physics.test.js` cubre la función pura: los 4 casos de referencia
(100/95 → x=0,05 `ok`; 100/80 → x=0,20 `advertencia`; 100/52,8 → límite,
`critico`; 100/40 → `critico`), el límite crítico ≈ 0,528 / 0,472, las
fronteras exactas de clasificación (x=0,10 es `ok`, 0,1001 ya es
`advertencia` — atrapa un `<` puesto donde va `<=`), las tres validaciones
de dominio, el caso sin caída (x=0) y la equivalencia bar/Pa.
`tests/calc-flujo.test.js` cubre la integración: que el ratio se calcule
sobre 1,8 bar **absolutos** y no sobre 0,8 manométricos (con contraprueba
de que el x manométrico sería 2,25× mayor), los estados `advertencia` /
`critico` / `no-aplica` end-to-end, y que `velocidadErosionMS` siga
devolviendo sus valores baselineados en todos esos escenarios.

## Rediseño UX/UI de las pestañas (`index.html`/`css/styles.css`/`ui.js`, 2026-09-24, a pedido del usuario)

Pedido abierto ("mejora el UX/UI de los dashboards"). No toca motores de
cálculo ni el diseño del informe impreso; `node Hidrogeno/tests/run-all.js`
sigue en verde. Mismo cambio en `GasNatural-GLP` (ver su `CLAUDE.md`).

- **Layout entradas | resultados** (`.calc-layout`, ≥960px): antes los
  resultados iban debajo del formulario y había que bajar para ver el
  efecto de cada cambio. La columna de resultados es `position: sticky`
  — solo actúa cuando es más corta que la de entradas. Encabezado
  "Resultados · Se actualizan al escribir" porque no hay botón Calcular.
- **Ancho de contenido = cabecera** (1180px, antes 1100px): el borde del
  logo y el de los formularios no calzaban.
- **Barra de pestañas fija** (`.barra-pestanas`, sticky) y, en móvil,
  pestañas con scroll horizontal en vez de partirse en 2 líneas. Al
  cambiar de pestaña estando abajo, `initTabs()` vuelve al inicio del
  panel.
- **Pestaña activa en el hash** (`#flujo`/`#almacenamiento`/`#memoria`):
  recargar ya no vuelve a la primera pestaña, y el hub enlaza directo a
  cada herramienta (`herramientas` en `assets/gases.js`). `replaceState`,
  no un paso de historial por clic.
- **Resultados en grupos** (`grupo()` en `ui.js`): cada grupo tiene su
  propia grilla auto-fit, así los 2 KPI llenan el ancho en vez de dejar
  columnas vacías. Mismos KPI/secundarios y mismo orden que la auditoría
  del 2026-09-03, salvo en el screening de flujo sónico: el tile **Estado**
  pasa primero y a fila completa (`.ancho`), con ΔP/P₁, P₂/P₁ y el límite
  crítico debajo — el veredicto antes que los números que lo respaldan.
  "Caudal de referencia" pasa a `.secundario` como el resto de su grupo
  (`tileConUnidad()` acepta ahora `variante`).
- **Tokens de estado** `--estado-ok/-alerta/-critico` (+ `-tinte`) en
  `.viz-root`: en tema oscuro, verde Material 400 (`#66bb6a`) en vez del
  800 (quedaba ~3:1 sobre `#221f1c`) y el rojo `#ef5350` que ya existía.
  Se declaran en los mismos 3 selectores de tema que `assets/brand.css`
  — **arregla un bug**: `.critico` oscuro usaba solo
  `@media (prefers-color-scheme: dark)` e ignoraba el botón "Modo
  oscuro/claro". Los tiles de estado suman barra lateral + tinte suave
  del mismo color (el estado se lee también por forma, no solo por color).
  Extrapolación de marca conservadora, igual que el verde/rojo originales.
- **Etiquetas de tile** en `--text-secondary` (antes `--text-muted`, ~3,5:1
  sobre la card blanca). Selector de unidad inline sin caja hasta hover.
- **Validación visible**: `initValidacionNumerica()` pone `aria-invalid`
  (borde rojo + tooltip) en un `inputmode="decimal"` con texto no numérico
  — `numeroFlexible()` lo calcula como 0 y antes eso pasaba sin aviso.
  Vacío no cuenta (hay campos opcionales).
- **Tubería manual**: los 4 cajetines (DI/espesor/límite elástico/
  rugosidad) pasan de una fila sin rótulos bajo una etiqueta larga a un
  `<fieldset class="subseccion">` con etiqueta visible por campo. Mismos
  `id`, `ui.js` no cambió. Accesorios en 3 columnas (`.fila-campos.compacta`).
- **Memoria de Cálculo**: barra de acciones con jerarquía (Imprimir como
  botón primario naranja), "Importar" como botón (`<label>` de un
  `<input type=file>` visualmente oculto) en vez del control nativo sin
  estilo, línea de estado `#memoria-estado` que confirma exportar/importar
  y avisa si el `.json` es inválido (antes la promesa rechazada fallaba en
  silencio), el `<input>` se vacía tras importar para poder reimportar el
  mismo archivo, foco al nombre del tramo recién agregado, títulos
  "Diagrama de la red"/"Tramos" (`.no-imprimir`), columnas calculadas
  sombreadas (`--tinte-calculado`) y anchos mínimos en Tramo/Continúa
  desde/Material (se veían "Tramc"/"AISI 31"). `.tabla-contenedor` lleva
  `position: relative` a propósito: sin eso, el texto `.visualmente-oculto`
  (absoluto) de la cabecera escapaba del scroll y ensanchaba la página.
- **Móvil (≤600px)**: 2 tiles por fila (la pestaña Tubería y Flujo medía
  ~3000px de alto con 1 por fila, ahora ~2350px), subtítulo de la cabecera
  oculto, desvanecido a la derecha de las pestañas como pista de scroll.

## Uso desde el teléfono (`css/styles.css`/`ui.js`/`index.html`, 2026-09-25, a pedido del usuario)

Pedido: "que los dashboards sean responsivos y se puedan usar desde el
teléfono". Auditado con Playwright a 320/375/414px (y 800px tablet, 1366px
escritorio para confirmar que escritorio no cambia). No toca motores ni el
informe impreso (sigue en 1 hoja A4, medido desde ancho de teléfono y de
escritorio). El bloque CSS "Uso desde el teléfono" y las funciones
`centrarPestana()`/`initResumenMovil()` son **idénticos en los tres
módulos** — mantenerlos iguales. Todas las reglas van con `@media screen
and …` a propósito: una A4 impresa mide ~690px de ancho y activaría las
reglas de pantalla angosta sobre el informe.

- **Barra de resumen fija al pie** (`initResumenMovil()`, `.resumen-movil`,
  <960px): con entradas y resultados apilados, los KPI quedaban ~800px bajo
  el campo que se edita. La barra copia los tiles del grupo `kpis` de la
  calculadora en uso (la del último campo tocado; si no, la primera de la
  pestaña activa) y se muestra solo mientras esos resultados no están a la
  vista (IntersectionObserver, descontando 120px del alto de la barra).
  Tocarla hace scroll a `.calc-resultados` (`scroll-margin-top` descuenta
  la barra de pestañas fija). Se rearma desde el DOM con un
  MutationObserver: no conoce ningún motor, así que un KPI nuevo aparece
  solo si va en `grupo(…, 'kpis')`. Máx. 3 KPI, 2 bajo 420px. Sin
  `aria-live` propio (`.calc-resultados` ya lo tiene). Sin barra en
  Memoria de Cálculo (no tiene `.calc-resultados`).
- **16px en cajetines y 44px de área táctil** (`max-width: 600px` o
  `pointer: coarse`): bajo 16px Safari de iPhone hace zoom a la página al
  tocar un cajetín y no vuelve. Se descartó `maximum-scale=1` en el
  viewport: en Android bloquea también el zoom con los dedos (WCAG 1.4.4).
  Botones, ✕ de eliminar, control segmentado y selectores de unidad de los
  tiles suben a ≥36-44px.
- **Memoria de Cálculo en tarjetas** (≤720px): una tarjeta por tramo en
  vez de la tabla de 14 columnas con scroll horizontal (en 360px se veían
  3 columnas a la vez). CSS puro sobre la misma tabla: cada `<td>` lleva
  `data-label` con el encabezado y su unidad (`renderTablaMemoria()`), que
  `::before` muestra como etiqueta; del `<thead>` quedan solo los `<th>`
  con selector de unidad, como barra "Unidades". Las celdas calculadas
  llevan también `.col-calculada` (tinte). No cambia `leerFilaMemoria()`
  ni el fix de foco: se verificó escribir "12,5" en una tarjeta sin perder
  el foco ni la coma.
- **Diagrama de la red** dentro de `.arbol-contenedor` (overflow-x: auto);
  `renderArbol()` fija `min-width` del `<svg>` al nodo más a la derecha +
  su nombre, así se desplaza en vez de quedar cortado desde el 2º nivel.
- **Pestaña activa centrada** en la barra (`centrarPestana()` en
  `activar()`): al llegar desde el hub a `#memoria` la pestaña quedaba
  cortada fuera de pantalla.
- **Arreglos de desborde horizontal**: `.campo-ancho` (span 2) creaba una
  2ª columna implícita en grillas de 1 columna (Red de Gas de GN/GLP se
  podía arrastrar de lado); tablas de referencia dentro de `<details>` con
  scroll propio; celdas calculadas con `nowrap` que no dejaban partir
  "Pérdida acumulada [mbar]" en la tarjeta.
- Menores: Codos/Tee/Válvulas en 3 columnas también en el teléfono (antes
  2 + 1), barra de acciones de la Memoria en grilla de 2 con Imprimir a lo
  ancho, cabecera más baja, 96px de aire bajo `main` para la barra.

## Diagrama de la red como unifilar (`ui.js`/`css/styles.css`, 2026-09-25, a pedido del usuario)

Pedido: "mejora visualmente el diagrama de la red". Antes era un punto por
tramo con la fila asignada por orden de aparición dentro de cada nivel: un
hijo podía quedar en otra fila que su padre (líneas diagonales que se
cruzaban), el nombre largo se montaba sobre el nodo siguiente y no había
ningún dato del tramo. Ahora `dibujarDiagramaRed()` lo dibuja como un
unifilar:

- Cada tramo es un trozo de cañería horizontal; el primer hijo sigue en
  línea recta con su padre y los demás bajan en codo — sin cruces por
  construcción. Cada tramo final ocupa una fila; cada nivel es tan ancho
  como su texto más largo (medido con canvas, porque con la pestaña oculta
  `getComputedTextLength()` da 0; nombres de más de 240px se recortan con
  "…" y el nombre completo queda en el tooltip).
- Nombre arriba; tubería · longitud · potencia y "ΔP acum. · velocidad"
  abajo (ΔP en la unidad de la columna "Pérdida acumulada"). Grosor de la
  línea según el diámetro nominal (pista visual, el diámetro va escrito).
- Un valor fuera de un criterio de diseño va en rojo con ▲ y la cañería en
  rojo: son **las mismas marcas que la tabla del informe** —
  `evaluarCriteriosRed()` se extrajo de `renderInformeImpresion()` y la
  usan los dos. Por eso el listener de "Datos del informe" ahora también
  redibuja el diagrama.
- "Reinicia acum." = símbolo de regulador (válvula + domo) al inicio del
  tramo, en vez del anillo. Inicio de red = cuadrado. Leyenda solo de los
  símbolos presentes. Hover resalta el tramo en naranja; tooltip con ΔP
  del tramo, acumulada y velocidad.
- Colores por tokens (`--text-muted` cañería, `--brand-orange` nodos,
  `--estado-critico`), así que respeta el tema oscuro. Red vacía: texto
  "Agrega un tramo…". Ciclos de "Continúa desde" no cuelgan el dibujo.

`dibujarDiagramaRed()` y su bloque CSS son **idénticos** en Hidrógeno y
GN/GLP (copiados, no importados); cada `renderArbol*()` solo traduce su
resultado a `elementos`. Las fuentes de `DIAGRAMA.fuente*` deben coincidir
con las de `.arbol-nombre`/`.arbol-dato` en el CSS. Sigue sin imprimirse.

## Fix de ids de tramo/artefacto repetidos en la Memoria de Cálculo (`ui.js`, 2026-09-24, a pedido del usuario)

Al cargar (localStorage) o importar un proyecto, los contadores
`contadorId`/`contadorArtefactoId` partían de la **cantidad** de
elementos. Tras borrar uno intermedio (quedaban `t1`,`t3`) y recargar, el
contador quedaba en 2 y "Agregar tramo" volvía a crear `t3`: dos filas con
el mismo `data-id`, y como `tramos.map()` reemplaza por id, editar una
pisaba a la otra en el modelo (se veía al recargar: ambas con el mismo
nombre/valores); eliminar una borraba las dos. Mismo problema con los
artefactos (`a<N>`) y por la vía de "Importar proyecto".

- `maxSufijoId()` — los contadores parten del **mayor** sufijo numérico
  existente, no de la cantidad.
- `repararIdsDuplicados()` — al cargar e importar, la 2ª aparición de un
  id repetido (datos ya corruptos por el bug, en el navegador de alguien o
  en un `.json` exportado) recibe uno nuevo; un "Continúa desde" que
  apuntaba a ese id queda colgado del primero.

Verificado en navegador (borrar intermedio + recargar + agregar, importar
con ids salteados, y localStorage con ids ya repetidos). Mismo fix en
`GasNatural-GLP/js/ui.js`.

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
