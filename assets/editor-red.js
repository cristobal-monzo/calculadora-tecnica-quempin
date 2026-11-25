/* editor-red.js — diagrama de la red interactivo (pedido del usuario, 2026-11-25).

   Lo usan las tres Memorias de Cálculo (Hidrogeno, GasNatural-GLP, OtrosGases) con initEditorRed().
   La tabla de tramos sigue siendo la única fuente de datos: el panel de edición es un ESPEJO de la fila del
   tramo elegido. Cada cambio en el panel se escribe en el control de la fila y dispara su evento 'input', así
   que el cálculo, el guardado, los formatos (punto de miles, unidades por columna) y las validaciones son
   exactamente los de la tabla, sin una copia de la lógica de cada gas. Por eso este archivo no conoce los
   campos de ningún gas: arma el panel con las celdas de la fila (data-label = etiqueta, col-calculada = tile).

   Del diagrama solo necesita que dibujarDiagramaRed() ponga data-id en cada <g class="arbol-tramo">. Lo demás
   (zona de clic, botón «+» en el extremo, selección, foco con teclado, arrastre) se agrega aquí cada vez que
   el <svg> se redibuja (MutationObserver), porque el <svg> se reescribe en cada tecla.

   - Clic (o Enter) en un tramo: se abre la ventana flotante de edición junto al tramo. No desplaza nada: queda sobre el
     contenido (en el teléfono, hoja que sube desde abajo). Se cierra con ✕, Esc o un clic fuera; se mueve por su barra.
     Entrar a una fila de la tabla solo marca el tramo en el diagrama, sin abrir la ventana.
   - «+» en el extremo de un tramo: agrega un tramo que continúa desde él, con su presión, diámetro, material y
     temperatura (longitud y potencia quedan por defecto).
   - Arrastrar un tramo (mouse o lápiz) sobre otro: cambia «Continúa desde». Sobre un espacio vacío: red nueva.
     No ofrece los tramos que cerrarían un ciclo: usa las opciones del <select> «Continúa desde» de la fila.
*/

const NS = 'http://www.w3.org/2000/svg';
const NO_HEREDAR = ['mem-nombre', 'mem-padre', 'mem-reset', 'mem-largo', 'mem-potencia', 'mem-caudal', 'mem-desnivel'];
const UMBRAL_ARRASTRE = 6;

