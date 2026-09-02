import { calcularFlujo } from './calc-flujo.js';
import { calcularAlmacenamiento, formatearHoras } from './calc-almacenamiento.js';
import { calcularRed } from './calc-memoria.js';
import { TABLA_TUBERIA, TABLA_FACTOR_DISENO_F } from './gas-h2.js';
import { guardar, cargar, exportarJSON, importarJSON } from './storage.js';
import { initSelectorGas } from '../../assets/gas-switcher.js';
import { aPa, desdePa, opcionesUnidadPresion } from './unidades-presion.js';

// Formato numérico de todos los resultados (2026-09-02, a pedido del
// usuario): coma decimal / punto de miles (es-CL), hasta 2 decimales
// (recorta ceros de más). Solo afecta cómo se MUESTRAN los valores — el
// cálculo interno sigue con precisión completa.
const FORMATO_NUMERO = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
function formatearNumero(valor) {
  return FORMATO_NUMERO.format(valor);
}

// Parseo de las cajas de ingreso manual (2026-09-02, a pedido del usuario):
// son <input type="text" inputmode="decimal"> en vez de type="number" para
// que "," y "." funcionen indistintamente como separador decimal — con
// type="number" el navegador aplica el separador de su locale y descarta el
// otro carácter en silencio, lo que en la práctica impedía tipear cualquier
// decimal (y por lo tanto cualquier valor menor a 1) según la configuración
// regional del navegador/SO. Igual que un <input type="number"> vacío o
// inválido, un valor no numérico se trata como 0.
function numeroFlexible(valor) {
  const n = Number(String(valor).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Igual que formatearPresion() de unidades-presion.js pero con el formato
// de arriba en vez del string de precisión fija que usa esa función (que
// se deja intacta porque unidades-presion.test.js depende de poder
// Number()-earla).
function formatearPresionBonita(valorPa, unidad) {
  return formatearNumero(desdePa(valorPa, unidad));
}

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

// `variante` acepta un booleano (compatibilidad con los usos existentes,
// true -> 'alerta') o un string ('ok' | 'alerta', mismo patrón que
// GasNatural-GLP/js/ui.js) para el indicador "Tubería adecuada".
function tile(valor, etiqueta, variante = false) {
  const clase = variante === true ? ' alerta' : variante ? ` ${variante}` : '';
  return `<div class="resultado-tile${clase}"><div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div></div>`;
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
    const valorPa = aPa(numeroFlexible(input.value), select.dataset.unidadAnterior);
    input.value = Number(desdePa(valorPa, select.value).toPrecision(6));
    select.dataset.unidadAnterior = select.value;
  });
}

// Lee un campo de presión (input + select de unidad) convertido a la unidad
// que espera el motor de cálculo correspondiente.
function leerPresion(inputId, selectId, unidadDestino) {
  const valor = numeroFlexible(document.getElementById(inputId).value);
  const unidadOrigen = document.getElementById(selectId).value;
  return desdePa(aPa(valor, unidadOrigen), unidadDestino);
}

