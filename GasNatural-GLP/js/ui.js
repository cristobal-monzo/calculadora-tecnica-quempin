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

function tile(valor, etiqueta, variante) {
  const clase = variante ? ` ${variante}` : '';
  return `<div class="resultado-tile${clase}"><div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div></div>`;
}

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

const listeners = [];
function alCambiarCombustible(fn) { listeners.push(fn); }
function notificarCambioCombustible() { listeners.forEach((fn) => fn(combustible)); }

function initSelectorCombustible() {
  const select = document.getElementById('selector-combustible');
  select.value = combustible;
  select.addEventListener('change', () => {
    combustible = select.value;
    guardar('combustible', combustible);
    notificarCambioCombustible();
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
    <div class="valor"><span class="valor-numero">${formatearPresion(valorPa, unidad)}</span><select class="select-unidad-inline" data-tile-presion-unidad="${clave}">${opcionesUnidadPresion(unidad)}</select></div>
    <div class="etiqueta">${etiqueta}</div>
  </div>`;
}

function renderResultadosRedGas(r) {
  const variante = r.tuberiaAdecuada ? 'ok' : 'alerta';
  const tiles = [
    tile(`${r.caudalObjetivoM3H.toFixed(3)} m³/h`, 'Caudal objetivo'),
    tile(`${r.velocidadMS.toFixed(2)} m/s`, 'Velocidad de flujo'),
    tile(`${r.volumenTuberiaM3.toFixed(4)} m³`, 'Volumen de la tubería'),
    tilePresion(r.perdidaPresionRequeridaPa, 'Pérdida de presión requerida', 'perdida-requerida', variante),
    tilePresion(r.perdidaAdmisiblePa, 'Pérdida de presión admisible', 'perdida-admisible'),
    tile(r.tuberiaAdecuada ? 'Sí' : 'No — usar diámetro mayor', 'Tubería adecuada', variante),
  ];
  if (r.presionFinalPa !== null) {
    tiles.push(tilePresion(r.presionFinalPa, 'Presión final', 'presion-final'));
  }
  document.getElementById('resultados-red-gas').innerHTML = tiles.join('');
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
    const umbral = formatearPresion(aPa(10, 'kPa'), unidad);
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
    contenedor.querySelector('.valor-numero').textContent = formatearPresion(Number(contenedor.dataset.pa), evento.target.value);
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
    <p class="subtitulo">Cilindros — por razón de vaporización</p>
    <form id="form-cilindros-vap" class="fila-campos" autocomplete="off">
      <div class="campo"><label for="cv-potencia">Potencia total [kW]</label><input id="cv-potencia" type="text" inputmode="decimal" value="90" required></div>
      <div class="campo"><label for="cv-razon">Razón de vaporización [kW/cilindro]</label><input id="cv-razon" type="text" inputmode="decimal" value="30" required></div>
    </form>
    <div class="resultados" id="resultados-cilindros-vap"></div>

    <p class="subtitulo">Cilindros — por consumo diario</p>
    <form id="form-cilindros-diario" class="fila-campos" autocomplete="off">
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
    <div class="resultados" id="resultados-cilindros-diario"></div>

    <p class="subtitulo">Estanque GLP</p>
    <form id="form-estanque" autocomplete="off">
      <div class="fila-campos">
        <div class="campo"><label for="es-diametro">Diámetro [m]</label><input id="es-diametro" type="text" inputmode="decimal" value="0.76" required></div>
        <div class="campo"><label for="es-altura">Altura [m]</label><input id="es-altura" type="text" inputmode="decimal" value="1.36" required></div>
        <div class="campo"><label for="es-capacidad">Capacidad nominal [L]</label><input id="es-capacidad" type="text" inputmode="decimal" value="500" required></div>
      </div>
      ${marcadoComposicionGLP({ prefijo: 'es' })}
    </form>
    <div class="resultados" id="resultados-estanque"></div>
  `;
}

function initAlmacenamiento() {
  const contenedor = document.getElementById('almacenamiento-contenido');

  function render() {
    if (combustible !== 'GLP') {
      contenedor.innerHTML = `<div class="aviso-gas">El almacenamiento en cilindros/estanque es específico de GLP — no aplica a Gas Natural (suministro por red continua). Cambia el combustible a GLP para usar esta pestaña.</div>`;
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
      document.getElementById('resultados-cilindros-vap').innerHTML = tile(n, 'N° de cilindros necesarios');
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
      document.getElementById('resultados-cilindros-diario').innerHTML = [
        tile(`${resultado.consumoDiarioKwh.toFixed(2)} kWh`, 'Consumo diario estimado'),
        tile(resultado.nCilindros, 'N° de cilindros necesarios'),
      ].join('');
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
        tile(`${resultado.capacidadRealLitros.toFixed(0)} L`, 'Capacidad real (80%)'),
        tile(`${resultado.superficieM2.toFixed(3)} m²`, 'Superficie'),
        tile(`${resultado.qKgH.toFixed(2)} kg/h`, 'Capacidad de vaporización'),
        tile(`${resultado.pciKjKg.toFixed(0)} kJ/kg`, 'PCI del GLP (según composición)'),
        tile(`${resultado.qKw.toFixed(2)} kW`, 'Capacidad de vaporización'),
        tile(`${resultado.qMcalH.toFixed(2)} Mcal/h`, 'Capacidad de vaporización'),
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

function marcadoComposicionGLP(valores) {
  return `
    <p class="subtitulo">Composición GLP</p>
    <div class="fila-campos">
      <div class="campo"><label for="${valores.prefijo}-pct-butano">% Butano (molar)</label><input id="${valores.prefijo}-pct-butano" type="text" inputmode="decimal" value="0.3"></div>
      <div class="campo"><label for="${valores.prefijo}-pct-propano">% Propano (molar)</label><input id="${valores.prefijo}-pct-propano" type="text" inputmode="decimal" value="0.7"></div>
    </div>
  `;
}

function marcadoComposicionGN(valores) {
  return `
    <p class="subtitulo">Composición GN</p>
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
    tile(r.pm.toFixed(3), 'Masa molar [kg/kmol]'),
    tile(`${r.densidadNormal.toFixed(4)} kg/Nm³`, 'Densidad normal'),
    tile(`${r.aireEsteq.toFixed(3)} Nm³/kg`, 'Aire estequiométrico'),
    tile(`${r.caudalCombustibleNm3H.toFixed(3)} Nm³/h`, 'Caudal de combustible'),
    tile(`${r.caudalAireNm3H.toFixed(2)} Nm³/h`, 'Caudal de aire'),
    tile(`${r.caudalTotalNormalNm3H.toFixed(2)} Nm³/h`, 'Caudal total (condición normal)'),
    tile(`${r.caudalTotalReferenciaM3H.toFixed(2)} m³/h`, 'Caudal total (condición de referencia)'),
    tile(`${(r.composicion.co2 * 100).toFixed(2)} %`, 'CO₂ en gases de combustión'),
    tile(`${(r.composicion.h2o * 100).toFixed(2)} %`, 'H₂O en gases de combustión'),
    tile(`${(r.composicion.o2 * 100).toFixed(2)} %`, 'O₂ en gases de combustión'),
    tile(`${(r.composicion.n2 * 100).toFixed(2)} %`, 'N₂ en gases de combustión'),
    tile(`${r.emisionNoxAdmisiblePpm.toFixed(1)} ppm`, 'Emisión NOx admisible'),
    tile(`${r.emisionCoAdmisiblePpm} ppm`, 'Emisión CO admisible (valor normativo fijo)'),
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
    tile(`${r.tasaQuemadoWMm2.toFixed(2)} W/mm²`, 'Tasa de quemado'),
    tile(`${r.areaInyectorIn2.toFixed(6)} in²`, 'Área del inyector'),
    tile(`${r.caudalInyectorM3H.toFixed(4)} m³/h`, 'Caudal por el inyector'),
    tile(`${r.potenciaInyectorKw.toFixed(3)} kW`, 'Potencia que entrega el inyector'),
    tile(r.racEstequiometricaMasica.toFixed(3), 'RAC estequiométrica másica [kg aire/kg gas]'),
    tile(r.densidadPremezcla1.toFixed(4), 'Densidad de la premezcla 1ª [kg/Nm³]'),
    tile(`${(r.caudalPremezcla1Nm3S * 1000).toFixed(4)} NL/s`, 'Caudal de premezcla 1ª'),
    tile(`${r.largoLlamaMm.toFixed(2)} mm`, 'Largo de llama estimado'),
    tile(r.relacionAreaGargantaPerforaciones.toFixed(4), 'Relación área garganta/perforaciones'),
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
    tramosMemoria.filter((t) => t.id !== actualId).map((t) => `<option value="${t.id}">${t.nombre}</option>`)
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

  document.getElementById('memoria-tabla-cuerpo').innerHTML = resultado.map((t) => `
    <tr data-id="${t.id}">
      <td><input type="text" class="mem-nombre" value="${t.nombre}"></td>
      <td><select class="mem-padre">${opcionesPadre(t.id)}</select></td>
      <td style="text-align:center;"><input type="checkbox" class="mem-reset"${t.reseteaAcumulada ? ' checked' : ''} title="Reinicia la pérdida de carga acumulada desde este tramo (ej. después de un regulador de presión)"></td>
      <td>
        <select class="mem-regimen">
          <option value="<10 kPa"${t.regimenPresion === '<10 kPa' ? ' selected' : ''}>Baja (&lt;10 kPa)</option>
          <option value=">10 kPa"${t.regimenPresion === '>10 kPa' ? ' selected' : ''}>Media/alta (&gt;10 kPa)</option>
        </select>
      </td>
      <td>
        <select class="mem-material"${t.pulgadas === 'manual' ? ' style="display:none;"' : ''}>
          <option value="Acero Sch40"${t.material === 'Acero Sch40' ? ' selected' : ''}>Acero Sch40</option>
          <option value="Cobre tipo L"${t.material === 'Cobre tipo L' ? ' selected' : ''}>Cobre tipo L</option>
        </select>
      </td>
      <td>
        <select class="mem-diametro">
          ${TABLA_TUBERIA_RED_GAS.map((f) => `<option value="${f.pulgadas}"${f.pulgadas === t.pulgadas ? ' selected' : ''}>${formatearPulgadas(f.pulgadas)}</option>`).join('')}
          <option value="manual"${t.pulgadas === 'manual' ? ' selected' : ''}>Manual (mm)</option>
        </select>
        <div class="mem-tuberia-manual"${t.pulgadas === 'manual' ? '' : ' style="display:none;"'}>
          <input type="text" inputmode="decimal" class="mem-diametro-manual-mm" value="${t.tuberiaManual?.diametroMm ?? 50}" title="Diámetro interior [mm]">
          <input type="text" inputmode="decimal" class="mem-diametro-manual-k" value="${t.tuberiaManual?.k ?? 1800}" title="Factor K (rugosidad, solo baja presión)">
        </div>
      </td>
      <td><input type="text" inputmode="decimal" class="mem-potencia" value="${t.potenciaKw}"></td>
      <td><input type="text" inputmode="decimal" class="mem-largo" value="${t.longitudM}"></td>
      <td><input type="text" inputmode="decimal" class="mem-presion" value="${Number(desdePa(t.presionInicialPa, unidadPresionInicial).toPrecision(6))}"></td>
      <td><input type="text" inputmode="decimal" class="mem-temp" value="${t.temperaturaC}"></td>
      <td>${t.caudalObjetivoM3H.toFixed(3)}</td>
      <td>${t.velocidadMS.toFixed(2)}</td>
      <td>${formatearPresion(t.perdidaPresionRequeridaPa, unidadPerdidaRequerida)}</td>
      <td>${formatearPresion(t.perdidaAcumuladaPa, unidadPerdidaAcumulada)}</td>
      <td>${t.presionFinalPa !== null ? formatearPresion(t.presionFinalPa, unidadPresionFinal) : '—'}</td>
      <td><button type="button" class="mem-eliminar no-imprimir">✕</button></td>
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
      <title>${n.t.nombre} — ${formatearPresion(n.t.perdidaAcumuladaPa, 'Pa')} Pa acumulados, ${n.t.velocidadMS.toFixed(2)} m/s${n.t.reseteaAcumulada ? ' (reinicia acumulada)' : ''}</title>
      <text x="${n.nivel * anchoNivel + 74}" y="${n.fila * altoFila + 24}" font-size="12" fill="var(--text-primary)">${n.t.nombre}</text>
    </g>`).join('');
  svg.setAttribute('height', String(Math.max(...porNivel.values(), 1) * altoFila + 20));
  svg.innerHTML = lineas + circulos;
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
  renderTablaMemoria(resultado);
  renderArbolMemoria(resultado);

  const unidadPresionInicial = document.getElementById('memoria-presion-inicial-unidad').value;
  const unidadPerdidaAcumulada = document.getElementById('memoria-perdida-acumulada-unidad').value;
  document.getElementById('memoria-impresion-th-presion').textContent = `Presión inicial [${unidadPresionInicial}]`;
  document.getElementById('memoria-impresion-th-perdida').textContent = `Pérdida acumulada [${unidadPerdidaAcumulada}]`;
  document.getElementById('memoria-tabla-impresion-cuerpo').innerHTML = resultado.map((t) => `
    <tr><td>${t.nombre}</td><td>${porNombreTramoMemoria(t.continuaDesdeId)}${t.reseteaAcumulada ? ' (reinicia acumulada)' : ''}</td><td>${formatearPresion(t.presionInicialPa, unidadPresionInicial)}</td><td>${t.longitudM}</td><td>${etiquetaDiametroMemoria(t)}</td><td>${formatearPresion(t.perdidaAcumuladaPa, unidadPerdidaAcumulada)}</td></tr>
  `).join('');
  guardar('memoria-red-gas', tramosMemoria);
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

function initMemoria() {
  tramosMemoria = cargar('memoria-red-gas', null) ?? [tramoMemoriaPorDefecto()];
  contadorIdMemoria = tramosMemoria.length;

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

  document.getElementById('memoria-agregar-tramo').addEventListener('click', () => {
    tramosMemoria.push(tramoMemoriaPorDefecto());
    recalcularMemoria();
  });

  document.getElementById('memoria-tabla-cuerpo').addEventListener('input', (evento) => {
    const fila = evento.target.closest('tr[data-id]');
    if (!fila) return;
    const actualizado = leerFilaMemoria(fila);
    tramosMemoria = tramosMemoria.map((t) => (t.id === actualizado.id ? actualizado : t));
    recalcularMemoria();
  });

  document.getElementById('memoria-tabla-cuerpo').addEventListener('click', (evento) => {
    if (!evento.target.classList.contains('mem-eliminar')) return;
    const id = evento.target.closest('tr[data-id]').dataset.id;
    tramosMemoria = tramosMemoria.filter((t) => t.id !== id).map((t) => (t.continuaDesdeId === id ? { ...t, continuaDesdeId: null } : t));
    recalcularMemoria();
  });

  document.getElementById('memoria-exportar').addEventListener('click', () => {
    exportarJSON('proyecto-gas-natural-glp.json', tramosMemoria);
  });

  document.getElementById('memoria-importar').addEventListener('change', async (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    tramosMemoria = await importarJSON(archivo);
    contadorIdMemoria = tramosMemoria.length;
    recalcularMemoria();
  });

  document.getElementById('memoria-imprimir').addEventListener('click', () => window.print());

  alCambiarCombustible(recalcularMemoria);
  recalcularMemoria();
}

/* ---------------------------------------------------------------------- */

initTabs();
initSelectorCombustible();
initRedGas();
initAlmacenamiento();
initCombustion();
initQuemador();
initMemoria();
initSelectorGas({ actualId: 'gas-natural-glp', profundidad: 1 });
