import { calcularFlujo } from './calc-flujo.js';
import { calcularAlmacenamiento, formatearHoras } from './calc-almacenamiento.js';
import {
  GASES_PREDEFINIDOS, ID_PERSONALIZADO, gasPersonalizadoPorDefecto, copiaPersonalizada,
  buscarGasPredefinido, validarGas,
} from './biblioteca-gases.js';
import { TABLA_TUBERIA, MATERIAL_TABLA, buscarTuberia, tuberiaDesdeManual } from './tuberias.js';
import { densidadNormal, presionVaporPa, celsiusAKelvin, MARGEN_CONDENSACION_K, R_UNIVERSAL } from './termo.js';
import { flujoMasicoKgH } from './caudal.js';
import { P_ATMOSFERICA_PA } from './physics.js';
import { guardar, cargar } from './storage.js';
import { initSelectorGas } from '../../assets/gas-switcher.js';
import { aPa, desdePa, opcionesUnidadPresion } from './unidades-presion.js';

/* ---------------------------------------------------------------------- */
/* Utilidades de formato y formulario — copiadas de Hidrogeno/js/ui.js    */
/* (mismo patrón de pantalla, ver CLAUDE.md raíz)                         */
/* ---------------------------------------------------------------------- */

// Coma decimal / punto de miles (es-CL), hasta 2 decimales. Solo formato:
// el cálculo interno sigue con precisión completa.
const FORMATO_NUMERO = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
function formatearNumero(valor) {
  return FORMATO_NUMERO.format(valor);
}

// Z con 3-4 decimales (con 2, un Z de 0,9936 se leería "0,99").
const FORMATO_Z = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 3, maximumFractionDigits: 4 });
function formatearZ(valor) {
  return FORMATO_Z.format(valor);
}

const FORMATO_RATIO = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
function formatearRatio(valor) {
  return FORMATO_RATIO.format(valor);
}

// Propiedades que con 2 decimales pierden la cifra que importa (densidad
// normal del NH₃ 0,768 kg/Nm³, presión de vapor de 1,848 bar): 4 cifras
// significativas.
const FORMATO_SIGNIFICATIVO = new Intl.NumberFormat('es-CL', { maximumSignificantDigits: 4 });
function formatearSignificativo(valor) {
  return FORMATO_SIGNIFICATIVO.format(valor);
}

