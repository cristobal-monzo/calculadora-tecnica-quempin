import { TABLA_TUBERIA_RED_GAS } from './pipe-network.js';
import { calcularRedGas } from './calc-red-gas.js';
import { cilindrosPorVaporizacion, cilindrosPorConsumoDiario, calcularEstanqueGLP } from './calc-almacenamiento-glp.js';
import { calcularCombustionGLP, calcularCombustionGN } from './calc-combustion.js';
import { calcularQuemador } from './calc-quemador.js';
import { guardar, cargar } from './storage.js';
import { initSelectorGas } from '../../assets/gas-switcher.js';

let combustible = cargar('combustible', 'GLP');

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

function poblarSelectDiametro(select) {
  select.innerHTML = TABLA_TUBERIA_RED_GAS.map((f) => `<option value="${f.pulgadas}">${f.pulgadas}"</option>`).join('');
}

function leerRedGasForm() {
  const num = (id) => Number(document.getElementById(id).value);
  return {
    gas: combustible,
    regimenPresion: document.getElementById('rg-regimen').value,
    material: document.getElementById('rg-material').value,
    pulgadas: Number(document.getElementById('rg-diametro').value),
    potenciaKw: num('rg-potencia'),
    longitudM: num('rg-longitud'),
    presionInicialPa: num('rg-presion-inicial'),
    temperaturaC: num('rg-temperatura'),
  };
}

