# CLAUDE.md — Calculadora de Otros Gases (contenido)

Ver primero el maestro: [`../CLAUDE.md`](../CLAUDE.md) (marca, hosting,
estructura del repo, patrón de UI). Este archivo cubre lo específico de este
módulo: de dónde sale cada constante, qué modelo físico se usa, cuán exacto
es y qué falta.

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

## Las 3 pestañas

| Pestaña | Motor | Qué calcula |
|---|---|---|
| Propiedades del gas | `js/termo.js` | Densidad normal, curva de presión de vapor, propiedades derivadas, notas de seguridad |
| Tubería y Flujo | `js/calc-flujo.js` | Fase, Barlow, caudales, velocidad vs. erosional, Darcy-Weisbach, screening sónico |
| Almacenamiento | `js/calc-almacenamiento.js` | Masa y autonomía, en modo **licuado** o **comprimido** |

El gas activo se elige en la barra de pestañas (`#gas-activo`) y afecta a
las tres — mismo criterio que el selector GLP/GN de `GasNatural-GLP`, pero
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
- `js/unidades-presion.js`, `js/storage.js` — copias de Hidrógeno
  (`storage.js` con prefijo propio `quempin-otros-gases::`, sin
  exportar/importar JSON porque no hay Memoria de Cálculo).

## Constantes de los gases predefinidos

| | CO₂ | NH₃ | Fuente |
|---|---|---|---|
| M [g/mol] | 44,0098 | 17,03052 | Ecuación de referencia (Span & Wagner 1996 / Gao et al. 2020) |
| Tc | 304,1282 K | 405,56 K | Punto crítico de la tabla de saturación del NIST WebBook (consultada 2026-09-25) |
| Pc [bar abs] | 73,773 | 113,634 | Ídem |
| ω | 0,22394 | 0,2557 | CO₂: Span & Wagner vía REFPROP (su 0,7·Tc cae bajo el punto triple). NH₃: **calculado por definición** con la Psat NIST a 0,7·Tc (6,3069 bar a 10,742 °C) |
| γ = cp/cv | 1,29 | 1,30 | cp de gas ideal a 298 K (JANAF) |
| µ [µPa·s] | 14,67 | 9,91 | NIST WebBook, 20 °C / 1 bar |
| PCI [MJ/kg] | — | 18,6 | Entalpías de formación: 1,5·241,83 − 45,94 = 316,8 kJ/mol |
| Grado de llenado [kg/L] | 0,68 | 0,54 | 49 CFR §173.304a(a)(2) (texto de LII/Cornell, consultado 2026-09-25) |

El grado de llenado del CO₂ **depende del cilindro**: 68 % es para
cilindros DOT de 1800 psi; la misma tabla da 70,3/73,2/74,5 % para 2000/
2265/2400 psi, y ADR P200 da 0,66 (prueba 190 bar) / 0,75 (250 bar). Por
eso en Almacenamiento es un campo editable (vacío = valor del gas) y la
ayuda pide confirmar el del recipiente real.

**Por qué las constantes NIST y no Poling et al.**: los tests comparan
contra datos NIST, y ambos (constantes y datos) salen de la misma ecuación
de estado de referencia — así el error medido es el de Peng-Robinson/
Lee-Kesler y no una mezcla con diferencias entre tablas.

## Modelo físico

- **Compresibilidad Z**: Peng & Robinson (1976), cúbica **completa**
  resuelta a la temperatura real, raíz de vapor (la mayor). Ωa y Ωb con
  todos sus dígitos (0,457235529 / 0,077796074): con los redondeados del
  paper el punto crítico de la cúbica se corre del Tc/Pc ingresado. A
  diferencia de GN/GLP, que usa el truncamiento `Z = 1 + B − A` a 20 °C fijos
  (de su Excel) — válido para GLP/GN a baja presión, no para CO₂ cerca de
  su curva de saturación.
