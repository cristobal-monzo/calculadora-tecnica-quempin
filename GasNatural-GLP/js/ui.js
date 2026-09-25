import { TABLA_TUBERIA_RED_GAS } from './pipe-network.js';
import { calcularRedGas } from './calc-red-gas.js';
import { calcularRedMemoria } from './calc-memoria-red-gas.js';
import { cilindrosPorVaporizacion, cilindrosPorConsumoDiario, calcularEstanqueGLP } from './calc-almacenamiento-glp.js';
import { calcularCombustionGLP, calcularCombustionGN } from './calc-combustion.js';
import { propiedadesGN } from './gas-gn.js';
import { calcularQuemador } from './calc-quemador.js';
import { guardar, cargar, exportarJSON, importarJSON } from './storage.js';
import { initSelectorGas } from '../../assets/gas-switcher.js';
import { aPa, desdePa, formatearPresion, opcionesUnidadPresion } from './unidades-presion.js';

let combustible = cargar('combustible', 'GLP');

// Parseo de las cajas de ingreso manual (2026-09-02, a pedido del usuario):
// son <input type="text" inputmode="decimal"> en vez de type="number" para
// que "," y "." funcionen indistintamente como separador decimal — con
// type="number" el navegador aplica el separador de su locale y descarta el
// otro carácter en silencio, lo que en la práctica impedía tipear cualquier
// decimal (y por lo tanto cualquier valor menor a 1) según la configuración
// regional del navegador/SO. Igual que un <input type="number"> vacío o
// inválido, un valor no numérico se trata como 0. Copia funcional de la
// misma función en Hidrogeno/js/ui.js (ver su CLAUDE.md) — sin dependencia
// cruzada entre módulos, mismo criterio que unidades-presion.js.
function numeroFlexible(valor) {
  const n = Number(String(valor).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Escapa texto que se interpola dentro de un atributo HTML (ej.
// aria-label="..."). Copia funcional de la misma función en
// Hidrogeno/js/ui.js (ver su CLAUDE.md), sin dependencia cruzada.
function escapeAttr(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// Escapa texto libre de usuario (nombre de tramo/artefacto) antes de
// insertarlo como CONTENIDO de una etiqueta (ej. <td>, <option>, <text> del
// árbol SVG) — copia funcional de la misma función en Hidrogeno/js/ui.js
// (ver su CLAUDE.md para el detalle del bug que la motivó), sin
// dependencia cruzada.
function escapeHtml(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Formato de los números MOSTRADOS (2026-09-24): coma decimal / punto de
// miles (es-CL), igual que Hidrogeno. Antes este módulo mostraba
// `toFixed()` con punto decimal, así que "2.087 Nm³/h" se leía como dos
// mil en vez de dos coma cero ocho siete. Se conserva exactamente la
// cantidad de decimales que ya tenía cada resultado — solo cambian los
// separadores. Nunca usar para el `value` de un <input> (numeroFlexible()
// leería "1.000" como 1).
const FORMATOS_FIJOS = new Map();
function formatearFijo(valor, decimales) {
  if (!FORMATOS_FIJOS.has(decimales)) {
    FORMATOS_FIJOS.set(decimales, new Intl.NumberFormat('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }));
  }
  return FORMATOS_FIJOS.get(decimales).format(valor);
}

// Valores tipeados por el usuario (longitud, potencia, criterios de
// diseño) que se repiten en el informe: sin ceros de relleno, hasta 4
// decimales para no recortar lo que se ingresó.
const FORMATO_LIBRE = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 4 });
function formatearLibre(valor) {
  return FORMATO_LIBRE.format(valor);
}

// Misma precisión fija por unidad que formatearPresion() de
// unidades-presion.js (que no se toca: unidades-presion.test.js depende
// de poder Number()-earla), con separadores es-CL.
function formatearPresionFija(valorPa, unidad) {
  const texto = formatearPresion(valorPa, unidad);
  return formatearFijo(Number(texto), (texto.split('.')[1] ?? '').length);
}

// La pestaña activa vive en el hash de la URL (#red-gas, #almacenamiento,
// #combustion, #quemador, #memoria — el data-tab de cada botón,
// 2026-09-24, mismo patrón que Hidrogeno): recargar ya no devuelve siempre
// a la primera pestaña, y el hub puede enlazar directo a una herramienta.
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
      // La barra de pestañas queda fija arriba al hacer scroll: si se cambia
      // de pestaña estando más abajo, volver al inicio del contenido.
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

// Marca en rojo (aria-invalid) un cajetín numérico cuyo texto no se puede
// leer como número — numeroFlexible() lo trata como 0 sin avisar
// (2026-09-24, mismo patrón que Hidrogeno). Vacío no cuenta como inválido.
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

function tile(valor, etiqueta, variante) {
  const clase = variante ? ` ${variante}` : '';
  return `<div class="resultado-tile${clase}"><div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div></div>`;
}

// Agrupa tiles de resultado bajo un subtítulo opcional, cada grupo con su
// propia grilla auto-fit (2026-09-24, mismo patrón que Hidrogeno) — los KPI
// ocupan todo el ancho en vez de dejar columnas vacías. `clase` = 'kpis'
// para el grupo de KPI del tope.
function grupo(titulo, tiles, clase = '') {
  const subtitulo = titulo ? `<div class="resultados-subtitulo">${titulo}</div>` : '';
  return `<div class="grupo-resultados${clase ? ` ${clase}` : ''}">${subtitulo}${tiles.join('')}</div>`;
}

// Encabezado "Resultados" de la columna derecha dentro de un
// .bloque-calculo de Almacenamiento (el resto de las pestañas lo trae
// fijo en index.html).
const ENCABEZADO_RESULTADOS = '<div class="resultados-encabezado"><h2>Resultado</h2></div>';

/* --- Selectores de unidad de presión, uno independiente por campo/resultado --- */

// Cablea un <select> de unidad junto a un <input> de presión: al cambiar la
// unidad, convierte el número mostrado para conservar la presión física
// (ej. 1000 Pa -> 10 mbar), sin tocar el motor de cálculo. El evento 'input'
// del <select> burbujea hasta el listener del formulario, así que no hace
// falta disparar un recálculo aparte. Idempotente: se puede volver a llamar
// en cada render() (p.ej. tras restaurar estado guardado al cambiar de
// combustible) para resincronizar la unidad base sin duplicar el listener.
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

// formatearPresion() usa una cantidad fija de decimales por unidad (pensada
// para tiles numéricos, donde importa una precisión predecible) — para un
// texto de opción/etiqueta (ej. "Baja presión (<10 kPa)") esos ceros de
// más se ven como ruido ("<10.0000 kPa"). Recorta los ceros sobrantes sin
// tocar unidades-presion.js (unidades-presion.test.js depende de su
// precisión fija actual).
function formatearPresionEtiqueta(valorPa, unidad) {
  return formatearLibre(Number(formatearPresion(valorPa, unidad)));
}

const listeners = [];
function alCambiarCombustible(fn) { listeners.push(fn); }
function notificarCambioCombustible() { listeners.forEach((fn) => fn(combustible)); }

// Control segmentado GLP | Gas Natural en la barra de pestañas (2026-09-24,
// antes un <select id="selector-combustible">): un radio por combustible.
function establecerCombustible(valor) {
  if (valor === combustible) return;
  combustible = valor;
  document.querySelectorAll('input[name="combustible"]').forEach((r) => { r.checked = r.value === combustible; });
  guardar('combustible', combustible);
  notificarCambioCombustible();
}

function initSelectorCombustible() {
  document.querySelectorAll('input[name="combustible"]').forEach((radio) => {
    radio.checked = radio.value === combustible;
    radio.addEventListener('change', () => {
      if (radio.checked) establecerCombustible(radio.value);
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Pestaña 1 — Red de Gas                                                 */
/* ---------------------------------------------------------------------- */

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

function poblarSelectDiametro(select) {
  select.innerHTML = TABLA_TUBERIA_RED_GAS.map((f) => `<option value="${f.pulgadas}">${formatearPulgadas(f.pulgadas)}</option>`).join('')
    + '<option value="manual">Manual (ingresar mm)</option>';
}

function leerRedGasForm() {
  const num = (id) => numeroFlexible(document.getElementById(id).value);
  const diametroSeleccionado = document.getElementById('rg-diametro').value;
  const esManual = diametroSeleccionado === 'manual';
  return {
    gas: combustible,
    regimenPresion: document.getElementById('rg-regimen').value,
    material: document.getElementById('rg-material').value,
    pulgadas: esManual ? null : Number(diametroSeleccionado),
    tuberiaManual: esManual ? {
      diametroMm: num('rg-diametro-manual-mm'), k: num('rg-diametro-manual-k'),
    } : undefined,
    potenciaKw: num('rg-potencia'),
    longitudM: num('rg-longitud'),
    presionInicialPa: leerPresion('rg-presion-inicial', 'rg-presion-inicial-unidad', 'Pa'),
    temperaturaC: num('rg-temperatura'),
  };
}

// Unidad elegida para cada tile de resultado en presión — independiente de
// la unidad del campo de ingreso y persistida aparte.
const unidadesTilesPresionRedGas = cargar('unidades-tiles-presion-red-gas', {});

function tilePresion(valorPa, etiqueta, clave, variante) {
  const unidad = unidadesTilesPresionRedGas[clave] || 'Pa';
  const clase = variante ? ` ${variante}` : '';
  return `<div class="resultado-tile${clase}" data-tile-presion="${clave}" data-pa="${valorPa}">
    <div class="valor"><span class="valor-numero">${formatearPresionFija(valorPa, unidad)}</span><select class="select-unidad-inline" data-tile-presion-unidad="${clave}" aria-label="Unidad de ${escapeAttr(etiqueta)}">${opcionesUnidadPresion(unidad)}</select></div>
    <div class="etiqueta">${etiqueta}</div>
  </div>`;
}

function renderResultadosRedGas(r) {
  const variante = r.tuberiaAdecuada ? 'ok' : 'alerta';
  const detalle = [
    tile(`${formatearFijo(r.caudalObjetivoM3H, 3)} m³/h`, 'Caudal objetivo', 'secundario'),
    tile(`${formatearFijo(r.velocidadMS, 2)} m/s`, 'Velocidad de flujo', 'secundario'),
    tile(`${formatearFijo(r.volumenTuberiaM3, 4)} m³`, 'Volumen de la tubería', 'secundario'),
    tilePresion(r.perdidaAdmisiblePa, 'Pérdida de presión admisible', 'perdida-admisible', 'secundario'),
  ];
  if (r.presionFinalPa !== null) {
    detalle.push(tilePresion(r.presionFinalPa, 'Presión final', 'presion-final', 'secundario'));
  }
  document.getElementById('resultados-red-gas').innerHTML = [
    grupo(null, [
      tile(r.tuberiaAdecuada ? 'Sí' : 'No — usar diámetro mayor', 'Tubería adecuada', `kpi ${variante}`),
      tilePresion(r.perdidaPresionRequeridaPa, 'Pérdida de presión requerida', 'perdida-requerida', `kpi ${variante}`),
    ], 'kpis'),
    grupo('Detalle del cálculo', detalle),
  ].join('');
}

function initRedGas() {
  const form = document.getElementById('form-red-gas');
  const selectDiametro = document.getElementById('rg-diametro');
  poblarSelectDiametro(selectDiametro);

  const guardados = cargar('red-gas', null);
  if (guardados) {
    Object.entries(guardados).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.value = valor;
    });
  } else {
    selectDiametro.value = '0.75';
  }

  // Diámetro manual (2026-09-02, a pedido del usuario): "Material de
  // tubería" no aplica cuando el diámetro es manual (acero/cobre son solo
  // dos DI distintos de la misma fila tabulada; con un DI propio no hay
  // fila que elegir), así que se oculta junto con mostrar los campos
  // manuales — ver leerRedGasForm().
  function actualizarVisibilidadDiametroManual() {
    const esManual = selectDiametro.value === 'manual';
    document.getElementById('campo-rg-diametro-manual').style.display = esManual ? '' : 'none';
    document.getElementById('campo-rg-material').style.display = esManual ? 'none' : '';
  }
  actualizarVisibilidadDiametroManual();
  selectDiametro.addEventListener('input', actualizarVisibilidadDiametroManual);

  initSelectorUnidadCampo('rg-presion-inicial', 'rg-presion-inicial-unidad');

  // El umbral del selector "Régimen de presión" (10 kPa) es un valor fijo
  // del motor de cálculo (no un campo editable) — su selector de unidad solo
  // recalcula el texto mostrado en las dos opciones, el `value` interno
  // ("<10 kPa" / ">10 kPa") no cambia.
  function actualizarEtiquetasRegimen() {
    const unidad = document.getElementById('rg-regimen-unidad').value;
    const umbral = formatearPresionEtiqueta(aPa(10, 'kPa'), unidad);
    const select = document.getElementById('rg-regimen');
    select.options[0].textContent = `Baja presión (<${umbral} ${unidad})`;
    select.options[1].textContent = `Media/alta presión (>${umbral} ${unidad})`;
  }
  actualizarEtiquetasRegimen();
  document.getElementById('rg-regimen-unidad').addEventListener('input', actualizarEtiquetasRegimen);

  // Selector de unidad independiente en cada tile de presión: solo redibuja
  // ese tile a partir del valor en Pa ya cacheado en el DOM, sin recalcular.
  document.getElementById('resultados-red-gas').addEventListener('change', (evento) => {
    const clave = evento.target.dataset.tilePresionUnidad;
    if (!clave) return;
    unidadesTilesPresionRedGas[clave] = evento.target.value;
    guardar('unidades-tiles-presion-red-gas', unidadesTilesPresionRedGas);
    const contenedor = evento.target.closest('[data-tile-presion]');
    contenedor.querySelector('.valor-numero').textContent = formatearPresionFija(Number(contenedor.dataset.pa), evento.target.value);
  });

  function recalcular() {
    try {
      const resultado = calcularRedGas(leerRedGasForm());
      renderResultadosRedGas(resultado);
    } catch (error) {
      document.getElementById('resultados-red-gas').innerHTML = tile(error.message, 'Error', 'alerta');
    }
    guardar('red-gas', Object.fromEntries(
      Array.from(form.querySelectorAll('input, select')).map((el) => [el.id, el.value])
    ));
  }

  form.addEventListener('input', recalcular);
  alCambiarCombustible(recalcular);
  recalcular();
}

/* ---------------------------------------------------------------------- */
/* Pestaña 2 — Almacenamiento (solo GLP)                                  */
/* ---------------------------------------------------------------------- */

function marcadoAlmacenamientoGLP() {
  return `
    <section class="bloque-calculo">
      <h3 class="bloque-titulo">Cilindros — por razón de vaporización</h3>
      <div class="calc-layout">
      <form id="form-cilindros-vap" class="fila-campos calc-entradas" autocomplete="off">
        <div class="campo"><label for="cv-potencia">Potencia total [kW]</label><input id="cv-potencia" type="text" inputmode="decimal" value="90" required></div>
        <div class="campo"><label for="cv-razon">Razón de vaporización [kW/cilindro]</label><input id="cv-razon" type="text" inputmode="decimal" value="30" required></div>
      </form>
      <div class="calc-resultados">${ENCABEZADO_RESULTADOS}<div class="resultados" id="resultados-cilindros-vap"></div></div>
      </div>
    </section>

    <section class="bloque-calculo">
      <h3 class="bloque-titulo">Cilindros — por consumo diario</h3>
      <div class="calc-layout">
      <form id="form-cilindros-diario" class="fila-campos calc-entradas" autocomplete="off">
        <div class="campo"><label for="cd-calefont">N° calefonts</label><input id="cd-calefont" type="number" step="1" value="1" required></div>
        <div class="campo"><label for="cd-cocinas">N° cocinas</label><input id="cd-cocinas" type="number" step="1" value="3" required></div>
        <div class="campo"><label for="cd-estufas">N° estufas</label><input id="cd-estufas" type="number" step="1" value="0" required></div>
        <div class="campo"><label for="cd-nivel">Nivel de consumo</label>
          <select id="cd-nivel"><option value="bajo">Bajo</option><option value="medio">Medio</option><option value="alto">Alto</option></select>
        </div>
        <div class="campo"><label for="cd-temperatura">Temperatura ambiente [°C]</label>
          <select id="cd-temperatura">
            <option value="10">10</option><option value="5" selected>5</option><option value="0">0</option>
            <option value="-5">-5</option><option value="-10">-10</option><option value="-15">-15</option><option value="-20">-20</option>
          </select>
        </div>
        <div class="campo"><label for="cd-peso-cilindro">Tipo de cilindro</label>
          <select id="cd-peso-cilindro"><option value="15">15 kg</option><option value="45" selected>45 kg</option></select>
        </div>
      </form>
      <div class="calc-resultados">${ENCABEZADO_RESULTADOS}<div class="resultados" id="resultados-cilindros-diario"></div></div>
      </div>
    </section>

    <section class="bloque-calculo">
      <h3 class="bloque-titulo">Estanque GLP</h3>
      <div class="calc-layout">
      <form id="form-estanque" class="calc-entradas" autocomplete="off">
        <div class="seccion">
          <h4 class="seccion-titulo">Dimensiones</h4>
          <div class="fila-campos">
            <div class="campo"><label for="es-diametro">Diámetro [m]</label><input id="es-diametro" type="text" inputmode="decimal" value="0.76" required></div>
            <div class="campo"><label for="es-altura">Altura [m]</label><input id="es-altura" type="text" inputmode="decimal" value="1.36" required></div>
            <div class="campo"><label for="es-capacidad">Capacidad nominal [L]</label><input id="es-capacidad" type="text" inputmode="decimal" value="500" required></div>
          </div>
        </div>
        <div class="seccion">
          ${marcadoComposicionGLP({ prefijo: 'es', nivel: 'h4' })}
        </div>
      </form>
      <div class="calc-resultados">${ENCABEZADO_RESULTADOS}<div class="resultados" id="resultados-estanque"></div></div>
      </div>
    </section>
  `;
}

function initAlmacenamiento() {
  const contenedor = document.getElementById('almacenamiento-contenido');

  function render() {
    if (combustible !== 'GLP') {
      contenedor.innerHTML = `<div class="aviso-gas"><p>El almacenamiento en cilindros/estanque es específico de GLP — no aplica a Gas Natural (suministro por red continua).</p><button type="button" class="btn btn-primario" id="aviso-cambiar-glp">Cambiar a GLP</button></div>`;
      document.getElementById('aviso-cambiar-glp').addEventListener('click', () => establecerCombustible('GLP'));
      return;
    }
    contenedor.innerHTML = marcadoAlmacenamientoGLP();

    const guardados = cargar('almacenamiento-glp', null);
    if (guardados) {
      Object.entries(guardados).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) el.value = valor;
      });
    }

    function guardarEstado() {
      const campos = ['cv-potencia', 'cv-razon', 'cd-calefont', 'cd-cocinas', 'cd-estufas', 'cd-nivel', 'cd-temperatura', 'cd-peso-cilindro', 'es-diametro', 'es-altura', 'es-capacidad', 'es-pct-butano', 'es-pct-propano'];
      guardar('almacenamiento-glp', Object.fromEntries(campos.map((id) => [id, document.getElementById(id).value])));
    }

    function recalcularVap() {
      const potenciaTotalKw = numeroFlexible(document.getElementById('cv-potencia').value);
      const razonVaporizacionKw = numeroFlexible(document.getElementById('cv-razon').value);
      const n = cilindrosPorVaporizacion({ potenciaTotalKw, razonVaporizacionKw });
      document.getElementById('resultados-cilindros-vap').innerHTML = grupo(null, [tile(n, 'N° de cilindros necesarios', 'kpi')], 'kpis');
      guardarEstado();
    }

    function recalcularDiario() {
      const resultado = cilindrosPorConsumoDiario({
        nCalefont: Number(document.getElementById('cd-calefont').value),
        nCocinas: Number(document.getElementById('cd-cocinas').value),
        nEstufas: Number(document.getElementById('cd-estufas').value),
        nivel: document.getElementById('cd-nivel').value,
        temperaturaC: Number(document.getElementById('cd-temperatura').value),
        pesoCilindroKg: Number(document.getElementById('cd-peso-cilindro').value),
      });
      document.getElementById('resultados-cilindros-diario').innerHTML = grupo(null, [
        tile(resultado.nCilindros, 'N° de cilindros necesarios', 'kpi'),
        tile(`${formatearFijo(resultado.consumoDiarioKwh, 2)} kWh`, 'Consumo diario estimado'),
      ], 'kpis');
      guardarEstado();
    }

    function recalcularEstanque() {
      const resultado = calcularEstanqueGLP({
        diametroM: numeroFlexible(document.getElementById('es-diametro').value),
        alturaM: numeroFlexible(document.getElementById('es-altura').value),
        capacidadLitros: numeroFlexible(document.getElementById('es-capacidad').value),
        ...leerComposicion('es'),
      });
      document.getElementById('resultados-estanque').innerHTML = [
        grupo(null, [
          tile(`${formatearFijo(resultado.qKw, 2)} kW`, 'Capacidad de vaporización', 'kpi'),
          tile(`${formatearFijo(resultado.capacidadRealLitros, 0)} L`, 'Capacidad real (80%)'),
        ], 'kpis'),
        grupo('Detalle del cálculo', [
          tile(`${formatearFijo(resultado.superficieM2, 3)} m²`, 'Superficie', 'secundario'),
          tile(`${formatearFijo(resultado.pciKjKg, 0)} kJ/kg`, 'PCI del GLP (según composición)', 'secundario'),
          tile(`${formatearFijo(resultado.qKgH, 2)} kg/h`, 'Capacidad de vaporización (másica)', 'secundario'),
          tile(`${formatearFijo(resultado.qMcalH, 2)} Mcal/h`, 'Capacidad de vaporización (Mcal/h)', 'secundario'),
        ]),
      ].join('');
      guardarEstado();
    }

    document.getElementById('form-cilindros-vap').addEventListener('input', recalcularVap);
    document.getElementById('form-cilindros-diario').addEventListener('input', recalcularDiario);
    document.getElementById('form-estanque').addEventListener('input', recalcularEstanque);
    recalcularVap();
    recalcularDiario();
    recalcularEstanque();
  }

  alCambiarCombustible(render);
  render();
}

/* ---------------------------------------------------------------------- */
/* Pestaña 3 — Combustión                                                 */
/* ---------------------------------------------------------------------- */

// `nivel`: etiqueta del título — h3 cuando la composición es un bloque de
// primer nivel de la pestaña (Combustión, Quemador), h4 cuando va dentro
// de un .bloque-calculo que ya tiene su h3 (Estanque GLP).
function marcadoComposicionGLP(valores) {
  const nivel = valores.nivel ?? 'h3';
  return `
    <${nivel} class="seccion-titulo">Composición GLP</${nivel}>
    <div class="fila-campos">
      <div class="campo"><label for="${valores.prefijo}-pct-butano">% Butano (molar)</label><input id="${valores.prefijo}-pct-butano" type="text" inputmode="decimal" value="0.3"></div>
      <div class="campo"><label for="${valores.prefijo}-pct-propano">% Propano (molar)</label><input id="${valores.prefijo}-pct-propano" type="text" inputmode="decimal" value="0.7"></div>
    </div>
  `;
}

function marcadoComposicionGN(valores) {
  const nivel = valores.nivel ?? 'h3';
  return `
    <${nivel} class="seccion-titulo">Composición GN</${nivel}>
    <div class="fila-campos">
      <div class="campo"><label for="${valores.prefijo}-pct-metano">% Metano (molar)</label><input id="${valores.prefijo}-pct-metano" type="text" inputmode="decimal" value="0.97"></div>
      <div class="campo"><label for="${valores.prefijo}-pct-etano">% Etano (molar)</label><input id="${valores.prefijo}-pct-etano" type="text" inputmode="decimal" value="0.011"></div>
      <div class="campo"><label for="${valores.prefijo}-pct-propano">% Propano (molar)</label><input id="${valores.prefijo}-pct-propano" type="text" inputmode="decimal" value="0.001"></div>
      <div class="campo"><label for="${valores.prefijo}-pct-butano">% Butano (molar)</label><input id="${valores.prefijo}-pct-butano" type="text" inputmode="decimal" value="0.001"></div>
      <div class="campo"><label for="${valores.prefijo}-pct-dioxido">% Dióxido de carbono (molar)</label><input id="${valores.prefijo}-pct-dioxido" type="text" inputmode="decimal" value="0.01"></div>
      <div class="campo"><label for="${valores.prefijo}-pct-nitrogeno">% Nitrógeno (molar)</label><input id="${valores.prefijo}-pct-nitrogeno" type="text" inputmode="decimal" value="0.007"></div>
    </div>
  `;
}

function leerComposicion(prefijo) {
  const num = (id) => numeroFlexible(document.getElementById(id).value);
  if (combustible === 'GLP') {
    return { pctButano: num(`${prefijo}-pct-butano`), pctPropano: num(`${prefijo}-pct-propano`) };
  }
  return {
    pctMetano: num(`${prefijo}-pct-metano`), pctEtano: num(`${prefijo}-pct-etano`),
    pctPropano: num(`${prefijo}-pct-propano`), pctButano: num(`${prefijo}-pct-butano`),
    pctDioxidoC: num(`${prefijo}-pct-dioxido`), pctNitrogeno: num(`${prefijo}-pct-nitrogeno`),
  };
}

function renderResultadosCombustion(r) {
  document.getElementById('resultados-combustion').innerHTML = [
    grupo(null, [
      tile(`${formatearFijo(r.caudalCombustibleNm3H, 3)} Nm³/h`, 'Caudal de combustible', 'kpi'),
      tile(`${formatearFijo(r.caudalAireNm3H, 2)} Nm³/h`, 'Caudal de aire', 'kpi'),
    ], 'kpis'),
    grupo('Gases de combustión y emisiones', [
      tile(`${formatearFijo(r.composicion.co2 * 100, 2)} %`, 'CO₂ en gases de combustión', 'kpi'),
      tile(`${formatearFijo(r.emisionNoxAdmisiblePpm, 1)} ppm`, 'Emisión NOx admisible', 'kpi'),
      tile(`${formatearLibre(r.emisionCoAdmisiblePpm)} ppm`, 'Emisión CO admisible (valor normativo fijo)', 'kpi'),
    ]),
    grupo('Factores de verificación', [
      tile(formatearFijo(r.pm, 3), 'Masa molar [kg/kmol]', 'secundario'),
      tile(`${formatearFijo(r.densidadNormal, 4)} kg/Nm³`, 'Densidad normal', 'secundario'),
      tile(`${formatearFijo(r.aireEsteq, 3)} Nm³/kg`, 'Aire estequiométrico', 'secundario'),
      tile(`${formatearFijo(r.caudalTotalNormalNm3H, 2)} Nm³/h`, 'Caudal total (condición normal)', 'secundario'),
      tile(`${formatearFijo(r.caudalTotalReferenciaM3H, 2)} m³/h`, 'Caudal total (condición de referencia)', 'secundario'),
      tile(`${formatearFijo(r.composicion.h2o * 100, 2)} %`, 'H₂O en gases de combustión', 'secundario'),
      tile(`${formatearFijo(r.composicion.o2 * 100, 2)} %`, 'O₂ en gases de combustión', 'secundario'),
      tile(`${formatearFijo(r.composicion.n2 * 100, 2)} %`, 'N₂ en gases de combustión', 'secundario'),
    ]),
  ].join('');
}

function initCombustion() {
  const contenedorComposicion = document.getElementById('combustion-campos-composicion');
  const form = document.getElementById('form-combustion');

  function render() {
    contenedorComposicion.innerHTML = combustible === 'GLP'
      ? marcadoComposicionGLP({ prefijo: 'cb' })
      : marcadoComposicionGN({ prefijo: 'cb' });
    // El campo de PCI aplica a los dos gases (GN antes lo calculaba
    // siempre de la composición, sin mostrarlo ni dejarlo editar — ver
    // GasNatural-GLP/CLAUDE.md). El de PCI simplificado (solo para la
    // emisión NOx admisible) sigue siendo propio de GN.
    document.getElementById('campo-pci-simplificado-gn').style.display = combustible === 'GN' ? '' : 'none';

    const guardados = cargar(`combustion-${combustible}`, null);
    if (guardados) {
      Object.entries(guardados).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) el.value = valor;
      });
    } else if (combustible === 'GN') {
      // Sin estado guardado para GN: precompletar el PCI con el valor
      // derivado de la composición por defecto, en vez de dejar el 48029
      // de GLP puesto en el HTML.
      const pciPorDefecto = propiedadesGN(leerComposicion('cb')).pciMasa;
      document.getElementById('cb-pci').value = pciPorDefecto.toFixed(2);
    }

    initSelectorUnidadCampo('cb-presion-ref', 'cb-presion-ref-unidad');
    contenedorComposicion.querySelectorAll('input').forEach((el) => el.addEventListener('input', recalcular));
    recalcular();
  }

  function recalcular() {
    const num = (id) => numeroFlexible(document.getElementById(id).value);
    const comunes = {
      potenciaKw: num('cb-potencia'), lambda: num('cb-lambda'), pciKjKg: num('cb-pci'),
      presionReferenciaKPa: leerPresion('cb-presion-ref', 'cb-presion-ref-unidad', 'kPa'), temperaturaReferenciaC: num('cb-temp-ref'),
      concentracionO2Pct: num('cb-o2-medido') / 100,
    };
    let resultado;
    try {
      if (combustible === 'GLP') {
        resultado = calcularCombustionGLP({ ...leerComposicion('cb'), ...comunes });
      } else {
        resultado = calcularCombustionGN({ ...leerComposicion('cb'), ...comunes, pciSimplificadoKwhM3: num('cb-pci-simplificado') });
      }
      renderResultadosCombustion(resultado);
    } catch (error) {
      document.getElementById('resultados-combustion').innerHTML = tile(error.message, 'Error', 'alerta');
    }

    const campos = Array.from(form.querySelectorAll('input, select')).concat(Array.from(contenedorComposicion.querySelectorAll('input')));
    guardar(`combustion-${combustible}`, Object.fromEntries(campos.map((el) => [el.id, el.value])));
  }

  form.addEventListener('input', recalcular);
  alCambiarCombustible(render);
  render();
}

/* ---------------------------------------------------------------------- */
/* Pestaña 4 — Quemador Atmosférico                                       */
/* ---------------------------------------------------------------------- */

function renderResultadosQuemador(r) {
  document.getElementById('resultados-quemador').innerHTML = [
    grupo(null, [
      tile(`${formatearFijo(r.potenciaInyectorKw, 3)} kW`, 'Potencia que entrega el inyector', 'kpi'),
      tile(`${formatearFijo(r.largoLlamaMm, 2)} mm`, 'Largo de llama estimado', 'kpi'),
      tile(`${formatearFijo(r.tasaQuemadoWMm2, 2)} W/mm²`, 'Tasa de quemado', 'kpi'),
    ], 'kpis'),
    grupo('Factores de verificación', [
      tile(`${formatearFijo(r.areaInyectorIn2, 6)} in²`, 'Área del inyector', 'secundario'),
      tile(`${formatearFijo(r.caudalInyectorM3H, 4)} m³/h`, 'Caudal por el inyector', 'secundario'),
      tile(formatearFijo(r.racEstequiometricaMasica, 3), 'RAC estequiométrica másica [kg aire/kg gas]', 'secundario'),
      tile(formatearFijo(r.densidadPremezcla1, 4), 'Densidad de la premezcla 1ª [kg/Nm³]', 'secundario'),
      tile(`${formatearFijo(r.caudalPremezcla1Nm3S * 1000, 4)} NL/s`, 'Caudal de premezcla 1ª', 'secundario'),
      tile(formatearFijo(r.relacionAreaGargantaPerforaciones, 4), 'Relación área garganta/perforaciones', 'secundario'),
    ]),
  ].join('');
}

function initQuemador() {
  const contenedorComposicion = document.getElementById('quemador-campos-composicion');
  const form = document.getElementById('form-quemador');

  function render() {
    contenedorComposicion.innerHTML = combustible === 'GLP'
      ? marcadoComposicionGLP({ prefijo: 'qm' })
      : marcadoComposicionGN({ prefijo: 'qm' });

    const guardados = cargar(`quemador-${combustible}`, null);
    if (guardados) {
      Object.entries(guardados).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) el.value = valor;
      });
    } else if (combustible === 'GN') {
      // Igual que en Combustión: sin estado guardado para GN, precompletar
      // el PCI con el valor derivado de la composición por defecto en vez
      // de dejar el 45990 de GLP puesto en el HTML.
      document.getElementById('qm-pci').value = propiedadesGN(leerComposicion('qm')).pciMasa.toFixed(2);
    }

    initSelectorUnidadCampo('qm-presion-gas', 'qm-presion-gas-unidad');
    contenedorComposicion.querySelectorAll('input').forEach((el) => el.addEventListener('input', recalcular));
    recalcular();
  }

  function recalcular() {
    const num = (id) => numeroFlexible(document.getElementById(id).value);
    try {
      const resultado = calcularQuemador({
        gas: combustible,
        composicion: leerComposicion('qm'),
        potenciaKw: num('qm-potencia'),
        pciKjKg: num('qm-pci'),
        cantidadPerforaciones: num('qm-cant-perforaciones'),
        diametroPerforacionMm: num('qm-diam-perforacion'),
        coeficienteDescarga: num('qm-cd'),
        diametroInyectorMm: num('qm-diam-inyector'),
        presionGasMbar: leerPresion('qm-presion-gas', 'qm-presion-gas-unidad', 'mbar'),
        relacionAire: num('qm-relacion-aire'),
        temperaturaGasC: num('qm-temp-gas'),
        temperaturaAmbienteC: num('qm-temp-ambiente'),
        diametroGargantaMm: num('qm-diam-garganta'),
        cantidadPerforacionesGarganta: num('qm-cant-perforaciones-garganta'),
      });
      renderResultadosQuemador(resultado);
    } catch (error) {
      document.getElementById('resultados-quemador').innerHTML = tile(error.message, 'Error', 'alerta');
    }

    const campos = Array.from(form.querySelectorAll('input, select')).concat(Array.from(contenedorComposicion.querySelectorAll('input')));
    guardar(`quemador-${combustible}`, Object.fromEntries(campos.map((el) => [el.id, el.value])));
  }

  form.addEventListener('input', recalcular);
  alCambiarCombustible(render);
  render();
}

