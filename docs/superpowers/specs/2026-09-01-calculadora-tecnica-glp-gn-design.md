# Calculadora Técnica QUEMPIN — GLP / GN (diseño)

Fecha: 2026-09-01
Estado: alcance aprobado por el usuario (selección múltiple en chat);
decisiones de detalle tomadas por la IA dentro de ese alcance, documentadas
acá para que Cristóbal las revise cuando quiera.

## Contexto y fuentes

El usuario agregó dos workbooks nuevos a la carpeta del proyecto:

- `Libro11111111.xlsx`, hoja `Bases de Cálculo` — dimensionamiento de red
  de gas (tubería) + dimensionamiento de cilindros GLP. Soporta GLP/GN/H2
  vía un selector (`B5`), con Z real (Peng-Robinson) por gas.
- `MASTER DISEÑO.xlsm` — hojas `Estanque GLP` (capacidad de vaporización
  de estanque), `Combustión Gas` (análisis de gases de combustión para
  H2/GLP/GN/Pellet, columnas independientes por gas), `Diseño Quemador
  Atmosférico` y `Quem. Atm.` (dos borradores de dimensionamiento de
  quemador atmosférico), `Chimenea Simple` (cálculo de tiro, casi vacía —
  solo encabezados de coeficientes), y `Proveedores` (precios de
  materiales — información comercial privada).

Analizados celda por celda el 2026-09-01.

## Alcance v1 (elegido por el usuario: todo excepto lo explícitamente
excluido abajo)

1. **Red de Gas** — tubería GLP y GN.
2. **Almacenamiento (GLP)** — cilindros + estanque.
3. **Combustión** — GLP y GN.
4. **Quemador Atmosférico** — GLP y GN.

Repo, hosting y sistema de marca: sin cambios respecto al maestro
(`../../CLAUDE.md`). Sitio nuevo `GasNatural-GLP/` (ruta ya reservada en
`assets/gases.js` desde el diseño del hub), con selector de gas GLP/GN
compartiendo pestañas — mismo patrón decidido para el módulo de Hidrógeno.

## Excluido de v1 (y por qué)

- **Chimenea (tiro)**: la hoja fuente (`Chimenea Simple`) tiene solo 9
  filas de encabezados de coeficientes (norma tipo EN 13384), sin ningún
  valor calculado ni caso de ejemplo — no hay suficiente base para portar
  algo funcional sin inventar coeficientes. Si Cristóbal completa esa hoja
  con un caso de ejemplo resuelto, se puede retomar en un ciclo futuro.
- **Proveedores**: lista de precios de materiales por proveedor (CLP/USD)
  — información comercial privada, no pertenece a un sitio público.
- **H2 y Pellet dentro de "Combustión"**: la hoja `Combustión Gas` cubre
  también H2 y Pellet, pero H2 ya tiene su propio sitio (`Hidrogeno/`) y
  Pellet no es un gas — fuera del alcance de este módulo. Además las
  columnas de Pellet (`U`/`V`/`W`) tienen fórmulas `#REF!` rotas en el
  Excel fuente (celdas `V44:V48`) — no se intenta reconstruir esa parte.
- **Entalpía de gases de combustión / "calor disponible"** (filas 32-37,
  92-98 de `Combustión Gas`): están completas para GLP y H2 en el Excel,
  pero **no existen para GN** (columnas `M`/`N`, filas 32-39, vacías —
  verificado con grep, cero coincidencias). Es un output secundario sobre
  el análisis de combustión (el análisis estequiométrico y de gases de
  combustión SÍ se porta completo); se documenta como salida faltante en
  el Excel fuente, no como algo que la IA decidió omitir por su cuenta.

## Decisiones de reconciliación

### Quemador atmosférico: dos hojas borrador, ninguna completa por sí sola

`Diseño Quemador Atmosférico` (84 filas) tiene inyector + aireación
primaria completos para GN y GLP, pero la verificación de largo de llama
solo está calculada para GN (columna D) — la columna GLP (G/H) se desvía
hacia geometría de garganta Venturi con valores de ejemplo distintos, no
encadenados al mismo caso. `Quem. Atm.` (64 filas) tiene inyector +
aireación primaria + verificación de largo de llama completos y simétricos
para AMBOS gases (columnas D y H), pero su sección de "Diseño de tubo de
premezcla" son solo etiquetas sin fórmulas (inacabada).

Decisión: el motor de cálculo porta la cadena completa (inyector →
aireación primaria → relación aire-combustible → verificación de largo de
llama → garganta Venturi → tubo de mezclado) aplicada de forma coherente
al gas seleccionado, tomando cada bloque de fórmulas de la hoja que sí lo
tiene completo y simétrico (`Quem. Atm.` para inyector/aireación/llama,
`Diseño Quemador Atmosférico` para Venturi/tubo de mezclado — sus fórmulas
para esos dos bloques son las mismas físicas, solo con más filas
desarrolladas). Ninguna hoja del Excel fuente tiene este flujo completo
para los dos gases a la vez; esta es una síntesis, no un puerto 1:1 de una
sola hoja — por eso se documenta acá en vez de en el `CLAUDE.md` de
discrepancias silenciosas.