- **Presión de vapor**: Lee & Kesler (1975), forma de Poling et al. 5ª ed.
  ec. 7-4.1/7-4.2. Temperatura de condensación a una presión dada: inversa
  por bisección.
- **Estado de fase** (`estadoFase`): `liquido` si P ≥ Psat(T) con T < Tc —
  **los motores no calculan nada de gas en ese caso** (`aplica: false`) en
  vez de dar un número con la raíz equivocada; `cerca-condensacion` si el
  margen sobre el punto de rocío es < 10 K (`MARGEN_CONDENSACION_K`,
  criterio de screening de este módulo, no normativo); `supercritico` solo
  en la zona crítica (T ≥ Tc, P ≥ Pc y Tr < 1,1, `TR_ZONA_CRITICA`) donde
  Peng-Robinson pierde exactitud; todo lo demás es `gas`.
- **Condiciones normales del Nm³**: 0 °C y 1 atm (como GN/GLP). Si a esas
  condiciones el fluido sería líquido (gas personalizado de Tc alta, p. ej.
  pentano), el Nm³ es un gas ideal hipotético (Z = 1) y la UI lo avisa.
- **Presión atmosférica**: 1,01325 bar para manométrica → absoluta.
  Hidrógeno usa 1 bar redondo por herencia de su Excel; acá no hay Excel.
- **Flujo**: misma cadena que Hidrógeno (Reynolds → Haaland → Darcy-Weisbach
  con K de accesorios 0,7/2/0,1 de `Calculos H2.xlsx`) con densidad a la
  presión de entrada. Válido mientras ΔP/P ≲ 10 % — justo el umbral de
  advertencia del screening sónico, que se reutiliza con el γ del gas.

### Diferencias deliberadas frente a `Hidrogeno/js/physics.js`