/* ---------------------------------------------------------------------- */
/* Pestaña 5 — Memoria de Cálculo (red ramificada de Red de Gas)          */
/* ---------------------------------------------------------------------- */

let tramosMemoria = [];
let contadorIdMemoria = 0;
let proyecto = null;
let contadorArtefactoId = 0;
let ultimoResultadoMemoria = [];

// Texto de observaciones por defecto (2026-09-03, a pedido del usuario,
// mirroring el informe formal de Hidrogeno/js/ui.js) — adaptado a la
// metodología real de este módulo: a diferencia de Hidrógeno (Barlow +
// Darcy-Weisbach + ASME B31.12/NFPA 2), Red de Gas usa Renouard (baja y
// media/alta presión) con compresibilidad real vía Peng-Robinson, bajo
// D.S. N°66 (reglamento chileno de instalaciones de gas) — ver
// GasNatural-GLP/CLAUDE.md y js/pipe-network.js.
const OBSERVACIONES_DEFECTO =
  'Cálculos basados en la ecuación de Renouard para la pérdida de carga en baja y media/alta presión, ' +
  'con factor de compresibilidad real determinado mediante la ecuación de estado de Peng-Robinson. ' +
  'Metodología de dimensionamiento de redes de gas aplicable según el D.S. N°66 (Reglamento de ' +
  'instalaciones interiores y medidores de gas).';