// "," o "." como separador decimal; lo no numérico cuenta como 0 (ver
// Hidrogeno/CLAUDE.md, "Separador decimal flexible").
function numeroFlexible(valor) {
  const n = Number(String(valor).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Campo opcional: vacío → null (no 0).
function numeroOpcional(valor) {
  const bruto = String(valor).trim();
  return bruto === '' ? null : numeroFlexible(bruto);
}

function formatearPresionBonita(valorPa, unidad) {
  return formatearNumero(desdePa(valorPa, unidad));
}

function escapeAttr(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// La pestaña activa vive en el hash (#gas, #flujo, #almacenamiento): el hub
// enlaza directo a cada herramienta y recargar no vuelve a la primera.
function initTabs() {
  const botones = Array.from(document.querySelectorAll('.tab'));
  const paneles = document.querySelectorAll('.tab-panel');
  function activar(nombre) {
    const boton = botones.find((b) => b.dataset.tab === nombre);
    if (!boton) return;
    botones.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    paneles.forEach((p) => p.classList.remove('active'));
    boton.classList.add('active');
    boton.setAttribute('aria-selected', 'true');
    document.querySelector(`[data-panel="${nombre}"]`).classList.add('active');
  }
  botones.forEach((boton) => {
    boton.addEventListener('click', () => {
      activar(boton.dataset.tab);
      history.replaceState(null, '', `#${boton.dataset.tab}`);
      const panel = document.querySelector('.tab-panel.active');
      const barra = document.querySelector('.barra-pestanas');
      const destino = panel.getBoundingClientRect().top + window.scrollY - barra.offsetHeight - 16;
      if (window.scrollY > destino) window.scrollTo({ top: destino });
    });
  });
  activar(decodeURIComponent(location.hash.slice(1)));
  window.addEventListener('hashchange', () => activar(decodeURIComponent(location.hash.slice(1))));
}

// Borde rojo (aria-invalid) en un cajetín numérico con texto no numérico.
function initValidacionNumerica() {
  document.addEventListener('input', (evento) => {
    const el = evento.target;
    if (!(el instanceof HTMLInputElement) || el.inputMode !== 'decimal') return;
    const bruto = el.value.trim();
    if (bruto !== '' && !Number.isFinite(Number(bruto.replace(',', '.')))) {
      el.setAttribute('aria-invalid', 'true');
      el.title = 'No es un número válido — se calcula como 0';
    } else if (el.hasAttribute('aria-invalid')) {
      el.removeAttribute('aria-invalid');
      el.removeAttribute('title');
    }
  });
}

function tile(valor, etiqueta, variante = false) {
  const clase = variante === true ? ' alerta' : variante ? ` ${variante}` : '';
  return `<div class="resultado-tile${clase}"><div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div></div>`;
}

function grupo(titulo, tiles, clase = '') {
  const subtitulo = titulo ? `<div class="resultados-subtitulo">${titulo}</div>` : '';
  return `<div class="grupo-resultados${clase ? ` ${clase}` : ''}">${subtitulo}${tiles.filter(Boolean).join('')}</div>`;
}

// <select> de unidad de presión junto a su <input>: al cambiar la unidad
// convierte el número mostrado para conservar la presión física.
function initSelectorUnidadCampo(inputId, selectId) {
  const input = document.getElementById(inputId);
  const select = document.getElementById(selectId);
  select.dataset.unidadAnterior = select.value;
  select.addEventListener('input', () => {
    if (input.value.trim() !== '') {
      const valorPa = aPa(numeroFlexible(input.value), select.dataset.unidadAnterior);
      input.value = Number(desdePa(valorPa, select.value).toPrecision(6));
    }
    select.dataset.unidadAnterior = select.value;
  });
}

// Mismo patrón para una magnitud con factores fijos (volumen L ↔ m³).
function initSelectorUnidadFactores(inputId, selectId, factores) {
  const input = document.getElementById(inputId);
  const select = document.getElementById(selectId);
  select.dataset.unidadAnterior = select.value;
  select.addEventListener('input', () => {
    const base = numeroFlexible(input.value) * factores[select.dataset.unidadAnterior];
    input.value = Number((base / factores[select.value]).toPrecision(6));
    select.dataset.unidadAnterior = select.value;
  });
}

function leerPresion(inputId, selectId, unidadDestino) {
  const valor = numeroFlexible(document.getElementById(inputId).value);
  const unidadOrigen = document.getElementById(selectId).value;
  return desdePa(aPa(valor, unidadOrigen), unidadDestino);
}

// Tile en presión con su propio selector de unidad inline — cambiar la
// unidad solo redibuja el tile desde el valor en Pa guardado en el DOM.
function tilePresion(valorNativo, unidadNativa, etiqueta, clave, unidadesTiles, variante = false) {
  const valorPa = aPa(valorNativo, unidadNativa);
  const unidad = unidadesTiles[clave] || unidadNativa;
  const clase = variante === true ? ' alerta' : variante ? ` ${variante}` : '';
  return `<div class="resultado-tile${clase}" data-tile-presion="${clave}" data-pa="${valorPa}">
    <div class="valor"><span class="valor-numero">${formatearPresionBonita(valorPa, unidad)}</span><select class="select-unidad-inline" data-tile-presion-unidad="${clave}" aria-label="Unidad de ${escapeAttr(etiqueta)}">${opcionesUnidadPresion(unidad)}</select></div>
    <div class="etiqueta">${etiqueta}</div>
  </div>`;
}

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

// Guarda/restaura los valores de los <input>/<select> de un formulario por id.
function restaurarCampos(clave) {
  const guardados = cargar(clave, null);
  if (!guardados) return false;
  Object.entries(guardados).forEach(([id, valor]) => {
    const el = document.getElementById(id);
    if (el) el.value = valor;
  });
  return true;
}

function guardarCampos(clave, form) {
  guardar(clave, Object.fromEntries(Array.from(form.querySelectorAll('input:not([type="radio"]), select'))
    .filter((el) => el.id).map((el) => [el.id, el.value])));
}

/* ---------------------------------------------------------------------- */
/* Gas activo — compartido por las 3 pestañas                             */
/* ---------------------------------------------------------------------- */

let gasActivoId = cargar('gas-activo', GASES_PREDEFINIDOS[0].id);
if (gasActivoId !== ID_PERSONALIZADO && !buscarGasPredefinido(gasActivoId)) gasActivoId = GASES_PREDEFINIDOS[0].id;
// Mezclado sobre el default: si una versión futura agrega un campo, un gas
// personalizado guardado antes no queda sin él.
let gasPersonalizado = { ...gasPersonalizadoPorDefecto(), ...cargar('gas-personalizado', {}) };

const esPersonalizado = () => gasActivoId === ID_PERSONALIZADO;
function gasActivo() {
  return esPersonalizado() ? gasPersonalizado : buscarGasPredefinido(gasActivoId);
}
function nombreCorto(gas) {
  return gas.formula?.trim() || gas.nombre?.trim() || 'gas';
}
function etiquetaGas(gas) {
  return gas.formula ? `${gas.formula} — ${gas.nombre}` : gas.nombre;
}

// Cada pestaña registra acá cómo reaccionar. `seleccion: true` = se eligió
// otro gas (hay que reescribir formularios que dependen del gas);
// `false` = se editó una propiedad del personalizado (solo recalcular —
// reescribir el formulario del gas mientras se tipea borraría la coma recién
// escrita, ver Hidrogeno/CLAUDE.md "Fix de foco").
const alCambiarGas = [];
function notificarCambioGas(opciones) {
  alCambiarGas.forEach((fn) => fn(opciones));
}

function renderSelectorGasActivo() {
  const select = document.getElementById('gas-activo');
  select.innerHTML = GASES_PREDEFINIDOS.map((g) => `<option value="${g.id}">${escapeHtml(etiquetaGas(g))}</option>`).join('')
    + `<option value="${ID_PERSONALIZADO}">Personalizado: ${escapeHtml(gasPersonalizado.nombre?.trim() || 'sin nombre')}</option>`;
  select.value = gasActivoId;
}

function seleccionarGas(id) {
  gasActivoId = id;
  guardar('gas-activo', id);
  renderSelectorGasActivo();
  notificarCambioGas({ seleccion: true });
}

function initSelectorGasActivo() {
  renderSelectorGasActivo();
  document.getElementById('gas-activo').addEventListener('change', (evento) => seleccionarGas(evento.target.value));
}

// Aviso común a Flujo y Almacenamiento cuando el gas personalizado tiene
// datos inválidos: se listan en vez de mostrar números calculados con ellos.
function grupoErroresGas(errores) {
  return grupo(null, [
    tile('Faltan datos del gas', 'Corregirlos en la pestaña "Propiedades del gas"', 'critico ancho'),
    `<ul class="lista-resultados">${errores.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`,
  ]);
}

function grupoError(mensaje) {
  return grupo(null, [tile('No se puede calcular', escapeHtml(mensaje), 'critico ancho')]);
}

/* ---------------------------------------------------------------------- */
/* Pestaña 1 — Propiedades del gas                                        */
/* ---------------------------------------------------------------------- */

const CAMPOS_NUMERICOS_GAS = [
  ['gas-masa-molar', 'masaMolarGMol'],
  ['gas-omega', 'factorAcentrico'],
  ['gas-viscosidad', 'viscosidadUPaS'],
  ['gas-gamma', 'gamma'],
];

// Quita el ruido binario de las conversiones (304,1282 − 273,15 =
// 30,978200000000015) antes de escribir un valor en un cajetín.
function redondear(valor) {
  return Number.isFinite(valor) ? Number(valor.toPrecision(10)) : '';
}

function escribirFormGas() {
  const gas = gasActivo();
  const escribir = (id, valor) => { document.getElementById(id).value = valor ?? ''; };
  escribir('gas-nombre', gas.nombre);
  escribir('gas-formula', gas.formula);
  CAMPOS_NUMERICOS_GAS.forEach(([id, propiedad]) => escribir(id, redondear(gas[propiedad])));
  escribir('gas-tc', redondear(gas.temperaturaCriticaK - 273.15));
  escribir('gas-pc', redondear(desdePa(aPa(gas.presionCriticaBar, 'bar'), document.getElementById('gas-pc-unidad').value)));
  escribir('gas-pci', gas.pciMJkg === null ? '' : redondear(gas.pciMJkg));
  escribir('gas-llenado', gas.gradoLlenadoKgL === null ? '' : redondear(gas.gradoLlenadoKgL));

  const soloLectura = !esPersonalizado();
  document.querySelectorAll('#form-gas input').forEach((el) => {
    el.readOnly = soloLectura;
    el.removeAttribute('aria-invalid');
    el.removeAttribute('title');
  });
  document.getElementById('seccion-gas-identificacion').classList.toggle('oculta', soloLectura);

  const texto = document.getElementById('aviso-gas-texto');
  const acciones = document.querySelector('#aviso-gas-predefinido .acciones-gas');
  if (soloLectura) {
    texto.innerHTML = `<strong>${escapeHtml(etiquetaGas(gas))}</strong>: valores de referencia (fuente citada en el código y en el CLAUDE.md del módulo), no se editan aquí. Para ajustar alguno, cópialos a un gas personalizado.`;
    acciones.innerHTML = `<button type="button" class="btn" data-copiar="${gas.id}">Editar como gas personalizado</button>`;
  } else {
    texto.innerHTML = '<strong>Gas personalizado</strong>: ingresa sus constantes — se guardan en este navegador. Para partir de un gas conocido:';
    acciones.innerHTML = GASES_PREDEFINIDOS.map((g) => `<button type="button" class="btn" data-copiar="${g.id}">Copiar ${escapeHtml(nombreCorto(g))}</button>`).join('');
  }
}

// Campo obligatorio vacío → NaN (no 0), para que validarGas() lo reporte.
function leerFormGas() {
  const valor = (id) => document.getElementById(id).value;
  const requerido = (id) => (valor(id).trim() === '' ? NaN : numeroFlexible(valor(id)));
  return {
    id: ID_PERSONALIZADO,
    nombre: valor('gas-nombre'),
    formula: valor('gas-formula'),
    masaMolarGMol: requerido('gas-masa-molar'),
    temperaturaCriticaK: requerido('gas-tc') + 273.15,
    presionCriticaBar: valor('gas-pc').trim() === '' ? NaN : leerPresion('gas-pc', 'gas-pc-unidad', 'bar'),
    factorAcentrico: requerido('gas-omega'),
    viscosidadUPaS: requerido('gas-viscosidad'),
    gamma: requerido('gas-gamma'),
    pciMJkg: numeroOpcional(valor('gas-pci')),
    gradoLlenadoKgL: numeroOpcional(valor('gas-llenado')),
  };
}

function copiarAPersonalizado(idOrigen) {
  const origen = buscarGasPredefinido(idOrigen);
  const yaTeniaUno = cargar('gas-personalizado', null) !== null;
  if (yaTeniaUno && !window.confirm(`Esto reemplaza las propiedades del gas personalizado actual ("${gasPersonalizado.nombre}") por las de ${origen.nombre}. ¿Continuar?`)) return;
  gasPersonalizado = copiaPersonalizada(origen, { nombre: `${origen.nombre} (modificado)` });
  guardar('gas-personalizado', gasPersonalizado);
  seleccionarGas(ID_PERSONALIZADO);
}

const unidadesTilesGas = cargar('unidades-tiles-presion-gas', {});
const M_AIRE_G_MOL = 28.9647; // aire seco (ISO 2533)
const TEMPERATURAS_CURVA_C = [-30, -20, -10, 0, 10, 20, 30, 40, 50];

function grupoCurvaVapor(gas) {
  const filas = TEMPERATURAS_CURVA_C.map((c) => {
    const temperaturaK = celsiusAKelvin(c);
    if (temperaturaK >= gas.temperaturaCriticaK) {
      return `<tr><td>${c} °C</td><td class="fuera" colspan="2">Sobre la temperatura crítica: no condensa</td></tr>`;
    }
    if (temperaturaK < 0.3 * gas.temperaturaCriticaK) {
      return `<tr><td>${c} °C</td><td class="fuera" colspan="2">Fuera del rango de la correlación</td></tr>`;
    }
    const p = presionVaporPa({ gas, temperaturaK });
    const man = p - P_ATMOSFERICA_PA;
    return `<tr><td>${c} °C</td><td>${formatearSignificativo(p / 1e5)}</td><td>${formatearSignificativo(man / 1e5)}</td></tr>`;
  }).join('');
  return grupo('Presión de vapor (Lee-Kesler) — sobre esta presión el gas condensa', [
    `<table class="tabla-psat"><thead><tr><th>Temperatura</th><th>bar abs</th><th>bar man.</th></tr></thead><tbody>${filas}</tbody></table>`,
    '<div class="resultados-nota">Correlación generalizada: frente a NIST, error ≤ 1 % para CO₂ y para NH₃ sobre 0 °C; hasta ~3 % para NH₃ a −20 °C. Manométrica negativa = bajo la presión atmosférica.</div>',
  ]);
}

function renderResultadosGas() {
  const gas = gasActivo();
  const contenedor = document.getElementById('resultados-gas');
  const errores = validarGas(gas);
  if (errores.length) {
    contenedor.innerHTML = grupo(null, [
      tile('Datos incompletos o fuera de rango', 'Corregir los campos marcados abajo', 'critico ancho'),
      `<ul class="lista-resultados">${errores.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`,
    ]);
    return;
  }
  const normal = densidadNormal(gas);
  const tcC = gas.temperaturaCriticaK - 273.15;
  const psat20 = presionVaporPa({ gas, temperaturaK: celsiusAKelvin(20) });
  const relativa = gas.masaMolarGMol / M_AIRE_G_MOL;

  contenedor.innerHTML = [
    grupo(null, [
      tile(`${formatearSignificativo(normal.densidadKgM3)} kg/Nm³`,
        normal.ideal ? 'Densidad normal — gas ideal hipotético: a 0 °C y 1 atm este fluido sería líquido' : 'Densidad normal (0 °C, 1 atm)',
        normal.ideal ? 'kpi alerta' : 'kpi'),
      psat20 === null
        ? tile('No condensa a 20 °C', `Su temperatura crítica es ${formatearNumero(tcC)} °C: sobre ella no existe líquido a ninguna presión`, 'kpi')
        : tilePresion(psat20 / 1e5, 'bar', 'Presión de vapor a 20 °C (abs) — sobre ella el gas condensa', 'psat-20', unidadesTilesGas, 'kpi'),
    ], 'kpis'),
    grupo('Propiedades derivadas', [
      tile(formatearSignificativo(relativa), `Densidad relativa al aire — ${relativa > 1 ? 'más pesado: se acumula en zonas bajas' : 'más liviano que el aire'}`, 'secundario'),
      tile(formatearZ(normal.z), 'Factor Z a condiciones normales', 'secundario'),
      tile(`${formatearNumero((R_UNIVERSAL * 1000) / gas.masaMolarGMol)} J/(kg·K)`, 'Constante específica R', 'secundario'),
      tile(`${formatearNumero(tcC)} °C`, `Temperatura crítica (${formatearNumero(gas.temperaturaCriticaK)} K)`, 'secundario'),
      tilePresion(gas.presionCriticaBar, 'bar', 'Presión crítica (abs)', 'pc', unidadesTilesGas, 'secundario'),
      gas.pciMJkg > 0 ? tile(`${formatearNumero(gas.pciMJkg * normal.densidadKgM3)} MJ/Nm³`, 'PCI volumétrico', 'secundario') : '',
    ]),
    grupoCurvaVapor(gas),
    gas.notas?.length
      ? grupo('Seguridad y operación', [`<ul class="lista-resultados">${gas.notas.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`])
      : '',
  ].join('');
}

function initPanelGas() {
  const unidadPc = cargar('gas-pc-unidad', null);
  if (unidadPc) document.getElementById('gas-pc-unidad').value = unidadPc;
  initSelectorUnidadCampo('gas-pc', 'gas-pc-unidad');
  initTilesPresion('resultados-gas', unidadesTilesGas, 'unidades-tiles-presion-gas');

  document.getElementById('form-gas').addEventListener('input', (evento) => {
    if (evento.target.id === 'gas-pc-unidad') guardar('gas-pc-unidad', evento.target.value);
    if (!esPersonalizado()) return; // predefinido: solo lectura (el selector de unidad sí convierte)
    gasPersonalizado = leerFormGas();
    guardar('gas-personalizado', gasPersonalizado);
    renderSelectorGasActivo();
    notificarCambioGas({ seleccion: false });
  });

  document.getElementById('aviso-gas-predefinido').addEventListener('click', (evento) => {
    const id = evento.target.dataset?.copiar;
    if (id) copiarAPersonalizado(id);
  });

  alCambiarGas.push(({ seleccion }) => {
    if (seleccion) escribirFormGas();
    renderResultadosGas();
  });
}

/* ---------------------------------------------------------------------- */
/* Caudal: kg/h · Nm³/h · kW (este último solo si el gas tiene PCI)       */
/* ---------------------------------------------------------------------- */

function masaACaudal(masaKgH, unidad, densidadNormalKgM3, pciMJkg) {
  if (unidad === 'Nm3/h') return masaKgH / densidadNormalKgM3;
  if (unidad === 'kW') return (masaKgH * pciMJkg) / 3.6;
  return masaKgH;
}

// Al cambiar la unidad del caudal se convierte el número para conservar el
// mismo flujo másico (mismo criterio que los selectores de presión). Si el
// gas es inválido o no tiene PCI, el número queda como está.
function initSelectorCaudal(inputId, selectId) {
  const input = document.getElementById(inputId);
  const select = document.getElementById(selectId);
  select.dataset.unidadAnterior = select.value;
  select.addEventListener('input', () => {
    const gas = gasActivo();
    if (!validarGas(gas).length) {
      try {
        const rhoN = densidadNormal(gas).densidadKgM3;
        const masa = flujoMasicoKgH({ caudal: numeroFlexible(input.value), unidad: select.dataset.unidadAnterior, densidadNormalKgM3: rhoN, pciMJkg: gas.pciMJkg });
        input.value = Number(masaACaudal(masa, select.value, rhoN, gas.pciMJkg).toPrecision(6));
      } catch (error) {
        // sin PCI: no hay conversión posible a/desde kW
      }
    }
    select.dataset.unidadAnterior = select.value;
  });
}

// kW solo tiene sentido con PCI: sin él la opción queda deshabilitada y, si
// estaba elegida, se pasa a kg/h (el número no se convierte: no hay con qué).
function sincronizarOpcionKw(selectId) {
  const gas = gasActivo();
  const select = document.getElementById(selectId);
  const opcion = select.querySelector('option[value="kW"]');
  const conPci = gas.pciMJkg > 0;
  opcion.disabled = !conPci;
  opcion.textContent = conPci ? 'kW' : 'kW (sin PCI)';
  if (!conPci && select.value === 'kW') {
    select.value = 'kg/h';
    select.dataset.unidadAnterior = 'kg/h';
  }
}

/* ---------------------------------------------------------------------- */
/* Fase del fluido — común a Flujo y Almacenamiento                       */
/* ---------------------------------------------------------------------- */

function grupoFase(fase, gas, temperaturaC, unidadesTiles) {
  const f = formatearNumero;
  const nombre = escapeHtml(nombreCorto(gas));
  const tSatC = fase.temperaturaSaturacionK === null ? null : fase.temperaturaSaturacionK - 273.15;
  const psatAbsBar = fase.presionVaporPa === null ? null : fase.presionVaporPa / 1e5;
  const tcC = gas.temperaturaCriticaK - 273.15;
  let etiqueta, variante, nota;
  if (fase.estado === 'liquido') {
    etiqueta = 'Líquido — los cálculos de gas no aplican';
    variante = 'critico';
    nota = `A ${f(temperaturaC)} °C el ${nombre} condensa sobre ${f(psatAbsBar)} bar abs (${f(psatAbsBar - P_ATMOSFERICA_PA / 1e5)} bar man.): a esta presión habría líquido. Bajar la presión${tSatC === null ? '' : ` o trabajar sobre ${f(tSatC)} °C`}.`;
  } else if (fase.estado === 'cerca-condensacion') {
    etiqueta = 'Gas — cerca de condensar';
    variante = 'alerta';
    nota = `A esta presión el ${nombre} condensa bajo ${f(tSatC)} °C: quedan ${f(temperaturaC - tSatC)} °C de margen, menos de los ${MARGEN_CONDENSACION_K} °C que pide este chequeo. Un día frío o el enfriamiento al expandirse en una válvula pueden formar líquido.`;
  } else if (fase.estado === 'supercritico') {
    etiqueta = 'Fluido supercrítico';
    variante = 'alerta';
    nota = `Sobre ${f(tcC)} °C y ${f(gas.presionCriticaBar)} bar abs el ${nombre} es un fluido denso de una sola fase: no condensa, pero cerca del punto crítico Peng-Robinson puede subestimar su densidad hasta ~10 %, y la viscosidad ingresada (de gas a baja presión) queda corta.`;
  } else {
    etiqueta = 'Gas';
    variante = 'ok';
    nota = temperaturaC >= tcC
      ? `Sobre su temperatura crítica (${f(tcC)} °C) el ${nombre} no condensa a ninguna presión.`
      : tSatC === null
        ? `Muy lejos de su curva de condensación.`
        : `A esta presión el ${nombre} condensaría bajo ${f(tSatC)} °C (margen de ${f(temperaturaC - tSatC)} °C).`;
  }
  return grupo('Fase del fluido', [
    tile(etiqueta, 'Estado a la presión y temperatura ingresadas', `${variante} ancho`),
    tSatC === null ? '' : tile(`${f(tSatC)} °C`, 'Temperatura de condensación a esta presión', 'secundario'),
    psatAbsBar === null ? '' : tilePresion(psatAbsBar, 'bar', `Presión de vapor a ${f(temperaturaC)} °C (abs)`, 'psat', unidadesTiles, 'secundario'),
    `<div class="resultados-nota">${nota}</div>`,
  ]);
}

/* ---------------------------------------------------------------------- */
/* Pestaña 2 — Tubería y Flujo                                            */
/* ---------------------------------------------------------------------- */

function poblarSelectTuberia(select) {
  const opciones = (cedula) => TABLA_TUBERIA.filter((f) => f.cedula === cedula).map(
    (f) => `<option value="${f.id}">${formatearPulgadas(f.pulgadas)} Sch ${cedula} — DI ${formatearNumero(f.diMm)} mm</option>`,
  ).join('');
  select.innerHTML = `<optgroup label="Acero al carbono, Schedule 40">${opciones('40')}</optgroup>`
    + `<optgroup label="Acero al carbono, Schedule 80">${opciones('80')}</optgroup>`
    + '<option value="manual">Manual (ingresar mm)</option>';
}

function renderTablaTuberia() {
  const filas = TABLA_TUBERIA.map(
    (f) => `<tr><td>${formatearPulgadas(f.pulgadas)}</td><td>${f.cedula}</td><td>${formatearNumero(f.deMm)}</td><td>${formatearNumero(f.espesorMm)}</td><td>${formatearNumero(f.diMm)}</td></tr>`,
  ).join('');
  document.getElementById('tabla-tuberia-flujo').innerHTML =
    `<thead><tr><th>Nominal</th><th>Schedule</th><th>DE [mm]</th><th>Espesor [mm]</th><th>DI [mm]</th></tr></thead><tbody>${filas}</tbody>`;
  document.querySelector('#panel-flujo details summary').textContent =
    `Tabla de tubería (referencia) — ASME B36.10M, ${MATERIAL_TABLA.nombre}: S = ${MATERIAL_TABLA.limiteElasticoMPa} MPa, rugosidad ${formatearSignificativo(MATERIAL_TABLA.rugosidadMm)} mm`;
}

function leerFlujoForm() {
  const num = (id) => numeroFlexible(document.getElementById(id).value);
  const tuberiaId = document.getElementById('flujo-tuberia').value;
  return {
    gas: gasActivo(),
    presionBarG: leerPresion('flujo-presion', 'flujo-presion-unidad', 'bar'),
    temperaturaC: num('flujo-temperatura'),
    caudal: num('flujo-caudal'),
    unidadCaudal: document.getElementById('flujo-caudal-unidad').value,
    largoM: num('flujo-largo'),
    tuberia: tuberiaId === 'manual'
      ? tuberiaDesdeManual({
        diMm: num('flujo-tuberia-manual-di'), espesorMm: num('flujo-tuberia-manual-espesor'),
        limiteElasticoMPa: num('flujo-tuberia-manual-limite'), rugosidadMm: num('flujo-tuberia-manual-rugosidad'),
      })
      : buscarTuberia(tuberiaId),
    codos: num('flujo-codos'),
    tees: num('flujo-tees'),
    valvulas: num('flujo-valvulas'),
    factorDiseno: num('flujo-factor-diseno'),
  };
}

const unidadesTilesPresionFlujo = cargar('unidades-tiles-presion-flujo', {});

// Screening de flujo sónico — mismos estados y umbrales que Hidrógeno
// (textos generalizados: allá hablan de servicio de H₂).
const ESTADOS_SONICO = {
  ok: {
    etiqueta: 'OK — Baja caída de presión',
    variante: 'ok',
    nota: () => 'Caída de presión ≤ 10 % de la presión aguas arriba. No se identifica una condición relevante de aceleración hacia flujo sónico mediante este screening simplificado.',
  },
  advertencia: {
    etiqueta: 'ADVERTENCIA — Revisar válvulas/reguladores',
    variante: 'alerta',
    nota: () => 'Caída de presión > 10 %: el cálculo con densidad constante pierde exactitud, y conviene revisar válvulas, reguladores y restricciones por alta velocidad local, ruido y enfriamiento por expansión.',
  },
  critico: {
    etiqueta: 'CRÍTICO — Posible flujo sónico / choked flow',
    variante: 'critico',
    nota: (gas) => `La relación de presiones alcanza el límite crítico aproximado para ${escapeHtml(nombreCorto(gas))} ideal (γ = ${formatearNumero(gas.gamma)}). Puede existir flujo estrangulado en una restricción: verificar la válvula/regulador con datos del fabricante.`,
  },
  'no-aplica': {
    etiqueta: 'No aplica',
    variante: 'alerta',
    nota: () => 'La pérdida de carga calculada supera la presión absoluta disponible: la línea no puede entregar este caudal. Aumentar el diámetro o la presión.',
  },
};

function tilesChequeoSonico(c, gas) {
  const { etiqueta, variante, nota } = ESTADOS_SONICO[c.estado];
  const valor = (v, sufijo = '') => (v === null ? '—' : `${formatearNumero(v)}${sufijo}`);
  return grupo(`Caída de presión / flujo sónico — ${escapeHtml(nombreCorto(gas))} (screening simplificado, no reemplaza API RP 14E)`, [
    tile(etiqueta, 'Estado', `${variante} ancho`),
    tile(valor(c.caidaPresionPorcentaje, ' %'), 'ΔP/P₁ (sobre presión absoluta)'),
    tile(c.relacionPresion === null ? '—' : formatearRatio(c.relacionPresion), 'P₂/P₁'),
    tile(formatearRatio(c.relacionPresionCritica), `Límite crítico aprox. P₂/P₁ (γ = ${formatearNumero(gas.gamma)})`, 'secundario'),
    `<div class="resultados-nota">${nota(gas)}</div>`,
  ]);
}

function renderResultadosFlujo(r, entradas) {
  const { gas } = entradas;
  const nombre = escapeHtml(nombreCorto(gas));
  const varianteAdecuada = r.tuberiaAdecuada ? 'ok' : 'alerta';
  const kpis = grupo(null, [
    tilePresion(r.presionMaxDisenoBar, 'bar', 'Presión máxima de diseño (Barlow, manométrica)', 'presion-max-diseno', unidadesTilesPresionFlujo, `kpi ${varianteAdecuada}`),
    tile(r.tuberiaAdecuada ? 'Sí' : 'No — usar tubería de mayor espesor o menor diámetro', 'Tubería adecuada (operación ≤ máxima de diseño)', `kpi ${varianteAdecuada}`),
  ], 'kpis');
  const fase = grupoFase(r.fase, gas, entradas.temperaturaC, unidadesTilesPresionFlujo);
  const contenedor = document.getElementById('resultados-flujo');

  if (!r.aplica) {
    contenedor.innerHTML = [fase, kpis].join('');
    return;
  }
  const cercaDeErosion = r.velocidadFlujoMS >= r.velocidadErosionalMS * 0.8;
  contenedor.innerHTML = [
    kpis,
    grupo('Caudal y velocidad', [
      tile(`${formatearNumero(r.flujoMasicoKgH)} kg/h`, `Flujo másico de ${nombre}`),
      tile(`${formatearNumero(r.caudalNormalNm3H)} Nm³/h`, 'Caudal normal (0 °C, 1 atm)'),
      tile(`${formatearNumero(r.caudalRealM3H)} m³/h`, 'Caudal real (a presión y temperatura de operación)'),
      tile(`${formatearNumero(r.velocidadErosionalMS)} m/s`, 'Velocidad erosional (API RP 14E, C = 100)'),
      tile(`${formatearNumero(r.velocidadFlujoMS)} m/s`, cercaDeErosion ? 'Velocidad de flujo — sobre el 80 % de la erosional' : 'Velocidad de flujo', cercaDeErosion),
      tilePresion(r.perdidaCargaMbar, 'mbar', 'Pérdida de carga (Darcy-Weisbach)', 'perdida-carga', unidadesTilesPresionFlujo),
    ]),
    fase,
    tilesChequeoSonico(r.chequeoSonico, gas),
    grupo('Factores de verificación', [
      tile(`${formatearNumero(r.densidadKgM3)} kg/m³`, 'Densidad real (Peng-Robinson)', 'secundario'),
      tile(formatearZ(r.z), 'Factor de compresibilidad Z', 'secundario'),
      tile(formatearNumero(r.factorTAplicado), 'Factor T (derating por temperatura)', 'secundario'),
      tile(formatearNumero(r.reynolds), 'Número de Reynolds', 'secundario'),
      tile(formatearNumero(r.factorFriccion), 'Factor de fricción (Haaland)', 'secundario'),
    ]),
  ].join('');
}

function initFlujo() {
  const form = document.getElementById('form-flujo');
  const selectTuberia = document.getElementById('flujo-tuberia');
  poblarSelectTuberia(selectTuberia);
  renderTablaTuberia();
  selectTuberia.value = 'sch40-0.5';
  restaurarCampos('flujo');

  function actualizarVisibilidadTuberiaManual() {
    document.getElementById('campo-flujo-tuberia-manual').style.display = selectTuberia.value === 'manual' ? '' : 'none';
  }
  actualizarVisibilidadTuberiaManual();
  selectTuberia.addEventListener('input', actualizarVisibilidadTuberiaManual);

  initSelectorUnidadCampo('flujo-presion', 'flujo-presion-unidad');
  initSelectorCaudal('flujo-caudal', 'flujo-caudal-unidad');
  initTilesPresion('resultados-flujo', unidadesTilesPresionFlujo, 'unidades-tiles-presion-flujo');

  function recalcular() {
    const contenedor = document.getElementById('resultados-flujo');
    const entradas = leerFlujoForm();
    const errores = validarGas(entradas.gas);
    if (errores.length) {
      contenedor.innerHTML = grupoErroresGas(errores);
    } else {
      try {
        renderResultadosFlujo(calcularFlujo(entradas), entradas);
      } catch (error) {
        contenedor.innerHTML = grupoError(error.message);
      }
    }
    guardarCampos('flujo', form);
  }

  form.addEventListener('input', recalcular);
  alCambiarGas.push(() => {
    sincronizarOpcionKw('flujo-caudal-unidad');
    recalcular();
  });
}

/* ---------------------------------------------------------------------- */
/* Pestaña 3 — Almacenamiento                                             */
/* ---------------------------------------------------------------------- */

// Modo (licuado/comprimido) y grado de llenado ingresado se recuerdan POR
// GAS: el CO₂ suele ir licuado y un gas personalizado quizás no. Default del
// modo: licuado si el gas tiene grado de llenado, comprimido si no.
const modosAlm = cargar('alm-modo', {});
const llenadosAlm = cargar('alm-llenado', {});
const unidadesTilesAlm = cargar('unidades-tiles-presion-alm', {});

function modoAlmActual() {
  return modosAlm[gasActivoId] ?? (gasActivo().gradoLlenadoKgL !== null ? 'licuado' : 'comprimido');
}

const AYUDA_MODO = {
  licuado: 'Líquido + vapor en equilibrio, como el CO₂ y el NH₃ en cilindros y estanques a temperatura ambiente. La masa la fija el grado de llenado; la presión, la temperatura.',
  comprimido: 'Solo gas en el recipiente (PV = ZnRT, con Z de Peng-Robinson). Válido mientras la presión quede bajo la de condensación a esa temperatura.',
};

function sincronizarFormAlm({ seleccion }) {
  const gas = gasActivo();
  const modo = modoAlmActual();
  document.querySelectorAll('input[name="alm-modo"]').forEach((r) => { r.checked = r.value === modo; });
  document.getElementById('alm-modo-ayuda').textContent = AYUDA_MODO[modo];
  document.getElementById('campo-alm-presion').style.display = modo === 'comprimido' ? '' : 'none';
  document.getElementById('campo-alm-llenado').style.display = modo === 'licuado' ? '' : 'none';
  document.getElementById('alm-volumen-etiqueta').textContent = modo === 'licuado' ? 'Capacidad de agua' : 'Volumen del recipiente';

  const llenado = document.getElementById('alm-llenado');
  if (seleccion) llenado.value = llenadosAlm[gasActivoId] ?? '';
  llenado.placeholder = gas.gradoLlenadoKgL === null ? 'Ingresar' : `${formatearSignificativo(gas.gradoLlenadoKgL)} (del gas)`;
  const ayuda = document.getElementById('alm-llenado-ayuda');
  ayuda.style.display = modo === 'licuado' ? '' : 'none';
  ayuda.textContent = gas.gradoLlenadoKgL === null
    ? 'Este gas no tiene grado de llenado definido: ingresarlo aquí o en Propiedades del gas → Opcionales.'
    : `Vacío = ${formatearSignificativo(gas.gradoLlenadoKgL)} kg/L${gas.fuenteGradoLlenado ? ` (${gas.fuenteGradoLlenado})` : ''}. Depende del recipiente: confirmar el de su placa o su norma.`;

  sincronizarOpcionKw('alm-consumo-unidad');
}

function leerAlmacenamientoForm() {
  const num = (id) => numeroFlexible(document.getElementById(id).value);
  const gas = gasActivo();
  const factorVolumen = document.getElementById('alm-volumen-unidad').value === 'L' ? 0.001 : 1;
  return {
    gas,
    modo: modoAlmActual(),
    temperaturaC: num('alm-temperatura'),
    volumenM3: num('alm-volumen') * factorVolumen,
    presionBarAbs: leerPresion('alm-presion', 'alm-presion-unidad', 'bar'),
    gradoLlenadoKgL: numeroOpcional(document.getElementById('alm-llenado').value) ?? gas.gradoLlenadoKgL,
    consumo: num('alm-consumo'),
    unidadConsumo: document.getElementById('alm-consumo-unidad').value,
  };
}

function tileAutonomia(horas) {
  return horas === null
    ? tile('—', 'Autonomía (ingresar un consumo)', 'kpi')
    : tile(formatearHoras(horas), 'Autonomía (hh:mm:ss)', 'kpi');
}

function renderResultadosAlmacenamiento(r, entradas) {
  const { gas } = entradas;
  const nombre = escapeHtml(nombreCorto(gas));
  const contenedor = document.getElementById('resultados-almacenamiento');
  const consumo = [
    tile(`${formatearNumero(r.consumoKgH ?? 0)} kg/h`, 'Consumo', 'secundario'),
    tile(`${formatearNumero(r.consumoNm3H ?? 0)} Nm³/h`, 'Consumo (normalizado)', 'secundario'),
  ];

  if (r.modo === 'licuado') {
    const tcC = gas.temperaturaCriticaK - 273.15;
    contenedor.innerHTML = [
      grupo(null, [
        tile(`${formatearNumero(r.masaKg)} kg`, `Masa de ${nombre} (capacidad × grado de llenado)`, 'kpi'),
        tileAutonomia(r.autonomiaHoras),
      ], 'kpis'),
      grupo('Detalle del cálculo', [
        r.supercritico
          ? tile('Sobre la temperatura crítica', `A más de ${formatearNumero(tcC)} °C no hay líquido ni presión de vapor: la presión depende del llenado y sube rápido con la temperatura (no se estima aquí)`, 'alerta ancho')
          : tilePresion(r.presionVaporManBar, 'bar', `Presión en el recipiente = presión de vapor a ${formatearNumero(entradas.temperaturaC)} °C (manométrica)`, 'alm-psat', unidadesTilesAlm),
        tile(`${formatearNumero(r.volumenNormalNm3)} Nm³`, 'Gas equivalente (0 °C, 1 atm)', 'secundario'),
        tile(`${formatearSignificativo(entradas.gradoLlenadoKgL)} kg/L`, 'Grado de llenado usado', 'secundario'),
        ...consumo,
        '<div class="resultados-nota">Mientras quede líquido la presión se mantiene en la de vapor: el manómetro no indica cuánto queda (hay que pesar el recipiente). Al extraer gas, la evaporación enfría el líquido y baja la presión — con consumos altos puede limitar el caudal entregable, como en el GLP.</div>',
      ]),
    ].join('');
    return;
  }

  const fase = grupoFase(r.fase, gas, entradas.temperaturaC, unidadesTilesAlm);
  if (!r.aplica) {
    contenedor.innerHTML = [
      fase,
      grupo(null, ['<div class="resultados-nota">Con líquido en el recipiente, PV = ZnRT no da la masa: usar <strong>Gas licuado</strong> arriba.</div>']),
    ].join('');
    return;
  }
  contenedor.innerHTML = [
    grupo(null, [
      tile(`${formatearNumero(r.masaKg)} kg`, `Masa de ${nombre} almacenada (PV = ZnRT)`, 'kpi'),
      tileAutonomia(r.autonomiaHoras),
    ], 'kpis'),
    fase,
    grupo('Detalle del cálculo', [
      tile(formatearZ(r.z), 'Factor de compresibilidad Z (Peng-Robinson)', 'secundario'),
      tile(`${formatearNumero(r.densidadKgM3)} kg/m³`, 'Densidad en el recipiente', 'secundario'),
      tile(`${formatearNumero(r.volumenNormalNm3)} Nm³`, 'Gas equivalente (0 °C, 1 atm)', 'secundario'),
      ...consumo,
    ]),
  ].join('');
}

function initAlmacenamiento() {
  const form = document.getElementById('form-almacenamiento');
  restaurarCampos('almacenamiento');

  initSelectorUnidadCampo('alm-presion', 'alm-presion-unidad');
  initSelectorUnidadFactores('alm-volumen', 'alm-volumen-unidad', { L: 0.001, m3: 1 });
  initSelectorCaudal('alm-consumo', 'alm-consumo-unidad');
  initTilesPresion('resultados-almacenamiento', unidadesTilesAlm, 'unidades-tiles-presion-alm');

  function recalcular() {
    const contenedor = document.getElementById('resultados-almacenamiento');
    const entradas = leerAlmacenamientoForm();
    const errores = validarGas(entradas.gas);
    if (errores.length) {
      contenedor.innerHTML = grupoErroresGas(errores);
    } else if (entradas.modo === 'licuado' && !(entradas.gradoLlenadoKgL > 0)) {
      contenedor.innerHTML = grupoError('Ingresa el grado de llenado [kg/L] para calcular la masa de gas licuado.');
    } else {
      try {
        renderResultadosAlmacenamiento(calcularAlmacenamiento(entradas), entradas);
      } catch (error) {
        contenedor.innerHTML = grupoError(error.message);
      }
    }
    guardarCampos('almacenamiento', form);
  }

  form.addEventListener('input', (evento) => {
    if (evento.target.name === 'alm-modo') {
      modosAlm[gasActivoId] = evento.target.value;
      guardar('alm-modo', modosAlm);
      sincronizarFormAlm({ seleccion: false });
    } else if (evento.target.id === 'alm-llenado') {
      if (evento.target.value.trim() === '') delete llenadosAlm[gasActivoId];
      else llenadosAlm[gasActivoId] = evento.target.value;
      guardar('alm-llenado', llenadosAlm);
    }
    recalcular();
  });

  alCambiarGas.push((opciones) => {
    sincronizarFormAlm(opciones);
    recalcular();
  });
}

/* ---------------------------------------------------------------------- */

initTabs();
initValidacionNumerica();
initSelectorGasActivo();
initPanelGas();
initFlujo();
initAlmacenamiento();
notificarCambioGas({ seleccion: true });
initSelectorGas({ actualId: 'otros-gases', profundidad: 1 });