// Tile de resultado en presión con su propio selector de unidad inline —
// cambiar la unidad solo redibuja ese tile desde el valor en Pa ya
// cacheado en el DOM, no dispara un recálculo. `unidadesTiles` es el mapa
// persistido (clave -> unidad elegida) del panel dueño del tile.
function tilePresion(valorNativo, unidadNativa, etiqueta, clave, unidadesTiles, variante = false) {
  const valorPa = aPa(valorNativo, unidadNativa);
  const unidad = unidadesTiles[clave] || unidadNativa;
  const clase = variante === true ? ' alerta' : variante ? ` ${variante}` : '';
  return `<div class="resultado-tile${clase}" data-tile-presion="${clave}" data-pa="${valorPa}">
    <div class="valor"><span class="valor-numero">${formatearPresionBonita(valorPa, unidad)}</span><select class="select-unidad-inline" data-tile-presion-unidad="${clave}">${opcionesUnidadPresion(unidad)}</select></div>
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
    contenedorTile.querySelector('.valor-numero').textContent = formatearPresionBonita(Number(contenedorTile.dataset.pa), evento.target.value);
  });
}

// Tile de resultado de flujo con su propio selector de unidad inline — a
// diferencia de tilePresion(), acá SÍ dispara un recálculo al cambiar (el
// motor recibe la unidad elegida y devuelve el valor ya expresado en ella,
// ver unidadNormalizado/unidadH2 en calc-flujo.js). El <select> se
// regenera en cada render (igual que poblarSelectTuberia), así que
// `seleccionada` fija cuál opción queda marcada.
function tileConUnidad(valorFormateado, etiqueta, selectId, opciones, seleccionada) {
  const opcionesHtml = opciones.map((o) => {
    const texto = o.replace(/[[\]]/g, '').replace('m3', 'm³');
    return `<option value="${o}"${o === seleccionada ? ' selected' : ''}>${texto}</option>`;
  }).join('');
  return `<div class="resultado-tile">
    <div class="valor"><span class="valor-numero">${valorFormateado}</span><select class="select-unidad-inline" id="${selectId}">${opcionesHtml}</select></div>
    <div class="etiqueta">${etiqueta}</div>
  </div>`;
}

// Selector de Factor de diseño F por Clase de Ubicación — ASME B31.12,
// Tabla PL-3.7.1(b)(6)-1 (ver TABLA_FACTOR_DISENO_F en gas-h2.js). El
// value es el propio factor F (lo que espera calcularFlujo); varias clases
// comparten F=0.50 a propósito, igual que la tabla oficial. Por defecto
// selecciona la última fila (Clase 4, F=0.40) — mismo valor que tenía el
// input numérico libre que reemplaza.
function poblarSelectFactorDiseno(select) {
  select.innerHTML = TABLA_FACTOR_DISENO_F.map(
    (f, i) => `<option value="${f.factor}"${i === TABLA_FACTOR_DISENO_F.length - 1 ? ' selected' : ''}>${f.clase} (F=${f.factor.toFixed(2)})</option>`
  ).join('');
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
  ).join('') + '<option value="manual">Manual (ingresar mm)</option>';
}

/* ---------------------------------------------------------------------- */
/* Pestaña 1 — Tubería y Flujo                                            */
/* ---------------------------------------------------------------------- */

// Unidad de flujo normalizado/H₂ elegida — vive fuera del <form> (el
// selector ahora está junto a su tile de resultado, a pedido del usuario),
// así que se sigue por variable en vez de leerse del DOM del formulario.
// Factor E de uniones longitudinales: SIEMPRE 1, ya no es editable ni se
// muestra (a pedido del usuario) — ver Hidrogeno/CLAUDE.md.
const OPCIONES_UNIDAD_NORMALIZADO = ['[Nm3/h]', '[sL/min]'];
const OPCIONES_UNIDAD_H2 = ['[m3/h]', '[L/min]'];
let unidadNormalizadoFlujo = '[sL/min]';
let unidadH2Flujo = '[m3/h]';

function leerFlujoForm() {
  const num = (id) => numeroFlexible(document.getElementById(id).value);
  const tuberiaSeleccionada = document.getElementById('flujo-tuberia').value;
  const esManual = tuberiaSeleccionada === 'manual';
  return {
    presionBarG: leerPresion('flujo-presion', 'flujo-presion-unidad', 'bar'),
    temperaturaC: num('flujo-temperatura'),
    potenciaKw: num('flujo-potencia'),
    tuberiaPulgadas: esManual ? null : Number(tuberiaSeleccionada),
    tuberiaManual: esManual ? {
      diMm: num('flujo-tuberia-manual-di'), espesorMm: num('flujo-tuberia-manual-espesor'),
      limiteElasticoMPa: num('flujo-tuberia-manual-limite'), rugosidadMm: num('flujo-tuberia-manual-rugosidad'),
    } : undefined,
    presionMinBarG: leerPresion('flujo-presion-min', 'flujo-presion-min-unidad', 'bar'),
    largoM: num('flujo-largo'),
    codos: num('flujo-codos'),
    tees: num('flujo-tees'),
    valvulas: num('flujo-valvulas'),
    factorDiseno: num('flujo-factor-diseno'),
    factorUnion: 1,
    unidadNormalizado: unidadNormalizadoFlujo,
    unidadH2: unidadH2Flujo,
  };
}

const unidadesTilesPresionFlujo = cargar('unidades-tiles-presion-flujo', {});

// Orden y etiquetas (2026-09-02, a pedido del usuario): los resultados de
// mayor relevancia para la decisión de dimensionamiento van primero
// (presión/adecuación, caudales, velocidades, pérdida de carga); los
// factores de verificación de la fórmula (Hf, T, Z, Reynolds, fricción) y
// la densidad se agrupan aparte, al final, bajo su propio subtítulo.
function renderResultadosFlujo(r) {
  const cercaDeErosion = r.velocidadFlujoMS >= r.velocidadErosionMS * 0.8;
  const varianteAdecuada = r.tuberiaAdecuada ? 'ok' : 'alerta';
  document.getElementById('resultados-flujo').innerHTML = [
    tilePresion(r.presionMaxDisenoBar, 'bar', 'Presión máxima diseño (PL-3.7.1)', 'presion-max-diseno', unidadesTilesPresionFlujo, varianteAdecuada),
    tile(r.tuberiaAdecuada ? 'Sí' : 'No — usar tubería de mayor espesor o menor diámetro', 'Tubería adecuada', varianteAdecuada),
    tileConUnidad(formatearNumero(r.flujoVolNormalizado), 'Flujo volum. Norm.', 'flujo-unidad-normalizado', OPCIONES_UNIDAD_NORMALIZADO, unidadNormalizadoFlujo),
    tileConUnidad(formatearNumero(r.flujoVolH2), 'Flujo volum. de H₂', 'flujo-unidad-h2', OPCIONES_UNIDAD_H2, unidadH2Flujo),
    tile(`${formatearNumero(r.flujoMasicoKgH)} kg/h`, 'Flujo másico de H₂'),
    tile(`${formatearNumero(r.velocidadErosionMS)} m/s`, 'Velocidad erosión (I-3.4.5)'),
    tile(`${formatearNumero(r.velocidadFlujoMS)} m/s`, 'Velocidad de flujo', cercaDeErosion),
    tilePresion(r.perdidaCargaMbar, 'mbar', 'Pérdidas de carga', 'perdida-carga', unidadesTilesPresionFlujo),
    '<div class="resultados-subtitulo">Factores de verificación</div>',
    tile(`${formatearNumero(r.densidadKgM3)} kg/m³`, 'Densidad real'),
    tile(formatearNumero(r.factorHfAplicado), 'Factor Hf aplicado (Tabla IX-5A, fragilización por H₂)'),
    tile(formatearNumero(r.factorTAplicado), 'Factor T aplicado (Tabla PL-3.7.1(b)(8), derating por temperatura)'),
    tile(formatearNumero(r.zDiseno), 'Factor Z (diseño)'),
    tile(formatearNumero(r.reynolds), 'Número de Reynolds'),
    tile(formatearNumero(r.factorFriccion), 'Factor de fricción (Haaland)'),
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
  poblarSelectFactorDiseno(document.getElementById('flujo-factor-diseno'));
  renderTablaTuberia();

  const guardados = cargar('flujo', null);
  if (guardados) {
    Object.entries(guardados).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.value = valor;
    });
    unidadNormalizadoFlujo = guardados['flujo-unidad-normalizado'] ?? unidadNormalizadoFlujo;
    unidadH2Flujo = guardados['flujo-unidad-h2'] ?? unidadH2Flujo;
  } else {
    select.value = '0.5';
  }

  function actualizarVisibilidadTuberiaManual() {
    document.getElementById('campo-flujo-tuberia-manual').style.display = select.value === 'manual' ? '' : 'none';
  }
  actualizarVisibilidadTuberiaManual();
  select.addEventListener('input', actualizarVisibilidadTuberiaManual);

  initSelectorUnidadCampo('flujo-presion', 'flujo-presion-unidad');
  initSelectorUnidadCampo('flujo-presion-min', 'flujo-presion-min-unidad');
  initTilesPresion('resultados-flujo', unidadesTilesPresionFlujo, 'unidades-tiles-presion-flujo');

  function recalcular() {
    const inputs = leerFlujoForm();
    const resultado = calcularFlujo(inputs);
    renderResultadosFlujo(resultado);
    guardar('flujo', Object.assign(
      Object.fromEntries(Array.from(form.querySelectorAll('input, select')).map((el) => [el.id, el.value])),
      { 'flujo-unidad-normalizado': unidadNormalizadoFlujo, 'flujo-unidad-h2': unidadH2Flujo }
    ));
  }

  // Los selectores de unidad de flujo viven en los tiles de resultado (se
  // regeneran en cada render), fuera del <form> — se cablean aparte por
  // delegación en el contenedor de resultados en vez de sumarse a
  // `form.querySelectorAll('input, select')`.
  document.getElementById('resultados-flujo').addEventListener('input', (evento) => {
    if (evento.target.id === 'flujo-unidad-normalizado') {
      unidadNormalizadoFlujo = evento.target.value;
      recalcular();
    } else if (evento.target.id === 'flujo-unidad-h2') {
      unidadH2Flujo = evento.target.value;
      recalcular();
    }
  });

  form.addEventListener('input', recalcular);
  recalcular();
}

/* ---------------------------------------------------------------------- */
/* Pestaña 2 — Almacenamiento                                             */
/* ---------------------------------------------------------------------- */

const OPCIONES_UNIDAD_CAUDAL_ALM = ['[m³/h]', '[L/min]'];
let unidadCaudalAlm = '[m³/h]';

function leerAlmacenamientoForm() {
  const num = (id) => numeroFlexible(document.getElementById(id).value);
  return {
    potenciaKw: num('alm-potencia'),
    temperaturaC: num('alm-temperatura'),
    presionBarAbs: leerPresion('alm-presion', 'alm-presion-unidad', 'bar'),
    volumenM3: num('alm-volumen'),
    unidadCaudalReferencia: unidadCaudalAlm,
  };
}

function renderResultadosAlmacenamiento(r) {
  document.getElementById('resultados-almacenamiento').innerHTML = [
    tile(`${formatearNumero(r.masaAlmacenadaKg)} kg`, 'Masa de H₂ almacenada (PV=ZnRT)'),
    tile(formatearNumero(r.zAlmacenamiento), 'Factor de compresibilidad Z'),
    tile(`${formatearNumero(r.densidadRealKgM3)} kg/m³`, 'Densidad real en el estanque'),
    tile(`${formatearNumero(r.volumenNormalizadoNm3)} Nm³`, 'Volumen normalizado'),
    tile(formatearHoras(r.autonomiaHoras), 'Autonomía (hh:mm:ss)'),
    tile(`${formatearNumero(r.consumoKgH)} kg/h`, 'Consumo del quemador'),
    tile(`${formatearNumero(r.consumoNm3H)} Nm³/h`, 'Consumo del quemador (normalizado)'),
    tileConUnidad(formatearNumero(r.caudalReferenciaM3H), 'Caudal de referencia (línea capilar Ø¼")', 'alm-unidad-caudal', OPCIONES_UNIDAD_CAUDAL_ALM, unidadCaudalAlm),
    tile(`${formatearNumero(r.velocidadReferenciaMS)} m/s`, 'Velocidad de referencia (línea capilar Ø¼")'),
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
    unidadCaudalAlm = guardados['alm-unidad-caudal'] ?? unidadCaudalAlm;
  }

  initSelectorUnidadCampo('alm-presion', 'alm-presion-unidad');

  function recalcular() {
    const resultado = calcularAlmacenamiento(leerAlmacenamientoForm());
    renderResultadosAlmacenamiento(resultado);
    guardar('almacenamiento', Object.assign(
      Object.fromEntries(Array.from(form.querySelectorAll('input, select')).map((el) => [el.id, el.value])),
      { 'alm-unidad-caudal': unidadCaudalAlm }
    ));
  }

  document.getElementById('resultados-almacenamiento').addEventListener('input', (evento) => {
    if (evento.target.id === 'alm-unidad-caudal') {
      unidadCaudalAlm = evento.target.value;
      recalcular();
    }
  });

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
    reseteaAcumulada: false,
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
      <td style="text-align:center;"><input type="checkbox" class="mem-reset"${t.reseteaAcumulada ? ' checked' : ''} title="Reinicia la pérdida de carga acumulada desde este tramo (ej. después de un regulador de presión)"></td>
      <td><input type="text" inputmode="decimal" class="mem-presion" value="${Number(desdePa(aPa(t.presionMPa, 'MPa'), unidadPresion).toPrecision(6))}"></td>
      <td><input type="text" inputmode="decimal" class="mem-largo" value="${t.longitudM}"></td>
      <td><input type="text" inputmode="decimal" class="mem-potencia" value="${t.potenciaKw}"></td>
      <td>
        <select class="mem-tuberia">
          ${TABLA_TUBERIA.map((f) => `<option value="${f.pulgadas}"${f.pulgadas === t.tuberiaPulgadas ? ' selected' : ''}>${formatearPulgadas(f.pulgadas)}</option>`).join('')}
          <option value="manual"${t.tuberiaPulgadas === 'manual' ? ' selected' : ''}>Manual (mm)</option>
        </select>
        <div class="mem-tuberia-manual"${t.tuberiaPulgadas === 'manual' ? '' : ' style="display:none;"'}>
          <input type="text" inputmode="decimal" class="mem-tuberia-manual-di" value="${t.tuberiaManual?.diMm ?? 12.7}" title="Diámetro interior [mm]">
          <input type="text" inputmode="decimal" class="mem-tuberia-manual-espesor" value="${t.tuberiaManual?.espesorMm ?? 1.2}" title="Espesor de pared [mm]">
          <input type="text" inputmode="decimal" class="mem-tuberia-manual-limite" value="${t.tuberiaManual?.limiteElasticoMPa ?? 170}" title="Límite elástico [MPa]">
          <input type="text" inputmode="decimal" class="mem-tuberia-manual-rugosidad" value="${t.tuberiaManual?.rugosidadMm ?? 0.002}" title="Rugosidad [mm]">
        </div>
      </td>
      <td><input type="text" class="mem-material" value="${t.material}"></td>
      <td><input type="text" inputmode="decimal" class="mem-temp" value="${t.temperaturaC}"></td>
      <td>${formatearNumero(t.densidadKgM3)}</td>
      <td>${formatearNumero(t.velocidadFlujoMS)}</td>
      <td>${formatearPresionBonita(aPa(t.perdidaParcialMbar, 'mbar'), unidadPerdidaParcial)}</td>
      <td>${formatearPresionBonita(aPa(t.perdidaAcumuladaMbar, 'mbar'), unidadPerdidaAcumulada)}</td>
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
      ${n.t.reseteaAcumulada ? `<circle cx="${n.nivel * anchoNivel + 60}" cy="${n.fila * altoFila + 20}" r="12" fill="none" stroke="var(--text-primary)" stroke-width="2"/>` : ''}
      <circle cx="${n.nivel * anchoNivel + 60}" cy="${n.fila * altoFila + 20}" r="8" fill="var(--brand-orange)"/>
      <title>${n.t.nombre} — ${formatearNumero(n.t.perdidaAcumuladaMbar)} mbar acumulados, ${formatearNumero(n.t.velocidadFlujoMS)} m/s${n.t.reseteaAcumulada ? ' (reinicia acumulada)' : ''}</title>
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
      `<tr><td colspan="14" class="resultado-tile alerta">${error.message}</td></tr>`;
    return;
  }
  renderTablaMemoria(resultado);
  renderArbol(resultado);

  const unidadPresion = document.getElementById('memoria-presion-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  document.getElementById('memoria-impresion-th-presion').textContent = `Presión [${unidadPresion}]`;
  document.getElementById('memoria-impresion-th-perdida').textContent = `Pérdida acumulada [${unidadPerdidaAcumulada}]`;
  document.getElementById('memoria-tabla-impresion-cuerpo').innerHTML = resultado.map((t) => `
    <tr><td>${t.nombre}</td><td>${porNombreTramo(t.continuaDesdeId)}${t.reseteaAcumulada ? ' (reinicia acumulada)' : ''}</td><td>${formatearPresionBonita(aPa(t.presionMPa, 'MPa'), unidadPresion)}</td><td>${t.longitudM}</td><td>${etiquetaTuberia(t)}</td><td>${formatearPresionBonita(aPa(t.perdidaAcumuladaMbar, 'mbar'), unidadPerdidaAcumulada)}</td></tr>
  `).join('');
  guardar('memoria', tramos);
}

function leerFilaMemoria(fila) {
  const id = fila.dataset.id;
  const val = (clase) => fila.querySelector(`.${clase}`).value;
  const unidadPresion = document.getElementById('memoria-presion-unidad').value;
  const tuberiaSeleccionada = val('mem-tuberia');
  const esManual = tuberiaSeleccionada === 'manual';
  return {
    id,
    nombre: val('mem-nombre'),
    continuaDesdeId: val('mem-padre') || null,
    reseteaAcumulada: fila.querySelector('.mem-reset').checked,
    presionMPa: desdePa(aPa(numeroFlexible(val('mem-presion')), unidadPresion), 'MPa'),
    longitudM: numeroFlexible(val('mem-largo')),
    potenciaKw: numeroFlexible(val('mem-potencia')),
    tuberiaPulgadas: esManual ? 'manual' : Number(tuberiaSeleccionada),
    tuberiaManual: esManual ? {
      diMm: numeroFlexible(val('mem-tuberia-manual-di')), espesorMm: numeroFlexible(val('mem-tuberia-manual-espesor')),
      limiteElasticoMPa: numeroFlexible(val('mem-tuberia-manual-limite')), rugosidadMm: numeroFlexible(val('mem-tuberia-manual-rugosidad')),
    } : undefined,
    material: val('mem-material'),
    temperaturaC: numeroFlexible(val('mem-temp')),
  };
}

function etiquetaTuberia(t) {
  return t.tuberiaPulgadas === 'manual' ? `Manual ${t.tuberiaManual.diMm} mm` : formatearPulgadas(t.tuberiaPulgadas);
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