function proyectoPorDefecto() {
  return {
    fecha: '', proyecto: '', instalador: '', contacto: '', direccion: '', comuna: '',
    cargoInstalador: '', runInstalador: '', numeroDoc: '402604', revision: '1',
    // A diferencia de Hidrógeno (que precompleta 20 m/s, el límite NFPA 2 ya
    // usado en "Tubería y Flujo"), acá se deja sin valor por defecto: no hay
    // una norma de referencia ya usada en este módulo de la que tomar un
    // límite de velocidad — el usuario lo completa si aplica a su proyecto.
    velocidadMaxFlujoDisenoMS: null, velocidadErosionDisenoMS: null, perdidaMaxAcumuladaDisenoPa: null,
    artefactos: [], observaciones: OBSERVACIONES_DEFECTO,
  };
}

function artefactoPorDefecto() {
  contadorArtefactoId += 1;
  return { id: `a${contadorArtefactoId}`, nombre: '', potenciaKw: 0 };
}

// Mayor sufijo numérico entre ids "t<N>" / "a<N>" — punto de partida de
// los contadores de tramos y artefactos al cargar o importar (2026-09-24).
// Antes se usaba la CANTIDAD de elementos: tras borrar uno intermedio
// (t1,t3) y recargar, el contador quedaba en 2 y el siguiente "Agregar"
// volvía a crear t3 — dos filas con el mismo data-id, y editar una pisaba
// a la otra en el modelo (se veía al recargar).
function maxSufijoId(items) {
  return items.reduce((max, item) => Math.max(max, Number(String(item.id).slice(1)) || 0), 0);
}

