// Termodinámica de gas real para CUALQUIER gas, a partir de sus constantes
// críticas (Tc, Pc) y su factor acéntrico ω — a diferencia de Hidrógeno
// (correlación NIST propia del H₂) y GN/GLP (Peng-Robinson truncado a
// Z = 1 + B − A, evaluado a 20 °C fijos), acá la ecuación cúbica se resuelve
// completa y a la temperatura real, porque CO₂ y NH₃ trabajan cerca de su
// curva de saturación y ahí el truncamiento deja de valer. Ver
// OtrosGases/CLAUDE.md.

export const R_UNIVERSAL = 8.314462618; // J/(mol·K), CODATA 2018

// Condiciones normales del Nm³ de este módulo: 0 °C y 1 atm (DIN 1343),
// las mismas que usa GasNatural-GLP (101,325 kPa / 273,15 K).
export const P_NORMAL_PA = 101325;
export const T_NORMAL_K = 273.15;

// Margen de temperatura sobre el punto de condensación bajo el cual se
// advierte (criterio de screening de este módulo, no normativo): 10 K
// cubren un día frío o el enfriamiento por expansión en una válvula.
export const MARGEN_CONDENSACION_K = 10;

// Sobre Tc y Pc, Peng-Robinson solo se degrada cerca del punto crítico.
// Contra NIST (tests/termo.test.js): CO₂ 40 °C/100 bar (Tr 1,03) −10 %,
// NH₃ 160 °C/150 bar (Tr 1,07) −6 %, pero CO₂ 92 °C/100 bar (Tr 1,20) +1,4 %
// y N₂ 20 °C/200 bar (Tr 2,3) +2,9 %, el error típico de la cúbica en gas.
// Bajo Tr = 1,1 se advierte; sobre, es un gas comprimido común.
export const TR_ZONA_CRITICA = 1.1;

export function celsiusAKelvin(temperaturaC) {
  return temperaturaC + 273.15;
}

// Raíces reales de Z³ + c2·Z² + c1·Z + c0 = 0, ordenadas de menor a mayor.
// Cardano/trigonométrica + un pulido de Newton por raíz (la forma cerrada
// pierde dígitos cerca de raíces múltiples, p. ej. en el punto crítico).
export function raicesCubica(c2, c1, c0) {
  const p = c1 - (c2 * c2) / 3;
  const q = (2 * c2 ** 3) / 27 - (c2 * c1) / 3 + c0;
  const disc = (q / 2) ** 2 + (p / 3) ** 3;
  let raices;
  if (disc > 0) {
    const s = Math.sqrt(disc);
    raices = [Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s)];
  } else {
    const r = 2 * Math.sqrt(-p / 3);
    const arg = p === 0 ? 0 : Math.min(1, Math.max(-1, (3 * q) / (p * r)));
    const phi = Math.acos(arg) / 3;
    raices = [0, 1, 2].map((k) => r * Math.cos(phi - (2 * Math.PI * k) / 3));
  }
  const f = (z) => ((z + c2) * z + c1) * z + c0;
  const df = (z) => (3 * z + 2 * c2) * z + c1;
  return raices
    .map((t) => {
      let z = t - c2 / 3;
      for (let i = 0; i < 20; i++) {
        const d = df(z);
        if (d === 0) break;
        const paso = f(z) / d;
        z -= paso;
        if (Math.abs(paso) < 1e-14) break;
      }
      return z;
    })
    .sort((a, b) => a - b);
}

// Peng & Robinson (1976), Ind. Eng. Chem. Fundam. 15(1):59-64, con la
// función α original (κ cuadrático en ω). Para ω > 0,49 los autores
// publicaron luego otra κ (PR78) — no se implementa: CO₂ (0,224) y NH₃
// (0,256) quedan muy por debajo.
export function coeficientesPengRobinson({ gas, presionAbsPa, temperaturaK }) {
  const tc = gas.temperaturaCriticaK;
  const pc = gas.presionCriticaBar * 1e5;
  const w = gas.factorAcentrico;
  // Ωa, Ωb con todos sus dígitos (el paper los redondea a 0,45724/0,07780):
  // con los redondeados el punto crítico de la cúbica se corre del Tc/Pc
  // ingresado y Zc deja de ser el 0,3074 teórico de Peng-Robinson.
  const a = (0.457235529 * R_UNIVERSAL ** 2 * tc ** 2) / pc;
  const b = (0.077796074 * R_UNIVERSAL * tc) / pc;
  const kappa = 0.37464 + 1.54226 * w - 0.26992 * w ** 2;
  const alfa = (1 + kappa * (1 - Math.sqrt(temperaturaK / tc))) ** 2;
  const A = (a * alfa * presionAbsPa) / (R_UNIVERSAL * temperaturaK) ** 2;
  const B = (b * presionAbsPa) / (R_UNIVERSAL * temperaturaK);
  return { A, B };
}

// Factor de compresibilidad Z. `fase: 'vapor'` toma la raíz mayor (la
// única con sentido para un gas); 'liquido' la menor físicamente posible
// (Z > B). Quien llama decide la fase con estadoFase() — la cúbica sola no
// sabe si el estado es estable o metaestable.
export function factorZ({ gas, presionAbsPa, temperaturaK, fase = 'vapor' }) {
  const { A, B } = coeficientesPengRobinson({ gas, presionAbsPa, temperaturaK });
  const raices = raicesCubica(-(1 - B), A - 3 * B * B - 2 * B, -(A * B - B * B - B ** 3))
    .filter((z) => z > B);
  if (!raices.length) throw new Error('La ecuación de Peng-Robinson no tiene solución física para este estado.');
  return fase === 'liquido' ? raices[0] : raices[raices.length - 1];
}

