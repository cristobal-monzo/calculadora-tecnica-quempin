# CLAUDE.md — Calculadora de Gas Natural / GLP

Ver primero el maestro: [`../CLAUDE.md`](../CLAUDE.md).

| Si vas a tocar… | Lee antes |
|---|---|
| Una fórmula o constante: Red de Gas, Renouard, Darcy-Weisbach, cilindros, combustión, quemador, D.S. 66, prueba de hermeticidad, tabla de tuberías | [docs/formulas.md](docs/formulas.md), con reconciliaciones, correcciones y discrepancias |
| La pantalla: unidades, decimales, pestañas, teléfono, diagrama unifilar | [docs/interfaz.md](docs/interfaz.md) |
| El informe de Memoria de Cálculo: membrete, firma, numeración, una sola hoja, criterios | [docs/informe.md](docs/informe.md) |

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

## Las 5 pestañas y su hoja de origen

| Pestaña | Hoja Excel | Motor |
|---|---|---|
| Red de Gas | `Bases de Cálculo` (izquierda) | `js/pipe-network.js` + `js/calc-red-gas.js` |
| Almacenamiento (solo GLP) | `Bases de Cálculo` (cilindros) + `Estanque GLP` | `js/calc-almacenamiento-glp.js` |
| Combustión | `Combustión Gas` (columnas GLP/GN) | `js/combustion.js` + `js/calc-combustion.js` |
| Quemador Atmosférico | `Quem. Atm.` + `Diseño Quemador Atmosférico` | `js/calc-quemador.js` |
| Memoria de Cálculo | (sin hoja fuente — no existe en el Excel) | `js/calc-memoria-red-gas.js` |

Propiedades de gas: `js/gas-glp.js`, `js/gas-gn.js` (composición → PM, R,
densidad, fracciones de carbono/hidrógeno para combustión).

## Reglas que se rompen sin que se note

- **Los Excel fuente nunca se versionan ni se publican**: traen fórmulas propietarias y precios reales de proveedores.
- **Unidades de presión**: cada campo tiene su selector, no hay uno global. `js/unidades-presion.js` tiene una copia en `Hidrogeno`.
- **Decimales**: los campos manuales son `type="text" inputmode="decimal"`, para aceptar coma o punto.
- **La Memoria toma el gas de toda la red, no por tramo**, y corre sobre Red de Gas (Hidrógeno usa Barlow).
- **No reescribas el `innerHTML` de la tabla en cada tecla** (se pierde el foco), y los contadores de id parten del mayor existente.
- **El informe siempre entra en una sola hoja A4.**
- **Límites del D.S. 66**: opcionales (`proyecto.incluirLimitesDS66`); un proyecto anterior sin el campo queda sin incluir.
- **Prueba de hermeticidad** (D.S. 66 f.11): tiempo en minutos = volumen de la tubería (m³) × 214, con un mínimo de 15.
- **No toda diferencia entre GLP y GN es un error**: lee § Discrepancias en `docs/formulas.md` antes de «corregir» una.

## Verificar cambios a una fórmula

```bash
node GasNatural-GLP/tests/run-all.js
```

La rama de Red de Gas para GLP/GN no tiene caso cacheado en el Excel
(`Bases de Cálculo!B5` es un selector, el archivo quedó guardado en modo
H2) — sus tests verifican autoconsistencia algebraica (invertir el caudal
calculado debe devolver el `ΔP` de entrada), el caso H2 sí cacheado de
baja presión (misma fórmula, gas-agnóstica) y, desde el 2026-09-25, dos
referencias independientes: Renouard clásico (baja y media presión) y
Darcy-Weisbach isotérmico (media presión). La autoconsistencia sola no
detecta una fórmula mal escrita (ver "Auditoría de coherencia física" en `docs/formulas.md`). El resto de los motores (cilindros,
estanque, combustión GLP/GN, quemador GLP/GN) sí tienen valores cacheados
reales del Excel como fixtures, independientes del selector de gas.

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
