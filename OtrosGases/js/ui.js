import { calcularFlujo } from './calc-flujo.js';
import { calcularAlmacenamiento, formatearHoras } from './calc-almacenamiento.js';
import { calcularRed } from './calc-memoria.js';
import {
  GASES_PREDEFINIDOS, ID_PERSONALIZADO, gasPersonalizadoPorDefecto, copiaPersonalizada,
  buscarGasPredefinido, validarGas,
} from './biblioteca-gases.js';
import { TABLA_TUBERIA, MATERIAL_TABLA, buscarTuberia, tuberiaDesdeManual } from './tuberias.js';
import { densidadNormal, presionVaporPa, celsiusAKelvin, MARGEN_CONDENSACION_K, R_UNIVERSAL } from './termo.js';
import { flujoMasicoKgH } from './caudal.js';
import { P_ATMOSFERICA_PA } from './physics.js';
import { guardar, cargar, exportarJSON, importarJSON } from './storage.js';
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

// La pestaña activa vive en el hash (#gas, #flujo, #almacenamiento, #memoria): el hub
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
    centrarPestana(boton);
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

// En un teléfono las pestañas no caben y la barra se desplaza en horizontal
// (2026-09-25): al activar una (también al llegar desde el hub con #memoria)
// se centra en la barra, para que la pestaña activa nunca quede cortada
// fuera de la pantalla. Sin efecto en escritorio, donde la barra no
// desborda. Mueve solo el scroll horizontal de .tabs, nunca el de la página.
function centrarPestana(boton) {
  const barra = boton.parentElement;
  const rBarra = barra.getBoundingClientRect();
  const rBoton = boton.getBoundingClientRect();
  barra.scrollLeft += rBoton.left - rBarra.left - (rBarra.width - rBoton.width) / 2;
}