export function densidadReal({ gas, presionAbsPa, temperaturaK, z }) {
  return (presionAbsPa * gas.masaMolarGMol / 1000) / (z * R_UNIVERSAL * temperaturaK);
}

// Presión de vapor — correlación de Lee & Kesler (1975), AIChE J.
// 21(3):510-527, en la forma de Poling, Prausnitz & O'Connell, "The
// Properties of Gases and Liquids", 5ª ed., ec. 7-4.1/7-4.2. Solo usa Tc,
// Pc y ω (los mismos datos que Peng-Robinson). Contra NIST: CO₂ y NH₃
// dentro de ~1 % entre −20 y 40 °C (tests/termo.test.js). Devuelve null
// sobre la temperatura crítica (no hay líquido que evaporar).
export function presionVaporPa({ gas, temperaturaK }) {
  const tr = temperaturaK / gas.temperaturaCriticaK;
  if (tr >= 1) return null;
  const f0 = 5.92714 - 6.09648 / tr - 1.28862 * Math.log(tr) + 0.169347 * tr ** 6;
  const f1 = 15.2518 - 15.6875 / tr - 13.4721 * Math.log(tr) + 0.43577 * tr ** 6;
  return gas.presionCriticaBar * 1e5 * Math.exp(f0 + gas.factorAcentrico * f1);
}

// Temperatura de condensación (punto de rocío del gas puro) a una presión
// absoluta dada — la inversa de presionVaporPa() por bisección, que es
// monótona en T. null si P ≥ Pc (no hay condensación, solo fluido
// supercrítico o líquido comprimido) o si cae bajo 0,3·Tc, fuera del rango
// razonable de la correlación.
export function temperaturaSaturacionK({ gas, presionAbsPa }) {
  if (presionAbsPa >= gas.presionCriticaBar * 1e5 || presionAbsPa <= 0) return null;
  let bajo = 0.3 * gas.temperaturaCriticaK;
  let alto = gas.temperaturaCriticaK;
  if (presionVaporPa({ gas, temperaturaK: bajo }) > presionAbsPa) return null;
  for (let i = 0; i < 100; i++) {
    const medio = (bajo + alto) / 2;
    if (presionVaporPa({ gas, temperaturaK: medio }) > presionAbsPa) alto = medio;
    else bajo = medio;
    if (alto - bajo < 1e-9) break;
  }
  return (bajo + alto) / 2;
}

// Estado del fluido a (P, T):
//   'gas'                 — bajo la curva de vapor con margen ≥ MARGEN_CONDENSACION_K
//   'cerca-condensacion'  — todavía gas, pero a menos de ese margen del rocío
//   'liquido'             — P ≥ Psat(T) con T < Tc: condensa, el cálculo de gas no aplica
//   'supercritico'        — T ≥ Tc, P ≥ Pc y Tr < TR_ZONA_CRITICA: fluido
//                           denso cerca del punto crítico, donde la densidad
//                           de Peng-Robinson pierde exactitud
// Cualquier otro estado sobre Tc es 'gas' (no condensa a ninguna presión).
export function estadoFase({ gas, presionAbsPa, temperaturaK }) {
  const presionVapor = presionVaporPa({ gas, temperaturaK });
  const tSat = temperaturaSaturacionK({ gas, presionAbsPa });
  const base = { presionVaporPa: presionVapor, temperaturaSaturacionK: tSat };
  if (temperaturaK >= gas.temperaturaCriticaK) {
    const zonaCritica = presionAbsPa >= gas.presionCriticaBar * 1e5
      && temperaturaK < TR_ZONA_CRITICA * gas.temperaturaCriticaK;
    return { ...base, estado: zonaCritica ? 'supercritico' : 'gas' };
  }
  if (presionAbsPa >= presionVapor) return { ...base, estado: 'liquido' };
  const margen = tSat === null ? Infinity : temperaturaK - tSat;
  return { ...base, estado: margen < MARGEN_CONDENSACION_K ? 'cerca-condensacion' : 'gas' };
}

// Densidad a condiciones normales (0 °C, 1 atm), la que convierte kg ↔ Nm³.
// Si a esas condiciones el fluido sería líquido (p. ej. un gas personalizado
// con Tc alta, como el pentano), el "Nm³" es un volumen de gas ideal
// hipotético: se calcula con Z = 1 y se marca `ideal: true` para avisarlo.
export function densidadNormal(gas) {
  const fase = estadoFase({ gas, presionAbsPa: P_NORMAL_PA, temperaturaK: T_NORMAL_K });
  const ideal = fase.estado === 'liquido';
  const z = ideal ? 1 : factorZ({ gas, presionAbsPa: P_NORMAL_PA, temperaturaK: T_NORMAL_K });
  return { z, densidadKgM3: densidadReal({ gas, presionAbsPa: P_NORMAL_PA, temperaturaK: T_NORMAL_K, z }), ideal };
}
