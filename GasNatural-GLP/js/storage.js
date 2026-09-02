// Autoguardado en localStorage + exportar/importar proyecto como JSON.
// Copia funcional de Hidrogeno/js/storage.js (mismo contrato, sin
// dependencia cruzada entre sitios — ver CLAUDE.md raíz).

const PREFIJO = 'quempin-glp-gn-calculadora::';

export function guardar(clave, datos) {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(datos));
  } catch (error) {
    console.warn('No se pudo guardar en localStorage:', error);
  }
}

export function cargar(clave, porDefecto) {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    return crudo === null ? porDefecto : JSON.parse(crudo);
  } catch (error) {
    console.warn('No se pudo leer de localStorage:', error);
    return porDefecto;
  }
}

export function exportarJSON(nombreArchivo, datos) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

export function importarJSON(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
      try {
        resolve(JSON.parse(lector.result));
      } catch (error) {
        reject(error);
      }
    };
    lector.onerror = () => reject(lector.error);
    lector.readAsText(archivo);
  });
}