// Quien ya se topó con ese bug tiene ids repetidos guardados (localStorage
// o un .json exportado): la 2ª aparición de un id recibe uno nuevo al
// cargar/importar. Un "Continúa desde" que apuntaba al id repetido queda
// colgado del primero.
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

function tramoMemoriaPorDefecto() {
  contadorIdMemoria += 1;
  return {
    id: `t${contadorIdMemoria}`, nombre: `Tramo ${contadorIdMemoria}`, continuaDesdeId: null,
    reseteaAcumulada: false, regimenPresion: '<10 kPa', material: 'Acero Sch40', pulgadas: 0.75,
    potenciaKw: 30, longitudM: 10, presionInicialPa: 1000, temperaturaC: 15,
  };
}

function etiquetaDiametroMemoria(t) {
  return t.pulgadas === 'manual' ? `Manual ${t.tuberiaManual.diametroMm} mm` : formatearPulgadas(t.pulgadas);
}

function porNombreTramoMemoria(id) {
  return id ? (tramosMemoria.find((t) => t.id === id)?.nombre ?? '') : '— raíz —';
}

function renderTablaMemoria(resultado) {
  const opcionesPadre = (actualId) => ['<option value="">— raíz —</option>'].concat(
    tramosMemoria.filter((t) => t.id !== actualId).map((t) => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`)
  ).join('');

  // Unidad elegida en cada cabecera de columna de presión — independiente
  // entre las cuatro, no hay una unidad "de la tabla". El dato canónico
  // en `tramosMemoria` sigue siempre en Pa (lo que espera calcularRedGas
  // vía calcularRedMemoria); cambiar la unidad de una columna solo
  // redibuja la tabla, ver leerFilaMemoria().
  const unidadPresionInicial = document.getElementById('memoria-presion-inicial-unidad').value;
  const unidadPerdidaRequerida = document.getElementById('memoria-perdida-requerida-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  const unidadPresionFinal = document.getElementById('memoria-presion-final-unidad').value;

  // data-label = encabezado de la columna, con su unidad: en un teléfono la
  // tabla se muestra como una tarjeta por tramo y cada celda lo usa como
  // etiqueta propia (td::before en css/styles.css, 2026-09-25).
  document.getElementById('memoria-tabla-cuerpo').innerHTML = resultado.map((t) => `
    <tr data-id="${t.id}">
      <td class="mem-celda-nombre" data-label="Tramo"><input type="text" class="mem-nombre" value="${escapeAttr(t.nombre)}" aria-label="Nombre del tramo"></td>
      <td data-label="Continúa desde"><select class="mem-padre" aria-label="Continúa desde">${opcionesPadre(t.id)}</select></td>
      <td class="mem-celda-check" data-label="Reinicia acum." style="text-align:center;"><input type="checkbox" class="mem-reset"${t.reseteaAcumulada ? ' checked' : ''} title="Reinicia la pérdida de carga acumulada desde este tramo (ej. después de un regulador de presión)" aria-label="Reinicia la pérdida de carga acumulada"></td>
      <td data-label="Régimen de presión">
        <select class="mem-regimen" aria-label="Régimen de presión">
          <option value="<10 kPa"${t.regimenPresion === '<10 kPa' ? ' selected' : ''}>Baja (&lt;10 kPa)</option>
          <option value=">10 kPa"${t.regimenPresion === '>10 kPa' ? ' selected' : ''}>Media/alta (&gt;10 kPa)</option>
        </select>
      </td>
      <td class="mem-celda-material" data-label="Material">
        <select class="mem-material" aria-label="Material"${t.pulgadas === 'manual' ? ' style="display:none;"' : ''}>
          <option value="Acero Sch40"${t.material === 'Acero Sch40' ? ' selected' : ''}>Acero Sch40</option>
          <option value="Cobre tipo L"${t.material === 'Cobre tipo L' ? ' selected' : ''}>Cobre tipo L</option>
        </select>
      </td>
      <td data-label="Diámetro">
        <select class="mem-diametro" aria-label="Diámetro">
          ${TABLA_TUBERIA_RED_GAS.map((f) => `<option value="${f.pulgadas}"${f.pulgadas === t.pulgadas ? ' selected' : ''}>${formatearPulgadas(f.pulgadas)}</option>`).join('')}
          <option value="manual"${t.pulgadas === 'manual' ? ' selected' : ''}>Manual (mm)</option>
        </select>
        <div class="mem-tuberia-manual"${t.pulgadas === 'manual' ? '' : ' style="display:none;"'}>
          <input type="text" inputmode="decimal" class="mem-diametro-manual-mm" value="${t.tuberiaManual?.diametroMm ?? 50}" title="Diámetro interior [mm]">
          <input type="text" inputmode="decimal" class="mem-diametro-manual-k" value="${t.tuberiaManual?.k ?? 1800}" title="Factor K (rugosidad, solo baja presión)">
        </div>
      </td>
      <td data-label="Potencia [kW]"><input type="text" inputmode="decimal" class="mem-potencia" value="${t.potenciaKw}" aria-label="Potencia [kW]"></td>
      <td data-label="Longitud [m]"><input type="text" inputmode="decimal" class="mem-largo" value="${t.longitudM}" aria-label="Longitud [m]"></td>
      <td data-label="Presión inicial [${unidadPresionInicial}]"><input type="text" inputmode="decimal" class="mem-presion" value="${Number(desdePa(t.presionInicialPa, unidadPresionInicial).toPrecision(6))}" aria-label="Presión inicial [${unidadPresionInicial}]"></td>
      <td data-label="Temp. [°C]"><input type="text" inputmode="decimal" class="mem-temp" value="${t.temperaturaC}" aria-label="Temperatura [°C]"></td>
      <td class="mem-caudal col-calculada" data-label="Caudal objetivo [m³/h]">${formatearFijo(t.caudalObjetivoM3H, 3)}</td>
      <td class="mem-velocidad col-calculada" data-label="Velocidad [m/s]">${formatearFijo(t.velocidadMS, 2)}</td>
      <td class="mem-perdida-requerida col-calculada" data-label="Pérdida requerida [${unidadPerdidaRequerida}]">${formatearPresionFija(t.perdidaPresionRequeridaPa, unidadPerdidaRequerida)}</td>
      <td class="mem-perdida-acumulada col-calculada" data-label="Pérdida acumulada [${unidadPerdidaAcumulada}]">${formatearPresionFija(t.perdidaAcumuladaPa, unidadPerdidaAcumulada)}</td>
      <td class="mem-presion-final col-calculada" data-label="Presión final [${unidadPresionFinal}]">${t.presionFinalPa !== null ? formatearPresionFija(t.presionFinalPa, unidadPresionFinal) : '—'}</td>
      <td class="mem-celda-acciones"><button type="button" class="mem-eliminar no-imprimir" aria-label="Eliminar ${escapeAttr(t.nombre)}">✕</button></td>
    </tr>
  `).join('');

  tramosMemoria.forEach((t) => {
    const selectPadre = document.querySelector(`#memoria-tabla-cuerpo tr[data-id="${t.id}"] .mem-padre`);
    if (selectPadre) selectPadre.value = t.continuaDesdeId ?? '';
  });
}

