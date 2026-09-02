import { calcularFlujo } from './calc-flujo.js';
import { calcularAlmacenamiento, formatearHoras } from './calc-almacenamiento.js';
import { calcularRed } from './calc-memoria.js';
import { TABLA_TUBERIA } from './gas-h2.js';
import { guardar, cargar, exportarJSON, importarJSON } from './storage.js';
import { initSelectorGas } from '../../assets/gas-switcher.js';
import { aPa, desdePa, formatearPresion, opcionesUnidadPresion } from './unidades-presion.js';

function initTabs() {
  const botones = document.querySelectorAll('.tab');
  const paneles = document.querySelectorAll('.tab-panel');
  botones.forEach((boton) => {
    boton.addEventListener('click', () => {
      botones.forEach((b) => b.classList.remove('active'));
      paneles.forEach((p) => p.classList.remove('active'));
      boton.classList.add('active');
      document.querySelector(`[data-panel="${boton.dataset.tab}"]`).classList.add('active');
    });
  });
}

function tile(valor, etiqueta, alerta = false) {
  return `<div class="resultado-tile${alerta ? ' alerta' : ''}"><div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div></div>`;
}

/* --- Selectores de unidad de presión, uno independiente por campo/resultado --- */

// Cablea un <select> de unidad junto a un <input> de presión: al cambiar la
// unidad, convierte el número mostrado para conservar la presión física
// (ej. 1000 Pa -> 10 mbar), sin tocar el motor de cálculo. El evento 'input'
// del <select> burbujea hasta el listener del formulario, así que no hace
// falta disparar un recálculo aparte. Idempotente: se puede volver a llamar
// varias veces sin duplicar el listener.
function initSelectorUnidadCampo(inputId, selectId) {
  const input = document.getElementById(inputId);
  const select = document.getElementById(selectId);
  select.dataset.unidadAnterior = select.value;
  if (select.dataset.unidadCableada) return;
  select.dataset.unidadCableada = '1';
  select.addEventListener('input', () => {
    const valorPa = aPa(Number(input.value) || 0, select.dataset.unidadAnterior);
    input.value = Number(desdePa(valorPa, select.value).toPrecision(6));
    select.dataset.unidadAnterior = select.value;
  });
}

// Lee un campo de presión (input + select de unidad) convertido a la unidad
// que espera el motor de cálculo correspondiente.
function leerPresion(inputId, selectId, unidadDestino) {
  const valor = Number(document.getElementById(inputId).value);
  const unidadOrigen = document.getElementById(selectId).value;
  return desdePa(aPa(valor, unidadOrigen), unidadDestino);
}

// Tile de resultado en presión con su propio selector de unidad inline —
// cambiar la unidad solo redibuja ese tile desde el valor en Pa ya
// cacheado en el DOM, no dispara un recálculo. `unidadesTiles` es el mapa
// persistido (clave -> unidad elegida) del panel dueño del tile.
function tilePresion(valorNativo, unidadNativa, etiqueta, clave, unidadesTiles, alerta = false) {
  const valorPa = aPa(valorNativo, unidadNativa);
  const unidad = unidadesTiles[clave] || unidadNativa;
  return `<div class="resultado-tile${alerta ? ' alerta' : ''}" data-tile-presion="${clave}" data-pa="${valorPa}">
    <div class="valor"><span class="valor-numero">${formatearPresion(valorPa, unidad)}</span><select class="select-unidad-inline" data-tile-presion-unidad="${clave}">${opcionesUnidadPresion(unidad)}</select></div>
    <div class="etiqueta">${etiqueta}</div>
  </div>`;
}

// Delegación de clic/cambio para los selectores inline de los tiles de un
// panel de resultados: redibuja solo el tile afectado desde su data-pa.
function initTilesPresion(contenedorId, unidadesTiles, claveStorage) {
  document.getElementById(contenedorId).addEventListener('change', (evento) => {
    const clave = evento.target.dataset.tilePresionUnidad;
    if (!clave) return;
    unidadesTiles[clave] = evento.target.value;
    guardar(claveStorage, unidadesTiles);
    const contenedorTile = evento.target.closest('[data-tile-presion]');
    contenedorTile.querySelector('.valor-numero').textContent = formatearPresion(Number(contenedorTile.dataset.pa), evento.target.value);
  });
}

