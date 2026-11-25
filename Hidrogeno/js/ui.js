import { calcularFlujo } from './calc-flujo.js';
import { calcularAlmacenamiento, formatearHoras } from './calc-almacenamiento.js';
import { calcularRed } from './calc-memoria.js';
import { pruebaHermeticidadRed, pruebaHermeticidadIP, volumenTuberiaM3 } from './prueba-hermeticidad.js';
import { TABLA_TUBERIA, TABLA_FACTOR_DISENO_F } from './gas-h2.js';
import { guardar, cargar, exportarJSON, importarJSON } from './storage.js';
import { initSelectorGas } from '../../assets/gas-switcher.js';
import { initEditorRed } from '../../assets/editor-red.js';
import { aPa, desdePa, opcionesUnidadPresion } from './unidades-presion.js';

// Formato numérico de todos los resultados (2026-09-02, a pedido del
// usuario): coma decimal / punto de miles (es-CL), hasta 2 decimales
// (recorta ceros de más). Solo afecta cómo se MUESTRAN los valores — el
// cálculo interno sigue con precisión completa.
const FORMATO_NUMERO = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
function formatearNumero(valor) {
  return FORMATO_NUMERO.format(valor);
}

// El factor de compresibilidad Z necesita más resolución que el resto de los
// resultados (2026-09-08): con 2 decimales, el Z de "Tubería y Flujo"
// (1,0011 a baja presión) se mostraba como "1" y el de Almacenamiento
// perdía el detalle que justamente hace visible que ya no hay escalones.
// El cálculo interno siempre usa precisión completa; esto es solo formato.
const FORMATO_Z = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 3, maximumFractionDigits: 4 });
function formatearZ(valor) {
  return FORMATO_Z.format(valor);
}