// Resumen fijo de resultados en pantallas angostas (2026-09-25, uso desde
// el teléfono): bajo 960px .calc-layout apila entradas y resultados, y en
// un teléfono los KPI quedaban hasta ~800px bajo el campo que se edita —
// había que bajar y volver a subir para ver el efecto de cada cambio. Esta
// barra repite al pie de la pantalla los KPI (grupo `kpis`) de la
// calculadora en uso mientras sus resultados no están a la vista; tocarla
// baja hasta ellos. Es solo una copia de lectura, rearmada desde el DOM de
// .calc-resultados cada vez que cambia (MutationObserver): no conoce ningún
// motor de cálculo. .calc-resultados ya tiene aria-live, así que la barra
// no se anuncia aparte. Mismo código en los tres módulos — mantener igual.
function initResumenMovil() {
  const angosta = window.matchMedia('(max-width: 959px)');
  const barra = document.createElement('button');
  barra.type = 'button';
  barra.className = 'resumen-movil';
  barra.hidden = true;
  barra.setAttribute('aria-label', 'Ir a los resultados');
  document.querySelector('.viz-root').append(barra);

  let objetivo = null;
  let ultimoLayout = null;
  let aLaVista = true;
  let hayContenido = false;
  // El margen inferior negativo descuenta el alto de la propia barra: los
  // resultados cuentan como "a la vista" solo si asoman por encima de ella.
  const io = new IntersectionObserver(([entrada]) => {
    aLaVista = entrada.isIntersecting;
    actualizar();
  }, { rootMargin: '0px 0px -120px 0px' });
  const mo = new MutationObserver(() => pintar());

  // Calculadora en uso: la del último campo tocado si sigue en la pestaña
  // activa (Almacenamiento GLP tiene 3 en una misma pestaña), si no la
  // primera de la pestaña activa. Memoria de Cálculo no tiene ninguna.
  function candidato() {
    const panel = document.querySelector('.tab-panel.active');
    if (!panel) return null;
    if (ultimoLayout && ultimoLayout.isConnected && panel.contains(ultimoLayout)) {
      return ultimoLayout.querySelector('.calc-resultados');
    }
    return panel.querySelector('.calc-resultados');
  }

  function elegir() {
    const nuevo = candidato();
    if (nuevo === objetivo) return;
    io.disconnect();
    mo.disconnect();
    objetivo = nuevo;
    aLaVista = true;
    if (objetivo) {
      io.observe(objetivo);
      mo.observe(objetivo, { childList: true, subtree: true, characterData: true });
    }
    pintar();
  }

  function textoValor(tile) {
    const valor = tile.querySelector('.valor');
    if (!valor) return '';
    const unidad = valor.querySelector('select');
    const numero = Array.from(valor.childNodes).filter((n) => n !== unidad).map((n) => n.textContent).join(' ').trim();
    return unidad ? `${numero} ${unidad.selectedOptions[0]?.textContent ?? ''}` : numero;
  }

  function pintar() {
    if (objetivo && !objetivo.isConnected) { elegir(); return; }
    const tiles = objetivo ? Array.from(objetivo.querySelectorAll('.grupo-resultados.kpis > .resultado-tile')).slice(0, 3) : [];
    hayContenido = tiles.length > 0;
    barra.innerHTML = tiles.map((t) => {
      const estado = ['ok', 'alerta', 'critico'].find((c) => t.classList.contains(c)) ?? '';
      return `<span class="resumen-movil-item ${estado}">
        <span class="resumen-movil-valor">${escapeHtml(textoValor(t))}</span>
        <span class="resumen-movil-etiqueta">${escapeHtml(t.querySelector('.etiqueta')?.textContent ?? '')}</span>
      </span>`;
    }).join('') + '<span class="resumen-movil-ir" aria-hidden="true">↓</span>';
    actualizar();
  }

  function actualizar() {
    barra.hidden = !(angosta.matches && hayContenido && !aLaVista);
  }

  barra.addEventListener('click', () => {
    if (!objetivo) return;
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    objetivo.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
  });
  document.addEventListener('focusin', (evento) => {
    const layout = evento.target.closest?.('.calc-layout');
    if (layout) ultimoLayout = layout;
    elegir();
  });
  // Cambio de pestaña o de gas/combustible: puede cambiar (o reemplazar en
  // el DOM) la calculadora en uso. Se difiere un cuadro para leer el panel
  // ya activado por initTabs().
  const reelegir = () => requestAnimationFrame(elegir);
  document.addEventListener('click', reelegir);
  document.addEventListener('change', reelegir);
  window.addEventListener('hashchange', reelegir);
  angosta.addEventListener('change', actualizar);
  elegir();
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
/* Gas activo — compartido por las 4 pestañas                             */
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
/* Pestaña 4 — Memoria de Cálculo (red ramificada + informe impreso)      */
/* ---------------------------------------------------------------------- */

// Portada de Hidrogeno/js/ui.js el 2026-09-28 (a pedido del usuario: poder
// emitir memorias de CO₂, NH₃ u otro gas). Mismo esquema — tabla editable de
// tramos, diagrama unifilar, "Datos del informe", exportar/importar .json,
// informe A4 de una hoja — con estas diferencias, detalladas en
// OtrosGases/CLAUDE.md:
//   - El gas es el del selector "Gas" de la barra de pestañas; el informe
//     imprime sus constantes (sección 2) y el .json exportado lo incluye.
//   - Caudal por tramo en kg/h, Nm³/h o kW (este último solo con PCI), con
//     la unidad elegida en la cabecera de la columna (proyecto.unidadCaudal).
//   - Presión canónica en bar manométricos (Hidrógeno: MPa).
//   - Verificación automática por tramo, además de los límites manuales:
//     velocidad erosional (API RP 14E), presión máxima de diseño (Barlow, con
//     el factor F de "Datos del informe") y fase gaseosa.

let tramos = [];
let contadorId = 0;
let proyecto = null;
let contadorArtefactoId = 0;
let ultimoResultadoMemoria = [];
let errorMemoria = null;
// Último gas válido con que se calculó la Memoria: para convertir los
// caudales en kW a kg/h si el gas nuevo no tiene PCI (ver initMemoria()).
let gasMemoriaAnterior = null;

// Texto de observaciones por defecto: mismo criterio que el de Hidrógeno
// (metodología en una frase por paso), con los modelos propios de este
// módulo. Editable en el cajetín "Observaciones".
const OBSERVACIONES_DEFECTO =
  'Cálculos basados en la ecuación de continuidad (Q=vA), determinación de pérdidas de carga mediante la ' +
  'ecuación de Darcy–Weisbach con factor de fricción de Haaland y evaluación del régimen de flujo mediante el ' +
  'número de Reynolds. Densidad real del gas con la ecuación de estado de Peng–Robinson a la presión y ' +
  'temperatura de cada tramo, y estado de fase verificado con la presión de vapor de Lee–Kesler. Velocidad ' +
  'erosional según API RP 14E y presión máxima de diseño según la fórmula de Barlow (ASME B31.8 / B31.12) ' +
  'con factor de temperatura T.';

const UNIDADES_CAUDAL_ETIQUETA = { 'kg/h': 'kg/h', 'Nm3/h': 'Nm³/h', kW: 'kW' };

function proyectoPorDefecto() {
  return {
    fecha: '', proyecto: '', instalador: '', contacto: '', direccion: '', comuna: '',
    cargoInstalador: '', runInstalador: '', numeroDoc: '402605', revision: '1',
    velocidadMaxFlujoDisenoMS: 20, perdidaMaxAcumuladaDisenoPa: null, factorDiseno: 0.4,
    unidadCaudal: 'kg/h', artefactos: [], observaciones: OBSERVACIONES_DEFECTO,
  };
}

function artefactoPorDefecto() {
  contadorArtefactoId += 1;
  return { id: `a${contadorArtefactoId}`, nombre: '', caudal: 0 };
}

// Mayor sufijo numérico entre ids "t<N>" / "a<N>" y reparación de ids
// repetidos al cargar/importar — mismo fix que Hidrógeno (2026-09-24).
function maxSufijoId(items) {
  return items.reduce((max, item) => Math.max(max, Number(String(item.id).slice(1)) || 0), 0);
}

function repararIdsDuplicados(items, prefijo) {
  const vistos = new Set();
  let siguiente = maxSufijoId(items);
  return items.map((item) => {
    if (!vistos.has(item.id)) {
      vistos.add(item.id);
      return item;
    }
    siguiente += 1;
    return { ...item, id: `${prefijo}${siguiente}` };
  });
}

function tramoPorDefecto() {
  contadorId += 1;
  return {
    id: `t${contadorId}`, nombre: `Tramo ${contadorId}`, continuaDesdeId: null,
    reseteaAcumulada: false,
    presionBarG: 10, longitudM: 10, caudal: 50, tuberiaId: 'sch40-0.5',
    material: 'Acero A106 Gr. B', temperaturaC: 20,
  };
}

// Conversión de caudales al cambiar la unidad de la columna: conserva el
// flujo másico (mismo criterio que initSelectorCaudal()). null = no hay con
// qué convertir (gas inválido, o kW sin PCI). Con precisión completa: el
// redondeo es solo de lo que muestra el cajetín (ver valorMostrado()).
function conversorCaudal(de, a, gas) {
  if (de === a) return (v) => v;
  if (!gas || validarGas(gas).length) return null;
  if ((de === 'kW' || a === 'kW') && !(gas.pciMJkg > 0)) return null;
  const rhoN = densidadNormal(gas).densidadKgM3;
  return (v) => masaACaudal(
    flujoMasicoKgH({ caudal: v, unidad: de, densidadNormalKgM3: rhoN, pciMJkg: gas.pciMJkg }), a, rhoN, gas.pciMJkg,
  );
}

// Número que muestra un cajetín convertido (presión en otra unidad, caudal
// tras cambiar de unidad): 6 cifras significativas. El valor guardado
// conserva la precisión completa, y leerFilaMemoria() lo mantiene mientras
// el cajetín siga mostrando exactamente este texto — si no, cada ida y
// vuelta de unidades dejaba deriva (50 kg/h → kW → kg/h = 49,9999).
function valorMostrado(valor) {
  return String(Number(Number(valor).toPrecision(6)));
}

// Valor de un cajetín con data-mostrado: el guardado si no se editó, o lo
// escrito (con `convertir` a la unidad canónica) si cambió. Al leer lo
// escrito, data-mostrado pasa a ser ese texto: desde ahí el guardado ES lo
// escrito (si no, borrar "50" y volver a escribirlo devolvía el valor de
// una tecla intermedia).
function leerMostrado(input, guardado, convertir = (v) => v) {
  if (guardado !== undefined && input.value === input.dataset.mostrado) return guardado;
  input.dataset.mostrado = input.value;
  return convertir(numeroFlexible(input.value));
}

function convertirCaudales(convertir) {
  tramos = tramos.map((t) => ({ ...t, caudal: convertir(t.caudal) }));
  proyecto.artefactos = proyecto.artefactos.map((a) => ({ ...a, caudal: convertir(a.caudal) }));
}

function filaTuberia(t) {
  return t.tuberiaId === 'manual' ? null : TABLA_TUBERIA.find((f) => f.id === t.tuberiaId) ?? null;
}

function etiquetaTuberia(t) {
  if (t.tuberiaId === 'manual') return `Manual DI ${formatearNumero(t.tuberiaManual?.diMm ?? 0)} mm`;
  const fila = filaTuberia(t);
  return fila ? `${formatearPulgadas(fila.pulgadas)} Sch ${fila.cedula}` : '—';
}

function opcionesTuberiaTramo(seleccionada) {
  const grupoCedula = (cedula) => `<optgroup label="Schedule ${cedula}">${TABLA_TUBERIA.filter((f) => f.cedula === cedula).map(
    (f) => `<option value="${f.id}"${f.id === seleccionada ? ' selected' : ''}>${formatearPulgadas(f.pulgadas)} Sch ${cedula}</option>`,
  ).join('')}</optgroup>`;
  return grupoCedula('40') + grupoCedula('80') + `<option value="manual"${seleccionada === 'manual' ? ' selected' : ''}>Manual (mm)</option>`;
}

// Valor calculado de una celda: '—' si el tramo no tiene resultado (fase
// líquida, o la red no se pudo resolver).
function calc(valor, formatear = formatearNumero) {
  return valor === null || valor === undefined || Number.isNaN(valor) ? '—' : formatear(valor);
}

function textoPerdida(mbar, unidad) {
  return calc(mbar, (v) => formatearPresionBonita(aPa(v, 'mbar'), unidad));
}

function renderTablaMemoria(resultado) {
  const opcionesPadre = (actualId) => ['<option value="">— raíz —</option>'].concat(
    tramos.filter((t) => t.id !== actualId).map((t) => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`),
  ).join('');

  const unidadPresion = document.getElementById('memoria-presion-unidad').value;
  const unidadCaudal = UNIDADES_CAUDAL_ETIQUETA[proyecto.unidadCaudal];
  const unidadPerdidaParcial = document.getElementById('memoria-perdida-parcial-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;

  // data-label = encabezado con su unidad, para las tarjetas del teléfono
  // (td::before en css/styles.css, mismo criterio que Hidrógeno).
  document.getElementById('memoria-tabla-cuerpo').innerHTML = resultado.map((t) => `
    <tr data-id="${t.id}">
      <td class="mem-celda-nombre" data-label="Tramo"><input type="text" class="mem-nombre" value="${escapeAttr(t.nombre)}" aria-label="Nombre del tramo"></td>
      <td data-label="Continúa desde"><select class="mem-padre" aria-label="Continúa desde">${opcionesPadre(t.id)}</select></td>
      <td class="mem-celda-check" data-label="Reinicia acum." style="text-align:center;"><input type="checkbox" class="mem-reset"${t.reseteaAcumulada ? ' checked' : ''} title="Reinicia la pérdida de carga acumulada desde este tramo (ej. después de un regulador de presión)" aria-label="Reinicia la pérdida de carga acumulada"></td>
      <td data-label="Presión man. [${unidadPresion}]"><input type="text" inputmode="decimal" class="mem-presion" value="${valorMostrado(desdePa(aPa(t.presionBarG, 'bar'), unidadPresion))}" data-mostrado="${valorMostrado(desdePa(aPa(t.presionBarG, 'bar'), unidadPresion))}" aria-label="Presión manométrica [${unidadPresion}]"></td>
      <td data-label="Longitud [m]"><input type="text" inputmode="decimal" class="mem-largo" value="${t.longitudM}" aria-label="Longitud [m]"></td>
      <td data-label="Caudal [${unidadCaudal}]"><input type="text" inputmode="decimal" class="mem-caudal" value="${valorMostrado(t.caudal)}" data-mostrado="${valorMostrado(t.caudal)}" aria-label="Caudal [${unidadCaudal}]"></td>
      <td data-label="Diámetro">
        <select class="mem-tuberia" aria-label="Diámetro">${opcionesTuberiaTramo(t.tuberiaId)}</select>
        <div class="mem-tuberia-manual"${t.tuberiaId === 'manual' ? '' : ' style="display:none;"'}>
          <input type="text" inputmode="decimal" class="mem-tuberia-manual-di" value="${t.tuberiaManual?.diMm ?? 10.2}" title="Diámetro interior [mm]" aria-label="Diámetro interior [mm]">
          <input type="text" inputmode="decimal" class="mem-tuberia-manual-espesor" value="${t.tuberiaManual?.espesorMm ?? 1.65}" title="Espesor de pared [mm]" aria-label="Espesor de pared [mm]">
          <input type="text" inputmode="decimal" class="mem-tuberia-manual-limite" value="${t.tuberiaManual?.limiteElasticoMPa ?? 170}" title="Límite elástico [MPa]" aria-label="Límite elástico [MPa]">
          <input type="text" inputmode="decimal" class="mem-tuberia-manual-rugosidad" value="${t.tuberiaManual?.rugosidadMm ?? 0.0015}" title="Rugosidad [mm]" aria-label="Rugosidad [mm]">
        </div>
      </td>
      <td data-label="Material"><input type="text" class="mem-material" value="${escapeAttr(t.material)}" aria-label="Material"></td>
      <td data-label="Temp. [°C]"><input type="text" inputmode="decimal" class="mem-temp" value="${t.temperaturaC}" aria-label="Temperatura [°C]"></td>
      <td class="mem-densidad col-calculada" data-label="Densidad [kg/m³]"></td>
      <td class="mem-velocidad col-calculada" data-label="Velocidad [m/s]"></td>
      <td class="mem-perdida-parcial col-calculada" data-label="Pérdida parcial [${unidadPerdidaParcial}]"></td>
      <td class="mem-perdida-acumulada col-calculada" data-label="Pérdida acumulada [${unidadPerdidaAcumulada}]"></td>
      <td class="mem-celda-acciones"><button type="button" class="mem-eliminar no-imprimir" aria-label="Eliminar ${escapeAttr(t.nombre)}">✕</button></td>
    </tr>
  `).join('');

  tramos.forEach((t) => {
    const selectPadre = document.querySelector(`#memoria-tabla-cuerpo tr[data-id="${t.id}"] .mem-padre`);
    if (selectPadre) selectPadre.value = t.continuaDesdeId ?? '';
  });
  actualizarCeldasCalculadas(resultado);
}

// Celdas de resultado (solo lectura) de cada fila — también las usa
// recalcularMemoriaLigero(), que nunca toca un <input> (fix de foco,
// Hidrogeno/CLAUDE.md). Un tramo líquido lo dice en la celda de densidad.
function actualizarCeldasCalculadas(resultado) {
  const unidadPerdidaParcial = document.getElementById('memoria-perdida-parcial-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  resultado.forEach((t) => {
    const fila = document.querySelector(`#memoria-tabla-cuerpo tr[data-id="${t.id}"]`);
    if (!fila) return;
    const densidad = fila.querySelector('.mem-densidad');
    const liquido = t.fase?.estado === 'liquido';
    densidad.textContent = liquido ? 'Líquido' : calc(t.densidadKgM3);
    densidad.classList.toggle('mem-liquido', liquido);
    densidad.title = liquido ? 'A esta presión y temperatura el gas condensa: no se calcula como gas (ver "Tubería y Flujo" → Fase del fluido)'
      : t.fase?.estado === 'supercritico' ? 'Fluido supercrítico cerca del punto crítico: Peng-Robinson puede subestimar la densidad hasta ~10 %'
        : '';
    fila.querySelector('.mem-velocidad').textContent = calc(t.velocidadFlujoMS);
    fila.querySelector('.mem-perdida-parcial').textContent = textoPerdida(t.perdidaParcialMbar, unidadPerdidaParcial);
    fila.querySelector('.mem-perdida-acumulada').textContent = textoPerdida(t.perdidaAcumuladaMbar, unidadPerdidaAcumulada);
  });
}

