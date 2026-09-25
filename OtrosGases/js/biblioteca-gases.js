// Gases predefinidos del módulo + validación de un gas personalizado.
// Agregar un gas nuevo = agregar un objeto a GASES_PREDEFINIDOS con los
// mismos campos (la UI y los motores no cambian). Cada constante cita su
// fuente — ver OtrosGases/CLAUDE.md antes de cambiar una.
//
// Campos (todos los motores los leen de este mismo shape):
//   masaMolarGMol          [g/mol]
//   temperaturaCriticaK    [K]        ┐ Peng-Robinson (Z, densidad) y
//   presionCriticaBar      [bar abs]  │ Lee-Kesler (presión de vapor)
//   factorAcentrico        [-]        ┘
//   gamma                  cp/cv de gas ideal, solo para el screening de flujo sónico
//   viscosidadUPaS         [µPa·s] a ~20 °C y 1 bar (se usa constante — ver CLAUDE.md)
//   pciMJkg                [MJ/kg] poder calorífico inferior; null si no es combustible
//   gradoLlenadoKgL        [kg/L]  máximo reglamentario para almacenarlo licuado; null si no aplica

export const GASES_PREDEFINIDOS = [
  {
    id: 'co2',
    nombre: 'Dióxido de carbono',
    formula: 'CO₂',
    // Tc, Pc, M: ecuación de referencia de Span & Wagner (1996), la que usa
    // el NIST Chemistry WebBook (punto crítico de su tabla de saturación,
    // consultada 2026-09-25: 30,9782 °C / 73,773 bar). ω: 0,22394 (Span &
    // Wagner vía REFPROP) — no se puede recalcular por definición desde la
    // tabla porque 0,7·Tc = 212,9 K cae bajo el punto triple (216,6 K).
    masaMolarGMol: 44.0098,
    temperaturaCriticaK: 304.1282,
    presionCriticaBar: 73.773,
    factorAcentrico: 0.22394,
    // cp de gas ideal a 298,15 K = 37,135 J/(mol·K) (JANAF) → γ = cp/(cp − R)
    gamma: 1.29,
    // NIST WebBook, 20 °C / 1 bar: 14,6747 µPa·s
    viscosidadUPaS: 14.67,
    pciMJkg: null,
    // 49 CFR §173.304a(a)(2): 68 % en cilindros DOT de 1800 psi (70,3/73,2/
    // 74,5 % en cilindros de mayor presión de servicio; ADR P200: 0,66 con
    // presión de prueba 190 bar, 0,75 con 250 bar). Confirmar el del
    // recipiente real.
    gradoLlenadoKgL: 0.68,
    fuenteGradoLlenado: '49 CFR §173.304a, cilindro DOT de 1800 psi; hasta 0,745 en cilindros de mayor presión de servicio',
    notas: [
      'Asfixiante y más pesado que el aire: se acumula en fosos y zonas bajas.',
      'Punto triple 5,18 bar abs / −56,6 °C: bajo esa presión el CO₂ líquido no existe — al expandir líquido se forma hielo seco, que puede bloquear válvulas y reguladores.',
      'Fuerte enfriamiento al expandirse (efecto Joule-Thomson): revisar la temperatura aguas abajo de cada reducción de presión.',
      'A temperatura ambiente condensa sobre ~57 bar abs (20 °C): los cilindros lo contienen licuado — usar "Gas licuado" en Almacenamiento.',
    ],
  },
  {
    id: 'nh3',
    nombre: 'Amoníaco',
    formula: 'NH₃',
    // Tc, Pc, M: ecuación de referencia de Gao et al. (2020), la que usa hoy
    // el NIST Chemistry WebBook (punto crítico de su tabla de saturación,
    // consultada 2026-09-25: 132,41 °C / 113,634 bar). ω calculado por su
    // definición, −log10(Psat(0,7·Tc)/Pc) − 1, con la Psat de esa misma
    // tabla a 10,742 °C (6,3069 bar) → 0,2557.
    masaMolarGMol: 17.03052,
    temperaturaCriticaK: 405.56,
    presionCriticaBar: 113.634,
    factorAcentrico: 0.2557,
    // cp de gas ideal a 298,15 K = 35,630 J/(mol·K) (JANAF) → γ = cp/(cp − R)
    gamma: 1.30,
    // NIST WebBook, 20 °C / 1 bar: 9,90832 µPa·s
    viscosidadUPaS: 9.91,
    // PCI por entalpías de formación (NIST-JANAF, 298 K): NH₃ + ¾O₂ →
    // ½N₂ + 3/2 H₂O(g) libera 1,5·241,83 − 45,94 = 316,8 kJ/mol → 18,60 MJ/kg
    pciMJkg: 18.6,
    // 49 CFR §173.304a(a)(2): 54 % (anhydrous ammonia)
    gradoLlenadoKgL: 0.54,
    fuenteGradoLlenado: '49 CFR §173.304a',
    notas: [
      'Tóxico y corrosivo. Incompatible con cobre, latón y aleaciones de cobre/zinc: usar acero al carbono o inoxidable.',
      'Inflamable (aprox. 15 a 28 % vol. en aire), de baja reactividad.',
      'Más liviano que el aire como gas, pero una fuga de líquido forma una nube fría más densa que el aire.',
      'A 20 °C condensa sobre ~8,6 bar abs: en estanques y cilindros se almacena licuado — usar "Gas licuado" en Almacenamiento.',
    ],
  },
];