// Relaciones de presión adimensionales del screening de flujo sónico
// (2026-09-08): 3 decimales fijos, para que el límite crítico se lea
// "0,528" tal como se cita en la literatura y no "0,53".
const FORMATO_RATIO = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
function formatearRatio(valor) {
  return FORMATO_RATIO.format(valor);
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

// Escapa texto que se interpola dentro de un atributo HTML (ej.
// aria-label="..."). Necesario porque algunas etiquetas de resultado
// llevan una comilla literal (ej. 'línea capilar Ø¼"') que si no se escapa
// corta el atributo a mitad de camino y rompe el marcado.
function escapeAttr(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// Escapa texto libre de usuario (nombre de tramo/artefacto, material)
// antes de insertarlo como CONTENIDO de una etiqueta (ej. <td>${...}</td>,
// <option>${...}</option>, <text>${...}</text> del árbol SVG) — a
// diferencia de escapeAttr(), acá lo peligroso es "<" (abre una etiqueta
// nueva) y "&" (abre una entidad), no la comilla. Sin esto, un nombre de
// tramo como `<b>x</b>` se renderizaría como HTML real en vez de texto
// literal (autoimportado desde un .json, no un vector entre usuarios —
// pero igual rompe el layout de la tabla/árbol/informe con solo escribirlo
// a mano).
function escapeHtml(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// La pestaña activa vive en el hash de la URL (#flujo, #memoria — el
// data-tab de cada botón, 2026-09-24): recargar la página ya no devuelve
// siempre a la primera pestaña, y el hub puede enlazar directo a una
// herramienta. replaceState en vez de asignar location.hash para no llenar
// el historial con un paso por cada clic de pestaña.
// Desde 2026-11-24 Almacenamiento vive en la pestaña #flujo («Estanque y
// tubería»): un enlace o marcador viejo a #almacenamiento lleva ahí.
const ALIAS_PESTANA = { almacenamiento: 'flujo' };

function initTabs() {
  const botones = Array.from(document.querySelectorAll('.tab'));
  const paneles = document.querySelectorAll('.tab-panel');
  function activar(pedido) {
    const nombre = ALIAS_PESTANA[pedido] ?? pedido;
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
      // de pestaña estando más abajo, volver al inicio del contenido en vez
      // de dejar al usuario a media altura de un panel distinto.
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

// Marca en rojo (aria-invalid, estilo en css/styles.css) un cajetín
// numérico cuyo texto no se puede leer como número — numeroFlexible() lo
// trata como 0, y antes eso pasaba sin ningún aviso (2026-09-24). Vacío no
// cuenta como inválido: hay campos opcionales (criterios de diseño).
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

// `variante` acepta un booleano (compatibilidad con los usos existentes,
// true -> 'alerta') o un string ('ok' | 'alerta', mismo patrón que
// GasNatural-GLP/js/ui.js) para el indicador "Tubería adecuada".
function tile(valor, etiqueta, variante = false) {
  const clase = variante === true ? ' alerta' : variante ? ` ${variante}` : '';
  return `<div class="resultado-tile${clase}"><div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div></div>`;
}

// Agrupa tiles de resultado bajo un subtítulo opcional, cada grupo con su
// propia grilla auto-fit (2026-09-24): así el par de KPI ocupa todo el
// ancho en vez de dejar columnas vacías de una grilla común a todos los
// tiles. `clase` = 'kpis' para el grupo de KPI del tope (tiles más anchos).
function grupo(titulo, tiles, clase = '') {
  const subtitulo = titulo ? `<div class="resultados-subtitulo">${titulo}</div>` : '';
  return `<div class="grupo-resultados${clase ? ` ${clase}` : ''}">${subtitulo}${tiles.join('')}</div>`;
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
    <div class="valor"><span class="valor-numero">${formatearPresionBonita(valorPa, unidad)}</span><select class="select-unidad-inline" data-tile-presion-unidad="${clave}" aria-label="Unidad de ${escapeAttr(etiqueta)}">${opcionesUnidadPresion(unidad)}</select></div>
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
function tileConUnidad(valorFormateado, etiqueta, selectId, opciones, seleccionada, variante = '') {
  const opcionesHtml = opciones.map((o) => {
    const texto = o.replace(/[[\]]/g, '').replace('m3', 'm³');
    return `<option value="${o}"${o === seleccionada ? ' selected' : ''}>${texto}</option>`;
  }).join('');
  return `<div class="resultado-tile${variante ? ` ${variante}` : ''}">
    <div class="valor"><span class="valor-numero">${valorFormateado}</span><select class="select-unidad-inline" id="${selectId}" aria-label="Unidad de ${escapeAttr(etiqueta)}">${opcionesHtml}</select></div>
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
    (f) => `<option value="${f.pulgadas}">${formatearPulgadas(f.pulgadas)} — DE ${formatearNumero(f.deMm)} / DI ${formatearNumero(f.diMm)} mm</option>`
  ).join('') + '<option value="manual">Manual (ingresar mm)</option>';
}

/* ---------------------------------------------------------------------- */
/* Pestaña «Tubería y estanque» — parte tubería                          */
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

// Presentación del screening de caída de presión / flujo sónico
// (AGREGADO 2026-09-08, a pedido del usuario). Mapea el `estado` que
// devuelve chequeoCaidaPresion() a la etiqueta, la variante visual y el
// texto auxiliar. Los textos son los provistos por el usuario.
//
// IMPORTANTE: esto NO es API RP 14E ni lo reemplaza — el par de tiles
// "Velocidad erosión (I-3.4.5)" / "Velocidad de flujo" sigue arriba, con su
// criterio del 80% intacto. Este bloque es un chequeo adicional, y su
// alcance es un SCREENING SIMPLIFICADO de gas ideal: sin Cv, sin xT, sin
// datos del fabricante. Un OK acá no certifica que una válvula o regulador
// sea apto para H₂.
const ESTADOS_SONICO = {
  ok: {
    etiqueta: 'OK — Baja caída de presión',
    variante: 'ok',
    nota: 'Caída de presión ≤ 10 % de la presión aguas arriba. No se identifica una condición relevante de aceleración hacia flujo sónico mediante este screening simplificado.',
  },
  advertencia: {
    etiqueta: 'ADVERTENCIA — Revisar válvulas/reguladores',
    variante: 'alerta',
    nota: 'Caída de presión > 10 %. En servicio de H₂ se recomienda revisar especialmente válvulas, reguladores y restricciones por posible alta velocidad local, ruido, erosión o abrasión.',
  },
  critico: {
    etiqueta: 'CRÍTICO — Posible flujo sónico / choked flow',
    variante: 'critico',
    nota: 'La relación de presiones alcanza el límite crítico aproximado para H₂ ideal (γ = 1,40). Puede existir flujo estrangulado en una restricción. Se requiere verificación específica de la válvula/regulador con datos del fabricante.',
  },
  'no-aplica': {
    etiqueta: 'No aplica',
    variante: 'alerta',
    nota: 'La presión aguas abajo no es menor que la aguas arriba (o queda fuera de rango físico), así que esto no constituye una caída de presión. Revise la presión de operación y la pérdida de carga antes de interpretar este screening.',
  },
};

// Filas del screening dentro de la lista de Tubería (2026-11-25, maqueta
// «A»): el estado ya lo dice la franja de veredicto, aquí van solo las
// cifras. La nota del usuario se muestra solo si el estado no es OK.
function filasChequeoSonico(c) {
  const { variante, nota } = ESTADOS_SONICO[c.estado];
  const valor = (v, sufijo = '') => (v === null ? '—' : `${formatearNumero(v)}${sufijo}`);
  return [
    tile(valor(c.caidaPresionPorcentaje, ' %'), 'Caída de presión ΔP/P₁ (límite 10 %)', c.estado === 'ok' ? '' : variante),
    tile(`${c.relacionPresion === null ? '—' : formatearRatio(c.relacionPresion)} · ${formatearRatio(c.relacionPresionCritica)}`, 'P₂/P₁ · límite crítico (γ = 1,40)', 'secundario'),
    ...(c.estado === 'ok' ? [] : [`<div class="resultados-nota">${nota}</div>`]),
  ];
}

/* === Veredicto de resultados — INICIO ===
   Mismo código en Hidrogeno, GasNatural-GLP y OtrosGases (sus estilos,
   en el bloque «Resultados compactos con veredicto» de css/styles.css).
   Franja de veredicto (2026-11-25, maqueta «A» elegida por el usuario):
   dice de un vistazo si el cálculo cumple y por qué. `chequeos` = lista de
   { estado: 'ok' | 'alerta' | 'critico', texto, nota?, descarta? }. «No
   cumple» solo si un chequeo crítico `descarta` el diseño (una tubería que
   no resiste, un fluido que condensa); los demás avisos piden «Revisar»,
   porque exigen verificar, no descartan. `info` = texto del ⓘ. */
let infoVeredictoAbierta = false;
function veredicto(chequeos, info) {
  const peor = ['critico', 'alerta'].find((e) => chequeos.some((ch) => ch.estado === e)) ?? 'ok';
  const titulo = chequeos.some((ch) => ch.estado === 'critico' && ch.descarta) ? 'No cumple'
    : peor === 'ok' ? 'Cumple' : 'Revisar';
  const chips = chequeos.map((ch) => `<li class="veredicto-chip ${ch.estado}"${ch.nota ? ` title="${escapeAttr(ch.nota)}"` : ''}>${ch.texto}</li>`).join('');
  return `<div class="veredicto ${peor}">
    <div class="veredicto-titulo">${titulo} <span class="info-norma" tabindex="0" role="img" aria-label="Qué se revisa" title="${escapeAttr(info)}">ⓘ</span></div>
    <ul class="veredicto-chips">${chips}</ul>
    <div class="resultados-nota info-norma-texto"${infoVeredictoAbierta ? '' : ' hidden'}>${escapeHtml(info)}</div>
  </div>`;
}

// ⓘ del veredicto: en el teléfono no hay hover, así que al tocarlo muestra
// u oculta su texto. Delegado en el documento porque el veredicto se
// redibuja en cada tecla; se recuerda si quedó abierto.
function initInfoVeredicto() {
  const alternar = (evento) => {
    const icono = evento.target.closest?.('.veredicto .info-norma');
    if (!icono) return;
    if (evento.type === 'keydown') {
      if (evento.key !== 'Enter' && evento.key !== ' ') return;
      evento.preventDefault();
    }
    infoVeredictoAbierta = !infoVeredictoAbierta;
    document.querySelectorAll('.veredicto .info-norma-texto').forEach((nota) => { nota.hidden = !infoVeredictoAbierta; });
  };
  document.addEventListener('click', alternar);
  document.addEventListener('keydown', alternar);
}
/* === Veredicto de resultados — FIN === */

// Los 3 chequeos de la tubería para la franja de veredicto (ver veredicto()).
function veredictoInstalacion(r, cercaDeErosion) {
  const c = r.chequeoSonico;
  const sonico = ESTADOS_SONICO[c.estado];
  const caida = c.caidaPresionPorcentaje === null ? '' : `: ΔP ${formatearNumero(c.caidaPresionPorcentaje)} %`;
  return veredicto([
    r.tuberiaAdecuada
      ? { estado: 'ok', texto: 'Tubería adecuada' }
      : { estado: 'critico', texto: 'Tubería no adecuada: usar mayor espesor o menor diámetro', descarta: true },
    {
      estado: cercaDeErosion ? 'alerta' : 'ok',
      texto: `${r.velocidadFlujoErosionMS > r.velocidadErosionMS ? 'Supera la velocidad de erosión'
        : cercaDeErosion ? 'Cerca de la erosión' : 'Lejos de la erosión'}: ${formatearNumero(r.velocidadFlujoErosionMS)} de ${formatearNumero(r.velocidadErosionMS)} m/s`,
    },
    {
      estado: sonico.variante,
      texto: c.estado === 'ok' ? `Baja caída de presión${caida}`
        : c.estado === 'no-aplica' ? 'Caída de presión: no aplica' : `${sonico.etiqueta}${caida}`,
      nota: sonico.nota,
    },
  ], 'Tres chequeos de la tubería:\n• Espesor: la presión máx. de diseño (ASME B31.12 PL-3.7.1) supera la de operación.\n• Erosión (API RP 14E): aviso si la velocidad a la presión mínima pasa el 80 % de la de erosión.\n• Caída de presión / flujo sónico: screening simplificado de gas ideal; no reemplaza API RP 14E ni los datos del fabricante de válvulas y reguladores.');
}


// Bloque de resultados con la misma marca (1, 2, 3) que su sección del
// formulario (2026-11-24, maqueta «A·1» elegida por el usuario): el
// resultado de lo que se acaba de cambiar se encuentra en el mismo orden y
// con el mismo número. `marca` = '1' | '2' | '3' | 'prueba'.
// `clase` = 'bloque-principal' | 'bloque-ancho' (acomodo en dos columnas,
// ver «Resultados compactos con veredicto» en css/styles.css).
function bloqueResultados(marca, titulo, contenido, clase = '') {
  const simbolo = marca === 'prueba' ? '✓' : marca;
  return `<section class="bloque-resultados${clase ? ` ${clase}` : ''}"><h3 class="bloque-titulo"><span class="marca marca-${marca}" aria-hidden="true">${simbolo}</span>${titulo}</h3>${contenido.join('')}</section>`;
}

// «Factores de verificación» va plegado: se recuerda si el usuario lo abrió,
// porque el bloque se redibuja en cada tecla.
let factoresAbiertos = false;

// Orden (2026-11-25, a pedido del usuario: la tubería primero): KPI arriba
// (los lee también el resumen del teléfono), luego 1 Tubería, 2 Estanque,
// 3 Consumo (datos comunes) y la prueba de
// hermeticidad, que usa la instalación completa. Dentro de Tubería sigue
// el orden de 2026-09-02: caudal y velocidad, erosión, flujo sónico y, al
// final, los factores de la fórmula.
// Ya no se muestra «Consumo del quemador» de Almacenamiento: repetía el
// flujo másico y el normalizado de la tubería (solo cambia el PCI de cada
// hoja del Excel, 119 960 vs 120 000 kJ/kg).
function renderResultadosInstalacion(r, a, prueba, presionDisenoBarG) {
  // API RP 14E en el MISMO estado del gas (2026-09-25): velocidad de flujo
  // y velocidad erosional, ambas a la presión mínima de la línea — ver
  // calc-flujo.js. Antes se comparaba la de flujo a la presión de operación
  // con la erosional a la mínima.
  const cercaDeErosion = r.velocidadFlujoErosionMS >= r.velocidadErosionMS * 0.8;
  const notaPresionMinima = r.presionMinimaSobreOperacion
    ? ['<div class="resultados-nota">La presión mínima ingresada supera la de operación: no puede ser la mínima de esta línea. La erosión se verificó a la presión de operación.</div>']
    : [];
  const varianteAdecuada = r.tuberiaAdecuada ? 'ok' : 'alerta';
  const formatearVolumen = (v) => new Intl.NumberFormat('es-CL', { maximumSignificantDigits: 3 }).format(v);
  const ds66 = prueba.ds66;
  // El ajuste va en la etiqueta, no en el valor: el valor no se corta y
  // una frase larga ahí aplastaba la etiqueta en una columna angosta.
  const textoDs66 = ds66.ajuste === 'minimo' ? `; mínimo, la fórmula da ${formatearNumero(ds66.formulaMin)} min`
    : ds66.ajuste === 'maximo' ? `; máximo, la fórmula da ${formatearNumero(ds66.formulaMin)} min` : '';

  document.getElementById('resultados-flujo').innerHTML = [
    veredictoInstalacion(r, cercaDeErosion),

    grupo(null, [
      tile(formatearHoras(a.autonomiaHoras), 'Autonomía hasta la presión residual (hh:mm:ss)', 'kpi'),
      tilePresion(r.presionMaxDisenoBar, 'bar', 'Presión máxima diseño (PL-3.7.1)', 'presion-max-diseno', unidadesTilesPresionFlujo, `kpi ${varianteAdecuada}`),
      tile(`${formatearNumero(a.masaUtilizableKg)} kg`, 'Masa utilizable de H₂ (sobre la presión residual)', 'kpi'),
    ], 'kpis'),

    '<div class="bloques-resultados">',
    bloqueResultados('1', 'Tubería', [
      grupo(null, [
        tileConUnidad(formatearNumero(r.flujoVolH2), 'Flujo volum. de H₂ en la línea', 'flujo-unidad-h2', OPCIONES_UNIDAD_H2, unidadH2Flujo),
        tile(`${formatearNumero(r.velocidadFlujoMS)} m/s`, 'Velocidad de flujo (presión de operación)'),
        tilePresion(r.perdidaCargaMbar, 'mbar', 'Pérdidas de carga', 'perdida-carga', unidadesTilesPresionFlujo),
        tile(`${formatearNumero(r.velocidadErosionMS)} m/s`, 'Velocidad de erosión (API RP 14E, I-3.4.5)'),
        tile(`${formatearNumero(r.velocidadFlujoErosionMS)} m/s`, `Velocidad de flujo a la presión mínima (${formatearNumero(r.presionErosionBarG)} barG)`, cercaDeErosion ? 'alerta' : ''),
        ...filasChequeoSonico(r.chequeoSonico),
        ...notaPresionMinima,
      ]),
      `<details class="detalle-factores"${factoresAbiertos ? ' open' : ''}><summary>Factores de verificación</summary>${grupo(null, [
        tile(`${formatearNumero(r.densidadKgM3)} kg/m³`, 'Densidad real en la línea', 'secundario'),
        tile(formatearNumero(r.factorHfAplicado), 'Factor Hf aplicado (Tabla IX-5A, fragilización por H₂)', 'secundario'),
        tile(formatearNumero(r.factorTAplicado), 'Factor T aplicado (Tabla PL-3.7.1(b)(8), derating por temperatura)', 'secundario'),
        tile(formatearZ(r.zDiseno), 'Factor Z (compresibilidad, correlación NIST)', 'secundario'),
        tile(formatearNumero(r.reynolds), 'Número de Reynolds', 'secundario'),
        tile(formatearNumero(r.factorFriccion), 'Factor de fricción (Haaland)', 'secundario'),
      ])}</details>`,
    ], 'bloque-principal'),

    bloqueResultados('2', 'Estanque', [
      grupo(null, [
        tile(`${formatearNumero(a.masaAlmacenadaKg)} kg`, 'Masa de H₂ almacenada (PV=ZnRT)'),
        tile(`${formatearNumero(a.volumenNormalizadoNm3)} Nm³`, 'Volumen normalizado'),
        tile(a.tiempoLlenadoHoras === null ? '—' : formatearHoras(a.tiempoLlenadoHoras), 'Tiempo de llenado desde la presión residual (hh:mm:ss)'),
        tileConUnidad(formatearNumero(a.caudalReferenciaM3H), 'Caudal real de llenado (a la presión del estanque)', 'alm-unidad-caudal', OPCIONES_UNIDAD_CAUDAL_ALM, unidadCaudalAlm, 'secundario'),
        tile(`${formatearNumero(a.velocidadReferenciaMS)} m/s`, `Velocidad de llenado en línea Ø¼" (DI ${formatearNumero(a.diametroCapilarMm)} mm)`, 'secundario'),
        tile(formatearZ(a.zAlmacenamiento), 'Factor de compresibilidad Z en el estanque', 'secundario'),
        tile(`${formatearNumero(a.densidadRealKgM3)} kg/m³`, 'Densidad real en el estanque', 'secundario'),
      ]),
    ]),

    bloqueResultados('3', 'Consumo (datos comunes)', [
      grupo(null, [
        tile(`${formatearNumero(r.flujoMasicoKgH)} kg/h`, 'Flujo másico de H₂'),
        tileConUnidad(formatearNumero(r.flujoVolNormalizado), 'Flujo volum. Norm.', 'flujo-unidad-normalizado', OPCIONES_UNIDAD_NORMALIZADO, unidadNormalizadoFlujo),
      ]),
    ]),

    bloqueResultados('prueba', 'Prueba de hermeticidad — ASME B31.12 IP-10', [
      grupo(null, [
        tile(`${prueba.duracionMinimaMin} min`, 'Duración mínima, revisando todas las uniones (IP-10.6.2)'),
        tile(`${formatearVolumen(prueba.volumenM3)} m³`, `Volumen probado: tubería ${formatearVolumen(prueba.volumenTuberiaM3)} + estanque ${formatearVolumen(prueba.volumenEstanqueM3)} m³`),
        tilePresion(prueba.hidrostaticaBarG, 'bar', 'Prueba hidrostática, mínimo (1,5 × diseño, IP-10.7.2)', 'prueba-hidrostatica', unidadesTilesPresionFlujo),
        tilePresion(prueba.neumaticaBarG, 'bar', 'Prueba neumática, aire o N₂ — nunca H₂ (1,1 × diseño, IP-10.8.4)', 'prueba-neumatica', unidadesTilesPresionFlujo),
        tilePresion(prueba.alivioMaxBarG, 'bar', 'Alivio en prueba neumática, calibración máx. (IP-10.8.2)', 'prueba-alivio', unidadesTilesPresionFlujo, 'secundario'),
        tile(`${formatearNumero(ds66.duracionMin)} min`, `Referencia D.S. 66 f.11 (volumen × 214${textoDs66}) — no exigida para H₂`, 'secundario'),
        `<div class="resultados-nota">Presión de diseño tomada: la de la línea (${formatearNumero(presionDisenoBarG)} barG). Fuentes en el ⓘ de la Memoria de Cálculo.</div>`,
      ]),
    ], 'bloque-ancho'),
    '</div>',
  ].join('');
}

function renderTablaTuberia() {
  const filas = TABLA_TUBERIA.map(
    (f) => `<tr><td>${formatearPulgadas(f.pulgadas)}</td><td>${formatearNumero(f.deMm)}</td><td>${formatearNumero(f.diMm)}</td><td>${f.espesorMm}</td><td>${f.limiteElasticoMPa}</td><td>${f.rugosidadMm}</td></tr>`
  ).join('');
  document.getElementById('tabla-tuberia-flujo').innerHTML =
    `<thead><tr><th>Nominal</th><th>DE [mm]</th><th>DI [mm]</th><th>Espesor [mm]</th><th>S mín. [MPa]</th><th>Rugosidad [mm]</th></tr></thead><tbody>${filas}</tbody>`;
}

/* ---------------------------------------------------------------------- */
/* Almacenamiento (desde 2026-11-24 en la misma pestaña que la tubería)   */
/* ---------------------------------------------------------------------- */

const OPCIONES_UNIDAD_CAUDAL_ALM = ['[m³/h]', '[L/min]'];
let unidadCaudalAlm = '[m³/h]';

// Potencia y temperatura son los «Datos comunes» de la pestaña: los mismos
// cajetines que la tubería (flujo-potencia, flujo-temperatura). Antes el
// estanque tenía los suyos (alm-potencia, alm-temperatura).
function leerAlmacenamientoForm() {
  const num = (id) => numeroFlexible(document.getElementById(id).value);
  return {
    potenciaKw: num('flujo-potencia'),
    temperaturaC: num('flujo-temperatura'),
    presionBarAbs: leerPresion('alm-presion', 'alm-presion-unidad', 'bar'),
    volumenM3: num('alm-volumen'),
    presionResidualBarAbs: leerPresion('alm-presion-residual', 'alm-presion-residual-unidad', 'bar'),
    caudalLlenadoNm3H: num('alm-caudal-llenado'),
    unidadCaudalReferencia: unidadCaudalAlm,
  };
}

// Pestaña «Tubería y estanque» (2026-11-24): un formulario, dos motores sin
// cambios (calcularFlujo, calcularAlmacenamiento) y la prueba de
// hermeticidad con el volumen de esta línea más el del estanque. Lo
// guardado sigue en dos claves, 'flujo' (campos flujo-*) y
// 'almacenamiento' (campos alm-*), así se conservan los datos de antes.
function initInstalacion() {
  const form = document.getElementById('form-flujo');
  const select = document.getElementById('flujo-tuberia');
  poblarSelectTuberia(select);
  poblarSelectFactorDiseno(document.getElementById('flujo-factor-diseno'));
  renderTablaTuberia();

  const aplicar = (guardados) => Object.entries(guardados).forEach(([id, valor]) => {
    const el = document.getElementById(id);
    if (el && form.contains(el)) el.value = valor;
  });
  const guardadosFlujo = cargar('flujo', null);
  if (guardadosFlujo) {
    aplicar(guardadosFlujo);
    unidadNormalizadoFlujo = guardadosFlujo['flujo-unidad-normalizado'] ?? unidadNormalizadoFlujo;
    unidadH2Flujo = guardadosFlujo['flujo-unidad-h2'] ?? unidadH2Flujo;
  } else {
    select.value = '0.5';
  }
  const guardadosAlm = cargar('almacenamiento', null);
  if (guardadosAlm) {
    aplicar(guardadosAlm);
    unidadCaudalAlm = guardadosAlm['alm-unidad-caudal'] ?? unidadCaudalAlm;
  }

  function actualizarVisibilidadTuberiaManual() {
    document.getElementById('campo-flujo-tuberia-manual').style.display = select.value === 'manual' ? '' : 'none';
  }
  actualizarVisibilidadTuberiaManual();
  select.addEventListener('input', actualizarVisibilidadTuberiaManual);

  initSelectorUnidadCampo('flujo-presion', 'flujo-presion-unidad');
  initSelectorUnidadCampo('flujo-presion-min', 'flujo-presion-min-unidad');
  initSelectorUnidadCampo('alm-presion', 'alm-presion-unidad');
  initSelectorUnidadCampo('alm-presion-residual', 'alm-presion-residual-unidad');
  initTilesPresion('resultados-flujo', unidadesTilesPresionFlujo, 'unidades-tiles-presion-flujo');

  const camposConPrefijo = (prefijo) => Object.fromEntries(
    Array.from(form.querySelectorAll('input, select')).filter((el) => el.id.startsWith(prefijo)).map((el) => [el.id, el.value])
  );

  function recalcular() {
    const entradasFlujo = leerFlujoForm();
    const flujo = calcularFlujo(entradasFlujo);
    const almacenamiento = calcularAlmacenamiento(leerAlmacenamientoForm());
    const volumenEstanqueM3 = numeroFlexible(document.getElementById('alm-volumen').value);
    const volumenLineaM3 = volumenTuberiaM3({ diametroInteriorMm: flujo.tuberia.diMm, longitudM: entradasFlujo.largoM });
    const prueba = {
      ...pruebaHermeticidadIP({ presionDisenoBarG: entradasFlujo.presionBarG, volumenM3: volumenLineaM3 + Math.max(0, volumenEstanqueM3) }),
      volumenTuberiaM3: volumenLineaM3,
      volumenEstanqueM3: Math.max(0, volumenEstanqueM3),
    };
    renderResultadosInstalacion(flujo, almacenamiento, prueba, entradasFlujo.presionBarG);
    guardar('flujo', Object.assign(camposConPrefijo('flujo-'),
      { 'flujo-unidad-normalizado': unidadNormalizadoFlujo, 'flujo-unidad-h2': unidadH2Flujo }));
    guardar('almacenamiento', Object.assign(camposConPrefijo('alm-'), { 'alm-unidad-caudal': unidadCaudalAlm }));
  }

  // Los selectores de unidad de flujo y de caudal de llenado viven en los
  // tiles de resultado (se regeneran en cada render), fuera del <form> — se
  // cablean por delegación en el contenedor de resultados.
  const resultados = document.getElementById('resultados-flujo');
  resultados.addEventListener('input', (evento) => {
    const id = evento.target.id;
    if (id === 'flujo-unidad-normalizado') unidadNormalizadoFlujo = evento.target.value;
    else if (id === 'flujo-unidad-h2') unidadH2Flujo = evento.target.value;
    else if (id === 'alm-unidad-caudal') unidadCaudalAlm = evento.target.value;
    else return;
    recalcular();
  });
  // 'toggle' no burbujea: se escucha en captura.
  resultados.addEventListener('toggle', (evento) => {
    if (evento.target.matches?.('.detalle-factores')) factoresAbiertos = evento.target.open;
  }, true);

  form.addEventListener('input', recalcular);
  recalcular();
}

/* ---------------------------------------------------------------------- */
/* Pestaña 3 — Memoria de Cálculo (red ramificada)                        */
/* ---------------------------------------------------------------------- */

let tramos = [];
let contadorId = 0;
let proyecto = null;
let contadorArtefactoId = 0;
let ultimoResultadoMemoria = [];

// Texto de observaciones por defecto (2026-09-02, a pedido del usuario) —
// mismo texto que trae el documento de ejemplo de QUEMPIN (Q=vA en vez del
// itálico matemático original, por compatibilidad de fuente); editable en
// el cajetín "Observaciones".
const OBSERVACIONES_DEFECTO =
  'Cálculos basados en la ecuación de continuidad (Q=vA), determinación de pérdidas de carga ' +
  'mediante la ecuación de Darcy–Weisbach y evaluación del régimen de flujo mediante el número de ' +
  'Reynolds. Metodología de análisis hidráulico respaldada por principios clásicos de mecánica de ' +
  'fluidos y criterios de diseño aplicables a tuberías de hidrógeno establecidos en ASME B31.12 y NFPA 2.';

function proyectoPorDefecto() {
  return {
    fecha: '', proyecto: '', instalador: '', contacto: '', direccion: '', comuna: '',
    cargoInstalador: '', runInstalador: '', numeroDoc: '402603', revision: '1',
    velocidadMaxFlujoDisenoMS: 20, velocidadErosionDisenoMS: null, perdidaMaxAcumuladaDisenoPa: null,
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

function tramoPorDefecto() {
  contadorId += 1;
  return {
    id: `t${contadorId}`, nombre: `Tramo ${contadorId}`, continuaDesdeId: null,
    reseteaAcumulada: false,
    presionMPa: 0.5, longitudM: 5, potenciaKw: 12, tuberiaPulgadas: 0.25,
    material: 'AISI 316L', temperaturaC: 20,
  };
}

// Tramos que continúan (directa o indirectamente) desde `id`: elegir uno de
// ellos en "Continúa desde" cerraría un ciclo, así que no se ofrecen
// (2026-09-28, igual en los tres módulos). El motor igual rechaza un ciclo
// que llegue en un .json importado.
function descendientesDe(id, lista) {
  const hijosDe = new Map();
  lista.forEach((t) => {
    if (t.continuaDesdeId) hijosDe.set(t.continuaDesdeId, [...(hijosDe.get(t.continuaDesdeId) ?? []), t.id]);
  });
  const descendientes = new Set();
  const pendientes = [...(hijosDe.get(id) ?? [])];
  while (pendientes.length) {
    const actual = pendientes.pop();
    if (actual === id || descendientes.has(actual)) continue;
    descendientes.add(actual);
    pendientes.push(...(hijosDe.get(actual) ?? []));
  }
  return descendientes;
}

function renderTablaMemoria(resultado) {
  const opcionesPadre = (actualId) => ['<option value="">— raíz —</option>'].concat(
    tramos.filter((t) => t.id !== actualId && !descendientesDe(actualId, tramos).has(t.id)).map((t) => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`)
  ).join('');

  // Unidad elegida en cada cabecera de columna de presión — independiente
  // entre las tres, no hay una unidad "de la tabla". El dato canónico en
  // `tramos` sigue siendo MPa (motor de cálculo); esto solo cambia cómo se
  // muestra/lee, ver leerFilaMemoria().
  const unidadPresion = document.getElementById('memoria-presion-unidad').value;
  const unidadPerdidaParcial = document.getElementById('memoria-perdida-parcial-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;

  // data-label = encabezado de la columna, con su unidad: en un teléfono la
  // tabla se muestra como una tarjeta por tramo y cada celda lo usa como
  // etiqueta propia (td::before en css/styles.css, 2026-09-25).
  document.getElementById('memoria-tabla-cuerpo').innerHTML = resultado.map((t) => `
    <tr data-id="${t.id}">
      <td class="mem-celda-nombre" data-label="Tramo"><input type="text" class="mem-nombre" value="${escapeAttr(t.nombre)}" aria-label="Nombre del tramo"></td>
      <td data-label="Continúa desde"><select class="mem-padre" aria-label="Continúa desde">${opcionesPadre(t.id)}</select></td>
      <td class="mem-celda-check" data-label="Reinicia acum." style="text-align:center;"><input type="checkbox" class="mem-reset"${t.reseteaAcumulada ? ' checked' : ''} title="Reinicia la pérdida de carga acumulada desde este tramo (ej. después de un regulador de presión)" aria-label="Reinicia la pérdida de carga acumulada"></td>
      <td data-label="Presión [${unidadPresion}]"><input type="text" inputmode="decimal" class="mem-presion" value="${Number(desdePa(aPa(t.presionMPa, 'MPa'), unidadPresion).toPrecision(6))}" aria-label="Presión [${unidadPresion}]"></td>
      <td data-label="Longitud [m]"><input type="text" inputmode="decimal" class="mem-largo" value="${t.longitudM}" aria-label="Longitud [m]"></td>
      <td data-label="Potencia [kW]"><input type="text" inputmode="decimal" class="mem-potencia" value="${t.potenciaKw}" aria-label="Potencia [kW]"></td>
      <td data-label="Diámetro">
        <select class="mem-tuberia" aria-label="Diámetro">
          ${TABLA_TUBERIA.map((f) => `<option value="${f.pulgadas}"${f.pulgadas === t.tuberiaPulgadas ? ' selected' : ''}>${formatearPulgadas(f.pulgadas)}</option>`).join('')}
          <option value="manual"${t.tuberiaPulgadas === 'manual' ? ' selected' : ''}>Manual (mm)</option>
        </select>
        <div class="mem-tuberia-manual"${t.tuberiaPulgadas === 'manual' ? '' : ' style="display:none;"'}>
          <input type="text" inputmode="decimal" class="mem-tuberia-manual-di" value="${t.tuberiaManual?.diMm ?? 10.3}" title="Diámetro interior [mm]">
          <input type="text" inputmode="decimal" class="mem-tuberia-manual-espesor" value="${t.tuberiaManual?.espesorMm ?? 1.2}" title="Espesor de pared [mm]">
          <input type="text" inputmode="decimal" class="mem-tuberia-manual-limite" value="${t.tuberiaManual?.limiteElasticoMPa ?? 170}" title="Límite elástico [MPa]">
          <input type="text" inputmode="decimal" class="mem-tuberia-manual-rugosidad" value="${t.tuberiaManual?.rugosidadMm ?? 0.002}" title="Rugosidad [mm]">
        </div>
      </td>
      <td data-label="Material"><input type="text" class="mem-material" value="${escapeAttr(t.material)}" aria-label="Material"></td>
      <td data-label="Temp. [°C]"><input type="text" inputmode="decimal" class="mem-temp" value="${t.temperaturaC}" aria-label="Temperatura [°C]"></td>
      <td class="mem-densidad col-calculada" data-label="Densidad [kg/m³]">${formatearNumero(t.densidadKgM3)}</td>
      <td class="mem-velocidad col-calculada" data-label="Velocidad [m/s]">${formatearNumero(t.velocidadFlujoMS)}</td>
      <td class="mem-perdida-parcial col-calculada" data-label="Pérdida parcial [${unidadPerdidaParcial}]">${formatearPresionBonita(aPa(t.perdidaParcialMbar, 'mbar'), unidadPerdidaParcial)}</td>
      <td class="mem-perdida-acumulada col-calculada" data-label="Pérdida acumulada [${unidadPerdidaAcumulada}]">${formatearPresionBonita(aPa(t.perdidaAcumuladaMbar, 'mbar'), unidadPerdidaAcumulada)}</td>
      <td class="mem-celda-acciones"><button type="button" class="mem-eliminar no-imprimir" aria-label="Eliminar ${escapeAttr(t.nombre)}">✕</button></td>
    </tr>
  `).join('');

  tramos.forEach((t) => {
    const selectPadre = document.querySelector(`#memoria-tabla-cuerpo tr[data-id="${t.id}"] .mem-padre`);
    if (selectPadre) selectPadre.value = t.continuaDesdeId ?? '';
  });
}

// --- Diagrama de la red (rediseño visual 2026-09-25, a pedido del usuario).
// Antes: un punto por tramo, con la fila asignada por orden de aparición
// dentro de cada nivel — un hijo podía quedar en otra fila que su padre y
// las líneas diagonales se cruzaban —, el nombre montado sobre el nodo
// siguiente y ningún dato del tramo. Ahora es un unifilar: cada tramo es un
// trozo de cañería horizontal, el primer hijo sigue en línea recta con su
// padre y los demás bajan en codo (sin cruces, por construcción); nombre
// arriba, tubería/longitud/potencia y resultados abajo; el grosor de la
// línea crece con el diámetro. Un resultado fuera de un límite de diseño va
// en rojo con ▲ (las mismas marcas que la tabla del informe) y el tramo que
// reinicia la pérdida acumulada lleva el símbolo de un regulador.
// dibujarDiagramaRed() es idéntica en Hidrogeno y GasNatural-GLP (copiada,
// no importada): cada renderArbol*() solo traduce su resultado a `elementos`
// ({ id, padreId, nombre, reinicia, pulgadas, datos, resultados, titulo }).
const DIAGRAMA = {
  margenX: 16, margenSup: 30, altoFila: 72, anchoMinTramo: 150, anchoMaxNombre: 240, radioCodo: 8,
  fuenteNombre: '700 12.5px Lato, system-ui, sans-serif',
  fuenteDato: '400 11px Lato, system-ui, sans-serif',
  fuenteDatoNegrita: '700 11px Lato, system-ui, sans-serif',
};
let lienzoMedida = null;

// Ancho real del texto (canvas, no getComputedTextLength: el <svg> suele
// dibujarse con la pestaña oculta, y oculto mide 0).
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

// Grosor de la cañería según el diámetro nominal: 1/4" ≈ 3,3 px, 1" = 5 px,
// 4" ≈ 8,3 px. Solo una pista visual — el diámetro va escrito abajo.
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
    return `<g class="arbol-tramo${n.excede ? ' excede' : ''}" data-id="${escapeAttr(n.e.id)}">
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
  const { velocidadExcede, perdidaExcede } = evaluarCriteriosRed(resultado);
  const perdida = (mbar, unidad) => `${formatearPresionBonita(aPa(mbar, 'mbar'), unidad)} ${unidad}`;
  dibujarDiagramaRed(document.getElementById('memoria-arbol'), resultado.map((t) => {
    const manual = t.tuberiaPulgadas === 'manual';
    const tuberia = manual ? `DI ${formatearNumero(t.tuberiaManual.diMm)} mm` : formatearPulgadas(t.tuberiaPulgadas);
    return {
      id: t.id, padreId: t.continuaDesdeId, nombre: t.nombre, reinicia: t.reseteaAcumulada,
      pulgadas: manual ? t.tuberiaManual.diMm / 25.4 : Number(t.tuberiaPulgadas),
      datos: `${tuberia} · ${formatearNumero(t.longitudM)} m · ${formatearNumero(t.potenciaKw)} kW`,
      resultados: [
        { texto: `ΔP acum. ${perdida(t.perdidaAcumuladaMbar, unidadPerdidaAcumulada)}`, excede: perdidaExcede.has(t.id) },
        { texto: `${formatearNumero(t.velocidadFlujoMS)} m/s`, excede: velocidadExcede.has(t.id) },
      ],
      titulo: [
        `${t.nombre}${t.reseteaAcumulada ? ' (reinicia la pérdida acumulada)' : ''}`,
        `${tuberia}${t.material ? ` ${t.material}` : ''}`,
        `ΔP del tramo: ${perdida(t.perdidaParcialMbar, unidadPerdidaParcial)}`,
        `ΔP acumulada: ${perdida(t.perdidaAcumuladaMbar, unidadPerdidaAcumulada)}`,
        `Velocidad: ${formatearNumero(t.velocidadFlujoMS)} m/s`,
      ].join('\n'),
    };
  }));
}

function porNombreTramo(id) {
  return id ? (tramos.find((t) => t.id === id)?.nombre ?? '') : '— raíz —';
}

// Cajetín de un criterio de diseño opcional del encabezado del informe
// (Velocidad máxima flujo de gas / Velocidad de erosión / Máxima pérdida de
// carga acumulada, 2026-09-02, a pedido del usuario). Desde el 2026-09-25
// el valor va con notación SI ("20 m/s", sin corchetes: los corchetes
// quedan para rotular columnas) y sin valor dice "No definida" en vez de
// "- [m/s]", que en papel se leía como un dato faltante por error.
function criterioDefinido(valor) {
  return valor !== null && valor !== undefined && !Number.isNaN(valor);
}

function formatearCriterio(valor, formatear) {
  return criterioDefinido(valor) ? formatear(valor) : 'No definida';
}

// Cabecera de columna del informe: etiqueta + unidad en su propia línea,
// fuera del text-transform: uppercase de la cabecera — en mayúsculas
// "MPa"/"mbar"/"m/s"/"kW" se leían "MPA"/"MBAR"/"M/S"/"KW", y en unidades
// SI la caja es parte del símbolo (m = mili, M = mega).
function thConUnidad(etiqueta, unidad) {
  return `${escapeHtml(etiqueta)}<span class="informe-unidad">${escapeHtml(unidad)}</span>`;
}

// Verificación de un criterio de diseño contra la red resuelta
// (2026-09-25): antes el informe declaraba los límites y mostraba los
// máximos calculados sin compararlos nunca — y en unidades distintas
// (criterio en Pa, resultado en mbar) —, así que quien lo leía tenía que
// hacer la cuenta a mano para saber si la red cumple. `valorDe` y `limite`
// van en la misma unidad canónica; `formatear` decide cómo se muestran.
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

// El criterio de pérdida se ingresa en Pa pero se muestra en la unidad de
// la columna "ΔP acumulada" — límite y resultado siempre comparables a
// simple vista (antes: "5.000 [Pa]" arriba vs. "273,86 [mbar]" abajo).
function formatosCriterio() {
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  return {
    velocidad: (v) => `${formatearNumero(v)} m/s`,
    perdidaAcum: (pa) => `${formatearPresionBonita(pa, unidadPerdidaAcumulada)} ${unidadPerdidaAcumulada}`,
  };
}

// Criterios de diseño contra la red resuelta: la sección 5 del informe y
// las marcas ▲ de la tabla de tramos impresa y del diagrama de la red.
function evaluarCriteriosRed(resultado) {
  const { velocidad, perdidaAcum } = formatosCriterio();
  const criterios = [
    evaluarCriterio({
      nombre: 'Velocidad de flujo', limite: proyecto.velocidadMaxFlujoDisenoMS,
      tramos: resultado, valorDe: (t) => t.velocidadFlujoMS, formatear: velocidad,
    }),
  ];
  if (criterioDefinido(proyecto.velocidadErosionDisenoMS)) {
    criterios.push(evaluarCriterio({
      nombre: 'Velocidad de erosión', limite: proyecto.velocidadErosionDisenoMS,
      tramos: resultado, valorDe: (t) => t.velocidadFlujoMS, formatear: velocidad,
    }));
  }
  const criterioPerdida = evaluarCriterio({
    nombre: 'Pérdida de carga acumulada', limite: proyecto.perdidaMaxAcumuladaDisenoPa,
    tramos: resultado, valorDe: (t) => aPa(t.perdidaAcumuladaMbar, 'mbar'), formatear: perdidaAcum,
  });
  criterios.push(criterioPerdida);
  const velocidadExcede = new Set(criterios.filter((c) => c !== criterioPerdida).flatMap((c) => c.exceden.map((t) => t.id)));
  const perdidaExcede = new Set(criterioPerdida.exceden.map((t) => t.id));
  return { criterios, velocidadExcede, perdidaExcede };
}

function actualizarTotalArtefactos() {
  const totalKw = proyecto.artefactos.reduce((suma, a) => suma + (Number(a.potenciaKw) || 0), 0);
  document.getElementById('memoria-artefactos-total-txt').textContent =
    `Total: ${formatearNumero(totalKw)} kW térmicos — Potencia instalada: ${formatearNumero(totalKw)} kW térmicos (no se considera operación simultánea)`;
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

  const unidadPresion = document.getElementById('memoria-presion-unidad').value;
  const unidadPerdidaParcial = document.getElementById('memoria-perdida-parcial-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  const { velocidad, perdidaAcum } = formatosCriterio();

  document.getElementById('informe-vel-max-flujo').textContent = formatearCriterio(proyecto.velocidadMaxFlujoDisenoMS, velocidad);
  document.getElementById('informe-vel-erosion').textContent = formatearCriterio(proyecto.velocidadErosionDisenoMS, velocidad);
  document.getElementById('informe-perdida-max').textContent = formatearCriterio(proyecto.perdidaMaxAcumuladaDisenoPa, perdidaAcum);

  // Una sola fila de total: antes "Total" y "Potencia instalada" repetían
  // el mismo número (sin simultaneidad son lo mismo, decisión 2026-09-03).
  const totalKw = proyecto.artefactos.reduce((suma, a) => suma + (Number(a.potenciaKw) || 0), 0);
  document.getElementById('informe-artefactos-cuerpo').innerHTML = proyecto.artefactos.length
    ? proyecto.artefactos.map((a) => `<tr><td>${escapeHtml(a.nombre)}</td><td>${formatearNumero(a.potenciaKw)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="informe-vacio">Sin artefactos registrados</td></tr>';
  document.getElementById('informe-potencia-instalada').textContent = formatearNumero(totalKw);

  const { criterios, velocidadExcede, perdidaExcede } = evaluarCriteriosRed(resultado);
  const marcar = (texto, excede) => (excede ? `<span class="informe-excede">▲ ${texto}</span>` : texto);

  document.getElementById('memoria-impresion-th-presion').innerHTML = thConUnidad('Presión man.', unidadPresion);
  document.getElementById('memoria-impresion-th-parcial').innerHTML = thConUnidad('ΔP tramo', unidadPerdidaParcial);
  document.getElementById('memoria-impresion-th-perdida').innerHTML = thConUnidad('ΔP acumulada', unidadPerdidaAcumulada);
  document.getElementById('memoria-tabla-impresion-cuerpo').innerHTML = resultado.map((t) => `
    <tr>
      <td>${escapeHtml(t.nombre)}${t.reseteaAcumulada ? '<sup class="informe-marca">R</sup>' : ''}</td>
      <td>${t.continuaDesdeId ? escapeHtml(porNombreTramo(t.continuaDesdeId)) : '<span class="informe-vacio">Inicio de red</span>'}</td>
      <td>${formatearPresionBonita(aPa(t.presionMPa, 'MPa'), unidadPresion)}</td>
      <td>${formatearNumero(t.longitudM)}</td>
      <td>${formatearNumero(t.potenciaKw)}</td>
      <td>${etiquetaTuberia(t)}</td>
      <td>${escapeHtml(t.material)}</td>
      <td>${formatearPresionBonita(aPa(t.perdidaParcialMbar, 'mbar'), unidadPerdidaParcial)}</td>
      <td>${marcar(formatearPresionBonita(aPa(t.perdidaAcumuladaMbar, 'mbar'), unidadPerdidaAcumulada), perdidaExcede.has(t.id))}</td>
      <td>${marcar(formatearNumero(t.velocidadFlujoMS), velocidadExcede.has(t.id))}</td>
    </tr>
  `).join('');

  // Leyenda solo de las marcas que aparecen en la tabla — el texto largo
  // "(reinicia acumulada)" dentro de la celda ensanchaba la tabla más allá
  // del margen de la hoja.
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

// Prueba de hermeticidad de toda la red (2026-11-19, a pedido del usuario):
// ASME B31.12 IP-10 + referencia D.S. 66 f.11. Fuentes en el ⓘ del
// index.html y en js/prueba-hermeticidad.js. Las presiones usan la unidad
// de la columna Presión de la tabla de tramos.
function textoReferenciaDS66(r) {
  const minutos = `${formatearNumero(r.duracionMin)} min`;
  if (r.ajuste === 'minimo') return `${minutos} (mínimo; la fórmula da ${formatearNumero(r.formulaMin)} min)`;
  if (r.ajuste === 'maximo') return `${minutos} (máximo; la fórmula da ${formatearNumero(r.formulaMin)} min)`;
  return minutos;
}

// Volumen del estanque para la prueba: el que el usuario escribió en la
// Memoria (se guarda con el proyecto) o, si no escribió nada, el de la
// pestaña Almacenamiento.
function volumenEstanquePrueba() {
  const propio = proyecto?.volumenEstanqueM3;
  if (propio !== null && propio !== undefined) return propio;
  return numeroFlexible(document.getElementById('alm-volumen').value);
}

function renderPruebaHermeticidad(resultado) {
  const p = pruebaHermeticidadRed(resultado, { volumenEstanqueM3: volumenEstanquePrueba() });
  const campoEstanque = document.getElementById('mem-volumen-estanque');
  if (document.activeElement !== campoEstanque) {
    // numeros.js formatea la caja (coma decimal); se le pasa el número sin formato.
    campoEstanque.value = String(Math.round(p.volumenEstanqueM3 * 1e4) / 1e4);
  }
  const unidad = document.getElementById('memoria-presion-unidad').value;
  const presion = (bar) => `${formatearPresionBonita(aPa(bar, 'bar'), unidad)} ${unidad}`;
  const formatearVolumen = (v) => new Intl.NumberFormat('es-CL', { maximumSignificantDigits: 3 }).format(v);
  const volumen = formatearVolumen(p.volumenM3);
  const litros = formatearNumero(p.volumenM3 * 1000);
  document.getElementById('memoria-prueba-hermeticidad').innerHTML = grupo(null, [
    tile(`${p.duracionMinimaMin} min`, 'Duración mínima, revisando todas las uniones (IP-10.6.2)', 'kpi'),
    tile(presion(p.hidrostaticaBarG), 'Presión prueba hidrostática, mínimo (1,5 × diseño, IP-10.7.2)'),
    tile(presion(p.neumaticaBarG), 'Presión prueba neumática (1,1 × diseño, IP-10.8.4)'),
    tile(presion(p.alivioMaxBarG), 'Alivio en prueba neumática, calibración máx. (IP-10.8.2)', 'secundario'),
    tile('Agua, aire o N₂', 'Fluido de prueba — nunca H₂ (IP-10.8.3)', 'secundario'),
    tile(`${volumen} m³`, `Volumen probado (${litros} L): tubería ${formatearVolumen(p.volumenTuberiaM3)} m³ + estanque ${formatearVolumen(p.volumenEstanqueM3)} m³`),
    tile(textoReferenciaDS66(p.ds66), 'Referencia D.S. 66 f.11 (volumen × 214) — no exigida para H₂', 'secundario'),
    `<div class="resultados-nota">Presión de diseño tomada: ${presion(p.presionDisenoBarG)} (la mayor de los tramos).</div>`,
  ]);
  document.getElementById('informe-prueba-hermeticidad').textContent =
    `Prueba de hermeticidad (ASME B31.12 IP-10): al menos ${p.duracionMinimaMin} min revisando todas las uniones; `
    + `hidrostática ≥ ${presion(p.hidrostaticaBarG)} o neumática ${presion(p.neumaticaBarG)} con aire o N₂, nunca H₂ `
    + `(presión de diseño ${presion(p.presionDisenoBarG)}). Volumen probado ${volumen} m³ (tubería ${formatearVolumen(p.volumenTuberiaM3)} + estanque ${formatearVolumen(p.volumenEstanqueM3)}); referencia D.S. 66 f.11: ${textoReferenciaDS66(p.ds66)}.`;
}

// Cajetín del estanque en la Memoria: vacío = vuelve a tomar el de
// Almacenamiento. Si cambia Almacenamiento y el usuario no escribió uno
// propio, la prueba se actualiza.
function initEstanquePrueba() {
  const campo = document.getElementById('mem-volumen-estanque');
  const actualizar = () => { if (ultimoResultadoMemoria) renderPruebaHermeticidad(ultimoResultadoMemoria); };
  campo.addEventListener('input', () => {
    const bruto = campo.value.trim();
    proyecto.volumenEstanqueM3 = bruto === '' ? null : numeroFlexible(bruto);
    guardar('memoria-proyecto', proyecto);
    actualizar();
  });
  campo.addEventListener('blur', actualizar);
  document.getElementById('alm-volumen').addEventListener('input', actualizar);
}

// ⓘ de la prueba: en el teléfono no hay hover, así que al tocarlo muestra
// u oculta su texto (el mismo del title) debajo del título.
function initInfoNorma() {
  document.querySelectorAll('.info-norma').forEach((icono) => {
    const nota = document.createElement('div');
    nota.className = 'resultados-nota info-norma-texto';
    nota.hidden = true;
    nota.style.whiteSpace = 'pre-line';
    nota.textContent = icono.title;
    // El ⓘ del veredicto se redibuja en cada tecla: lo maneja
    // initInfoVeredicto(), no este.
    const titulo = icono.closest('h3');
    if (!titulo) return;
    titulo.after(nota);
    const alternar = () => { nota.hidden = !nota.hidden; };
    icono.addEventListener('click', alternar);
    icono.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } });
  });
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
  ultimoResultadoMemoria = resultado;
  renderTablaMemoria(resultado);
  renderArbol(resultado);
  renderArtefactos();
  renderInformeImpresion(resultado);
  renderPruebaHermeticidad(resultado);
  guardar('memoria', tramos);
  guardar('memoria-proyecto', proyecto);
}

// Fix de foco al escribir (bug reportado por el usuario 2026-09-08, mismo
// patrón que GasNatural-GLP corrigió el 2026-09-03 — ver su CLAUDE.md; acá
// había quedado pendiente de portar): recalcularMemoria() reescribe el
// innerHTML completo de #memoria-tabla-cuerpo en cada tecla, destruyendo el
// foco del cajetín y volviendo a serializar el valor ya convertido a
// número, descartando cualquier "," recién tipeada antes del siguiente
// carácter — en la práctica, escribir un decimal solo dejaba entrar el
// primer dígito. recalcularMemoriaLigero() solo actualiza las celdas de
// resultado (de solo lectura, identificadas con las clases nuevas
// .mem-densidad/.mem-velocidad/.mem-perdida-parcial/.mem-perdida-acumulada
// en renderTablaMemoria()) vía textContent y sincroniza las etiquetas de
// "Continúa desde" de las demás filas si el nombre cambió — nunca toca
// ningún <input>/<select>, así que el foco y lo que el usuario ya escribió
// se conservan. Los <select> de la fila (tubería, padre) siguen pasando
// por recalcularMemoria() completo, ver el listener en initMemoria().
function recalcularMemoriaLigero() {
  let resultado;
  try {
    resultado = calcularRed(tramos);
  } catch (error) {
    document.getElementById('memoria-tabla-cuerpo').innerHTML =
      `<tr><td colspan="14" class="resultado-tile alerta">${error.message}</td></tr>`;
    return;
  }
  ultimoResultadoMemoria = resultado;
  const unidadPerdidaParcial = document.getElementById('memoria-perdida-parcial-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  resultado.forEach((t) => {
    const fila = document.querySelector(`#memoria-tabla-cuerpo tr[data-id="${t.id}"]`);
    if (!fila) return;
    fila.querySelector('.mem-densidad').textContent = formatearNumero(t.densidadKgM3);
    fila.querySelector('.mem-velocidad').textContent = formatearNumero(t.velocidadFlujoMS);
    fila.querySelector('.mem-perdida-parcial').textContent = formatearPresionBonita(aPa(t.perdidaParcialMbar, 'mbar'), unidadPerdidaParcial);
    fila.querySelector('.mem-perdida-acumulada').textContent = formatearPresionBonita(aPa(t.perdidaAcumuladaMbar, 'mbar'), unidadPerdidaAcumulada);
  });
  tramos.forEach((t) => {
    document.querySelectorAll(`#memoria-tabla-cuerpo .mem-padre option[value="${t.id}"]`).forEach((opcion) => {
      opcion.textContent = t.nombre;
    });
  });
  renderArbol(resultado);
  renderInformeImpresion(resultado);
  renderPruebaHermeticidad(resultado);
  guardar('memoria', tramos);
  guardar('memoria-proyecto', proyecto);
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

// El informe entra siempre en una sola hoja A4 (2026-09-08, a pedido del
// usuario): si no cabe, se reduce todo con `zoom` — no `transform: scale()`,
// que no achica el alto de layout y la paginación seguiría viendo el
// original. Cómo se mide (2026-09-28, igual en los tres módulos con
// Memoria): Chrome dispara `beforeprint` con los estilos de PANTALLA
// todavía activos (medido con page.pdf(): matchMedia('print') = false y el
// informe, oculto, mide 0 px), así que medirlo "en su lugar" daba siempre 0
// y nunca se achicaba. Acá se muestra un instante fuera de la pantalla con
// el ancho útil de la hoja (A4 menos los márgenes de 14 mm del @page) y se
// mide ahí; sus estilos viven fuera de @media print para eso (ver
// css/styles.css).
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
  // ×0.98: margen contra el redondeo de `zoom` (medido ~3 px, 2026-09-08).
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

function initMemoria() {
  window.addEventListener('beforeprint', ajustarEscalaImpresion);
  window.addEventListener('afterprint', () => {
    const el = document.getElementById('memoria-informe-impresion');
    if (el) el.style.zoom = '';
  });
  tramos = cargar('memoria', null) ?? [tramoPorDefecto()];
  tramos = repararIdsDuplicados(tramos, 't');
  contadorId = maxSufijoId(tramos);
  proyecto = cargar('memoria-proyecto', null) ?? proyectoPorDefecto();
  proyecto.artefactos = repararIdsDuplicados(proyecto.artefactos, 'a');
  contadorArtefactoId = maxSufijoId(proyecto.artefactos);
  aplicarProyectoAForm();

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

  // Tras agregar un tramo, el foco pasa a su nombre (seleccionado) para
  // poder escribirlo de inmediato, sin buscar la fila nueva al final.
  document.getElementById('memoria-agregar-tramo').addEventListener('click', () => {
    tramos.push(tramoPorDefecto());
    recalcularMemoria();
    const nombre = document.querySelector('#memoria-tabla-cuerpo tr:last-child .mem-nombre');
    if (nombre) { nombre.focus(); nombre.select(); }
  });

  // Un <select> cambia la estructura de la fila (opciones de padre,
  // visibilidad de sub-campos manuales) y necesita el re-render completo;
  // un <input> de texto/checkbox solo actualiza los resultados calculados
  // sin tocar ningún elemento de ingreso — ver recalcularMemoriaLigero().
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

  // Cajetines de datos del proyecto (fecha, instalador, artefactos, etc.) —
  // un único listener de 'input' delegado en el <form>; nunca se regeneran
  // vía innerHTML (solo se leen y se guardan), así que no tienen el
  // problema de foco de la tabla de tramos — solo hace falta refrescar el
  // informe impreso, no recalcular toda la red. Los artefactos NO viven
  // dentro de este <form> (ver más abajo) para que su propio re-render no
  // dispare este listener dos veces. El diagrama se redibuja porque sus
  // marcas ▲ dependen de los criterios de diseño.
  document.getElementById('form-memoria-proyecto').addEventListener('input', () => {
    proyecto = { ...proyecto, ...leerProyecto() };
    renderArbol(ultimoResultadoMemoria);
    renderInformeImpresion(ultimoResultadoMemoria);
    guardar('memoria-proyecto', proyecto);
  });

  // Artefactos: escribir en un cajetín solo actualiza el total y el
  // informe (sin regenerar la lista, mismo criterio que
  // recalcularMemoriaLigero()); agregar/quitar sí necesita regenerar la
  // lista completa (ver el listener 'click' debajo).
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

  // Línea de estado bajo la barra de acciones (2026-09-24): confirma
  // importar/exportar — antes no había ninguna respuesta visible, y un
  // .json inválido fallaba en silencio (promesa rechazada sin capturar).
  const estado = document.getElementById('memoria-estado');
  function mostrarEstado(texto, esError = false) {
    estado.textContent = texto;
    estado.classList.toggle('error', esError);
  }

  document.getElementById('memoria-exportar').addEventListener('click', () => {
    exportarJSON('proyecto-hidrogeno.json', { tramos, proyecto });
    mostrarEstado('Proyecto exportado como proyecto-hidrogeno.json.');
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
    // Compatibilidad hacia atrás (2026-09-02): un export previo a los
    // cajetines de proyecto era un array plano de tramos, sin envolver.
    if (Array.isArray(datos)) {
      tramos = datos;
    } else {
      tramos = datos.tramos ?? [];
      proyecto = { ...proyectoPorDefecto(), ...datos.proyecto };
      proyecto.artefactos = repararIdsDuplicados(proyecto.artefactos, 'a');
      contadorArtefactoId = maxSufijoId(proyecto.artefactos);
      aplicarProyectoAForm();
    }
    tramos = repararIdsDuplicados(tramos, 't');
    contadorId = maxSufijoId(tramos);
    recalcularMemoria();
    mostrarEstado(`Proyecto "${archivo.name}" importado — ${tramos.length} ${tramos.length === 1 ? 'tramo' : 'tramos'}.`);
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
initInstalacion();
initMemoria();
initEditorRed({
  svg: document.getElementById('memoria-arbol'),
  tbody: document.getElementById('memoria-tabla-cuerpo'),
  botonAgregar: document.getElementById('memoria-agregar-tramo'),
});
initInfoNorma();
initInfoVeredicto();
initEstanquePrueba();
initSelectorGas({ actualId: 'hidrogeno', profundidad: 1 });
initResumenMovil();
