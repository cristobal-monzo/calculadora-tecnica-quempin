import {
  calcularDiametro, regimenDesdePresion, UMBRAL_MEDIA_PRESION_PA, LD_CODO_POR_DEFECTO, K_CODO_H2,
  VELOCIDAD_MAX_H2_POR_DEFECTO, GASES_DIAMETRO,
} from './calc-diametro.js';
import { TABLA_VI_DS66, GAS_TABLA_VI_POR_DEFECTO } from '../../GasNatural-GLP/js/calc-red-gas.js';
import { VELOCIDAD_MAXIMA_DS66_MS } from '../../GasNatural-GLP/js/pipe-network.js';
import { aPa, desdePa } from '../../Hidrogeno/js/unidades-presion.js';
import { guardar, cargar } from './storage.js';
import { initSelectorGas } from '../../assets/gas-switcher.js';

/* ---------------------------------------------------------------------- */
/* Utilidades de formato y formulario — copiadas de OtrosGases/js/ui.js   */
/* (mismo patrón de pantalla, ver CLAUDE.md raíz)                         */
/* ---------------------------------------------------------------------- */

// Coma decimal / punto de miles (es-CL). Solo formato: el cálculo interno
// sigue con precisión completa.
const FORMATO_NUMERO = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
function formatearNumero(valor) {
  return FORMATO_NUMERO.format(valor);
}
const FORMATO_UN_DECIMAL = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
const FORMATO_PORCENTAJE = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 0 });