// --- Diagrama de la red: dibujarDiagramaRed() y sus auxiliares son
// idénticos a los de Hidrogeno y GasNatural-GLP (copiados, no importados).
// renderArbol() solo traduce el resultado a `elementos`.
const DIAGRAMA = {
  margenX: 16, margenSup: 30, altoFila: 72, anchoMinTramo: 150, anchoMaxNombre: 240, radioCodo: 8,
  fuenteNombre: '700 12.5px Lato, system-ui, sans-serif',
  fuenteDato: '400 11px Lato, system-ui, sans-serif',
  fuenteDatoNegrita: '700 11px Lato, system-ui, sans-serif',
};
let lienzoMedida = null;

function anchoTexto(texto, fuente) {
  lienzoMedida ??= document.createElement('canvas').getContext('2d');
  lienzoMedida.font = fuente;
  return lienzoMedida.measureText(texto).width;
}

function recortarTexto(texto, fuente, anchoMax) {
  if (anchoTexto(texto, fuente) <= anchoMax) return texto;
  let recortado = texto;
  while (recortado.length > 1 && anchoTexto(`${recortado}…`, fuente) > anchoMax) recortado = recortado.slice(0, -1);
  return `${recortado.trimEnd()}…`;
}

function grosorTuberia(pulgadas) {
  return Number.isFinite(pulgadas) && pulgadas > 0 ? Math.min(9, Math.max(2.5, 2.5 + 2.5 * Math.log2(1 + pulgadas))) : 3;
}

function simboloRegulador(x, y) {
  return `<g class="arbol-regulador"><path d="M${x - 7} ${y - 6} L${x + 7} ${y + 6} L${x + 7} ${y - 6} L${x - 7} ${y + 6} Z"/>` +
    `<path d="M${x} ${y - 6} V${y - 11} M${x - 6} ${y - 11} A6 6 0 0 1 ${x + 6} ${y - 11} Z"/></g>`;
}

function dibujarDiagramaRed(svg, elementos) {
  const D = DIAGRAMA;
  if (!elementos.length) {
    svg.setAttribute('height', '64');
    svg.style.minWidth = '';
    svg.innerHTML = `<text class="arbol-vacio" x="${D.margenX}" y="37">Agrega un tramo para ver el diagrama de la red.</text>`;
    return;
  }

  const porId = new Map(elementos.map((e) => [e.id, e]));
  const esRaiz = (e) => !e.padreId || e.padreId === e.id || !porId.has(e.padreId);
  const hijosDe = new Map();
  elementos.filter((e) => !esRaiz(e)).forEach((e) => hijosDe.set(e.padreId, [...(hijosDe.get(e.padreId) ?? []), e]));

  // Filas: el primer hijo queda en la fila del padre (la cañería sigue
  // recta) y cada tramo final ocupa una fila propia. Un ciclo de "Continúa
  // desde" (viene de datos editables o importados) no cuelga el dibujo: lo
  // que quede sin visitar arranca como una red aparte.
  const nodos = [];
  const visitados = new Set();
  let filas = 0;
  const visitar = (e, nivel, padre) => {
    visitados.add(e.id);
    const nodo = { e, nivel, fila: filas, padre };
    nodos.push(nodo);
    const pendientes = (hijosDe.get(e.id) ?? []).filter((h) => !visitados.has(h.id));
    if (!pendientes.length) filas += 1;
    pendientes.forEach((h) => { if (!visitados.has(h.id)) visitar(h, nivel + 1, nodo); });
  };
  elementos.filter(esRaiz).forEach((e) => visitar(e, 0, null));
  elementos.forEach((e) => { if (!visitados.has(e.id)) visitar(e, 0, null); });

  // Cada nivel es tan ancho como el texto más largo de sus tramos.
  const niveles = Math.max(...nodos.map((n) => n.nivel)) + 1;
  const anchoNivel = Array(niveles).fill(D.anchoMinTramo);
  nodos.forEach((n) => {
    n.nombre = recortarTexto(n.e.nombre.trim() || 'Sin nombre', D.fuenteNombre, D.anchoMaxNombre);
    n.excede = n.e.resultados.some((r) => r.excede);
    const textoResultados = n.e.resultados.map((r) => (r.excede ? `▲ ${r.texto}` : r.texto)).join(' · ');
    const ancho = D.radioCodo + 22 + Math.max(
      (n.e.reinicia ? 34 : 12) + anchoTexto(n.nombre, D.fuenteNombre),
      12 + anchoTexto(n.e.datos, D.fuenteDato),
      12 + anchoTexto(textoResultados, n.excede ? D.fuenteDatoNegrita : D.fuenteDato),
    );
    anchoNivel[n.nivel] = Math.max(anchoNivel[n.nivel], Math.ceil(ancho));
  });
  const xNivel = [D.margenX];
  anchoNivel.forEach((ancho, i) => xNivel.push(xNivel[i] + ancho));
  const yFila = (fila) => D.margenSup + fila * D.altoFila;

  // En orden inverso: cada tramo se dibuja antes que su padre, así el nodo
  // del padre queda encima del arranque de sus ramales.
  const tramosSvg = nodos.slice().reverse().map((n) => {
    const x0 = xNivel[n.nivel], x1 = xNivel[n.nivel + 1], y = yFila(n.fila);
    const grosor = grosorTuberia(n.e.pulgadas);
    let inicio = x0;
    let bajada = '';
    if (n.padre && n.padre.fila !== n.fila) {
      inicio = x0 + D.radioCodo;
      bajada = `<path class="arbol-bajada" d="M${x0} ${yFila(n.padre.fila)} V${y - D.radioCodo} Q${x0} ${y} ${inicio} ${y}" stroke-width="${grosor.toFixed(1)}"/>`;
    }
    const resultados = n.e.resultados
      .map((r) => (r.excede ? `<tspan class="arbol-excede">▲ ${escapeHtml(r.texto)}</tspan>` : escapeHtml(r.texto)))
      .join(' · ');
    return `<g class="arbol-tramo${n.excede ? ' excede' : ''}">
      <title>${escapeHtml(n.e.titulo)}</title>
      ${bajada}
      <line class="arbol-tuberia" x1="${inicio}" y1="${y}" x2="${x1}" y2="${y}" stroke-width="${grosor.toFixed(1)}"/>
      ${n.padre ? '' : `<rect class="arbol-inicio" x="${x0 - 5}" y="${y - 5}" width="10" height="10" rx="1.5"/>`}
      ${n.e.reinicia ? simboloRegulador(inicio + 14, y) : ''}
      <text class="arbol-nombre" x="${inicio + (n.e.reinicia ? 34 : 12)}" y="${y - 10}">${escapeHtml(n.nombre)}</text>
      <text class="arbol-dato" x="${inicio + 12}" y="${y + 19}">${escapeHtml(n.e.datos)}</text>
      <text class="arbol-dato" x="${inicio + 12}" y="${y + 33}">${resultados}</text>
      <circle class="arbol-nodo" cx="${x1}" cy="${y}" r="${Math.max(5, grosor / 2 + 2).toFixed(1)}"/>
    </g>`;
  }).join('');

  // Leyenda solo de los símbolos que aparecen (mismo criterio que la
  // leyenda de la tabla del informe).
  let alto = yFila(filas - 1) + 44;
  let leyenda = '';
  let anchoLeyenda = 0;
  const items = [];
  if (nodos.some((n) => n.e.reinicia)) items.push({ reg: true, texto: 'Reinicia la pérdida acumulada (p. ej., regulador)' });
  if (nodos.some((n) => n.excede)) items.push({ reg: false, texto: 'Fuera del límite de diseño' });
  if (items.length) {
    const y = alto + 14;
    let x = D.margenX;
    leyenda = items.map((item) => {
      const simbolo = item.reg
        ? simboloRegulador(x + 7, y - 4)
        : `<text class="arbol-leyenda arbol-excede" x="${x}" y="${y}">▲</text>`;
      const anchoSimbolo = item.reg ? 20 : 14;
      const svgItem = `${simbolo}<text class="arbol-leyenda" x="${x + anchoSimbolo}" y="${y}">${escapeHtml(item.texto)}</text>`;
      x += anchoSimbolo + anchoTexto(item.texto, D.fuenteDato) + 24;
      return svgItem;
    }).join('');
    anchoLeyenda = x;
    alto = y + 14;
  }

  svg.setAttribute('height', String(alto));
  // Ancho mínimo = el dibujo completo: en un teléfono .arbol-contenedor
  // (overflow-x: auto) se desplaza en horizontal en vez de cortar niveles.
  svg.style.minWidth = `${Math.ceil(Math.max(xNivel[niveles] + D.margenX, anchoLeyenda))}px`;
  svg.innerHTML = tramosSvg + leyenda;
}

