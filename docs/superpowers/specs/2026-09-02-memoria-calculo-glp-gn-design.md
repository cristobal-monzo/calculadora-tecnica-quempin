# Memoria de Cálculo — GLP/GN (diseño)

Fecha: 2026-09-02
Estado: aprobado por el usuario en chat (alcance + las dos decisiones de
modelado de abajo). Detalle de implementación documentado acá para que
Cristóbal lo revise antes de generar el plan de implementación.

## Contexto

Hidrógeno ya tiene una pestaña "Memoria de Cálculo": una red ramificada de
tramos (árbol padre/hijo) donde cada tramo reusa la física de "Tubería y
Flujo" y se reporta una pérdida acumulada sumando la cadena de padres.
GasNatural-GLP (Red de Gas, Almacenamiento, Combustión, Quemador
Atmosférico) no tiene ninguna pestaña equivalente. El pedido es agregarla,
mirroring lo que ya existe en Hidrógeno, adaptado al motor de Red de Gas
(Renouard baja/media-alta presión + Peng-Robinson) en vez del de Barlow.

## Decisiones de modelado (confirmadas por el usuario)

1. **Gas por red, no por tramo.** GasNatural-GLP tiene un selector global
   de Combustible (GLP/GN) que ya gobierna las otras 4 pestañas. La nueva
   Memoria de Cálculo sigue ese mismo selector — un solo gas para toda la
   red de tramos, no un campo de gas por fila. Cambiar el selector global
   recalcula toda la tabla (mismo hook `alCambiarCombustible` que ya usan
   Red de Gas/Combustión/Quemador/Almacenamiento).
2. **Sin encadenar presión entre tramos.** Cada tramo recibe su propia
   "presión inicial" como input manual, igual que hoy en Hidrógeno (donde
   la Memoria no retroalimenta la presión de un tramo hijo con la presión
   final del padre). La "pérdida acumulada" sigue sumando hacia arriba
   solo para reportar, sin tocar la presión inicial de ningún tramo. Esto
   evita la ambigüedad de qué hacer cuando el tramo padre está en baja
   presión (que no calcula presión final) o cuando el régimen cambia a
   mitad de la red.

## Motor de cálculo: `GasNatural-GLP/js/calc-memoria-red-gas.js`

**No reimplementa la física.** A diferencia de tener que portar Renouard/
Peng-Robinson otra vez, cada tramo se pasa directo a `calcularRedGas()`
(ya existente en `calc-red-gas.js`), inyectando el `gas` vigente (el
combustible global) en cada llamada. Esto significa que cualquier
corrección futura a Red de Gas se hereda automáticamente en Memoria, sin
duplicar fórmulas — mismo espíritu que Hidrógeno reusa `physics.js`/
`gas-h2.js` en vez de reimplementarlos por tramo.

```js
import { calcularRedGas } from './calc-red-gas.js';

function calcularTramoIndividual(tramo, gas) {
  const resultado = calcularRedGas({ ...tramo, gas });
  return { ...tramo, ...resultado };
}

export function calcularRedMemoria(tramos, gas) {
  const calculados = tramos.map((t) => calcularTramoIndividual(t, gas));
  // ... mismo patrón de validación de padres + detección de ciclos +
  // acumulación de perdidaPresionRequeridaPa que calcularRed() en
  // Hidrogeno/js/calc-memoria.js (porId, perdidaAcumulada con cache +
  // set "enProgreso" para detectar ciclos, mismos mensajes de error).
}
```

Cada tramo trae: `id`, `nombre`, `continuaDesdeId`, `regimenPresion`
(`'<10 kPa'` | `'>10 kPa'`), `pulgadas` (nominal, tabulado) o
`tuberiaManual: { diametroMm, k }`, `material` (`'Acero Sch40'` |
`'Cobre tipo L'`, ignorado cuando el diámetro es manual — mismo criterio
que el tramo único de Red de Gas), `potenciaKw`, `longitudM`,
`presionInicialPa`, `temperaturaC`. `calcularRedGas` ya devuelve
`caudalObjetivoM3H`, `velocidadMS`, `perdidaPresionRequeridaPa`,
`perdidaAdmisiblePa`, `tuberiaAdecuada`, `presionFinalPa` (`null` en baja
presión) por tramo — se reexponen tal cual en cada fila.

Errores (tubería no encontrada, caudal objetivo que excede lo que el
diámetro entrega a la presión inicial dada, ciclo en la red, padre
inexistente): igual que Hidrógeno, **no se aíslan por fila** — cualquier
excepción de un tramo aborta el cálculo completo de la red y la UI
muestra una sola fila de error reemplazando toda la tabla (mismo patrón
que `recalcularMemoria()` en `Hidrogeno/js/ui.js`, no una innovación).

## Qué NO se agrega (mismo límite que Hidrógeno ya documenta)