// "," o "." como separador decimal; lo no numérico cuenta como 0 (ver
// Hidrogeno/CLAUDE.md, "Separador decimal flexible").
function numeroFlexible(valor) {
  const n = Number(String(valor).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

// Dentro del grupo `kpis`, para que la barra de resumen del teléfono también
// avise que falta un dato en vez de quedar vacía.
function grupoError(mensaje) {
  return grupo(null, [tile('Revisa los datos', escapeHtml(mensaje), 'critico ancho')], 'kpis');
}

/* ---------------------------------------------------------------------- */
/* Gases y supuestos por gas                                              */
/* ---------------------------------------------------------------------- */

// Supuestos por defecto de cada gas: los mismos valores por defecto de la
// herramienta completa correspondiente (Red de Gas: 1 kPa y 15 °C; Tubería y
// Flujo de Hidrógeno: 0,8 barG y 20 °C). Cobre tipo L en GLP/GN: es la
// tubería más usada en redes interiores y, por tener el DI más chico por
// nominal, la opción conservadora.
const SUPUESTOS_POR_DEFECTO = {
  GLP: {
    'dt-presion': '1', 'dt-presion-unidad': 'kPa', 'dt-temperatura': '15', 'dt-material': 'Cobre tipo L',
    'dt-tabla-vi': GAS_TABLA_VI_POR_DEFECTO.GLP, 'dt-ld-codo': String(LD_CODO_POR_DEFECTO),
  },
  GN: {
    'dt-presion': '1', 'dt-presion-unidad': 'kPa', 'dt-temperatura': '15', 'dt-material': 'Cobre tipo L',
    'dt-tabla-vi': GAS_TABLA_VI_POR_DEFECTO.GN, 'dt-ld-codo': String(LD_CODO_POR_DEFECTO),
  },
  H2: {
    'dt-presion': '0.8', 'dt-presion-unidad': 'bar', 'dt-temperatura': '20', 'dt-vmax': String(VELOCIDAD_MAX_H2_POR_DEFECTO),
  },
};

const form = document.getElementById('form-diametro');
const campoCodos = document.getElementById('dt-codos');
const selectUnidadPresion = document.getElementById('dt-presion-unidad');

let gasActual = cargar('gas', 'GLP');
if (!GASES_DIAMETRO.includes(gasActual)) gasActual = 'GLP';
const supuestosGuardados = cargar('supuestos', {});

// Campos que dependen del gas: los que el gas actual usa (los demás quedan
// ocultos con [data-solo-gas] y no se leen ni se guardan).
function camposSupuestosDelGas() {
  return Array.from(form.querySelectorAll('[data-por-gas]'))
    .filter((el) => el.id in SUPUESTOS_POR_DEFECTO[gasActual]);
}

function escribirSupuestos() {
  form.querySelectorAll('[data-solo-gas]').forEach((el) => {
    el.hidden = !el.dataset.soloGas.split(' ').includes(gasActual);
  });
  if (gasActual !== 'H2') {
    document.getElementById('dt-tabla-vi').innerHTML = TABLA_VI_DS66[gasActual]
      .map((f) => `<option value="${f.id}">${escapeHtml(f.nombre)}</option>`).join('');
  }
  const valores = { ...SUPUESTOS_POR_DEFECTO[gasActual], ...supuestosGuardados[gasActual] };
  camposSupuestosDelGas().forEach((el) => {
    el.value = valores[el.id];
    // Un id guardado que ya no existe en un <select> (p. ej. una fila de la
    // Tabla VI que se quitara) deja el select vacío: vuelve al por defecto.
    if (el.tagName === 'SELECT' && el.value !== valores[el.id]) el.value = SUPUESTOS_POR_DEFECTO[gasActual][el.id];
    el.removeAttribute('aria-invalid');
    el.removeAttribute('title');
  });
  selectUnidadPresion.dataset.unidadAnterior = selectUnidadPresion.value;
  document.querySelectorAll('input[name="gas"]').forEach((r) => { r.checked = r.value === gasActual; });
}

function guardarSupuestos() {
  supuestosGuardados[gasActual] = Object.fromEntries(camposSupuestosDelGas().map((el) => [el.id, el.value]));
  guardar('supuestos', supuestosGuardados);
}

const CAMPOS_COMUNES = ['dt-potencia', 'dt-largo', 'dt-codos'];

function restaurarEntradas() {
  const guardadas = cargar('entradas', null);
  if (!guardadas) return;
  CAMPOS_COMUNES.forEach((id) => {
    if (typeof guardadas[id] === 'string') document.getElementById(id).value = guardadas[id];
  });
}

function guardarEntradas() {
  guardar('entradas', Object.fromEntries(CAMPOS_COMUNES.map((id) => [id, document.getElementById(id).value])));
}

// Codos: entero ≥ 0. Vacío cuenta como 0 (el campo se está editando);
// "2.5" o "-1" pasan tal cual para que el motor lo rechace con su mensaje.
// Un <input type="number"> con texto que no entiende devuelve value "" —
// validity.badInput lo distingue de un campo vacío.
function leerCodos() {
  if (campoCodos.validity.badInput) return NaN;
  const bruto = campoCodos.value.trim().replace(',', '.');
  if (bruto === '') return 0;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : NaN;
}

function leerEntradas() {
  const valor = (id) => numeroFlexible(document.getElementById(id).value);
  const entradas = {
    gas: gasActual,
    potenciaKw: valor('dt-potencia'),
    longitudM: valor('dt-largo'),
    codos: leerCodos(),
    presionPa: aPa(valor('dt-presion'), selectUnidadPresion.value),
    temperaturaC: valor('dt-temperatura'),
  };
  if (gasActual === 'H2') {
    entradas.velocidadMaxMS = valor('dt-vmax');
  } else {
    entradas.material = document.getElementById('dt-material').value;
    entradas.gasTablaVI = document.getElementById('dt-tabla-vi').value;
    entradas.ldCodo = valor('dt-ld-codo');
  }
  return entradas;
}

/* ---------------------------------------------------------------------- */
/* Formato de resultados                                                  */
/* ---------------------------------------------------------------------- */

// Pérdida de carga en la unidad natural de cada caso: Pa en baja presión
// (el D.S. 66 fija 150/120 Pa), kPa en media presión, mbar en H₂ (la unidad
// de Tubería y Flujo).
function unidadPerdida(r) {
  if (r.metodo === 'darcy') return 'mbar';
  return r.regimen === '<10 kPa' ? 'Pa' : 'kPa';
}

function numeroPresion(valorPa, unidad) {
  return (unidad === 'Pa' ? FORMATO_UN_DECIMAL : FORMATO_NUMERO).format(desdePa(valorPa, unidad));
}

function formatearPresion(valorPa, unidad) {
  return `${numeroPresion(valorPa, unidad)} ${unidad}`;
}

// Presión de suministro tal como la escribió el usuario (su unidad).
function presionSuministroTexto(entradas) {
  return formatearPresion(entradas.presionPa, selectUnidadPresion.value);
}

function formatearValorCriterio(c, valor, r) {
  if (c.unidad === 'Pa') return formatearPresion(valor, unidadPerdida(r));
  return `${formatearNumero(valor)} ${c.unidad}`;
}

const NOMBRE_CORTO_CRITERIO = {
  perdida: 'pérdida de carga', velocidad: 'velocidad', erosion: 'velocidad de erosión', 'presion-diseno': 'presión de diseño',
};

function textoMaterial(entradas, candidato) {
  if (entradas.gas === 'H2') {
    return `DE ${formatearNumero(candidato.detalle.tuberia.deMm)} mm · DI ${formatearNumero(candidato.diMm)} mm`;
  }
  const material = entradas.material === 'Acero Sch40' ? 'Acero Sch 40' : 'Cobre tipo L';
  return `${material} · DI ${formatearNumero(candidato.diMm)} mm`;
}

function textoRegimen(r) {
  return r.regimen === '<10 kPa' ? 'Baja presión' : 'Media presión';
}

// Qué hacer cuando ningún diámetro de la tabla alcanza.
function sugerenciaSinSolucion(r) {
  if (r.metodo === 'darcy') {
    return 'Subir la presión de suministro o repartir la carga en más de una línea. Un diámetro mayor se puede verificar con tubería manual en Tubería y Flujo (Hidrógeno).';
  }
  return r.regimen === '<10 kPa'
    ? 'Acortar el recorrido, repartir la carga en más de una línea o llevar el gas en media presión y regular cerca de los artefactos.'
    : 'Subir la presión de suministro o repartir la carga en más de una línea.';
}

/* ---------------------------------------------------------------------- */
/* Resultados                                                             */
/* ---------------------------------------------------------------------- */

function grupoKpis(r, entradas) {
  if (!r.recomendado) {
    const g = r.mayor.gobernante;
    return grupo(null, [
      tile(`Ninguno hasta ${formatearPulgadas(r.mayor.pulgadas)}`, 'Diámetro nominal: ningún diámetro de la tabla cumple', 'kpi critico'),
      r.mayor.excedeCapacidad || !g
        ? tile('Sin caudal', `${formatearPulgadas(r.mayor.pulgadas)} no entrega este caudal a esta presión`, 'kpi critico')
        : tile(formatearValorCriterio(g, g.valor, r),
          `${g.nombre} con ${formatearPulgadas(r.mayor.pulgadas)} · ${FORMATO_PORCENTAJE.format(g.uso)} del límite (${formatearValorCriterio(g, g.limite, r)})`, 'kpi critico'),
      `<div class="resultados-nota">${sugerenciaSinSolucion(r)}</div>`,
    ], 'kpis');
  }
  const c = r.recomendado;
  const g = c.gobernante;
  return grupo(null, [
    tile(formatearPulgadas(c.pulgadas), `Diámetro nominal mínimo · ${textoMaterial(entradas, c)}`, 'kpi ok'),
    tile(formatearValorCriterio(g, g.valor, r),
      `${g.nombre} · ${FORMATO_PORCENTAJE.format(g.uso)} del límite (${formatearValorCriterio(g, g.limite, r)})`, 'kpi'),
  ], 'kpis');
}

function grupoCondensacion(r, entradas) {
  if (!r.riesgoCondensacion) return '';
  const rocioBar = r.presionRocioAbsPa / 1e5;
  return grupo(null, [
    tile('El GLP condensa en la cañería', `A ${formatearNumero(entradas.temperaturaC)} °C una mezcla 70/30 propano/butano condensa sobre ${formatearNumero(rocioBar)} bar abs, y la presión de suministro es ${formatearNumero((entradas.presionPa + 101325) / 1e5)} bar abs: el cálculo de gas deja de aplicar. Bajar la presión de suministro.`, 'critico ancho'),
  ]);
}

function grupoDetalle(r, entradas) {
  const c = r.recomendado ?? r.mayor;
  if (c.excedeCapacidad) return '';
  const unidad = unidadPerdida(r);
  const titulo = r.recomendado
    ? `Cálculo con ${formatearPulgadas(c.pulgadas)}`
    : `Cálculo con ${formatearPulgadas(c.pulgadas)} (el mayor de la tabla)`;
  const caudal = r.metodo === 'darcy'
    ? tile(`${formatearNumero(r.caudalM3H)} Nm³/h`, 'Caudal de hidrógeno (0 °C, 1 bar)', 'secundario')
    : tile(`${formatearNumero(r.caudalM3H)} m³/h`, 'Caudal de gas (m³ a 15 °C y 101,3 kPa, D.S. 66 f.2)', 'secundario');
  const codos = entradas.codos;
  const recorrido = r.metodo === 'darcy'
    ? tile(`${formatearNumero(entradas.longitudM)} m`, codos
      ? `Largo real + ${codos} ${codos === 1 ? 'codo' : 'codos'} (K = ${formatearNumero(K_CODO_H2)} c/u)`
      : 'Largo real, sin codos', 'secundario')
    : tile(`${formatearNumero(c.longitudCalculoM)} m`, codos
      ? `Largo de cálculo = ${formatearNumero(entradas.longitudM)} m + ${codos} × ${formatearNumero(c.longitudCodosM / codos)} m por codo`
      : 'Largo de cálculo (sin codos: el largo real)', 'secundario');
  const aporteCodos = codos && c.perdidaPa > 0
    ? tile(formatearPresion(c.perdidaCodosPa, unidad), `Aporte de los codos · ${FORMATO_PORCENTAJE.format(c.perdidaCodosPa / c.perdidaPa)} de la pérdida`, 'secundario')
    : '';
  const suministro = r.metodo === 'darcy'
    ? tile(presionSuministroTexto(entradas), `Presión de suministro (man.) a ${formatearNumero(entradas.temperaturaC)} °C`, 'secundario')
    : tile(textoRegimen(r), `Suministro ${presionSuministroTexto(entradas)} man. (${r.regimen === '<10 kPa' ? 'bajo' : 'desde'} ${formatearNumero(UMBRAL_MEDIA_PRESION_PA / 1000)} kPa)`, 'secundario');
  return grupo(titulo, [
    caudal,
    recorrido,
    tile(formatearPresion(c.perdidaPa, unidad), `Pérdida de carga (admisible ${formatearPresion(r.perdidaAdmisiblePa, unidad)})`, 'secundario'),
    aporteCodos,
    tile(`${formatearNumero(c.velocidadMS)} m/s`, r.metodo === 'darcy' ? 'Velocidad del gas' : 'Velocidad del gas (D.S. 66 f.5)', 'secundario'),
    suministro,
  ]);
}

// Con más de un criterio (H₂: 4; GLP/GN en media presión: pérdida y
// velocidad) se listan con su valor y su límite. Con uno solo (GLP/GN en
// baja presión) ya lo dice el segundo KPI.
function grupoCriterios(r) {
  const c = r.recomendado ?? r.mayor;
  if (c.criterios.length < 2) return '';
  const comparador = (k) => (k.cumple ? (k.estricto ? '<' : '≤') : (k.estricto ? '≥' : '>'));
  const items = c.criterios.map((k) => `<li class="${k.cumple ? 'cumple' : 'no-cumple'}">
      <span class="marca" aria-hidden="true">${k.cumple ? '✓' : '✗'}</span>
      <span><strong>${k.nombre}</strong>: ${formatearValorCriterio(k, k.valor, r)} ${comparador(k)} ${formatearValorCriterio(k, k.limite, r)}<span class="visualmente-oculto">${k.cumple ? ' — cumple' : ' — no cumple'}</span></span>
    </li>`).join('');
  return grupo(`Criterios verificados con ${formatearPulgadas(c.pulgadas)}`, [`<ul class="lista-criterios">${items}</ul>`]);
}

// Tabla de diámetros vecinos: 2 por debajo y 2 por encima del elegido (o los
// 3 mayores si ninguno alcanza) — muestra por qué el anterior no sirve y
// cuánto margen da el siguiente, sin una tabla de 10 filas.
function grupoComparacion(r) {
  const n = r.candidatos.length;
  const desde = r.recomendado ? Math.max(0, r.indiceRecomendado - 2) : Math.max(0, n - 3);
  const hasta = r.recomendado ? Math.min(n, r.indiceRecomendado + 3) : n;
  const unidad = unidadPerdida(r);
  const filas = r.candidatos.slice(desde, hasta).map((c, i) => {
    const esRecomendado = desde + i === r.indiceRecomendado;
    let resultado;
    if (c.excedeCapacidad) resultado = '<span class="estado-no">No entrega el caudal</span>';
    else if (c.cumple) resultado = esRecomendado ? '<span class="estado-si">Mínimo que cumple</span>' : '<span class="estado-si">Cumple</span>';
    else {
      const peor = c.criterios.filter((k) => !k.cumple).reduce((a, b) => (b.uso > a.uso ? b : a));
      resultado = `<span class="estado-no">No: ${NOMBRE_CORTO_CRITERIO[peor.id]}</span>`;
    }
    return `<tr class="${esRecomendado ? 'fila-recomendada' : ''}">
      <th scope="row">${formatearPulgadas(c.pulgadas)}</th>
      <td>${formatearNumero(c.diMm)}</td>
      <td>${c.excedeCapacidad ? '—' : numeroPresion(c.perdidaPa, unidad)}</td>
      <td>${c.excedeCapacidad ? '—' : formatearNumero(c.velocidadMS)}</td>
      <td>${resultado}</td>
    </tr>`;
  }).join('');
  return grupo('Comparación con los diámetros vecinos', [
    `<div class="tabla-comparacion-contenedor"><table class="tabla-comparacion">
      <thead><tr><th scope="col">Nominal</th><th scope="col">DI [mm]</th><th scope="col">Pérdida [${unidad}]</th><th scope="col">Vel. [m/s]</th><th scope="col">Resultado</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>`,
  ]);
}

function notaMetodo(r) {
  if (r.metodo === 'darcy') {
    return `Método de Tubería y Flujo (módulo Hidrógeno): Darcy-Weisbach con factor de fricción de Haaland, Z de NIST y
      presión máxima de diseño por Barlow (ASME B31.12, F = 0,40 Clase 4, con Hf y T). Tubería: la tabla del módulo
      Hidrógeno (¼" a 1¼"). Criterios: velocidad, pérdida ≤ 10 % de la presión absoluta, velocidad de erosión (API RP 14E)
      y presión de diseño. No incluye tees ni válvulas: para eso usa
      <a href="../Hidrogeno/#flujo">Tubería y Flujo</a> o la <a href="../Hidrogeno/#memoria">Memoria de Cálculo</a>.`;
  }
  const criterio = r.regimen === '<10 kPa'
    ? `pérdida ≤ ${formatearPresion(r.perdidaAdmisiblePa, 'Pa')} (D.S. 66, Tabla VIII, baja presión)`
    : `velocidad < ${formatearNumero(VELOCIDAD_MAXIMA_DS66_MS)} m/s (D.S. 66 art. 45.2.9 d) y pérdida ≤ 10 % de la presión
      absoluta inicial (criterio de media presión de la app, no fijado por el D.S. 66)`;
  return `Método D.S. N°66: Renouard (${r.regimen === '<10 kPa' ? 'f.1, baja presión' : 'f.3, media presión'}) con
    propiedades de la Tabla VI — ${escapeHtml(r.tablaVI.nombre)} (d ${formatearNumero(r.tablaVI.densidadRelativa)}, PCS
    ${formatearNumero(r.tablaVI.pcsMJm3)} MJ/m³) — y factor K de la Tabla IX. Criterio: ${criterio}. No incluye desnivel
    (e.2), tees ni válvulas: para eso, o para una red de varios tramos, usa
    <a href="../GasNatural-GLP/#red-gas">Red de Gas</a> o la <a href="../GasNatural-GLP/#memoria">Memoria de Cálculo</a>.`;
}

function renderResultados(r, entradas) {
  document.getElementById('resultados-diametro').innerHTML = [
    grupoCondensacion(r, entradas),
    grupoKpis(r, entradas),
    grupoDetalle(r, entradas),
    grupoCriterios(r),
    grupoComparacion(r),
    grupo(null, [`<div class="resultados-nota nota-metodo">${notaMetodo(r)}</div>`]),
  ].join('');
}

/* ---------------------------------------------------------------------- */
/* Textos de ayuda que dependen del gas y del resultado                   */
/* ---------------------------------------------------------------------- */

function actualizarAyudas(entradas, r) {
  const vmax = formatearNumero(numeroFlexible(document.getElementById('dt-vmax').value));
  document.getElementById('ayuda-gas').textContent = {
    GLP: 'Criterio D.S. N°66: pérdida de carga de hasta 150 Pa en baja presión (en media presión: velocidad menor a 40 m/s y pérdida de hasta un 10 % de la presión).',
    GN: 'Criterio D.S. N°66: pérdida de carga de hasta 120 Pa en baja presión (en media presión: velocidad menor a 40 m/s y pérdida de hasta un 10 % de la presión).',
    H2: `Criterios: velocidad de hasta ${vmax} m/s y pérdida de hasta un 10 % de la presión absoluta.`,
  }[gasActual];

  const c = r?.recomendado;
  document.getElementById('ayuda-codos').textContent = gasActual === 'H2'
    ? `Codos de 90°. Cada uno suma K = ${formatearNumero(K_CODO_H2)} a la pérdida de carga.`
    : `Codos de 90°. Cada uno suma ${formatearNumero(entradas.ldCodo)} diámetros de largo equivalente${c ? ` (${formatearNumero((entradas.ldCodo * c.diMm) / 1000)} m en ${formatearPulgadas(c.pulgadas)})` : ''}.`;

  const resumen = gasActual === 'H2'
    ? [`${presionSuministroTexto(entradas)} man.`, `${formatearNumero(entradas.temperaturaC)} °C`, `v ≤ ${vmax} m/s`]
    : [
      `${regimenDesdePresion(entradas.presionPa) === '<10 kPa' ? 'Baja presión' : 'Media presión'} ${presionSuministroTexto(entradas)}`,
      `${formatearNumero(entradas.temperaturaC)} °C`,
      entradas.material === 'Acero Sch40' ? 'acero Sch 40' : 'cobre tipo L',
    ];
  document.getElementById('supuestos-resumen').textContent = `· ${resumen.join(' · ')}`;

  document.getElementById('ayuda-supuestos').textContent = gasActual === 'H2'
    ? 'La presión fija la densidad del hidrógeno: a más presión, menos velocidad y menos pérdida para la misma potencia. La velocidad máxima por defecto (20 m/s) es la misma de la Memoria de Cálculo de Hidrógeno.'
    : 'Bajo 10 kPa se calcula en baja presión; desde 10 kPa, en media presión. En baja presión la presión de suministro solo cambia la velocidad informada. Largo equivalente por codo: 30 diámetros interiores (codo estándar de 90°, Crane TP-410).';
}

/* ---------------------------------------------------------------------- */

function recalcular() {
  const entradas = leerEntradas();
  const contenedor = document.getElementById('resultados-diametro');
  const codosValidos = Number.isInteger(entradas.codos) && entradas.codos >= 0;
  if (codosValidos) campoCodos.removeAttribute('aria-invalid');
  else campoCodos.setAttribute('aria-invalid', 'true');
  // aria-disabled y no disabled: un botón deshabilitado pierde el foco justo
  // al llegar a 0 (el foco saltaría al inicio de la página con el teclado).
  document.querySelector('.contador-btn[data-paso="-1"]').setAttribute('aria-disabled', String(!(entradas.codos > 0)));
  let resultado = null;
  try {
    resultado = calcularDiametro(entradas);
    renderResultados(resultado, entradas);
  } catch (error) {
    contenedor.innerHTML = grupoError(error.message);
  }
  actualizarAyudas(entradas, resultado);
}

function cambiarGas(gas) {
  gasActual = gas;
  guardar('gas', gas);
  escribirSupuestos();
  recalcular();
}

function initFormulario() {
  restaurarEntradas();
  escribirSupuestos();

  // Cambiar la unidad de la presión convierte el número mostrado para
  // conservar la presión física (1 kPa → 10 mbar), como en los demás
  // módulos. Corre antes que el listener del formulario (fase de destino).
  selectUnidadPresion.addEventListener('input', () => {
    const input = document.getElementById('dt-presion');
    if (input.value.trim() !== '') {
      const valorPa = aPa(numeroFlexible(input.value), selectUnidadPresion.dataset.unidadAnterior);
      input.value = Number(desdePa(valorPa, selectUnidadPresion.value).toPrecision(6));
    }
    selectUnidadPresion.dataset.unidadAnterior = selectUnidadPresion.value;
  });

  form.addEventListener('input', (evento) => {
    if (evento.target.name === 'gas') {
      cambiarGas(evento.target.value);
      return;
    }
    if (evento.target.hasAttribute('data-por-gas')) guardarSupuestos();
    else guardarEntradas();
    recalcular();
  });

  // Contador de codos: − / + para el teléfono (sin tener que abrir el
  // teclado); el cajetín sigue aceptando un número tipeado.
  form.addEventListener('click', (evento) => {
    const boton = evento.target.closest('.contador-btn');
    if (!boton) return;
    const actual = leerCodos();
    const base = Number.isFinite(actual) ? Math.max(0, Math.round(actual)) : 0;
    campoCodos.value = Math.max(0, base + Number(boton.dataset.paso));
    campoCodos.dispatchEvent(new Event('input', { bubbles: true }));
  });

  document.getElementById('dt-restablecer').addEventListener('click', () => {
    delete supuestosGuardados[gasActual];
    guardar('supuestos', supuestosGuardados);
    escribirSupuestos();
    recalcular();
  });

  // Enter en un cajetín no debe "enviar" el formulario (recargaría la página).
  form.addEventListener('submit', (evento) => evento.preventDefault());

  recalcular();
}

initValidacionNumerica();
initFormulario();
initSelectorGas({ actualId: 'diametro-tuberia', profundidad: 1 });
initResumenMovil();