function renderArbol(resultado) {
  const unidadPerdidaParcial = document.getElementById('memoria-perdida-parcial-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  const unidadCaudal = UNIDADES_CAUDAL_ETIQUETA[proyecto.unidadCaudal];
  const { velocidadExcede, perdidaExcede, presionExcede } = evaluarCriteriosRed(resultado);
  // Sin resultado: "—" a secas, no "— mbar".
  const conUnidad = (texto, unidad) => (texto === '—' ? texto : `${texto} ${unidad}`);
  const perdida = (mbar, unidad) => conUnidad(textoPerdida(mbar, unidad), unidad);
  dibujarDiagramaRed(document.getElementById('memoria-arbol'), resultado.map((t) => {
    const fila = filaTuberia(t);
    const tuberia = etiquetaTuberia(t);
    const estado = t.fase?.estado;
    let resultados;
    if (estado === 'liquido') {
      resultados = [{ texto: 'Líquido: no se calcula como gas', excede: true }];
    } else {
      resultados = [
        { texto: `ΔP acum. ${perdida(t.perdidaAcumuladaMbar, unidadPerdidaAcumulada)}`, excede: perdidaExcede.has(t.id) },
        { texto: conUnidad(calc(t.velocidadFlujoMS), 'm/s'), excede: velocidadExcede.has(t.id) },
      ];
      if (estado === 'cerca-condensacion') resultados.push({ texto: 'cerca de condensar', excede: true });
      // Supercrítico: una sola fase (cumple), pero con la densidad menos exacta.
      if (estado === 'supercritico') resultados.push({ texto: 'supercrítico', excede: false });
    }
    if (presionExcede.has(t.id)) resultados.push({ texto: 'P > P máx. de diseño', excede: true });
    return {
      id: t.id, padreId: t.continuaDesdeId, nombre: t.nombre, reinicia: t.reseteaAcumulada,
      pulgadas: fila ? fila.pulgadas : (t.tuberiaManual?.diMm ?? 0) / 25.4,
      datos: `${tuberia} · ${formatearNumero(t.longitudM)} m · ${formatearNumero(t.caudal)} ${unidadCaudal}`,
      resultados,
      titulo: [
        `${t.nombre}${t.reseteaAcumulada ? ' (reinicia la pérdida acumulada)' : ''}`,
        `${tuberia}${t.material ? ` ${t.material}` : ''}`,
        `${formatearNumero(t.presionBarG)} bar man. · ${formatearNumero(t.temperaturaC)} °C`,
        `ΔP del tramo: ${perdida(t.perdidaParcialMbar, unidadPerdidaParcial)}`,
        `ΔP acumulada: ${perdida(t.perdidaAcumuladaMbar, unidadPerdidaAcumulada)}`,
        `Velocidad: ${conUnidad(calc(t.velocidadFlujoMS), 'm/s')} (erosional ${conUnidad(calc(t.velocidadErosionalMS), 'm/s')})`,
      ].join('\n'),
    };
  }));
}

function porNombreTramo(id) {
  return id ? (tramos.find((t) => t.id === id)?.nombre ?? '') : '— raíz —';
}

// Criterios de diseño del informe — mismas funciones que Hidrógeno
// (evaluarCriterio/filaVerificacion/textoConclusion, 2026-09-25), con
// `limiteTexto` opcional para los criterios que no son un número (fase).
function criterioDefinido(valor) {
  return valor !== null && valor !== undefined && !Number.isNaN(valor);
}

function formatearCriterio(valor, formatear) {
  return criterioDefinido(valor) ? formatear(valor) : 'No definida';
}

function thConUnidad(etiqueta, unidad) {
  return `${escapeHtml(etiqueta)}<span class="informe-unidad">${escapeHtml(unidad)}</span>`;
}

function evaluarCriterio({ nombre, limite, tramos: evaluables, valorDe, formatear, limiteTexto }) {
  const critico = evaluables.reduce((max, t) => (max === null || valorDe(t) > valorDe(max) ? t : max), null);
  const definido = criterioDefinido(limite);
  const exceden = definido ? evaluables.filter((t) => valorDe(t) > limite) : [];
  return {
    nombre, definido, exceden, critico, evaluados: evaluables.length,
    limiteTexto: definido ? (limiteTexto ?? `≤ ${formatear(limite)}`) : 'No definido',
    maximoTexto: critico ? formatear(valorDe(critico)) : '—',
    estado: !definido || !critico ? 'sin-limite' : exceden.length ? 'no-cumple' : 'cumple',
  };
}

function filaVerificacion(c) {
  const resultado = {
    'cumple': '<span class="informe-veredicto cumple">Cumple</span>',
    'no-cumple': `<span class="informe-veredicto no-cumple">No cumple</span> <span class="informe-veredicto-detalle">${c.exceden.length} de ${c.evaluados} ${c.evaluados === 1 ? 'tramo' : 'tramos'}</span>`,
    'sin-limite': '<span class="informe-veredicto-detalle">No evaluado</span>',
  }[c.estado];
  return `<tr><td>${escapeHtml(c.nombre)}</td><td>${c.limiteTexto}</td><td>${c.maximoTexto}</td>` +
    `<td>${c.critico ? escapeHtml(c.critico.nombre) : '—'}</td><td>${resultado}</td></tr>`;
}

function textoConclusion(criterios) {
  if (errorMemoria) return `No se pudo calcular la red: ${errorMemoria}`;
  const evaluados = criterios.filter((c) => c.estado !== 'sin-limite');
  if (!evaluados.length) {
    return 'No se definieron límites de diseño: los máximos calculados se informan sin verificación.';
  }
  const incumplidos = evaluados.filter((c) => c.estado === 'no-cumple').length;
  if (!incumplidos) {
    return evaluados.length === 1
      ? 'La red cumple el criterio de diseño definido.'
      : `La red cumple los ${evaluados.length} criterios de diseño verificados.`;
  }
  return `La red no cumple ${incumplidos} de ${evaluados.length} ${evaluados.length === 1 ? 'criterio' : 'criterios'} de diseño. ` +
    'Los valores fuera de límite se marcan con ▲ en la sección 4.';
}

function formatosCriterio() {
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  return {
    velocidad: (v) => `${formatearNumero(v)} m/s`,
    perdidaAcum: (pa) => `${formatearPresionBonita(pa, unidadPerdidaAcumulada)} ${unidadPerdidaAcumulada}`,
  };
}

// 0 = gas (o supercrítico: una sola fase), 1 = cerca de condensar, 2 = líquido.
const SEVERIDAD_FASE = { gas: 0, supercritico: 0, 'cerca-condensacion': 1, liquido: 2 };
const TEXTO_FASE = ['Gas', 'Cerca de condensar', 'Líquido'];

// Criterios de diseño contra la red resuelta: sección 5 del informe y marcas
// ▲ de la tabla impresa y del diagrama. Los criterios de gas se evalúan solo
// sobre los tramos con resultado de gas; la fase, sobre todos.
function evaluarCriteriosRed(resultado) {
  const { velocidad, perdidaAcum } = formatosCriterio();
  const deGas = resultado.filter((t) => t.aplica);
  const criterioVelocidad = evaluarCriterio({
    nombre: 'Velocidad de flujo', limite: proyecto.velocidadMaxFlujoDisenoMS,
    tramos: deGas, valorDe: (t) => t.velocidadFlujoMS, formatear: velocidad,
  });
  const criterioErosion = evaluarCriterio({
    nombre: 'Velocidad bajo la erosional (API RP 14E)', limite: 1,
    tramos: deGas, valorDe: (t) => t.velocidadFlujoMS / t.velocidadErosionalMS,
    formatear: (r) => `${formatearNumero(r * 100)} % de Ve`,
  });
  const criterioPerdida = evaluarCriterio({
    nombre: 'Pérdida de carga acumulada', limite: proyecto.perdidaMaxAcumuladaDisenoPa,
    tramos: resultado.filter((t) => t.perdidaAcumuladaMbar !== null && t.perdidaAcumuladaMbar !== undefined),
    valorDe: (t) => aPa(t.perdidaAcumuladaMbar, 'mbar'), formatear: perdidaAcum,
  });
  const conF = criterioDefinido(proyecto.factorDiseno) && proyecto.factorDiseno > 0;
  const criterioBarlow = evaluarCriterio({
    nombre: 'Presión de operación bajo la máx. de diseño (Barlow)', limite: conF ? 1 : null,
    tramos: conF ? resultado.filter((t) => t.presionMaxDisenoBar > 0) : [],
    valorDe: (t) => t.presionBarG / t.presionMaxDisenoBar,
    formatear: (r) => `${formatearNumero(r * 100)} % de P máx.`,
  });
  const criterioFase = evaluarCriterio({
    nombre: `Fase gaseosa (margen ≥ ${MARGEN_CONDENSACION_K} °C sobre la condensación)`, limite: 0,
    tramos: resultado.filter((t) => t.fase), valorDe: (t) => SEVERIDAD_FASE[t.fase.estado] ?? 0,
    formatear: (v) => TEXTO_FASE[v], limiteTexto: 'Gas',
  });
  // Sin tramos fuera de fase no hay "tramo crítico" que nombrar.
  if (criterioFase.estado === 'cumple') criterioFase.critico = null;

  const criterios = [criterioVelocidad, criterioErosion, criterioPerdida, criterioBarlow, criterioFase];
  const ids = (...lista) => new Set(lista.flatMap((c) => c.exceden.map((t) => t.id)));
  return {
    criterios,
    velocidadExcede: ids(criterioVelocidad, criterioErosion),
    perdidaExcede: ids(criterioPerdida),
    presionExcede: ids(criterioBarlow),
  };
}

function totalConsumos() {
  return proyecto.artefactos.reduce((suma, a) => suma + (Number(a.caudal) || 0), 0);
}

function actualizarTotalArtefactos() {
  const unidad = UNIDADES_CAUDAL_ETIQUETA[proyecto.unidadCaudal];
  document.getElementById('memoria-artefactos-total-txt').textContent =
    `Demanda instalada: ${formatearNumero(totalConsumos())} ${unidad} (no se considera operación simultánea)`;
}

function renderArtefactos() {
  const unidad = UNIDADES_CAUDAL_ETIQUETA[proyecto.unidadCaudal];
  document.getElementById('memoria-artefactos-cuerpo').innerHTML = proyecto.artefactos.map((a) => `
    <div class="artefacto-fila" data-id="${a.id}">
      <input type="text" class="af-nombre" value="${escapeAttr(a.nombre)}" placeholder="Punto de consumo" aria-label="Nombre del punto de consumo">
      <input type="text" inputmode="decimal" class="af-caudal" value="${valorMostrado(a.caudal)}" data-mostrado="${valorMostrado(a.caudal)}" placeholder="${unidad}" aria-label="Consumo [${unidad}]">
      <button type="button" class="af-eliminar no-imprimir" aria-label="Eliminar consumo${a.nombre ? ' ' + escapeAttr(a.nombre) : ''}">✕</button>
    </div>
  `).join('');
  actualizarTotalArtefactos();
}

// Aviso sobre la tabla: qué gas se está calculando (se elige en la barra de
// pestañas y cambia TODA la memoria) o por qué no se pudo resolver la red.
function renderAvisoMemoria() {
  const aviso = document.getElementById('memoria-aviso-gas');
  const gas = gasActivo();
  aviso.classList.toggle('error', Boolean(errorMemoria));
  aviso.innerHTML = errorMemoria
    ? `<strong>No se puede calcular la red.</strong> ${escapeHtml(errorMemoria)}`
    : `Red de <strong>${escapeHtml(etiquetaGas(gas))}</strong> — el gas se elige en el selector «Gas» de arriba y aplica a toda la memoria.`;
}

// Un símbolo en la etiqueta va en <span class="informe-simbolo">: el rótulo
// está en mayúsculas (CSS) y convertiría "ω" en "Ω", otro símbolo.
function fichaCampo(etiqueta, valor, simbolo = '') {
  const s = simbolo ? ` <span class="informe-simbolo">${escapeHtml(simbolo)}</span>` : '';
  return `<div class="informe-campo"><span class="informe-campo-label">${escapeHtml(etiqueta)}${s}</span><span class="informe-campo-valor">${escapeHtml(valor)}</span></div>`;
}

function renderInformeGas(gas) {
  const valido = !validarGas(gas).length;
  const normal = valido ? densidadNormal(gas) : null;
  document.getElementById('informe-gas').innerHTML = [
    fichaCampo('Gas', etiquetaGas(gas)),
    fichaCampo('Masa molar', `${calc(gas.masaMolarGMol, formatearSignificativo)} g/mol`),
    fichaCampo('Temperatura crítica', `${calc(gas.temperaturaCriticaK - 273.15)} °C`),
    fichaCampo('Presión crítica', `${calc(gas.presionCriticaBar, formatearSignificativo)} bar abs`),
    fichaCampo('Factor acéntrico', calc(gas.factorAcentrico, formatearSignificativo), 'ω'),
    fichaCampo('Viscosidad (~20 °C)', `${calc(gas.viscosidadUPaS, formatearSignificativo)} µPa·s`),
    fichaCampo('Densidad normal', normal ? `${formatearSignificativo(normal.densidadKgM3)} kg/Nm³ (0 °C; 1 atm)` : '—'),
    fichaCampo('PCI', gas.pciMJkg > 0 ? `${formatearSignificativo(gas.pciMJkg)} MJ/kg` : 'No combustible'),
  ].join('');
}

function renderInformeImpresion(resultado) {
  const gas = gasActivo();
  const nombreGas = gas.nombre?.trim() || 'gas personalizado';
  const subtitulo = `Red de ${nombreGas}${gas.formula ? ` (${gas.formula})` : ''}`;
  document.getElementById('informe-subtitulo').textContent = subtitulo;
  document.getElementById('informe-footer-titulo').textContent = `Memoria de Cálculo, ${subtitulo}`;

  document.getElementById('informe-doc-num').textContent = proyecto.numeroDoc;
  document.getElementById('informe-doc-rev').textContent = proyecto.revision;

  document.getElementById('informe-fecha').textContent = proyecto.fecha;
  document.getElementById('informe-proyecto').textContent = proyecto.proyecto;
  document.getElementById('informe-instalador').textContent = proyecto.instalador;
  document.getElementById('informe-direccion').textContent = proyecto.direccion;
  document.getElementById('informe-contacto').textContent = proyecto.contacto;
  document.getElementById('informe-comuna').textContent = proyecto.comuna;

  const unidadPresion = document.getElementById('memoria-presion-unidad').value;
  const unidadCaudal = UNIDADES_CAUDAL_ETIQUETA[proyecto.unidadCaudal];
  const unidadPerdidaParcial = document.getElementById('memoria-perdida-parcial-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  const { velocidad, perdidaAcum } = formatosCriterio();

  renderInformeGas(gas);
  document.getElementById('informe-vel-max-flujo').textContent = formatearCriterio(proyecto.velocidadMaxFlujoDisenoMS, velocidad);
  document.getElementById('informe-perdida-max').textContent = formatearCriterio(proyecto.perdidaMaxAcumuladaDisenoPa, perdidaAcum);
  document.getElementById('informe-barlow').textContent = criterioDefinido(proyecto.factorDiseno) && proyecto.factorDiseno > 0
    ? `Barlow · F = ${formatearNumero(proyecto.factorDiseno)} · E = 1 · factor T`
    : 'No evaluada';

  document.getElementById('informe-artefactos-th-consumo').innerHTML = thConUnidad('Consumo', unidadCaudal);
  document.getElementById('informe-artefactos-cuerpo').innerHTML = proyecto.artefactos.length
    ? proyecto.artefactos.map((a) => `<tr><td>${escapeHtml(a.nombre)}</td><td>${formatearNumero(Number(a.caudal) || 0)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="informe-vacio">Sin puntos de consumo registrados</td></tr>';
  document.getElementById('informe-potencia-instalada').textContent = `${formatearNumero(totalConsumos())} ${unidadCaudal}`;

  const { criterios, velocidadExcede, perdidaExcede, presionExcede } = evaluarCriteriosRed(resultado);
  const marcar = (texto, excede) => (excede ? `<span class="informe-excede">▲ ${texto}</span>` : texto);
  const marcaFase = { liquido: 'L', 'cerca-condensacion': 'C', supercritico: 'S' };

  document.getElementById('memoria-impresion-th-presion').innerHTML = thConUnidad('Presión man.', unidadPresion);
  document.getElementById('memoria-impresion-th-caudal').innerHTML = thConUnidad('Caudal', unidadCaudal);
  document.getElementById('memoria-impresion-th-parcial').innerHTML = thConUnidad('ΔP tramo', unidadPerdidaParcial);
  document.getElementById('memoria-impresion-th-perdida').innerHTML = thConUnidad('ΔP acumulada', unidadPerdidaAcumulada);
  document.getElementById('memoria-tabla-impresion-cuerpo').innerHTML = resultado.map((t) => {
    const marcas = [t.reseteaAcumulada ? 'R' : '', marcaFase[t.fase?.estado] ?? ''].filter(Boolean);
    return `
    <tr>
      <td>${escapeHtml(t.nombre)}${marcas.map((m) => `<sup class="informe-marca">${m}</sup>`).join('')}</td>
      <td>${t.continuaDesdeId ? escapeHtml(porNombreTramo(t.continuaDesdeId)) : '<span class="informe-vacio">Inicio de red</span>'}</td>
      <td>${marcar(formatearPresionBonita(aPa(t.presionBarG, 'bar'), unidadPresion), presionExcede.has(t.id))}</td>
      <td>${formatearNumero(t.temperaturaC)}</td>
      <td>${formatearNumero(t.longitudM)}</td>
      <td>${formatearNumero(t.caudal)}</td>
      <td>${escapeHtml(etiquetaTuberia(t))}</td>
      <td>${escapeHtml(t.material)}</td>
      <td>${textoPerdida(t.perdidaParcialMbar, unidadPerdidaParcial)}</td>
      <td>${marcar(textoPerdida(t.perdidaAcumuladaMbar, unidadPerdidaAcumulada), perdidaExcede.has(t.id))}</td>
      <td>${marcar(calc(t.velocidadFlujoMS), velocidadExcede.has(t.id))}</td>
    </tr>`;
  }).join('');

  const leyenda = [];
  if (resultado.some((t) => t.reseteaAcumulada)) {
    leyenda.push('<sup class="informe-marca">R</sup> La pérdida acumulada se reinicia en este tramo (p. ej., aguas abajo de un regulador de presión).');
  }
  if (resultado.some((t) => t.fase?.estado === 'liquido')) {
    leyenda.push(`<sup class="informe-marca">L</sup> A esta presión y temperatura el ${escapeHtml(nombreCorto(gas))} condensa: el tramo llevaría líquido y no se calcula como gas.`);
  }
  if (resultado.some((t) => t.fase?.estado === 'cerca-condensacion')) {
    leyenda.push(`<sup class="informe-marca">C</sup> Menos de ${MARGEN_CONDENSACION_K} °C de margen sobre la temperatura de condensación.`);
  }
  if (resultado.some((t) => t.fase?.estado === 'supercritico')) {
    leyenda.push('<sup class="informe-marca">S</sup> Fluido supercrítico cerca del punto crítico: una sola fase, pero la densidad calculada (Peng-Robinson) puede quedar hasta ~10 % baja.');
  }
  if (velocidadExcede.size || perdidaExcede.size || presionExcede.size) {
    leyenda.push('<span class="informe-excede">▲</span> Valor fuera del límite de diseño (ver sección 5).');
  }
  document.getElementById('informe-leyenda-tramos').innerHTML = leyenda.join(' ');

  document.getElementById('informe-verificacion-cuerpo').innerHTML = criterios.map(filaVerificacion).join('');
  const conclusion = document.getElementById('informe-conclusion');
  conclusion.textContent = textoConclusion(criterios);
  conclusion.className = `informe-conclusion ${errorMemoria || criterios.some((c) => c.estado === 'no-cumple') ? 'no-cumple' : criterios.some((c) => c.estado === 'cumple') ? 'cumple' : ''}`;

  document.getElementById('informe-observaciones').textContent = proyecto.observaciones;
  document.getElementById('informe-footer-doc').textContent = `${proyecto.numeroDoc}, Rev. ${proyecto.revision}`;

  document.getElementById('informe-firma-nombre').textContent = proyecto.instalador;
  document.getElementById('informe-firma-cargo').textContent = proyecto.cargoInstalador;
  document.getElementById('informe-firma-run').textContent = proyecto.runInstalador;
}

// Resuelve la red con el gas activo. Si no se puede (gas incompleto, un
// ciclo en "Continúa desde", kW sin PCI), la tabla se sigue mostrando —
// con los cálculos en "—" y el motivo en el aviso — para poder corregirla.
// Hidrógeno reemplaza la tabla por el mensaje de error; acá se evita porque
// un ciclo solo se deshace editando justamente esa tabla.
function resolverRed() {
  const gas = gasActivo();
  const errores = validarGas(gas);
  if (errores.length) {
    errorMemoria = `El gas activo tiene datos incompletos o fuera de rango — corregirlos en "Propiedades del gas": ${errores.join(' ')}`;
    return tramos.map((t) => ({ ...t }));
  }
  try {
    const resultado = calcularRed(tramos, { gas, unidadCaudal: proyecto.unidadCaudal, factorDiseno: proyecto.factorDiseno ?? NaN });
    errorMemoria = null;
    gasMemoriaAnterior = gas;
    return resultado;
  } catch (error) {
    errorMemoria = error.message;
    return tramos.map((t) => ({ ...t }));
  }
}

function recalcularMemoria() {
  const resultado = resolverRed();
  ultimoResultadoMemoria = resultado;
  renderAvisoMemoria();
  renderTablaMemoria(resultado);
  renderArbol(resultado);
  renderArtefactos();
  renderInformeImpresion(resultado);
  guardar('memoria', tramos);
  guardar('memoria-proyecto', proyecto);
}

// Igual que recalcularMemoria() pero sin regenerar ningún <input> (fix de
// foco al escribir, Hidrogeno/CLAUDE.md 2026-09-08): solo celdas de
// resultado, nombres en "Continúa desde", diagrama e informe.
function recalcularMemoriaLigero() {
  const resultado = resolverRed();
  ultimoResultadoMemoria = resultado;
  renderAvisoMemoria();
  actualizarCeldasCalculadas(resultado);
  tramos.forEach((t) => {
    document.querySelectorAll(`#memoria-tabla-cuerpo .mem-padre option[value="${t.id}"]`).forEach((opcion) => {
      opcion.textContent = t.nombre;
    });
  });
  renderArbol(resultado);
  renderInformeImpresion(resultado);
  guardar('memoria', tramos);
  guardar('memoria-proyecto', proyecto);
}