function formatearPulgadas(valor) {
  const entero = Math.floor(valor);
  const resto = valor - entero;
  if (resto === 0) return `${entero}"`;
  const denominador = 16;
  let numerador = Math.round(resto * denominador);
  let d = denominador;
  const mcd = (a, b) => (b === 0 ? a : mcd(b, a % b));
  const g = mcd(numerador, d);
  numerador /= g;
  d /= g;
  return entero > 0 ? `${entero}-${numerador}/${d}"` : `${numerador}/${d}"`;
}

function poblarSelectTuberia(select) {
  select.innerHTML = TABLA_TUBERIA.map(
    (f) => `<option value="${f.pulgadas}">${formatearPulgadas(f.pulgadas)} — DI ${f.diMm} mm</option>`
  ).join('');
}

/* ---------------------------------------------------------------------- */
/* Pestaña 1 — Tubería y Flujo                                            */
/* ---------------------------------------------------------------------- */

function leerFlujoForm() {
  const num = (id) => Number(document.getElementById(id).value);
  return {
    presionBarG: leerPresion('flujo-presion', 'flujo-presion-unidad', 'bar'),
    temperaturaC: num('flujo-temperatura'),
    potenciaKw: num('flujo-potencia'),
    tuberiaPulgadas: Number(document.getElementById('flujo-tuberia').value),
    presionMinBarG: leerPresion('flujo-presion-min', 'flujo-presion-min-unidad', 'bar'),
    largoM: num('flujo-largo'),
    codos: num('flujo-codos'),
    tees: num('flujo-tees'),
    valvulas: num('flujo-valvulas'),
    factorDiseno: num('flujo-factor-diseno'),
    factorUnion: num('flujo-factor-union'),
    unidadNormalizado: document.getElementById('flujo-unidad-normalizado').value,
    unidadH2: document.getElementById('flujo-unidad-h2').value,
  };
}

const unidadesTilesPresionFlujo = cargar('unidades-tiles-presion-flujo', {});

function renderResultadosFlujo(r) {
  const cercaDeErosion = r.velocidadFlujoMS >= r.velocidadErosionMS * 0.8;
  document.getElementById('resultados-flujo').innerHTML = [
    tilePresion(r.presionMaxDisenoBar, 'bar', 'Presión máxima de diseño (Barlow, ASME B31.12)', 'presion-max-diseno', unidadesTilesPresionFlujo),
    tile(r.factorHfAplicado.toFixed(3), 'Factor Hf aplicado (Tabla IX-5A, fragilización por H₂)'),
    tile(`${r.densidadKgM3.toFixed(4)} kg/m³`, 'Densidad real'),
    tile(`${r.flujoMasicoKgH.toFixed(3)} kg/h`, 'Flujo másico de H₂'),
    tile(`${r.flujoVolNormalizado.toFixed(2)}`, 'Flujo volumétrico normalizado'),
    tile(`${r.flujoVolH2.toFixed(3)}`, 'Flujo volumétrico H₂'),
    tile(`${r.velocidadFlujoMS.toFixed(2)} m/s`, 'Velocidad de flujo', cercaDeErosion),
    tile(`${r.velocidadErosionMS.toFixed(2)} m/s`, 'Velocidad de erosión (límite)'),
    tilePresion(r.perdidaCargaMbar, 'mbar', 'Pérdida de carga', 'perdida-carga', unidadesTilesPresionFlujo),
    tile(r.zDiseno.toFixed(6), 'Factor Z (diseño)'),
    tile(r.reynolds.toFixed(0), 'Número de Reynolds'),
    tile(r.factorFriccion.toFixed(5), 'Factor de fricción (Haaland)'),
  ].join('');
}

function renderTablaTuberia() {
  const filas = TABLA_TUBERIA.map(
    (f) => `<tr><td>${formatearPulgadas(f.pulgadas)}</td><td>${f.diMm}</td><td>${f.espesorMm}</td><td>${f.limiteElasticoMPa}</td><td>${f.rugosidadMm}</td></tr>`
  ).join('');
  document.getElementById('tabla-tuberia-flujo').innerHTML =
    `<thead><tr><th>Nominal</th><th>DI [mm]</th><th>Espesor [mm]</th><th>S mín. [MPa]</th><th>Rugosidad [mm]</th></tr></thead><tbody>${filas}</tbody>`;
}