const escapar = (texto) => String(texto ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const controlesDe = (raiz) => [...raiz.querySelectorAll('input, select, textarea')];

export function initEditorRed({ svg, tbody, botonAgregar }) {
  if (!svg || !tbody || svg.dataset.editorRed) return;
  svg.dataset.editorRed = '1';

  const contenedor = svg.closest('.arbol-contenedor');
  const envoltura = document.createElement('div');
  envoltura.className = 'red-editor no-imprimir';
  contenedor.before(envoltura);
  envoltura.append(contenedor);
  const panel = document.createElement('aside');
  panel.className = 'editor-tramo';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Editar tramo');
  panel.hidden = true;
  envoltura.append(panel);
  const ESTRECHO = window.matchMedia('(max-width: 959px)');

  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Diagrama de la red: elige un tramo para editarlo');

  let seleccionadoId = null;
  let abierto = false;           // ventana flotante visible
  let movidaAMano = false;       // la persona la arrastró: no se reubica sola hasta abrir otro tramo
  let filaPanel = null;          // <tr> que el panel refleja; si la tabla se redibuja, el panel se rearma
  let pendienteSync = false;

  const filaDe = (id) => (id ? tbody.querySelector(`tr[data-id="${CSS.escape(id)}"]`) : null);
  const nombreDe = (id) => filaDe(id)?.querySelector('.mem-nombre')?.value?.trim() || 'Sin nombre';

  /* ---------------------------------------------------------------- selección */

  function elegir(id, { enfocarPanel = false, abrir = true } = {}) {
    const anterior = abierto ? seleccionadoId : null;
    seleccionadoId = filaDe(id) ? id : null;
    abierto = Boolean(abrir && seleccionadoId);
    if (seleccionadoId !== anterior) movidaAMano = false;
    decorarDiagrama();
    sincronizar(true);
    tbody.querySelectorAll('tr.fila-seleccionada').forEach((tr) => tr.classList.remove('fila-seleccionada'));
    filaDe(seleccionadoId)?.classList.add('fila-seleccionada');
    if (abierto && !movidaAMano) posicionar();
    if (enfocarPanel) panel.querySelector('.editor-nombre input')?.focus({ preventScroll: true });
  }

  function cerrar({ devolverFoco = false } = {}) {
    if (!abierto) return;
    const id = seleccionadoId;
    abierto = false;
    panel.hidden = true;
    filaPanel = null;
    if (devolverFoco) svg.querySelector(`g.arbol-tramo[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }

  // Junto al tramo: a su derecha; si no cabe, a su izquierda; si tampoco, debajo. Siempre dentro de la pantalla.
  function posicionar() {
    if (panel.hidden || ESTRECHO.matches) { panel.style.left = ''; panel.style.top = ''; return; }
    const g = svg.querySelector(`g.arbol-tramo[data-id="${CSS.escape(seleccionadoId)}"]`);
    if (!g) return;
    const t = (g.querySelector('.arbol-zona') ?? g).getBoundingClientRect();
    const base = envoltura.getBoundingClientRect();
    const ancho = panel.offsetWidth, alto = panel.offsetHeight, aire = 18;
    let left = t.right - base.left + aire;
    let top = t.top - base.top - 6;
    if (base.left + left + ancho > window.innerWidth - 8) {
      left = t.left - base.left - ancho - aire;
      if (base.left + left < 8) {
        left = Math.min(Math.max(t.left - base.left, 8 - base.left), window.innerWidth - 8 - ancho - base.left);
        top = t.bottom - base.top + 8;
      }
    }
    const sobra = base.top + top + alto - (window.innerHeight - 12);
    if (sobra > 0) top = Math.max(top - sobra, 64 - base.top);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }
  window.addEventListener('resize', () => { if (abierto && !movidaAMano) posicionar(); });
  ESTRECHO.addEventListener('change', () => { movidaAMano = false; posicionar(); });

  // Clic fuera de la ventana (y fuera de los tramos del diagrama): se cierra.
  document.addEventListener('pointerdown', (evento) => {
    if (!abierto || panel.contains(evento.target) || evento.target.closest?.('#memoria-arbol g.arbol-tramo')) return;
    cerrar();
  });

  /* ---------------------------------------------------------------- diagrama */

  function decorarDiagrama() {
    svg.querySelectorAll('g.arbol-tramo[data-id]').forEach((g) => {
      const id = g.dataset.id;
      const linea = g.querySelector('.arbol-tuberia');
      const nodo = g.querySelector('.arbol-nodo');
      if (!linea || !nodo) return;
      const nombre = nombreDe(id);
      g.classList.toggle('seleccionado', id === seleccionadoId);
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-pressed', String(id === seleccionadoId));
      g.setAttribute('aria-label', `Tramo ${nombre}`);
      if (g.querySelector('.arbol-zona')) return;

      const x0 = Number(linea.getAttribute('x1')), x1 = Number(linea.getAttribute('x2')), y = Number(linea.getAttribute('y1'));
      const zona = document.createElementNS(NS, 'rect');
      zona.setAttribute('class', 'arbol-zona');
      zona.setAttribute('x', String(x0 - 8));
      zona.setAttribute('y', String(y - 27));
      zona.setAttribute('width', String(Math.max(20, x1 - x0 + 2)));
      zona.setAttribute('height', '68');
      zona.setAttribute('rx', '8');
      g.prepend(zona);

      const cx = Number(nodo.getAttribute('cx')), cy = Number(nodo.getAttribute('cy'));
      const mas = document.createElementNS(NS, 'g');
      mas.setAttribute('class', 'arbol-agregar');
      mas.setAttribute('transform', `translate(${cx} ${cy})`);
      mas.dataset.padre = id;
      mas.innerHTML = `<title>Agregar un tramo a continuación de ${escapar(nombre)}</title>` +
        '<circle r="13" class="arbol-agregar-zona"/><circle r="9"/><path d="M-4 0H4M0 -4V4"/>';
      g.append(mas);
    });
  }

  new MutationObserver(decorarDiagrama).observe(svg, { childList: true });

  const tramoDesdeEvento = (evento) => evento.target.closest?.('g.arbol-tramo[data-id]');

  svg.addEventListener('click', (evento) => {
    if (arrastre?.movido) return;
    const mas = evento.target.closest?.('.arbol-agregar');
    if (mas) { agregarTramo(mas.dataset.padre); return; }
    const g = tramoDesdeEvento(evento);
    if (g) elegir(g.dataset.id);
  });

  svg.addEventListener('keydown', (evento) => {
    const g = tramoDesdeEvento(evento);
    if (!g || (evento.key !== 'Enter' && evento.key !== ' ')) return;
    evento.preventDefault();
    elegir(g.dataset.id, { enfocarPanel: true });
  });

  /* ---------------------------------------------------------------- arrastre */

  let arrastre = null;
  const etiquetaArrastre = document.createElement('div');
  etiquetaArrastre.className = 'arrastre-etiqueta no-imprimir';
  etiquetaArrastre.hidden = true;
  document.body.append(etiquetaArrastre);

  function destinoEn(x, y) {
    const pila = document.elementsFromPoint(x, y);
    if (!pila.includes(svg)) return { tipo: 'fuera' };
    const g = pila.map((el) => el.closest?.('g.arbol-tramo[data-id]')).find((el) => el && el.dataset.id !== arrastre.id);
    if (!g) return { tipo: 'raiz' };
    return { tipo: 'tramo', id: g.dataset.id, g };
  }

  function valorPadrePara(destino) {
    const select = filaDe(arrastre.id)?.querySelector('.mem-padre');
    if (!select) return null;
    const valor = destino.tipo === 'raiz' ? '' : destino.id;
    if (![...select.options].some((o) => o.value === valor)) return null;   // cerraría un ciclo
    return select.value === valor ? null : valor;
  }

  svg.addEventListener('pointerdown', (evento) => {
    if (evento.pointerType === 'touch' || evento.button !== 0 || evento.target.closest('.arbol-agregar')) return;
    const g = tramoDesdeEvento(evento);
    if (!g) return;
    arrastre = { id: g.dataset.id, g, x: evento.clientX, y: evento.clientY, movido: false, puntero: evento.pointerId };
  });

  svg.addEventListener('pointermove', (evento) => {
    if (!arrastre || evento.pointerId !== arrastre.puntero) return;
    if (!arrastre.movido) {
      if (Math.hypot(evento.clientX - arrastre.x, evento.clientY - arrastre.y) < UMBRAL_ARRASTRE) return;
      arrastre.movido = true;
      svg.setPointerCapture(evento.pointerId);
      svg.classList.add('arrastrando');
      arrastre.g.classList.add('origen');
    }
    svg.querySelectorAll('.destino, .destino-invalido').forEach((el) => el.classList.remove('destino', 'destino-invalido'));
    const destino = destinoEn(evento.clientX, evento.clientY);
    const valor = destino.tipo === 'fuera' ? null : valorPadrePara(destino);
    let texto;
    if (destino.tipo === 'fuera') texto = 'Suelta dentro del diagrama';
    else if (valor === null) {
      const actual = filaDe(arrastre.id)?.querySelector('.mem-padre')?.value ?? '';
      const mismo = (destino.tipo === 'raiz' ? '' : destino.id) === actual;
      texto = mismo ? 'Ya continúa desde aquí' : 'No: este tramo continúa desde el que arrastras';
      destino.g?.classList.add('destino-invalido');
    } else {
      texto = destino.tipo === 'raiz' ? 'Inicio de una red nueva' : `Continúa desde ${nombreDe(destino.id)}`;
      destino.g?.classList.add('destino');
    }
    etiquetaArrastre.textContent = `${nombreDe(arrastre.id)} → ${texto}`;
    etiquetaArrastre.classList.toggle('invalido', valor === null);
    etiquetaArrastre.style.transform = `translate(${evento.clientX + 14}px, ${evento.clientY + 16}px)`;
    etiquetaArrastre.hidden = false;
  });

  function terminarArrastre(evento, soltar) {
    if (!arrastre || evento.pointerId !== arrastre.puntero) return;
    const { id, movido } = arrastre;
    if (movido) {
      const destino = destinoEn(evento.clientX, evento.clientY);
      const valor = soltar && destino.tipo !== 'fuera' ? valorPadrePara(destino) : null;
      svg.classList.remove('arrastrando');
      svg.querySelectorAll('.origen, .destino, .destino-invalido').forEach((el) => el.classList.remove('origen', 'destino', 'destino-invalido'));
      etiquetaArrastre.hidden = true;
      if (valor !== null) {
        escribirEnFila(filaDe(id).querySelector('.mem-padre'), valor);
        elegir(id, { abrir: abierto });
      }
      // El 'click' que sigue a soltar no debe elegir otro tramo.
      setTimeout(() => { arrastre = null; }, 0);
      return;
    }
    arrastre = null;
  }
  svg.addEventListener('pointerup', (evento) => terminarArrastre(evento, true));
  svg.addEventListener('pointercancel', (evento) => terminarArrastre(evento, false));

  /* ---------------------------------------------------------------- tabla ↔ panel */

  // Escribe en el control de la fila y dispara su 'input': la tabla hace todo lo demás.
  function escribirEnFila(control, valor) {
    if (!control) return;
    if (control.type === 'checkbox') control.checked = Boolean(valor);
    else control.value = valor;
    control.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function agregarTramo(padreId) {
    if (!botonAgregar) return;
    const scroll = window.scrollY;
    const padre = filaDe(padreId);
    botonAgregar.click();
    const nueva = tbody.querySelector('tr[data-id]:last-child');
    if (!nueva) return;
    const id = nueva.dataset.id;
    seleccionadoId = id;
    if (padre) {
      // Hereda del tramo de origen lo que suele seguir igual en la línea; un solo 'input' al final
      // (desde un <select>) hace que la tabla lea la fila completa y se redibuje una vez.
      const origen = controlesDe(padre);
      controlesDe(nueva).forEach((control, i) => {
        const fuente = origen[i];
        if (!fuente || fuente.className !== control.className || NO_HEREDAR.some((c) => control.classList.contains(c))) return;
        if (control.type === 'checkbox') control.checked = fuente.checked;
        else control.value = fuente.value;
      });
      escribirEnFila(nueva.querySelector('.mem-padre'), padreId);
    }
    elegir(id);
    window.scrollTo({ top: scroll });
    const nombre = panel.querySelector('.editor-nombre input');
    if (nombre) { nombre.focus({ preventScroll: true }); nombre.select(); }
  }

  // Entrar a una fila de la tabla marca su tramo en el diagrama, sin abrir la ventana.
  tbody.addEventListener('focusin', (evento) => {
    const fila = evento.target.closest('tr[data-id]');
    if (fila && fila.dataset.id !== seleccionadoId) elegir(fila.dataset.id, { abrir: false });
  });
  // Lo escrito directo en la tabla también pasa al panel.
  tbody.addEventListener('input', () => programarSync());
  new MutationObserver(() => programarSync()).observe(tbody, { childList: true, subtree: true, characterData: true });

  function programarSync() {
    if (pendienteSync) return;
    pendienteSync = true;
    queueMicrotask(() => { pendienteSync = false; sincronizar(false); });
  }

  function sincronizar(forzar) {
    const fila = filaDe(seleccionadoId);
    if (!fila) {
      seleccionadoId = null;
      cerrar();
      decorarDiagrama();
      return;
    }
    tbody.querySelectorAll('tr.fila-seleccionada').forEach((tr) => { if (tr !== fila) tr.classList.remove('fila-seleccionada'); });
    fila.classList.add('fila-seleccionada');
    panel.hidden = !abierto;
    if (!abierto) return;
    if (forzar || fila !== filaPanel) armarPanel(fila);
    else actualizarPanel(fila);
  }

  /* ---------------------------------------------------------------- panel */

  // Clave de cada control: "<celda>:<n° de control en la celda>". Igual en la fila y en el panel.
  function armarPanel(fila) {
    const claveFoco = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.dataset.clave : null;
    filaPanel = fila;
    panel.innerHTML = '<div class="editor-barra" title="Arrastra para mover la ventana">' +
      '<span class="editor-barra-titulo">Editar tramo</span>' +
      '<button type="button" class="editor-cerrar" aria-label="Cerrar">✕</button></div>';
    const cuerpo = document.createElement('div');
    cuerpo.className = 'editor-cuerpo';

    const celdas = [...fila.cells];
    const campos = document.createElement('div');
    campos.className = 'editor-campos';
    const tiles = document.createElement('div');
    tiles.className = 'editor-calculados';
    let cabecera = null;
    let interruptor = null;

    celdas.forEach((td, iCelda) => {
      if (td.classList.contains('mem-celda-acciones')) return;
      const etiqueta = td.dataset.label ?? '';
      if (td.classList.contains('col-calculada')) {
        const tile = document.createElement('div');
        tile.className = 'editor-tile';
        tile.dataset.celda = String(iCelda);
        tile.innerHTML = `<span class="editor-tile-etiqueta"></span><span class="editor-tile-valor"></span>`;
        tiles.append(tile);
        return;
      }
      const originales = controlesDe(td);
      if (!originales.length) return;
      const copia = document.createElement('div');
      td.childNodes.forEach((n) => copia.append(n.cloneNode(true)));
      const clones = controlesDe(copia);
      clones.forEach((clon, i) => {
        clon.removeAttribute('id');
        clon.dataset.clave = `${iCelda}:${i}`;
        // Controles secundarios (p. ej. el diámetro manual): su title pasa a ser una etiqueta visible.
        if (i > 0 && clon.title) {
          const sub = document.createElement('label');
          sub.className = 'editor-subcampo';
          sub.innerHTML = `<span>${escapar(clon.title)}</span>`;
          clon.replaceWith(sub);
          sub.append(clon);
          clon.setAttribute('aria-label', clon.title);
          clon.removeAttribute('title');
        }
      });

      if (originales[0].classList.contains('mem-nombre')) {
        cabecera = document.createElement('label');
        cabecera.className = 'editor-nombre';
        cabecera.innerHTML = '<span class="editor-etiqueta">Nombre del tramo</span>';
        cabecera.append(...copia.childNodes);
        return;
      }
      if (originales.length === 1 && originales[0].type === 'checkbox') {
        interruptor = document.createElement('label');
        interruptor.className = 'editor-interruptor';
        interruptor.dataset.celda = String(iCelda);
        interruptor.append(...copia.childNodes);
        interruptor.insertAdjacentHTML('beforeend', `<span>${escapar(originales[0].title || etiqueta)}</span>`);
        interruptor.querySelector('input').removeAttribute('title');
        return;
      }
      const campo = document.createElement('div');
      campo.className = 'editor-campo';
      campo.dataset.celda = String(iCelda);
      if (originales[0].classList.contains('mem-padre')) campo.classList.add('ancho');
      const id = `editor-${fila.dataset.id}-${iCelda}`;
      clones[0].id = id;
      campo.innerHTML = `<label class="editor-etiqueta" for="${id}"></label>`;
      campo.append(...copia.childNodes);
      campos.append(campo);
    });

    if (cabecera) cuerpo.append(cabecera);
    if (interruptor) campos.append(interruptor);
    cuerpo.append(campos);
    if (tiles.childElementCount) {
      const titulo = document.createElement('div');
      titulo.className = 'editor-subtitulo';
      titulo.textContent = 'Resultado del tramo';
      cuerpo.append(titulo, tiles);
    }
    const acciones = document.createElement('div');
    acciones.className = 'editor-acciones';
    acciones.innerHTML = '<button type="button" class="btn editor-seguir">+ Tramo a continuación</button>' +
      '<button type="button" class="btn editor-eliminar">Eliminar</button>';
    cuerpo.append(acciones);
    panel.append(cuerpo);

    window.QuempinNumeros && controlesDe(panel).forEach((c) => window.QuempinNumeros.preparar(c));
    actualizarPanel(fila, true);
    if (claveFoco) panel.querySelector(`[data-clave="${claveFoco}"]`)?.focus({ preventScroll: true });
  }

  // Copia de la fila al panel: valores (salvo el control que se está escribiendo), opciones, visibilidad,
  // etiquetas con su unidad y los resultados calculados.
  function actualizarPanel(fila, todo = false) {
    const celdas = [...fila.cells];
    panel.querySelectorAll('[data-celda]').forEach((bloque) => {
      const td = celdas[Number(bloque.dataset.celda)];
      if (!td) return;
      if (bloque.classList.contains('editor-tile')) {
        bloque.querySelector('.editor-tile-etiqueta').textContent = td.dataset.label ?? '';
        bloque.querySelector('.editor-tile-valor').textContent = td.textContent.trim() || '—';
        return;
      }
      const etiqueta = bloque.querySelector(':scope > .editor-etiqueta');
      if (etiqueta) etiqueta.textContent = td.dataset.label ?? '';
    });
    const nombre = fila.querySelector('.mem-nombre');
    if (nombre) panel.querySelector('.editor-eliminar')?.setAttribute('aria-label', `Eliminar ${nombre.value}`);

    controlesDe(panel).forEach((clon) => {
      if (!clon.dataset.clave) return;
      const [iCelda, i] = clon.dataset.clave.split(':').map(Number);
      const original = controlesDe(celdas[iCelda])[i];
      if (!original) return;
      const visible = original.style.display !== 'none' && original.closest('[style*="display: none"], [style*="display:none"]') === null;
      const caja = clon.closest('.editor-subcampo') ?? clon;
      caja.hidden = !visible;
      const envolturaManual = clon.closest('.mem-tuberia-manual');
      if (envolturaManual) envolturaManual.style.display = original.closest('.mem-tuberia-manual').style.display;
      if (!todo && clon === document.activeElement) return;
      if (clon.tagName === 'SELECT' && clon.innerHTML !== original.innerHTML) clon.innerHTML = original.innerHTML;
      if (clon.type === 'checkbox') clon.checked = original.checked;
      else if (clon.value !== original.value) clon.value = original.value;
      if (original.hasAttribute('aria-invalid')) clon.setAttribute('aria-invalid', 'true');
      else clon.removeAttribute('aria-invalid');
    });
  }

  panel.addEventListener('input', (evento) => {
    const clon = evento.target;
    if (!clon.dataset?.clave || !filaPanel) return;
    const [iCelda, i] = clon.dataset.clave.split(':').map(Number);
    const original = controlesDe(filaPanel.cells[iCelda])[i];
    escribirEnFila(original, clon.type === 'checkbox' ? clon.checked : clon.value);
  });

  panel.addEventListener('click', (evento) => {
    if (evento.target.closest('.editor-cerrar')) {
      cerrar({ devolverFoco: true });
    } else if (evento.target.closest('.editor-seguir')) {
      agregarTramo(seleccionadoId);
    } else if (evento.target.closest('.editor-eliminar')) {
      // Tras eliminar, la ventana se cierra y queda marcado el tramo de origen.
      const origen = filaPanel?.querySelector('.mem-padre')?.value;
      filaPanel?.querySelector('.mem-eliminar')?.click();
      cerrar();
      elegir(filaDe(origen) ? origen : null, { abrir: false });
    }
  });

  panel.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape' || !abierto) return;
    evento.preventDefault();
    cerrar({ devolverFoco: true });
  });

  // Mover la ventana arrastrando su barra (escritorio).
  panel.addEventListener('pointerdown', (evento) => {
    const barra = evento.target.closest('.editor-barra');
    if (!barra || evento.target.closest('button') || ESTRECHO.matches || evento.button !== 0) return;
    evento.preventDefault();
    const x0 = evento.clientX - panel.offsetLeft, y0 = evento.clientY - panel.offsetTop;
    barra.setPointerCapture(evento.pointerId);
    const mover = (e) => {
      movidaAMano = true;
      panel.style.left = `${e.clientX - x0}px`;
      panel.style.top = `${e.clientY - y0}px`;
    };
    const soltar = () => { barra.removeEventListener('pointermove', mover); barra.removeEventListener('pointerup', soltar); };
    barra.addEventListener('pointermove', mover);
    barra.addEventListener('pointerup', soltar);
  });

  elegir(null, { abrir: false });
}