- **Barlow con diámetro EXTERIOR** (`presionMaximaDiseno`, D = DI + 2t):
  ASME B31.8 §841.1.1 y B31.12 PL-3.7.1 definen D como el diámetro exterior
  nominal. **Hidrógeno usa el DI** (`diametroMm = tuberia.diMm`), heredado
  de su Excel — da presiones máximas más altas de lo que corresponde (≈ +19 %
  para su fila de ½": 128,5 vs 108,1 bar). No se tocó Hidrógeno: queda
  anotado para decidirlo con Cristóbal.
- **Sin factor Hf**: es el derating por fragilización de **hidrógeno** de
  ASME B31.12 (Tabla IX-5A); no aplica a otros gases. El factor T
  (temperatura) sí se mantiene: es la misma tabla en B31.8 (841.1.8-1) y
  B31.12 (PL-3.7.1(b)(8)).
- **Factor de diseño F como número libre** (default 0,40), no un selector de
  Clase de Ubicación: la tabla depende de la norma que rija la línea (B31.8,
  B31.12, …) y este módulo no sabe cuál es.
- **Velocidad erosional con la forma general** de API RP 14E, Ve = C/√ρ
  (C = 100), evaluada con la densidad real a la presión de operación — sin
  el campo aparte de "presión mínima" de Hidrógeno. Es algebraicamente la
  misma fórmula (`tests/physics.test.js` lo comprueba contra el valor
  baselineado en Hidrógeno).

### Tubería

`js/tuberias.js`: acero al carbono ASTM A106 Gr. B (S = 241 MPa, rugosidad
0,045 mm), ASME B36.10M Schedule 40 y 80, de ¼" a 8". Acero y no la tabla
de Hidrógeno ni la de GN/GLP porque el NH₃ **no puede ir por cobre** y
Barlow necesita espesor y límite elástico. Los DI de Sch 40 de ⅜" a 8"
coinciden con la columna de acero de `GasNatural-GLP/js/pipe-network.js`.
Otros materiales (inoxidable, tubing): opción "Manual".

### Almacenamiento: por qué dos modos

A temperatura ambiente el CO₂ condensa sobre ~57 bar y el NH₃ sobre
~8,6 bar: en cilindros y estanques están **licuados**, y ahí PV=ZnRT no
dice nada útil. Modo **licuado**: masa = capacidad de agua × grado de
llenado; presión = presión de vapor a esa temperatura (sobre Tc no se
estima — depende de la densidad de llenado, y es justo la zona donde
Peng-Robinson yerra más). Modo **comprimido**: PV=ZnRT con Z de
Peng-Robinson; si el gas condensaría a esa (P, T), no calcula y sugiere el
modo licuado. El modo y el grado de llenado ingresado se recuerdan **por
gas**; el default del modo es "licuado" si el gas tiene grado de llenado.

## Exactitud frente a NIST (`tests/termo.test.js`)

| Estado | Error de densidad (Peng-Robinson) |
|---|---|
| CO₂ y NH₃ a 1 atm (densidad normal) | 0,05 % / −0,5 % |
| NH₃ 20 °C / 5 bar | −1,5 % |
| CO₂ 20 °C / 50 bar (7 bar bajo saturación) | +2,1 % |
| N₂ 20 °C / 200 bar (Tr 2,3) | +2,9 % |
| CO₂ 92 °C / 100 bar (Tr 1,20) | +1,4 % |
| **CO₂ 40 °C / 100 bar (Tr 1,03)** | **−10,3 %** — zona crítica, la UI advierte |
| **NH₃ 160 °C / 150 bar (Tr 1,07)** | **−5,6 %** — ídem |

Presión de vapor (Lee-Kesler): CO₂ ≤ 0,5 % entre −20 y 30 °C; NH₃ ≤ 1 %
sobre 0 °C, −2,7 % a −20 °C y −4,6 % en su punto de ebullición (−33,3 °C) —
el NH₃ es polar y la correlación generalizada pierde exactitud a baja Tr.

**Viscosidad constante**: se usa la de gas a ~20 °C y 1 bar. A alta presión
queda corta (CO₂ a 50 bar/20 °C: 16,5 vs 14,7 µPa·s, −11 %; en zona
supercrítica ×3). Afecta a Reynolds y, poco, al factor de fricción en
régimen turbulento rugoso; la nota de estado supercrítico lo menciona.

## Verificar cambios

```bash
node OtrosGases/tests/run-all.js
```

Sin Excel, los baselines de `calc-flujo.test.js` y
`calc-almacenamiento.test.js` son los del motor el 2026-09-25, **más** una
relación física independiente por bloque (Reynolds a mano, conservación de
masa, ΔP de accesorios = ΣK·ρv²/2, masa licuada = V × llenado) para que el
baseline no sea circular. Un cambio intencional de fórmula: actualizar el
baseline y documentarlo acá.

Verificado en navegador 2026-09-25 (escritorio 1360 px y móvil 390 px,
claro y oscuro): CO₂ a 60 barG marca líquido; NH₃ en kW; kg/h → kW
convierte el número (50 kg/h de NH₃ → 258,3 kW) y al pasar a CO₂ (sin PCI)
kW se deshabilita y vuelve a kg/h; gas personalizado tipeado carácter a
carácter con coma decimal sin perder foco, con errores listados mientras
está incompleto.

## Fuera de alcance (v1)

- **Memoria de Cálculo** (red ramificada + informe impreso) — existe en
  Hidrógeno y GN/GLP; portarla acá es el siguiente paso natural si se
  necesita entregar memorias de CO₂/NH₃.
- Más de un gas personalizado guardado a la vez, y exportar/importar gases.
- Flujo de **líquido** (CO₂/NH₃ en fase líquida): el módulo solo detecta el
  caso y no calcula.
- Mezclas de gases (se puede ingresar una como gas personalizado con
  pseudo-constantes críticas, bajo responsabilidad del usuario).
- Viscosidad dependiente de P y T.