export const ID_PERSONALIZADO = 'personalizado';

// Punto de partida de un gas personalizado nuevo: copia del CO₂ (así los
// campos nunca parten vacíos y el usuario ajusta lo que difiere).
export function gasPersonalizadoPorDefecto() {
  return copiaPersonalizada(GASES_PREDEFINIDOS[0], { nombre: 'Gas personalizado', formula: '' });
}

// Copia editable de un gas predefinido: sin sus notas de seguridad ni la
// fuente de su grado de llenado (dejan de ser ciertas si se edita).
export function copiaPersonalizada(gas, cambios = {}) {
  const { id, notas, fuenteGradoLlenado, ...propiedades } = gas;
  return { ...propiedades, id: ID_PERSONALIZADO, ...cambios };
}

export function buscarGasPredefinido(id) {
  return GASES_PREDEFINIDOS.find((g) => g.id === id) ?? null;
}

// Errores que impiden calcular (lista vacía = gas válido). Los motores
// asumen un gas válido; la UI llama esto antes y muestra los errores en vez
// de resultados.
export function validarGas(gas) {
  const errores = [];
  const positivo = (valor) => Number.isFinite(valor) && valor > 0;
  if (!positivo(gas.masaMolarGMol)) errores.push('La masa molar debe ser mayor que 0.');
  if (!positivo(gas.temperaturaCriticaK)) errores.push('La temperatura crítica debe ser mayor que −273,15 °C.');
  if (!positivo(gas.presionCriticaBar)) errores.push('La presión crítica debe ser mayor que 0.');
  if (!Number.isFinite(gas.factorAcentrico) || gas.factorAcentrico < -0.5 || gas.factorAcentrico > 1.5) {
    errores.push('El factor acéntrico debe estar entre −0,5 y 1,5.');
  }
  if (!Number.isFinite(gas.gamma) || gas.gamma <= 1) errores.push('γ (cp/cv) debe ser mayor que 1.');
  if (!positivo(gas.viscosidadUPaS)) errores.push('La viscosidad debe ser mayor que 0.');
  if (gas.pciMJkg !== null && !(Number.isFinite(gas.pciMJkg) && gas.pciMJkg >= 0)) errores.push('El PCI no puede ser negativo.');
  if (gas.gradoLlenadoKgL !== null && !(Number.isFinite(gas.gradoLlenadoKgL) && gas.gradoLlenadoKgL >= 0)) {
    errores.push('El grado de llenado no puede ser negativo.');
  }
  return errores;
}