function renderResultadosRedGas(r) {
  const variante = r.tuberiaAdecuada ? 'ok' : 'alerta';
  const tiles = [
    tile(`${r.caudalObjetivoM3H.toFixed(3)} m³/h`, 'Caudal objetivo'),
    tile(`${r.velocidadMS.toFixed(2)} m/s`, 'Velocidad de flujo'),
    tile(`${r.volumenTuberiaM3.toFixed(4)} m³`, 'Volumen de la tubería'),
    tile(`${r.perdidaPresionRequeridaPa.toFixed(2)} Pa`, 'Pérdida de presión requerida', variante),
    tile(`${r.perdidaAdmisiblePa} Pa`, 'Pérdida de presión admisible'),
    tile(r.tuberiaAdecuada ? 'Sí' : 'No — usar diámetro mayor', 'Tubería adecuada', variante),
  ];
  if (r.presionFinalPa !== null) {
    tiles.push(tile(`${r.presionFinalPa.toFixed(1)} Pa`, 'Presión final'));
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
      <div class="campo"><label for="cv-potencia">Potencia total [kW]</label><input id="cv-potencia" type="number" step="any" value="90" required></div>
      <div class="campo"><label for="cv-razon">Razón de vaporización [kW/cilindro]</label><input id="cv-razon" type="number" step="any" value="30" required></div>
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
    <form id="form-estanque" class="fila-campos" autocomplete="off">
      <div class="campo"><label for="es-diametro">Diámetro [m]</label><input id="es-diametro" type="number" step="any" value="0.76" required></div>
      <div class="campo"><label for="es-altura">Altura [m]</label><input id="es-altura" type="number" step="any" value="1.36" required></div>
      <div class="campo"><label for="es-capacidad">Capacidad nominal [L]</label><input id="es-capacidad" type="number" step="any" value="500" required></div>
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
      const campos = ['cv-potencia', 'cv-razon', 'cd-calefont', 'cd-cocinas', 'cd-estufas', 'cd-nivel', 'cd-temperatura', 'cd-peso-cilindro', 'es-diametro', 'es-altura', 'es-capacidad'];
      guardar('almacenamiento-glp', Object.fromEntries(campos.map((id) => [id, document.getElementById(id).value])));
    }

    function recalcularVap() {
      const potenciaTotalKw = Number(document.getElementById('cv-potencia').value);
      const razonVaporizacionKw = Number(document.getElementById('cv-razon').value);
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
        diametroM: Number(document.getElementById('es-diametro').value),
        alturaM: Number(document.getElementById('es-altura').value),
        capacidadLitros: Number(document.getElementById('es-capacidad').value),
      });
      document.getElementById('resultados-estanque').innerHTML = [
        tile(`${resultado.capacidadRealLitros.toFixed(0)} L`, 'Capacidad real (80%)'),
        tile(`${resultado.superficieM2.toFixed(3)} m²`, 'Superficie'),
        tile(`${resultado.qKgH.toFixed(2)} kg/h`, 'Capacidad de vaporización'),
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
      <div class="campo"><label for="${valores.prefijo}-pct-butano">% Butano (molar)</label><input id="${valores.prefijo}-pct-butano" type="number" step="any" value="0.3"></div>
      <div class="campo"><label for="${valores.prefijo}-pct-propano">% Propano (molar)</label><input id="${valores.prefijo}-pct-propano" type="number" step="any" value="0.7"></div>
    </div>
  `;
}

function marcadoComposicionGN(valores) {
  return `
    <p class="subtitulo">Composición GN</p>
    <div class="fila-campos">
      <div class="campo"><label for="${valores.prefijo}-pct-metano">% Metano (molar)</label><input id="${valores.prefijo}-pct-metano" type="number" step="any" value="0.97"></div>
      <div class="campo"><label for="${valores.prefijo}-pct-etano">% Etano (molar)</label><input id="${valores.prefijo}-pct-etano" type="number" step="any" value="0.011"></div>
      <div class="campo"><label for="${valores.prefijo}-pct-propano">% Propano (molar)</label><input id="${valores.prefijo}-pct-propano" type="number" step="any" value="0.001"></div>
      <div class="campo"><label for="${valores.prefijo}-pct-butano">% Butano (molar)</label><input id="${valores.prefijo}-pct-butano" type="number" step="any" value="0.001"></div>
      <div class="campo"><label for="${valores.prefijo}-pct-dioxido">% Dióxido de carbono (molar)</label><input id="${valores.prefijo}-pct-dioxido" type="number" step="any" value="0.01"></div>
      <div class="campo"><label for="${valores.prefijo}-pct-nitrogeno">% Nitrógeno (molar)</label><input id="${valores.prefijo}-pct-nitrogeno" type="number" step="any" value="0.007"></div>
    </div>
  `;
}

function leerComposicion(prefijo) {
  const num = (id) => Number(document.getElementById(id).value);
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
    tile(`${r.caudalTotalNm3H.toFixed(2)} Nm³/h`, 'Caudal total'),
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
    document.getElementById('campo-pci-glp').style.display = combustible === 'GLP' ? '' : 'none';
    document.getElementById('campo-pci-simplificado-gn').style.display = combustible === 'GN' ? '' : 'none';

    const guardados = cargar(`combustion-${combustible}`, null);
    if (guardados) {
      Object.entries(guardados).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) el.value = valor;
      });
    }

    contenedorComposicion.querySelectorAll('input').forEach((el) => el.addEventListener('input', recalcular));
    recalcular();
  }

  function recalcular() {
    const num = (id) => Number(document.getElementById(id).value);
    const comunes = {
      potenciaKw: num('cb-potencia'), lambda: num('cb-lambda'),
      presionReferenciaKPa: num('cb-presion-ref'), temperaturaReferenciaC: num('cb-temp-ref'),
      concentracionO2Pct: num('cb-o2-medido') / 100,
    };
    let resultado;
    try {
      if (combustible === 'GLP') {
        resultado = calcularCombustionGLP({ ...leerComposicion('cb'), ...comunes, pciKjKg: num('cb-pci') });
      } else {
        resultado = calcularCombustionGN({ ...leerComposicion('cb'), ...comunes, pciSimplificadoKwhM3: num('cb-pci-simplificado') });
      }
      renderResultadosCombustion(resultado);
    } catch (error) {
      document.getElementById('resultados-combustion').innerHTML = tile(error.message, 'Error', 'alerta');
    }

    const campos = Array.from(form.querySelectorAll('input')).concat(Array.from(contenedorComposicion.querySelectorAll('input')));
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
    }

    contenedorComposicion.querySelectorAll('input').forEach((el) => el.addEventListener('input', recalcular));
    recalcular();
  }

  function recalcular() {
    const num = (id) => Number(document.getElementById(id).value);
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
        presionGasMbar: num('qm-presion-gas'),
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

    const campos = Array.from(form.querySelectorAll('input')).concat(Array.from(contenedorComposicion.querySelectorAll('input')));
    guardar(`quemador-${combustible}`, Object.fromEntries(campos.map((el) => [el.id, el.value])));
  }

  form.addEventListener('input', recalcular);
  alCambiarCombustible(render);
  render();
}

/* ---------------------------------------------------------------------- */

initTabs();
initSelectorCombustible();
initRedGas();
initAlmacenamiento();
initCombustion();
initQuemador();
initSelectorGas({ actualId: 'gas-natural-glp', profundidad: 1 });
