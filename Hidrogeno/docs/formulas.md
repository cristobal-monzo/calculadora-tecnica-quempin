# Hidrógeno: fórmulas, discrepancias y auditorías

Detalle de referencia: léelo solo al tocar esto. Las reglas vigentes están en `../CLAUDE.md`.

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
