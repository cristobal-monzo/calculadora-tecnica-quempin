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