function leerProyecto() {
  const val = (id) => document.getElementById(id).value;
  return {
    fecha: val('mp-fecha'), proyecto: val('mp-proyecto'), instalador: val('mp-instalador'),
    contacto: val('mp-contacto'), direccion: val('mp-direccion'), comuna: val('mp-comuna'),
    cargoInstalador: val('mp-cargo'), runInstalador: val('mp-run'),
    numeroDoc: val('mp-doc'), revision: val('mp-revision'),
    velocidadMaxFlujoDisenoMS: numeroOpcional(val('mp-vel-max-flujo')),
    perdidaMaxAcumuladaDisenoPa: numeroOpcional(val('mp-perdida-max')),
    factorDiseno: numeroOpcional(val('mp-factor-diseno')),
    observaciones: val('mp-observaciones'),
  };
}

function aplicarProyectoAForm() {
  document.getElementById('mp-fecha').value = proyecto.fecha;
  document.getElementById('mp-proyecto').value = proyecto.proyecto;
  document.getElementById('mp-instalador').value = proyecto.instalador;
  document.getElementById('mp-contacto').value = proyecto.contacto;
  document.getElementById('mp-direccion').value = proyecto.direccion;
  document.getElementById('mp-comuna').value = proyecto.comuna;
  document.getElementById('mp-cargo').value = proyecto.cargoInstalador;
  document.getElementById('mp-run').value = proyecto.runInstalador;
  document.getElementById('mp-doc').value = proyecto.numeroDoc;
  document.getElementById('mp-revision').value = proyecto.revision;
  document.getElementById('mp-vel-max-flujo').value = proyecto.velocidadMaxFlujoDisenoMS ?? '';
  document.getElementById('mp-perdida-max').value = proyecto.perdidaMaxAcumuladaDisenoPa ?? '';
  document.getElementById('mp-factor-diseno').value = proyecto.factorDiseno ?? '';
  document.getElementById('mp-observaciones').value = proyecto.observaciones;
  document.getElementById('memoria-caudal-unidad').value = proyecto.unidadCaudal;
}