Hidrógeno excluye explícitamente de su Memoria el chequeo de velocidad de
erosión por tramo, aunque existe en "Tubería y Flujo" (`Hidrogeno/CLAUDE.md`,
"Fuera de alcance"). Se aplica el mismo criterio acá: **no se agrega un
indicador "Tubería adecuada" por tramo** a la tabla, aunque `calcularRedGas`
lo devuelve gratis — agregarlo sería una columna más en una tabla ya
ancha, y excede lo que Hidrógeno mismo decidió mostrar en su propia
Memoria. Si en un futuro se decide agregarlo a los dos módulos, que sea
una decisión explícita y simétrica entre ambos, no un agregado unilateral
acá.

## Tabla (`GasNatural-GLP/index.html` + `ui.js`)

Columnas (mismo patrón de Hidrógeno: tabla editable con filas `<input>`/
`<select>` inline, recálculo completo de tbody en cada cambio):

Tramo | Continúa desde | Régimen de presión | Diámetro (nominal + opción
manual con sub-bloque mm/factor K, igual a Red de Gas) | Material (oculto
cuando el diámetro es manual — la visibilidad se resuelve gratis en el
render, sin wiring extra, porque toda la fila se regenera desde los datos
del tramo en cada cambio, igual que el sub-bloque manual de tubería de
Hidrógeno) | Potencia [kW] | Longitud [m] | Presión inicial (selector de
unidad propio en la cabecera de columna) | Temp. [°C] | Caudal objetivo
[m³/h] | Velocidad [m/s] | Pérdida requerida (selector de unidad propio) |
Pérdida acumulada (selector de unidad propio) | Presión final (selector
de unidad propio; celda muestra "—" cuando es `null`, régimen <10 kPa) |
(eliminar).

Valores por defecto de un tramo nuevo (`tramoPorDefecto()`): mismos que
los defaults del formulario de Red de Gas — `regimenPresion: '<10 kPa'`,
`material: 'Acero Sch40'`, `pulgadas: 0.75`, `potenciaKw: 30`,
`longitudM: 10`, `presionInicialPa: 1000`, `temperaturaC: 15`.

## Resto de la funcionalidad: mismo patrón 1:1 que Hidrógeno

- **Árbol SVG** (`<svg id="memoria-arbol">`): mismo algoritmo de niveles/
  filas, tooltip mostrando nombre + pérdida acumulada formateada + velocidad.
- **Exportar/Importar proyecto (.json)**: requiere agregar `exportarJSON`/
  `importarJSON` a `GasNatural-GLP/js/storage.js` (hoy solo tiene
  `guardar`/`cargar` — se portan las dos funciones tal cual están en
  `Hidrogeno/js/storage.js`, incluyendo el comentario de "copia funcional,
  sin dependencia cruzada" que ya usan las otras copias de este módulo).
- **Imprimir/Guardar PDF**: tabla de impresión recortada a las columnas
  esenciales — Tramo | Continúa desde | Presión inicial | Longitud |
  Diámetro | Pérdida acumulada (mismas 6 columnas que la de Hidrógeno).
- **Autoguardado en localStorage**: mismo patrón (`guardar('memoria-red-gas', tramos)`
  en cada recálculo, `cargar('memoria-red-gas', null) ?? [tramoPorDefecto()]`
  al iniciar) — clave de storage distinta a la de Red de Gas (`'red-gas'`)
  para no pisarla.
- **CSS**: portar a `GasNatural-GLP/css/styles.css` las reglas que hoy
  solo existen en `Hidrogeno/css/styles.css` para esta pestaña (estilos de
  `#memoria-tabla input/select`, `.mem-tuberia-manual`, `.mem-eliminar`,
  `#memoria-arbol`, `.select-unidad-columna`, y el bloque `@media print`
  que oculta pestañas/`.no-imprimir` y fija `.tab-panel.active` visible).

## Archivos nuevos

- `GasNatural-GLP/js/calc-memoria-red-gas.js`
- `GasNatural-GLP/tests/calc-memoria-red-gas.test.js` — mismo tipo de
  cobertura que `Hidrogeno/tests/calc-memoria.test.js`: caso feliz de 2-3
  tramos encadenados, detección de ciclo, padre inexistente, tramo con
  diámetro manual, y un caso por cada régimen de presión (baja y
  media/alta, para ejercitar `presionFinalPa` no-null en uno de los dos).

## Archivos modificados

`index.html` (nueva pestaña + panel), `ui.js` (nueva sección, siguiendo el
patrón de las 4 pestañas existentes: `poblarSelectDiametro` ya reusable
tal cual, funciones nuevas `leerFilaMemoria`/`renderTablaMemoria`/
`renderArbol`/`recalcularMemoria`/`initMemoria` calcadas de Hidrógeno),
`css/styles.css`, `storage.js`, `tests/run-all.js`, `CLAUDE.md`.

## Verificación

```bash
node GasNatural-GLP/tests/run-all.js
```

Todos los tests existentes deben seguir pasando (no se toca ninguna
fórmula de Red de Gas, solo se reusa); el archivo nuevo se agrega a la
secuencia de `run-all.js`.
