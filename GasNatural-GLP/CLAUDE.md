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
usa la fórmula de `H38` para ambos gases. **Confirmar con Cristóbal** si
esto es efectivamente un error de la hoja GN o si hay una razón física
para la diferencia antes de usar este resultado para una decisión de
diseño real.

## Discrepancias del Excel fuente (documentadas, no "corregidas")

- **Dos "densidades relativas" distintas para el mismo gas**:
  `Bases de Cálculo!B18` usa GLP=2 / GN=0.59 en la fórmula de caudal de
  baja presión, mientras que la tabla `Combustión Gas!I44:K47` usa
  GLP=1.81 / GN=0.62 para el factor Cr de la rama de alta presión. Se
  preservan ambas, cada una en su fórmula original (`js/calc-red-gas.js`,
  `PROPIEDADES_RED_GAS.{densidadRelativaBaja,densidadRelativaAlta}`).
- **PCI del combustible en "Combustión"**: GLP usa un input independiente
  (`Combustión Gas!J4=48029`, editable, no atado a la composición) — GN en
  cambio SIEMPRE deriva su PCI de la composición (`N4=N2/$F$45`, sin input
  propio). El motor replica esa asimetría.
- **"Caudal total" no suma lo mismo entre GLP y GN**: GLP
  (`J10=J9+J6`) suma el caudal de combustible en condición normal;
  GN (`N9=N8+N6`) suma el caudal en condición de referencia (T/P dadas).
  Ver el comentario `sumarCaudalTotalConRef` en `js/calc-combustion.js`.
- **GN carbono/hidrógeno mezcla fracción molar y fracción de masa**:
  `Combustión Gas!F36` (X carbono de GN) pondera el término de carbono con
  fracciones de MASA y el término de hidrógeno con PORCENTAJES MOLARES de
  entrada — inconsistente entre sí, transcrito literal en `js/gas-gn.js`
  y verificado contra el valor cacheado del Excel.
- **Tabla de consumo de artefactos GLP** (`Bases de Cálculo!K33`, Cocina/
  Bajo a 10°C) = 35 kWh/día, muy por encima del patrón del resto de la
  fila (~3.5–5.8) — posible error de tipeo del Excel original (¿"3.5" en
  vez de "35"?). Transcrito literal en
  `js/calc-almacenamiento-glp.js`. **Confirmar con Cristóbal.**
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