function leerFilaArtefacto(fila) {
  const previo = proyecto.artefactos.find((a) => a.id === fila.dataset.id);
  return {
    id: fila.dataset.id,
    nombre: fila.querySelector('.af-nombre').value,
    caudal: leerMostrado(fila.querySelector('.af-caudal'), previo?.caudal),
  };
}

function leerFilaMemoria(fila) {
  const val = (clase) => fila.querySelector(`.${clase}`).value;
  const unidadPresion = document.getElementById('memoria-presion-unidad').value;
  const tuberiaId = val('mem-tuberia');
  const esManual = tuberiaId === 'manual';
  const previo = tramos.find((t) => t.id === fila.dataset.id);
  return {
    id: fila.dataset.id,
    nombre: val('mem-nombre'),
    continuaDesdeId: val('mem-padre') || null,
    reseteaAcumulada: fila.querySelector('.mem-reset').checked,
    presionBarG: leerMostrado(fila.querySelector('.mem-presion'), previo?.presionBarG, (v) => desdePa(aPa(v, unidadPresion), 'bar')),
    longitudM: numeroFlexible(val('mem-largo')),
    caudal: leerMostrado(fila.querySelector('.mem-caudal'), previo?.caudal),
    tuberiaId,
    tuberiaManual: esManual ? {
      diMm: numeroFlexible(val('mem-tuberia-manual-di')), espesorMm: numeroFlexible(val('mem-tuberia-manual-espesor')),
      limiteElasticoMPa: numeroFlexible(val('mem-tuberia-manual-limite')), rugosidadMm: numeroFlexible(val('mem-tuberia-manual-rugosidad')),
    } : undefined,
    material: val('mem-material'),
    temperaturaC: numeroFlexible(val('mem-temp')),
  };
}