function renderArbolMemoria(resultado) {
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
      <title>${escapeHtml(n.t.nombre)} — ${formatearPresionFija(n.t.perdidaAcumuladaPa, 'Pa')} Pa acumulados, ${formatearFijo(n.t.velocidadMS, 2)} m/s${n.t.reseteaAcumulada ? ' (reinicia acumulada)' : ''}</title>
      <text x="${n.nivel * anchoNivel + 74}" y="${n.fila * altoFila + 24}" font-size="12" fill="var(--text-primary)">${escapeHtml(n.t.nombre)}</text>
    </g>`).join('');
  svg.setAttribute('height', String(Math.max(...porNivel.values(), 1) * altoFila + 20));
  // Ancho mínimo = el nodo más a la derecha + su nombre (~7px por carácter
  // a 12px): en un teléfono el 100% del contenedor no alcanza desde el 2º
  // nivel y los nodos quedaban cortados; con esto .arbol-contenedor
  // (overflow-x: auto) se desplaza en horizontal (2026-09-25).
  const anchoNecesario = Math.max(0, ...nodos.map((n) => n.nivel * anchoNivel + 74 + n.t.nombre.length * 7 + 16));
  svg.style.minWidth = `${anchoNecesario}px`;
  svg.innerHTML = lineas + circulos;
}

// Cajetín de un criterio de diseño opcional del encabezado del informe
// (2026-09-03, a pedido del usuario, mirroring Hidrogeno/js/ui.js). Desde
// el 2026-09-25 el valor va con notación SI ("20 m/s", sin corchetes: los
// corchetes quedan para rotular columnas) y sin valor dice "No definida"
// en vez de "- [m/s]", que en papel se leía como un dato faltante por error.
function criterioDefinido(valor) {
  return valor !== null && valor !== undefined && !Number.isNaN(valor);
}

function formatearCriterio(valor, formatear) {
  return criterioDefinido(valor) ? formatear(valor) : 'No definida';
}

// Números del informe impreso (2026-09-25): sin la precisión fija de la
// tabla en pantalla ("150.000,0 Pa", "0,150000 MPa") — hasta 2 decimales,
// pero nunca menos de 3 cifras significativas, para que un valor chico en
// una unidad grande (0,0028 MPa) no se imprima como "0".
const FORMATO_INFORME = new Intl.NumberFormat('es-CL', {
  maximumFractionDigits: 2, maximumSignificantDigits: 3, roundingPriority: 'morePrecision',
});
function formatearInforme(valor) {
  return FORMATO_INFORME.format(valor);
}

function formatearPresionInforme(valorPa, unidad) {
  return formatearInforme(desdePa(valorPa, unidad));
}

// Cabecera de columna del informe: etiqueta + unidad en su propia línea,
// fuera del text-transform: uppercase de la cabecera — en mayúsculas
// "kPa"/"mbar"/"m/s"/"kW" se leían "KPA"/"MBAR"/"M/S"/"KW", y en unidades
// SI la caja es parte del símbolo (m = mili, M = mega).
function thConUnidad(etiqueta, unidad) {
  return `${escapeHtml(etiqueta)}<span class="informe-unidad">${escapeHtml(unidad)}</span>`;
}

// Verificación de un criterio de diseño contra la red resuelta
// (2026-09-25, mismo criterio que Hidrogeno/js/ui.js): antes el informe
// declaraba los límites y mostraba los máximos calculados sin compararlos
// nunca, así que quien lo leía tenía que hacer la cuenta a mano para saber
// si la red cumple. `valorDe` y `limite` van en la misma unidad canónica;
// `formatear` decide cómo se muestran.
function evaluarCriterio({ nombre, limite, tramos, valorDe, formatear }) {
  const critico = tramos.reduce((max, t) => (max === null || valorDe(t) > valorDe(max) ? t : max), null);
  const definido = criterioDefinido(limite);
  const exceden = definido ? tramos.filter((t) => valorDe(t) > limite) : [];
  return {
    nombre, definido, exceden, critico, evaluados: tramos.length,
    limiteTexto: definido ? `≤ ${formatear(limite)}` : 'No definido',
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
  const evaluados = criterios.filter((c) => c.estado !== 'sin-limite');
  if (!evaluados.length) {
    return 'No se definieron límites de diseño: los máximos calculados se informan sin verificación.';
  }
  const incumplidos = evaluados.filter((c) => c.estado === 'no-cumple').length;
  if (!incumplidos) {
    return evaluados.length === 1
      ? 'La red cumple el criterio de diseño definido.'
      : `La red cumple los ${evaluados.length} criterios de diseño definidos.`;
  }
  return `La red no cumple ${incumplidos} de ${evaluados.length} ${evaluados.length === 1 ? 'criterio' : 'criterios'} de diseño. ` +
    'Los valores fuera de límite se marcan con ▲ en la sección 4.';
}

function actualizarTotalArtefactos() {
  const totalKw = proyecto.artefactos.reduce((suma, a) => suma + (Number(a.potenciaKw) || 0), 0);
  document.getElementById('memoria-artefactos-total-txt').textContent =
    `Total: ${formatearFijo(totalKw, 2)} kW térmicos — Potencia instalada: ${formatearFijo(totalKw, 2)} kW térmicos (no se considera operación simultánea)`;
}

function renderArtefactos() {
  document.getElementById('memoria-artefactos-cuerpo').innerHTML = proyecto.artefactos.map((a) => `
    <div class="artefacto-fila" data-id="${a.id}">
      <input type="text" class="af-nombre" value="${escapeAttr(a.nombre)}" placeholder="Nombre del artefacto" aria-label="Nombre del artefacto">
      <input type="text" inputmode="decimal" class="af-potencia" value="${a.potenciaKw}" placeholder="kW" aria-label="Potencia del artefacto [kW]">
      <button type="button" class="af-eliminar no-imprimir" aria-label="Eliminar artefacto${a.nombre ? ' ' + escapeAttr(a.nombre) : ''}">✕</button>
    </div>
  `).join('');
  actualizarTotalArtefactos();
}

function renderInformeImpresion(resultado) {
  document.getElementById('informe-doc-num').textContent = proyecto.numeroDoc;
  document.getElementById('informe-doc-rev').textContent = proyecto.revision;

  document.getElementById('informe-fecha').textContent = proyecto.fecha;
  document.getElementById('informe-proyecto').textContent = proyecto.proyecto;
  document.getElementById('informe-instalador').textContent = proyecto.instalador;
  document.getElementById('informe-direccion').textContent = proyecto.direccion;
  document.getElementById('informe-contacto').textContent = proyecto.contacto;
  document.getElementById('informe-comuna').textContent = proyecto.comuna;

  // Título y "Tipo de red" reflejan el combustible vigente (a diferencia de
  // Hidrogeno, donde ambos son texto fijo "Hidrógeno gas" — acá el mismo
  // informe sirve para GLP o Gas Natural según el selector global).
  const nombreRed = combustible === 'GLP' ? 'Red de GLP' : 'Red de Gas Natural';
  document.getElementById('informe-subtitulo').textContent = nombreRed.toUpperCase();
  document.getElementById('informe-tipo-red').textContent = combustible === 'GLP' ? 'GLP' : 'Gas Natural';
  document.getElementById('informe-footer-red').textContent = nombreRed;

  const unidadPresionInicial = document.getElementById('memoria-presion-inicial-unidad').value;
  const unidadPerdidaRequerida = document.getElementById('memoria-perdida-requerida-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  const velocidad = (v) => `${formatearInforme(v)} m/s`;
  // El criterio de pérdida se ingresa en Pa pero se muestra en la unidad de
  // la columna "ΔP acumulada" — límite y resultado siempre comparables a
  // simple vista, aunque se cambie la unidad de esa columna.
  const perdidaAcum = (pa) => `${formatearPresionInforme(pa, unidadPerdidaAcumulada)} ${unidadPerdidaAcumulada}`;

  document.getElementById('informe-vel-max-flujo').textContent = formatearCriterio(proyecto.velocidadMaxFlujoDisenoMS, velocidad);
  document.getElementById('informe-vel-erosion').textContent = formatearCriterio(proyecto.velocidadErosionDisenoMS, velocidad);
  document.getElementById('informe-perdida-max').textContent = formatearCriterio(proyecto.perdidaMaxAcumuladaDisenoPa, perdidaAcum);

  // Una sola fila de total: antes "Total" y "Potencia instalada" repetían
  // el mismo número (sin simultaneidad son lo mismo, decisión 2026-09-03).
  const totalKw = proyecto.artefactos.reduce((suma, a) => suma + (Number(a.potenciaKw) || 0), 0);
  document.getElementById('informe-artefactos-cuerpo').innerHTML = proyecto.artefactos.length
    ? proyecto.artefactos.map((a) => `<tr><td>${escapeHtml(a.nombre)}</td><td>${formatearInforme(Number(a.potenciaKw) || 0)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="informe-vacio">Sin artefactos registrados</td></tr>';
  document.getElementById('informe-potencia-instalada').textContent = formatearInforme(totalKw);

  // Pérdida acumulada en una red mixta (2026-09-25): el límite típico de
  // pérdida acumulada (D.S. 66: 150 Pa GLP / 120 Pa GN) es de BAJA presión,
  // desde el regulador al artefacto. Comparado contra un tramo de media
  // presión (p. ej. 6.923 Pa de caída sobre 150 kPa, un 4,6%) daba un "No
  // cumple" sin sentido y escondía el tramo de baja que de verdad manda.
  // Si la red mezcla regímenes se evalúan solo los tramos de baja presión,
  // y el nombre del criterio lo dice; si no, todos.
  const tramosBaja = resultado.filter((t) => t.regimenPresion === '<10 kPa');
  const redMixta = tramosBaja.length > 0 && tramosBaja.length < resultado.length;
  const criterios = [
    evaluarCriterio({
      nombre: 'Velocidad de flujo', limite: proyecto.velocidadMaxFlujoDisenoMS,
      tramos: resultado, valorDe: (t) => t.velocidadMS, formatear: velocidad,
    }),
  ];
  if (criterioDefinido(proyecto.velocidadErosionDisenoMS)) {
    criterios.push(evaluarCriterio({
      nombre: 'Velocidad de erosión', limite: proyecto.velocidadErosionDisenoMS,
      tramos: resultado, valorDe: (t) => t.velocidadMS, formatear: velocidad,
    }));
  }
  const criterioPerdida = evaluarCriterio({
    nombre: redMixta ? 'Pérdida de carga acumulada (tramos de baja presión)' : 'Pérdida de carga acumulada',
    limite: proyecto.perdidaMaxAcumuladaDisenoPa,
    tramos: redMixta ? tramosBaja : resultado, valorDe: (t) => t.perdidaAcumuladaPa, formatear: perdidaAcum,
  });
  criterios.push(criterioPerdida);
  const velocidadExcede = new Set(criterios.filter((c) => c !== criterioPerdida).flatMap((c) => c.exceden.map((t) => t.id)));
  const perdidaExcede = new Set(criterioPerdida.exceden.map((t) => t.id));
  const marcar = (texto, excede) => (excede ? `<span class="informe-excede">▲ ${texto}</span>` : texto);

  document.getElementById('memoria-impresion-th-presion').innerHTML = thConUnidad('P. inicial man.', unidadPresionInicial);
  document.getElementById('memoria-impresion-th-parcial').innerHTML = thConUnidad('ΔP tramo', unidadPerdidaRequerida);
  document.getElementById('memoria-impresion-th-perdida').innerHTML = thConUnidad('ΔP acumulada', unidadPerdidaAcumulada);
  document.getElementById('memoria-tabla-impresion-cuerpo').innerHTML = resultado.map((t) => `
    <tr>
      <td>${escapeHtml(t.nombre)}${t.reseteaAcumulada ? '<sup class="informe-marca">R</sup>' : ''}</td>
      <td>${t.continuaDesdeId ? escapeHtml(porNombreTramoMemoria(t.continuaDesdeId)) : '<span class="informe-vacio">Inicio de red</span>'}</td>
      <td>${formatearPresionInforme(t.presionInicialPa, unidadPresionInicial)}</td>
      <td>${formatearInforme(t.longitudM)}</td>
      <td>${formatearInforme(t.potenciaKw)}</td>
      <td>${etiquetaDiametroMemoria(t)}</td>
      <td>${t.pulgadas === 'manual' ? '—' : t.material}</td>
      <td>${formatearPresionInforme(t.perdidaPresionRequeridaPa, unidadPerdidaRequerida)}</td>
      <td>${marcar(formatearPresionInforme(t.perdidaAcumuladaPa, unidadPerdidaAcumulada), perdidaExcede.has(t.id))}</td>
      <td>${marcar(formatearInforme(t.velocidadMS), velocidadExcede.has(t.id))}</td>
    </tr>
  `).join('');

  // Leyenda solo de las marcas que aparecen en la tabla — el texto largo
  // "(reinicia acumulada)" dentro de la celda partía "Continúa desde" en 3
  // líneas y alargaba cada fila.
  const leyenda = [];
  if (resultado.some((t) => t.reseteaAcumulada)) {
    leyenda.push('<sup class="informe-marca">R</sup> La pérdida acumulada se reinicia en este tramo (p. ej., aguas abajo de un regulador de presión).');
  }
  if (velocidadExcede.size || perdidaExcede.size) {
    leyenda.push('<span class="informe-excede">▲</span> Valor fuera del límite de diseño (ver sección 5).');
  }
  document.getElementById('informe-leyenda-tramos').innerHTML = leyenda.join(' ');

  document.getElementById('informe-verificacion-cuerpo').innerHTML = criterios.map(filaVerificacion).join('');
  document.getElementById('informe-conclusion').textContent = textoConclusion(criterios);
  document.getElementById('informe-conclusion').className =
    `informe-conclusion ${criterios.some((c) => c.estado === 'no-cumple') ? 'no-cumple' : criterios.some((c) => c.estado === 'cumple') ? 'cumple' : ''}`;

  document.getElementById('informe-observaciones').textContent = proyecto.observaciones;
  document.getElementById('informe-footer-doc').textContent = `${proyecto.numeroDoc}, Rev. ${proyecto.revision}`;

  document.getElementById('informe-firma-nombre').textContent = proyecto.instalador;
  document.getElementById('informe-firma-cargo').textContent = proyecto.cargoInstalador;
  document.getElementById('informe-firma-run').textContent = proyecto.runInstalador;
}

function recalcularMemoria() {
  const contenedorError = document.getElementById('memoria-error');
  let resultado;
  try {
    resultado = calcularRedMemoria(tramosMemoria, combustible);
  } catch (error) {
    contenedorError.textContent = error.message;
    contenedorError.style.display = '';
    return;
  }
  contenedorError.style.display = 'none';
  ultimoResultadoMemoria = resultado;
  renderTablaMemoria(resultado);
  renderArbolMemoria(resultado);
  renderArtefactos();
  renderInformeImpresion(resultado);
  guardar('memoria-red-gas', tramosMemoria);
  guardar('memoria-proyecto', proyecto);
}

// Recalcula sin regenerar los <input>/<select> de la tabla de tramos
// (2026-09-03, a pedido del usuario): escribir en un cajetín de texto solo
// dejaba entrar un carácter a la vez, porque recalcularMemoria() reescribe
// el innerHTML completo de #memoria-tabla-cuerpo en cada tecla — destruye
// el foco y vuelve a serializar el valor ya convertido a número, perdiendo
// cualquier "," o "." recién tipeado antes del siguiente dígito. Esta
// versión solo actualiza las celdas de resultado (de solo lectura) de cada
// fila vía textContent y sincroniza las etiquetas de "Continúa desde" de
// las demás filas si el nombre cambió — nunca toca ningún <input>/<select>,
// así que el foco y lo que el usuario ya escribió se conservan intactos.
// Los cambios que sí alteran la estructura de la fila (un <select>: unidad,
// régimen, material, diámetro, padre; o el checkbox de reseteo) siguen
// pasando por recalcularMemoria() completo — ver el listener en initMemoria().
function recalcularMemoriaLigero() {
  const contenedorError = document.getElementById('memoria-error');
  let resultado;
  try {
    resultado = calcularRedMemoria(tramosMemoria, combustible);
  } catch (error) {
    contenedorError.textContent = error.message;
    contenedorError.style.display = '';
    return;
  }
  contenedorError.style.display = 'none';
  ultimoResultadoMemoria = resultado;
  actualizarCeldasCalculadas(resultado);
  tramosMemoria.forEach((t) => {
    document.querySelectorAll(`#memoria-tabla-cuerpo .mem-padre option[value="${t.id}"]`).forEach((opcion) => {
      opcion.textContent = t.nombre;
    });
  });
  renderArbolMemoria(resultado);
  renderInformeImpresion(resultado);
  guardar('memoria-red-gas', tramosMemoria);
}

function actualizarCeldasCalculadas(resultado) {
  const unidadPerdidaRequerida = document.getElementById('memoria-perdida-requerida-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  const unidadPresionFinal = document.getElementById('memoria-presion-final-unidad').value;
  resultado.forEach((t) => {
    const fila = document.querySelector(`#memoria-tabla-cuerpo tr[data-id="${t.id}"]`);
    if (!fila) return;
    fila.querySelector('.mem-caudal').textContent = formatearFijo(t.caudalObjetivoM3H, 3);
    fila.querySelector('.mem-velocidad').textContent = formatearFijo(t.velocidadMS, 2);
    fila.querySelector('.mem-perdida-requerida').textContent = formatearPresionFija(t.perdidaPresionRequeridaPa, unidadPerdidaRequerida);
    fila.querySelector('.mem-perdida-acumulada').textContent = formatearPresionFija(t.perdidaAcumuladaPa, unidadPerdidaAcumulada);
    fila.querySelector('.mem-presion-final').textContent = t.presionFinalPa !== null ? formatearPresionFija(t.presionFinalPa, unidadPresionFinal) : '—';
  });
}

function leerProyecto() {
  const val = (id) => document.getElementById(id).value;
  const numOpcional = (id) => {
    const bruto = val(id).trim();
    return bruto === '' ? null : numeroFlexible(bruto);
  };
  return {
    fecha: val('mp-fecha'), proyecto: val('mp-proyecto'), instalador: val('mp-instalador'),
    contacto: val('mp-contacto'), direccion: val('mp-direccion'), comuna: val('mp-comuna'),
    cargoInstalador: val('mp-cargo'), runInstalador: val('mp-run'),
    numeroDoc: val('mp-doc'), revision: val('mp-revision'),
    velocidadMaxFlujoDisenoMS: numOpcional('mp-vel-max-flujo'),
    velocidadErosionDisenoMS: numOpcional('mp-vel-erosion'),
    perdidaMaxAcumuladaDisenoPa: numOpcional('mp-perdida-max'),
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
  document.getElementById('mp-vel-erosion').value = proyecto.velocidadErosionDisenoMS ?? '';
  document.getElementById('mp-perdida-max').value = proyecto.perdidaMaxAcumuladaDisenoPa ?? '';
  document.getElementById('mp-observaciones').value = proyecto.observaciones;
}

function leerFilaArtefacto(fila) {
  return {
    id: fila.dataset.id,
    nombre: fila.querySelector('.af-nombre').value,
    potenciaKw: numeroFlexible(fila.querySelector('.af-potencia').value),
  };
}

function leerFilaMemoria(fila) {
  const id = fila.dataset.id;
  const val = (clase) => fila.querySelector(`.${clase}`).value;
  const unidadPresionInicial = document.getElementById('memoria-presion-inicial-unidad').value;
  const diametroSeleccionado = val('mem-diametro');
  const esManual = diametroSeleccionado === 'manual';
  return {
    id,
    nombre: val('mem-nombre'),
    continuaDesdeId: val('mem-padre') || null,
    reseteaAcumulada: fila.querySelector('.mem-reset').checked,
    regimenPresion: val('mem-regimen'),
    material: val('mem-material'),
    pulgadas: esManual ? 'manual' : Number(diametroSeleccionado),
    tuberiaManual: esManual ? {
      diametroMm: numeroFlexible(val('mem-diametro-manual-mm')), k: numeroFlexible(val('mem-diametro-manual-k')),
    } : undefined,
    potenciaKw: numeroFlexible(val('mem-potencia')),
    longitudM: numeroFlexible(val('mem-largo')),
    presionInicialPa: aPa(numeroFlexible(val('mem-presion')), unidadPresionInicial),
    temperaturaC: numeroFlexible(val('mem-temp')),
  };
}

// El informe debe entrar siempre en una sola hoja (2026-09-08, a pedido
// del usuario, mismo criterio que Hidrogeno — ver su CLAUDE.md para el
// detalle). Con una red de muchos tramos la tabla puede crecer más alto
// que una A4; en vez de desbordar a una 2ª página, se mide el alto real
// ya renderizado con los estilos de impresión aplicados (beforeprint
// dispara después de que el navegador cambia a @media print) y, si no
// entra, se reduce todo el informe con `zoom` (a diferencia de
// `transform: scale()`, sí reduce el alto de layout de la caja, así que
// la paginación de impresión ve el tamaño ya achicado).
function ajustarEscalaImpresion() {
  const el = document.getElementById('memoria-informe-impresion');
  if (!el) return;
  el.style.zoom = '';
  // ×0.98: margen de seguridad contra el redondeo de `zoom` (mismo
  // criterio que Hidrogeno, ver su CLAUDE.md).
  const altoDisponiblePx = (297 - 2 * 14) * (96 / 25.4) * 0.98;
  const altoNaturalPx = el.scrollHeight;
  el.style.zoom = altoNaturalPx > altoDisponiblePx ? altoDisponiblePx / altoNaturalPx : '';
}

function initMemoria() {
  window.addEventListener('beforeprint', ajustarEscalaImpresion);
  window.addEventListener('afterprint', () => {
    const el = document.getElementById('memoria-informe-impresion');
    if (el) el.style.zoom = '';
  });
  tramosMemoria = cargar('memoria-red-gas', null) ?? [tramoMemoriaPorDefecto()];
  tramosMemoria = repararIdsDuplicados(tramosMemoria, 't');
  contadorIdMemoria = maxSufijoId(tramosMemoria);
  proyecto = cargar('memoria-proyecto', null) ?? proyectoPorDefecto();
  proyecto.artefactos = repararIdsDuplicados(proyecto.artefactos, 'a');
  contadorArtefactoId = maxSufijoId(proyecto.artefactos);
  aplicarProyectoAForm();

  ['memoria-presion-inicial-unidad', 'memoria-perdida-requerida-unidad', 'memoria-perdida-acumulada-unidad', 'memoria-presion-final-unidad'].forEach((id) => {
    const clave = `memoria-red-gas-${id}`;
    const guardado = cargar(clave, null);
    const select = document.getElementById(id);
    if (guardado) select.value = guardado;
    select.addEventListener('input', () => {
      guardar(clave, select.value);
      recalcularMemoria();
    });
  });

  // Tras agregar un tramo, el foco pasa a su nombre (seleccionado) para
  // poder escribirlo de inmediato, sin buscar la fila nueva al final.
  document.getElementById('memoria-agregar-tramo').addEventListener('click', () => {
    tramosMemoria.push(tramoMemoriaPorDefecto());
    recalcularMemoria();
    const nombre = document.querySelector('#memoria-tabla-cuerpo tr:last-child .mem-nombre');
    if (nombre) { nombre.focus(); nombre.select(); }
  });

  // Un <select>/checkbox cambia la estructura de la fila (visibilidad de
  // sub-campos manuales, opciones de padre) y necesita el re-render
  // completo; un <input> de texto/número solo actualiza los resultados
  // calculados sin tocar ningún elemento de ingreso — ver
  // recalcularMemoriaLigero() y el comentario ahí.
  document.getElementById('memoria-tabla-cuerpo').addEventListener('input', (evento) => {
    const fila = evento.target.closest('tr[data-id]');
    if (!fila) return;
    const actualizado = leerFilaMemoria(fila);
    tramosMemoria = tramosMemoria.map((t) => (t.id === actualizado.id ? actualizado : t));
    if (evento.target.tagName === 'SELECT') {
      recalcularMemoria();
    } else {
      recalcularMemoriaLigero();
    }
  });

  document.getElementById('memoria-tabla-cuerpo').addEventListener('click', (evento) => {
    if (!evento.target.classList.contains('mem-eliminar')) return;
    const id = evento.target.closest('tr[data-id]').dataset.id;
    tramosMemoria = tramosMemoria.filter((t) => t.id !== id).map((t) => (t.continuaDesdeId === id ? { ...t, continuaDesdeId: null } : t));
    recalcularMemoria();
  });

  // Cajetines de datos del proyecto — un único listener de 'input'
  // delegado en el <form>; nunca se regeneran vía innerHTML (solo se leen
  // y se guardan), así que no tienen el problema de foco de la tabla de
  // tramos.
  document.getElementById('form-memoria-proyecto').addEventListener('input', () => {
    proyecto = { ...proyecto, ...leerProyecto() };
    renderInformeImpresion(ultimoResultadoMemoria);
    guardar('memoria-proyecto', proyecto);
  });

  // Artefactos: escribir en un cajetín solo actualiza el total y el
  // informe (sin regenerar la lista, mismo criterio que
  // recalcularMemoriaLigero()); agregar/quitar sí necesita regenerar la
  // lista completa.
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
    renderArtefactos();
    renderInformeImpresion(ultimoResultadoMemoria);
    guardar('memoria-proyecto', proyecto);
  });

  document.getElementById('memoria-artefacto-agregar').addEventListener('click', () => {
    proyecto.artefactos.push(artefactoPorDefecto());
    renderArtefactos();
    renderInformeImpresion(ultimoResultadoMemoria);
    guardar('memoria-proyecto', proyecto);
  });

  // Línea de estado bajo la barra de acciones (2026-09-24, mismo patrón
  // que Hidrogeno): confirma importar/exportar — antes no había ninguna
  // respuesta visible, y un .json inválido fallaba en silencio.
  const estado = document.getElementById('memoria-estado');
  function mostrarEstado(texto, esError = false) {
    estado.textContent = texto;
    estado.classList.toggle('error', esError);
  }

  document.getElementById('memoria-exportar').addEventListener('click', () => {
    exportarJSON('proyecto-gas-natural-glp.json', { tramos: tramosMemoria, proyecto });
    mostrarEstado('Proyecto exportado como proyecto-gas-natural-glp.json.');
  });

  document.getElementById('memoria-importar').addEventListener('change', async (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    // Se vacía el <input> para que volver a elegir el mismo archivo (p.ej.
    // tras editarlo) dispare 'change' de nuevo.
    evento.target.value = '';
    let datos;
    try {
      datos = await importarJSON(archivo);
    } catch (error) {
      mostrarEstado(`No se pudo importar "${archivo.name}": no es un archivo JSON válido.`, true);
      return;
    }
    if (datos === null || typeof datos !== 'object') {
      mostrarEstado(`No se pudo importar "${archivo.name}": no es un proyecto exportado desde esta calculadora.`, true);
      return;
    }
    // Compatibilidad hacia atrás: un export previo a los cajetines de
    // proyecto era un array plano de tramos, sin envolver.
    if (Array.isArray(datos)) {
      tramosMemoria = datos;
    } else {
      tramosMemoria = datos.tramos ?? [];
      proyecto = { ...proyectoPorDefecto(), ...datos.proyecto };
      proyecto.artefactos = repararIdsDuplicados(proyecto.artefactos, 'a');
      contadorArtefactoId = maxSufijoId(proyecto.artefactos);
      aplicarProyectoAForm();
    }
    tramosMemoria = repararIdsDuplicados(tramosMemoria, 't');
    contadorIdMemoria = maxSufijoId(tramosMemoria);
    recalcularMemoria();
    mostrarEstado(`Proyecto "${archivo.name}" importado — ${tramosMemoria.length} ${tramosMemoria.length === 1 ? 'tramo' : 'tramos'}.`);
  });

  document.getElementById('memoria-imprimir').addEventListener('click', () => window.print());

  alCambiarCombustible(recalcularMemoria);
  recalcularMemoria();
}

/* ---------------------------------------------------------------------- */

initTabs();
initValidacionNumerica();
initSelectorCombustible();
initRedGas();
initAlmacenamiento();
initCombustion();
initQuemador();
initMemoria();
initSelectorGas({ actualId: 'gas-natural-glp', profundidad: 1 });
initResumenMovil();
