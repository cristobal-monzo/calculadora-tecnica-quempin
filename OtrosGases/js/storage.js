// Autoguardado en localStorage (copia de Hidrogeno/js/storage.js con prefijo
// propio, para no mezclar lo guardado entre módulos).

const PREFIJO = 'quempin-otros-gases::';

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