// El informe entra siempre en una sola hoja A4 — mismo objetivo y mismo
// `zoom` que Hidrógeno (2026-09-08; `zoom` y no `transform`, para que la
// paginación vea el alto ya reducido), pero midiendo distinto: Chrome
// dispara `beforeprint` con los estilos de PANTALLA todavía activos (medido
// con page.pdf() el 2026-09-28: matchMedia('print') = false y el informe,
// oculto, mide 0 px), así que medir el informe "en su lugar" daba siempre 0
// y nunca se achicaba — una red de 5 tramos ya salía en 2 hojas. Acá se
// muestra un instante fuera de la pantalla con el ancho útil de la hoja
// (A4 menos los márgenes de 14 mm del @page) y se mide ahí; sus estilos
// viven fuera de @media print justamente para eso (ver css/styles.css).
//
// El factor no es simplemente disponible/natural: con `zoom` el informe
// sigue ocupando el ancho de la hoja, así que por dentro se ensancha (182/z
// mm), las líneas se parten menos y el alto baja MÁS que proporcionalmente
// (medido: z = 0,83 dejaba ~11 mm libres al pie). Ese cociente siempre cabe
// y es la cota inferior; una búsqueda binaria encuentra el mayor z que
// todavía entra, midiendo con el mismo ancho visual que tendrá en papel.
function ajustarEscalaImpresion() {
  const el = document.getElementById('memoria-informe-impresion');
  if (!el) return;
  el.style.zoom = '';
  const estilo = el.getAttribute('style') ?? '';
  const anchoHojaMm = 210 - 2 * 14;
  const altoCon = (zoom) => {
    el.setAttribute('style', `${estilo};display:block;position:absolute;left:-10000px;top:0;visibility:hidden;` +
      `width:${anchoHojaMm / zoom}mm;zoom:${zoom};`);
    return el.getBoundingClientRect().height;
  };
  // ×0.98: margen contra el redondeo de `zoom` (mismo criterio que Hidrógeno).
  const altoDisponiblePx = (297 - 2 * 14) * (96 / 25.4) * 0.98;
  const altoNaturalPx = altoCon(1);
  let zoom = 1;
  if (altoNaturalPx > altoDisponiblePx) {
    let cabe = altoDisponiblePx / altoNaturalPx;
    let noCabe = 1;
    for (let i = 0; i < 8; i++) {
      const medio = (cabe + noCabe) / 2;
      if (altoCon(medio) <= altoDisponiblePx) cabe = medio; else noCabe = medio;
    }
    zoom = cabe;
  }
  el.setAttribute('style', estilo);
  el.style.zoom = zoom < 1 ? String(zoom) : '';
}

// Línea de estado bajo la barra de acciones (importar/exportar, conversión
// de unidades).
function mostrarEstado(texto, esError = false) {
  const estado = document.getElementById('memoria-estado');
  estado.textContent = texto;
  estado.classList.toggle('error', esError);
}

// Si los caudales de la memoria están en kW y el gas activo no tiene PCI,
// pasan a kg/h con el PCI del último gas con que se calculó (mismo flujo
// másico) — en vez de leer "50 kW" como "50 kg/h" o dejar la red sin
// calcular. Se llama al cambiar de gas y al importar un proyecto.
function sincronizarUnidadCaudalConGas() {
  const gas = gasActivo();
  if (proyecto.unidadCaudal === 'kW' && !(gas.pciMJkg > 0)) {
    const convertir = conversorCaudal('kW', 'kg/h', gasMemoriaAnterior);
    if (convertir) convertirCaudales(convertir);
    proyecto.unidadCaudal = 'kg/h';
    mostrarEstado(`${nombreCorto(gas)} no tiene PCI: los caudales de la memoria pasaron de kW a kg/h${convertir ? ' (mismo flujo másico)' : ''}.`);
  }
  document.getElementById('memoria-caudal-unidad').value = proyecto.unidadCaudal;
  sincronizarOpcionKw('memoria-caudal-unidad');
}

// Proyecto exportado desde ESTA calculadora: tramos con presión en bar
// manométricos. Un .json de Hidrógeno (presionMPa, potenciaKw) se rechaza en
// vez de importarse con otros significados.
function esProyectoOtrosGases(datos) {
  return datos !== null && typeof datos === 'object' && !Array.isArray(datos)
    && Array.isArray(datos.tramos) && datos.tramos.every((t) => t && typeof t.presionBarG === 'number');
}