### Red de Gas: Goal Seek manual → solución algebraica cerrada

En el Excel, `B22` ("Pérdida presión") es un valor pegado a mano
(`63.39954095917689`, sin fórmula) que el usuario ajustaba con Buscar
Objetivo hasta que `B21` (potencia resultante del caudal a esa pérdida de
presión) igualara `B9` (potencia objetivo) — confirmado por la celda
`B12` ("Test") `=B9-B21`, cuyo valor cacheado es `≈ -1.39e-7`, es decir,
prácticamente cero solo cuando `B22` ya fue ajustado a mano.

Las dos fórmulas de caudal (`B20`, según el régimen de presión `B6`) son
ambas explícitamente invertibles en `ΔP` sin iteración:

- **Baja presión (`<10 kPa`)**: `Q = 9.65×10⁻⁷·⁵ · K · √(D⁵·ΔP / (SG·L))`
  → `ΔP = (Q / (9.65×10⁻⁷·⁵·K))² · SG·L / D⁵`
- **Media/alta presión (`>10 kPa`)**: `Q = 0.12426·D²·⁶²³·(P₁²−P₂²)·C`,
  con `P₂ = P₁−ΔP` y `C` constante (no depende de `ΔP`)
  → `ΔP = P₁ − √(P₁² − Q/(0.12426·D²·⁶²³·C))`

La app resuelve `ΔP` algebraicamente a partir de la potencia objetivo (sin
pedirle al usuario que itere a mano) y la compara contra la pérdida de
presión admisible (`B17`: 150 Pa GLP, 120 Pa GN) para indicar si el
diámetro elegido alcanza. Es la misma física y la misma fórmula fuente,
resuelta en la dirección útil para un dimensionamiento en vivo.

## Fuentes de verificación (fixtures de regresión)

A diferencia de `Bases de Cálculo!Red de Gas` (que solo tiene cacheado el
caso H2 por defecto, ya que `B5` es un selector), las siguientes secciones
tienen valores cacheados en Excel **independientes de cualquier selector**,
usables directamente como fixtures de regresión:

- `Bases de Cálculo!E1:G20` (cilindros GLP) — siempre GLP.
- `Estanque GLP!B2:B9` — siempre GLP.
- `Combustión Gas!I1:K47` (GLP) y `!M1:O47` (GN) — columnas dedicadas,
  no dependen de ningún selector.
- `Diseño Quemador Atmosférico` y `Quem. Atm.` — columnas C/D (GN) y G/H
  (GLP) dedicadas.

Para `Red de Gas` (pipe network), sin cacheado GLP/GN disponible, se sigue
el mismo método usado para verificar Hidrógeno post-deploy: reimplementar
la fórmula en Python de forma independiente, y usar ese resultado como
fixture — la fórmula en sí ya está verificada contra el caso H2 cacheado
(estructura idéntica, solo cambian las propiedades del gas).

## Estructura de archivos

```
GasNatural-GLP/
├── CLAUDE.md
├── index.html                    # 4 pestañas + selector de gas GLP/GN
├── css/styles.css
├── js/
│   ├── gas-glp.js                 # composición, PM, PCI/PCS, R, densidad, Z (Peng-Robinson)
│   ├── gas-gn.js                  # ídem para GN
│   ├── pipe-network.js            # fórmulas Renouard (baja / media-alta presión), tabla de tubería
│   ├── calc-red-gas.js            # pestaña 1
│   ├── calc-almacenamiento-glp.js # pestaña 2 (cilindros + estanque)
│   ├── combustion.js              # física de combustión compartida (aire esteq., gases de combustión)
│   ├── calc-combustion.js         # pestaña 3
│   ├── calc-quemador.js           # pestaña 4 (motor + física, sin separar — cadena única no reutilizada en otro lado)
│   ├── ui.js
│   └── storage.js                 # copia de Hidrogeno/js/storage.js (mismo contrato, sin dependencias cruzadas entre sitios)
└── tests/
    ├── gas-glp.test.js, gas-gn.test.js, pipe-network.test.js,
    ├── calc-red-gas.test.js, calc-almacenamiento-glp.test.js,
    ├── calc-combustion.test.js, calc-quemador.test.js
    └── run-all.js
```

`storage.js` se duplica (no se comparte vía `assets/`) porque no tiene
ninguna dependencia de datos específica de un gas — es infraestructura
genérica, y compartirla entre sitios acoplaría el ciclo de release de
ambos módulos sin necesidad real (mismo criterio ya usado: solo
`assets/brand.css`, `assets/gases.js` y `assets/gas-switcher.js` se
comparten, porque esos sí necesitan una única fuente de verdad).

## Testing

Mismo criterio que Hidrógeno: cada motor de cálculo tiene un test Node
plano que compara contra los fixtures de la sección anterior (tolerancia
relativa ~1e-6), ejecutable con `node GasNatural-GLP/tests/run-all.js`.
Verificación adicional en navegador (Playwright) contra el sitio publicado,
igual que se hizo para Hidrógeno.