function initTeoriaFlujo() {
  const form = document.getElementById('form-flujo');
  const select = document.getElementById('flujo-tuberia');
  poblarSelectTuberia(select);
  renderTablaTuberia();

  const guardados = cargar('flujo', null);
  if (guardados) {
    Object.entries(guardados).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.value = valor;
    });
  } else {
    select.value = '0.5';
  }

  initSelectorUnidadCampo('flujo-presion', 'flujo-presion-unidad');
  initSelectorUnidadCampo('flujo-presion-min', 'flujo-presion-min-unidad');
  initTilesPresion('resultados-flujo', unidadesTilesPresionFlujo, 'unidades-tiles-presion-flujo');

  function recalcular() {
    const inputs = leerFlujoForm();
    const resultado = calcularFlujo(inputs);
    renderResultadosFlujo(resultado);
    guardar('flujo', Object.fromEntries(
      Array.from(form.querySelectorAll('input, select')).map((el) => [el.id, el.value])
    ));
  }

  form.addEventListener('input', recalcular);
  recalcular();
}

/* ---------------------------------------------------------------------- */
/* Pestaña 2 — Almacenamiento                                             */
/* ---------------------------------------------------------------------- */

function leerAlmacenamientoForm() {
  const num = (id) => Number(document.getElementById(id).value);
  return {
    potenciaKw: num('alm-potencia'),
    temperaturaC: num('alm-temperatura'),
    presionBarAbs: leerPresion('alm-presion', 'alm-presion-unidad', 'bar'),
    volumenM3: num('alm-volumen'),
    unidadCaudalReferencia: document.getElementById('alm-unidad-caudal').value,
  };
}

function renderResultadosAlmacenamiento(r) {
  document.getElementById('resultados-almacenamiento').innerHTML = [
    tile(`${r.masaAlmacenadaKg.toFixed(3)} kg`, 'Masa de H₂ almacenada (PV=ZnRT)'),
    tile(r.zAlmacenamiento.toFixed(3), 'Factor de compresibilidad Z'),
    tile(`${r.densidadRealKgM3.toFixed(3)} kg/m³`, 'Densidad real en el estanque'),
    tile(`${r.volumenNormalizadoNm3.toFixed(2)} Nm³`, 'Volumen normalizado'),
    tile(formatearHoras(r.autonomiaHoras), 'Autonomía (hh:mm:ss)'),
    tile(`${r.consumoKgH.toFixed(3)} kg/h`, 'Consumo del quemador'),
    tile(`${r.consumoNm3H.toFixed(3)} Nm³/h`, 'Consumo del quemador (normalizado)'),
    tile(`${r.caudalReferenciaM3H.toFixed(4)}`, 'Caudal de referencia (línea capilar Ø¼")'),
    tile(`${r.velocidadReferenciaMS.toFixed(3)} m/s`, 'Velocidad de referencia (línea capilar Ø¼")'),
    tile(formatearHoras(r.tiempoLlenadoHoras), 'Tiempo de llenado (hh:mm:ss)'),
  ].join('');
}

function initAlmacenamiento() {
  const form = document.getElementById('form-almacenamiento');
  const guardados = cargar('almacenamiento', null);
  if (guardados) {
    Object.entries(guardados).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.value = valor;
    });
  }

  initSelectorUnidadCampo('alm-presion', 'alm-presion-unidad');

  function recalcular() {
    const resultado = calcularAlmacenamiento(leerAlmacenamientoForm());
    renderResultadosAlmacenamiento(resultado);
    guardar('almacenamiento', Object.fromEntries(
      Array.from(form.querySelectorAll('input, select')).map((el) => [el.id, el.value])
    ));
  }

  form.addEventListener('input', recalcular);
  recalcular();
}

/* ---------------------------------------------------------------------- */
/* Pestaña 3 — Memoria de Cálculo (red ramificada)                        */
/* ---------------------------------------------------------------------- */

let tramos = [];
let contadorId = 0;

function tramoPorDefecto() {
  contadorId += 1;
  return {
    id: `t${contadorId}`, nombre: `Tramo ${contadorId}`, continuaDesdeId: null,
    presionMPa: 0.5, longitudM: 5, potenciaKw: 12, tuberiaPulgadas: 0.25,
    material: 'AISI 316L', temperaturaC: 20,
  };
}

