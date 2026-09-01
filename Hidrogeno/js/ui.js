import { calcularFlujo } from './calc-flujo.js';
import { calcularAlmacenamiento, formatearHoras } from './calc-almacenamiento.js';
import { calcularRed } from './calc-memoria.js';
import { TABLA_TUBERIA } from './gas-h2.js';
import { guardar, cargar, exportarJSON, importarJSON } from './storage.js';

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

function poblarSelectTuberia(select) {
  select.innerHTML = TABLA_TUBERIA.map(
    (f) => `<option value="${f.pulgadas}">${f.pulgadas}" — DI ${f.diMm} mm</option>`
  ).join('');
}

/* ---------------------------------------------------------------------- */
/* Pestaña 1 — Tubería y Flujo                                            */
/* ---------------------------------------------------------------------- */

function leerFlujoForm() {
  const num = (id) => Number(document.getElementById(id).value);
  return {
    presionBarG: num('flujo-presion'),
    temperaturaC: num('flujo-temperatura'),
    potenciaKw: num('flujo-potencia'),
    tuberiaPulgadas: Number(document.getElementById('flujo-tuberia').value),
    presionMinBarG: num('flujo-presion-min'),
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

function renderResultadosFlujo(r) {
  const cercaDeErosion = r.velocidadFlujoMS >= r.velocidadErosionMS * 0.8;
  document.getElementById('resultados-flujo').innerHTML = [
    tile(`${r.presionMaxDisenoBar.toFixed(2)} bar`, 'Presión máxima de diseño (Barlow, ASME B31.12)'),
    tile(`${r.densidadKgM3.toFixed(4)} kg/m³`, 'Densidad real'),
    tile(`${r.flujoMasicoKgH.toFixed(3)} kg/h`, 'Flujo másico de H₂'),
    tile(`${r.flujoVolNormalizado.toFixed(2)}`, 'Flujo volumétrico normalizado'),
    tile(`${r.flujoVolH2.toFixed(3)}`, 'Flujo volumétrico H₂'),
    tile(`${r.velocidadFlujoMS.toFixed(2)} m/s`, 'Velocidad de flujo', cercaDeErosion),
    tile(`${r.velocidadErosionMS.toFixed(2)} m/s`, 'Velocidad de erosión (límite)'),
    tile(`${r.perdidaCargaMbar.toFixed(2)} mbar`, 'Pérdida de carga'),
    tile(r.zDiseno.toFixed(6), 'Factor Z (diseño)'),
    tile(r.reynolds.toFixed(0), 'Número de Reynolds'),
    tile(r.factorFriccion.toFixed(5), 'Factor de fricción (Haaland)'),
  ].join('');
}

function renderTablaTuberia() {
  const filas = TABLA_TUBERIA.map(
    (f) => `<tr><td>${f.pulgadas}"</td><td>${f.diMm}</td><td>${f.espesorMm}</td><td>${f.limiteElasticoMPa}</td><td>${f.rugosidadMm}</td></tr>`
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
    presionBarAbs: num('alm-presion'),
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

  document.getElementById('memoria-tabla-cuerpo').innerHTML = resultado.map((t) => `
    <tr data-id="${t.id}">
      <td><input type="text" class="mem-nombre" value="${t.nombre}"></td>
      <td><select class="mem-padre">${opcionesPadre(t.id)}</select></td>
      <td><input type="number" step="any" class="mem-presion" value="${t.presionMPa}"></td>
      <td><input type="number" step="any" class="mem-largo" value="${t.longitudM}"></td>
      <td><input type="number" step="any" class="mem-potencia" value="${t.potenciaKw}"></td>
      <td><select class="mem-tuberia">${TABLA_TUBERIA.map((f) => `<option value="${f.pulgadas}"${f.pulgadas === t.tuberiaPulgadas ? ' selected' : ''}>${f.pulgadas}"</option>`).join('')}</select></td>
      <td><input type="text" class="mem-material" value="${t.material}"></td>
      <td><input type="number" step="any" class="mem-temp" value="${t.temperaturaC}"></td>
      <td>${t.densidadKgM3.toFixed(4)}</td>
      <td>${t.velocidadFlujoMS.toFixed(2)}</td>
      <td>${t.perdidaParcialMbar.toFixed(2)}</td>
      <td>${t.perdidaAcumuladaMbar.toFixed(2)}</td>
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
  document.getElementById('memoria-tabla-impresion-cuerpo').innerHTML = resultado.map((t) => `
    <tr><td>${t.nombre}</td><td>${porNombreTramo(t.continuaDesdeId)}</td><td>${t.presionMPa}</td><td>${t.longitudM}</td><td>${t.tuberiaPulgadas}"</td><td>${t.perdidaAcumuladaMbar.toFixed(2)}</td></tr>
  `).join('');
  guardar('memoria', tramos);
}

function leerFilaMemoria(fila) {
  const id = fila.dataset.id;
  const val = (clase) => fila.querySelector(`.${clase}`).value;
  return {
    id,
    nombre: val('mem-nombre'),
    continuaDesdeId: val('mem-padre') || null,
    presionMPa: Number(val('mem-presion')),
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
