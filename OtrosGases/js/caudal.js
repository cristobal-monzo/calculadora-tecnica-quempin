// Conversión del caudal/consumo ingresado a flujo másico [kg/h] — lo que
// consumen los motores de Tubería y Flujo y de Almacenamiento. Tres formas
// de expresarlo según para qué se use el gas:
//   'kg/h'  — directo (CO₂ de proceso, venta por masa)
//   'Nm3/h' — volumen a 0 °C y 1 atm (termo.js), vía la densidad normal real
//   'kW'    — potencia térmica, solo si el gas tiene PCI (NH₃ como combustible)

export const UNIDADES_CAUDAL = ['kg/h', 'Nm3/h', 'kW'];

export function flujoMasicoKgH({ caudal, unidad, densidadNormalKgM3, pciMJkg }) {
  if (unidad === 'kg/h') return caudal;
  if (unidad === 'Nm3/h') return caudal * densidadNormalKgM3;
  if (unidad === 'kW') {
    if (!(pciMJkg > 0)) throw new Error('Para ingresar el caudal en kW el gas necesita un PCI mayor que 0.');
    // kW = kJ/s → kg/s = kW / (PCI·1000 kJ/kg) → kg/h = kW·3,6 / PCI[MJ/kg]
    return (caudal * 3.6) / pciMJkg;
  }
  throw new Error(`Unidad de caudal desconocida: ${unidad}`);
}