function renderTablaMemoria(resultado) {
  const opcionesPadre = (actualId) => ['<option value="">— raíz —</option>'].concat(
    tramos.filter((t) => t.id !== actualId).map((t) => `<option value="${t.id}">${t.nombre}</option>`)
  ).join('');

  // Unidad elegida en cada cabecera de columna de presión — independiente
  // entre las tres, no hay una unidad "de la tabla". El dato canónico en
  // `tramos` sigue siendo MPa (motor de cálculo); esto solo cambia cómo se
  // muestra/lee, ver leerFilaMemoria().
  const unidadPresion = document.getElementById('memoria-presion-unidad').value;
  const unidadPerdidaParcial = document.getElementById('memoria-perdida-parcial-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;

  document.getElementById('memoria-tabla-cuerpo').innerHTML = resultado.map((t) => `
    <tr data-id="${t.id}">
      <td><input type="text" class="mem-nombre" value="${t.nombre}"></td>
      <td><select class="mem-padre">${opcionesPadre(t.id)}</select></td>
      <td><input type="number" step="any" class="mem-presion" value="${Number(desdePa(aPa(t.presionMPa, 'MPa'), unidadPresion).toPrecision(6))}"></td>
      <td><input type="number" step="any" class="mem-largo" value="${t.longitudM}"></td>
      <td><input type="number" step="any" class="mem-potencia" value="${t.potenciaKw}"></td>
      <td><select class="mem-tuberia">${TABLA_TUBERIA.map((f) => `<option value="${f.pulgadas}"${f.pulgadas === t.tuberiaPulgadas ? ' selected' : ''}>${formatearPulgadas(f.pulgadas)}</option>`).join('')}</select></td>
      <td><input type="text" class="mem-material" value="${t.material}"></td>
      <td><input type="number" step="any" class="mem-temp" value="${t.temperaturaC}"></td>
      <td>${t.densidadKgM3.toFixed(4)}</td>
      <td>${t.velocidadFlujoMS.toFixed(2)}</td>
      <td>${formatearPresion(aPa(t.perdidaParcialMbar, 'mbar'), unidadPerdidaParcial)}</td>
      <td>${formatearPresion(aPa(t.perdidaAcumuladaMbar, 'mbar'), unidadPerdidaAcumulada)}</td>
      <td><button type="button" class="mem-eliminar no-imprimir">✕</button></td>
    </tr>
  `).join('');

  tramos.forEach((t) => {
    const selectPadre = document.querySelector(`#memoria-tabla-cuerpo tr[data-id="${t.id}"] .mem-padre`);
    if (selectPadre) selectPadre.value = t.continuaDesdeId ?? '';
  });
}

function renderArbol(resultado) {
  const porId = Object.fromEntries(resultado.map((t) => [t.id, t]));
  const nivelDe = (t, visitados = new Set()) => {
    if (!t.continuaDesdeId || visitados.has(t.id)) return 0;
    visitados.add(t.id);
    return 1 + nivelDe(porId[t.continuaDesdeId], visitados);
  };
  const anchoNivel = 140, altoFila = 40;
  const nodos = resultado.map((t) => ({ t, nivel: nivelDe(t) }));
  const porNivel = new Map();
  nodos.forEach((n) => {
    const fila = porNivel.get(n.nivel) ?? 0;
    n.fila = fila;
    porNivel.set(n.nivel, fila + 1);
  });

  const svg = document.getElementById('memoria-arbol');
  const lineas = nodos.filter((n) => n.t.continuaDesdeId).map((n) => {
    const padre = nodos.find((p) => p.t.id === n.t.continuaDesdeId);
    if (!padre) return '';
    return `<line x1="${padre.nivel * anchoNivel + 60}" y1="${padre.fila * altoFila + 20}" x2="${n.nivel * anchoNivel + 60}" y2="${n.fila * altoFila + 20}" stroke="var(--gridline)" stroke-width="2"/>`;
  }).join('');
  const circulos = nodos.map((n) => `
    <g>
      <circle cx="${n.nivel * anchoNivel + 60}" cy="${n.fila * altoFila + 20}" r="8" fill="var(--brand-orange)"/>
      <title>${n.t.nombre} — ${n.t.perdidaAcumuladaMbar.toFixed(2)} mbar acumulados, ${n.t.velocidadFlujoMS.toFixed(2)} m/s</title>
      <text x="${n.nivel * anchoNivel + 74}" y="${n.fila * altoFila + 24}" font-size="12" fill="var(--text-primary)">${n.t.nombre}</text>
    </g>`).join('');
  svg.setAttribute('height', String(Math.max(...porNivel.values(), 1) * altoFila + 20));
  svg.innerHTML = lineas + circulos;
}

function porNombreTramo(id) {
  return id ? (tramos.find((t) => t.id === id)?.nombre ?? '') : '— raíz —';
}

function recalcularMemoria() {
  let resultado;
  try {
    resultado = calcularRed(tramos);
  } catch (error) {
    document.getElementById('memoria-tabla-cuerpo').innerHTML =
      `<tr><td colspan="13" class="resultado-tile alerta">${error.message}</td></tr>`;
    return;
  }
  renderTablaMemoria(resultado);
  renderArbol(resultado);

  const unidadPresion = document.getElementById('memoria-presion-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  document.getElementById('memoria-impresion-th-presion').textContent = `Presión [${unidadPresion}]`;
  document.getElementById('memoria-impresion-th-perdida').textContent = `Pérdida acumulada [${unidadPerdidaAcumulada}]`;
  document.getElementById('memoria-tabla-impresion-cuerpo').innerHTML = resultado.map((t) => `
    <tr><td>${t.nombre}</td><td>${porNombreTramo(t.continuaDesdeId)}</td><td>${formatearPresion(aPa(t.presionMPa, 'MPa'), unidadPresion)}</td><td>${t.longitudM}</td><td>${formatearPulgadas(t.tuberiaPulgadas)}</td><td>${formatearPresion(aPa(t.perdidaAcumuladaMbar, 'mbar'), unidadPerdidaAcumulada)}</td></tr>
  `).join('');
  guardar('memoria', tramos);
}

function leerFilaMemoria(fila) {
  const id = fila.dataset.id;
  const val = (clase) => fila.querySelector(`.${clase}`).value;
  const unidadPresion = document.getElementById('memoria-presion-unidad').value;
  return {
    id,
    nombre: val('mem-nombre'),
    continuaDesdeId: val('mem-padre') || null,
    presionMPa: desdePa(aPa(Number(val('mem-presion')), unidadPresion), 'MPa'),
    longitudM: Number(val('mem-largo')),
    potenciaKw: Number(val('mem-potencia')),
    tuberiaPulgadas: Number(val('mem-tuberia')),
    material: val('mem-material'),
    temperaturaC: Number(val('mem-temp')),
  };
}

function initMemoria() {
  tramos = cargar('memoria', null) ?? [tramoPorDefecto()];
  contadorId = tramos.length;

  // Unidad de cada columna de presión de la tabla — independiente entre
  // las tres, persistida aparte. Cambiar cualquiera solo redibuja la tabla
  // (el dato canónico en `tramos` sigue en MPa, ver leerFilaMemoria()).
  ['memoria-presion-unidad', 'memoria-perdida-parcial-unidad', 'memoria-perdida-acumulada-unidad'].forEach((id) => {
    const clave = `memoria-${id}`;
    const guardado = cargar(clave, null);
    const select = document.getElementById(id);
    if (guardado) select.value = guardado;
    select.addEventListener('input', () => {
      guardar(clave, select.value);
      recalcularMemoria();
    });
  });

  document.getElementById('memoria-agregar-tramo').addEventListener('click', () => {
    tramos.push(tramoPorDefecto());
    recalcularMemoria();
  });

  document.getElementById('memoria-tabla-cuerpo').addEventListener('input', (evento) => {
    const fila = evento.target.closest('tr[data-id]');
    if (!fila) return;
    const actualizado = leerFilaMemoria(fila);
    tramos = tramos.map((t) => (t.id === actualizado.id ? actualizado : t));
    recalcularMemoria();
  });

  document.getElementById('memoria-tabla-cuerpo').addEventListener('click', (evento) => {
    if (!evento.target.classList.contains('mem-eliminar')) return;
    const id = evento.target.closest('tr[data-id]').dataset.id;
    tramos = tramos.filter((t) => t.id !== id).map((t) => (t.continuaDesdeId === id ? { ...t, continuaDesdeId: null } : t));
    recalcularMemoria();
  });

  document.getElementById('memoria-exportar').addEventListener('click', () => {
    exportarJSON('proyecto-hidrogeno.json', tramos);
  });

  document.getElementById('memoria-importar').addEventListener('change', async (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    tramos = await importarJSON(archivo);
    contadorId = tramos.length;
    recalcularMemoria();
  });

  document.getElementById('memoria-imprimir').addEventListener('click', () => window.print());

  recalcularMemoria();
}

/* ---------------------------------------------------------------------- */

initTabs();
initTeoriaFlujo();
initAlmacenamiento();
initMemoria();
initSelectorGas({ actualId: 'hidrogeno', profundidad: 1 });