// Gas del .json: uno predefinido se selecciona; uno personalizado reemplaza
// al guardado (con confirmación si era distinto). false = el usuario no
// aceptó reemplazarlo y se sigue con el gas activo.
function aplicarGasImportado(gas) {
  if (!gas || typeof gas !== 'object') return true;
  if (gas.id !== ID_PERSONALIZADO) {
    if (buscarGasPredefinido(gas.id)) seleccionarGas(gas.id);
    return true;
  }
  const nuevo = { ...gasPersonalizadoPorDefecto(), ...gas, id: ID_PERSONALIZADO };
  const guardado = cargar('gas-personalizado', null);
  if (guardado !== null && JSON.stringify(guardado) !== JSON.stringify(nuevo)
    && !window.confirm(`El proyecto trae su propio gas personalizado ("${nuevo.nombre}"), distinto del guardado en este navegador ("${gasPersonalizado.nombre}"). ¿Reemplazarlo?`)) {
    return false;
  }
  gasPersonalizado = nuevo;
  guardar('gas-personalizado', gasPersonalizado);
  seleccionarGas(ID_PERSONALIZADO);
  return true;
}

// Nombre de archivo del .json: NFKD pasa "₂" a "2" (CO₂ → co2) y separa
// las tildes, que se quitan.
function slugArchivo(texto) {
  return texto.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gas';
}

function initMemoria() {
  window.addEventListener('beforeprint', ajustarEscalaImpresion);
  window.addEventListener('afterprint', () => {
    const el = document.getElementById('memoria-informe-impresion');
    if (el) el.style.zoom = '';
  });
  tramos = cargar('memoria', null) ?? [tramoPorDefecto()];
  tramos = repararIdsDuplicados(tramos, 't');
  contadorId = maxSufijoId(tramos);
  proyecto = { ...proyectoPorDefecto(), ...cargar('memoria-proyecto', {}) };
  proyecto.artefactos = repararIdsDuplicados(proyecto.artefactos, 'a');
  contadorArtefactoId = maxSufijoId(proyecto.artefactos);
  aplicarProyectoAForm();

  // Unidad de las columnas de presión — solo cambian cómo se muestra/lee
  // (el dato canónico en `tramos` es bar manométrico).
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

  // Unidad del caudal: a diferencia de las de presión, los números de
  // `tramos` y de los consumos están EN esa unidad (así, al cambiar de gas,
  // lo que se escribió en Nm³/h sigue en Nm³/h). Cambiarla convierte todos
  // los caudales conservando el flujo másico.
  const selectCaudal = document.getElementById('memoria-caudal-unidad');
  sincronizarOpcionKw('memoria-caudal-unidad');
  selectCaudal.addEventListener('input', () => {
    const convertir = conversorCaudal(proyecto.unidadCaudal, selectCaudal.value, gasActivo());
    if (!convertir) {
      selectCaudal.value = proyecto.unidadCaudal;
      mostrarEstado('No se puede convertir el caudal: primero completa los datos del gas en "Propiedades del gas".', true);
      return;
    }
    convertirCaudales(convertir);
    proyecto.unidadCaudal = selectCaudal.value;
    mostrarEstado('');
    recalcularMemoria();
  });

  // Cambio de gas (o edición del personalizado): la memoria entera se
  // recalcula con el gas nuevo.
  alCambiarGas.push(() => {
    sincronizarUnidadCaudalConGas();
    recalcularMemoria();
  });

  document.getElementById('memoria-agregar-tramo').addEventListener('click', () => {
    tramos.push(tramoPorDefecto());
    recalcularMemoria();
    const nombre = document.querySelector('#memoria-tabla-cuerpo tr:last-child .mem-nombre');
    if (nombre) { nombre.focus(); nombre.select(); }
  });

  // <select> de la fila (padre, tubería) → re-render completo; <input> →
  // solo resultados (fix de foco).
  document.getElementById('memoria-tabla-cuerpo').addEventListener('input', (evento) => {
    const fila = evento.target.closest('tr[data-id]');
    if (!fila) return;
    const actualizado = leerFilaMemoria(fila);
    tramos = tramos.map((t) => (t.id === actualizado.id ? actualizado : t));
    if (evento.target.tagName === 'SELECT') {
      recalcularMemoria();
    } else {
      recalcularMemoriaLigero();
    }
  });

  document.getElementById('memoria-tabla-cuerpo').addEventListener('click', (evento) => {
    if (!evento.target.classList.contains('mem-eliminar')) return;
    const id = evento.target.closest('tr[data-id]').dataset.id;
    tramos = tramos.filter((t) => t.id !== id).map((t) => (t.continuaDesdeId === id ? { ...t, continuaDesdeId: null } : t));
    recalcularMemoria();
  });

  // Datos del informe: el factor F cambia la presión máxima de diseño de
  // cada tramo, así que se recalcula la red (liviano: la tabla de tramos no
  // se regenera); el resto solo refresca diagrama e informe.
  document.getElementById('form-memoria-proyecto').addEventListener('input', (evento) => {
    proyecto = { ...proyecto, ...leerProyecto() };
    if (evento.target.id === 'mp-factor-diseno') {
      recalcularMemoriaLigero();
      return;
    }
    renderArbol(ultimoResultadoMemoria);
    renderInformeImpresion(ultimoResultadoMemoria);
    guardar('memoria-proyecto', proyecto);
  });

  document.getElementById('memoria-artefactos-cuerpo').addEventListener('input', (evento) => {
    const fila = evento.target.closest('.artefacto-fila');
    if (!fila) return;
    const actualizado = leerFilaArtefacto(fila);
    proyecto.artefactos = proyecto.artefactos.map((a) => (a.id === actualizado.id ? actualizado : a));
    actualizarTotalArtefactos();
    renderInformeImpresion(ultimoResultadoMemoria);
    guardar('memoria-proyecto', proyecto);
  });

  document.getElementById('memoria-artefactos-cuerpo').addEventListener('click', (evento) => {
    if (!evento.target.classList.contains('af-eliminar')) return;
    const id = evento.target.closest('.artefacto-fila').dataset.id;
    proyecto.artefactos = proyecto.artefactos.filter((a) => a.id !== id);
    recalcularMemoria();
  });

  document.getElementById('memoria-artefacto-agregar').addEventListener('click', () => {
    proyecto.artefactos.push(artefactoPorDefecto());
    recalcularMemoria();
  });

  // El .json lleva también el gas: sin él, un proyecto con gas
  // personalizado no se podría reproducir en otro navegador.
  document.getElementById('memoria-exportar').addEventListener('click', () => {
    const gas = gasActivo();
    const archivo = `proyecto-${slugArchivo(gas.formula || gas.nombre || 'gas')}.json`;
    exportarJSON(archivo, { tramos, proyecto, gas });
    mostrarEstado(`Proyecto exportado como ${archivo}.`);
  });

  document.getElementById('memoria-importar').addEventListener('change', async (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    evento.target.value = '';
    let datos;
    try {
      datos = await importarJSON(archivo);
    } catch (error) {
      mostrarEstado(`No se pudo importar "${archivo.name}": no es un archivo JSON válido.`, true);
      return;
    }
    if (!esProyectoOtrosGases(datos)) {
      mostrarEstado(`No se pudo importar "${archivo.name}": no es un proyecto exportado desde la calculadora de Otros Gases.`, true);
      return;
    }
    tramos = repararIdsDuplicados(datos.tramos, 't');
    contadorId = maxSufijoId(tramos);
    proyecto = { ...proyectoPorDefecto(), ...datos.proyecto };
    proyecto.artefactos = repararIdsDuplicados(proyecto.artefactos ?? [], 'a');
    contadorArtefactoId = maxSufijoId(proyecto.artefactos);
    aplicarProyectoAForm();
    const gasAplicado = aplicarGasImportado(datos.gas);
    sincronizarUnidadCaudalConGas();
    recalcularMemoria();
    const n = `${tramos.length} ${tramos.length === 1 ? 'tramo' : 'tramos'}`;
    mostrarEstado(gasAplicado
      ? `Proyecto "${archivo.name}" importado — ${n}, ${etiquetaGas(gasActivo())}.`
      : `Proyecto "${archivo.name}" importado — ${n}, calculado con el gas activo (${etiquetaGas(gasActivo())}): no se reemplazó el gas personalizado.`);
  });

  document.getElementById('memoria-imprimir').addEventListener('click', () => window.print());

  recalcularMemoria();
  // El diagrama mide sus textos con Lato: si la fuente aún no cargaba, se
  // midió con la de reserva — se redibuja cuando llega.
  document.fonts?.ready.then(() => renderArbol(ultimoResultadoMemoria));
}

/* ---------------------------------------------------------------------- */

initTabs();
initValidacionNumerica();
initSelectorGasActivo();
initPanelGas();
initFlujo();
initAlmacenamiento();
initMemoria();
notificarCambioGas({ seleccion: true });
initSelectorGas({ actualId: 'otros-gases', profundidad: 1 });
initResumenMovil();
