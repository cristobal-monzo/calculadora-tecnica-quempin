// Funciones puras de mecánica de fluidos, gas-agnósticas. Copiadas (no
// importadas — cada módulo es autocontenido, ver CLAUDE.md raíz) de
// Hidrogeno/js/physics.js, que ya las tiene auditadas y con tests: Reynolds,
// rugosidad relativa y Haaland corregidos (2026-09-02), Darcy-Weisbach y el
// screening de flujo sónico (2026-09-08). Dos diferencias deliberadas,
// documentadas en OtrosGases/CLAUDE.md:
//   - presionMaximaDiseno() recibe el diámetro EXTERIOR (Barlow según ASME);
//   - velocidadErosional() usa la forma general de API RP 14E, C/√ρ.

// Atmósfera estándar (1,01325 bar) para pasar de manométrica a absoluta —
// Hidrógeno usa 1 bar redondo por herencia de su Excel fuente; acá no hay
// Excel que respetar y el Nm³ ya se define a 1 atm (termo.js).
export const P_ATMOSFERICA_PA = 101325;

export function barGaugeAPaAbs(bar) {
  return bar * 1e5 + P_ATMOSFERICA_PA;
}

export function reynolds({ densidad, velocidad, diametroM, viscosidad }) {
  return (densidad * velocidad * diametroM) / viscosidad;
}

export function rugosidadRelativa({ rugosidadMm, diametroM }) {
  return rugosidadMm / (diametroM * 1000);
}

// Haaland (1983): 1/√f = −1,8·log10[(ε/D/3,7)^1,11 + 6,9/Re]
export function factorFriccionHaaland({ rugosidadRelativa: rr, reynolds: re }) {
  const termino = -1.8 * Math.log10(Math.pow(rr / 3.7, 1.11) + 6.9 / re);
  return 1 / Math.pow(termino, 2);
}

// Darcy-Weisbach con pérdidas locales: ΔP = (f·L/D + ΣK)·ρv²/2 → mbar
export function perdidaCargaTramo({ factorFriccion, longitudM, diametroM, densidad, velocidad, sumaCoeficientesLocales = 0 }) {
  const terminoFriccion = (factorFriccion * longitudM) / diametroM + sumaCoeficientesLocales;
  const presionDinamicaPa = (densidad * Math.pow(velocidad, 2)) / 2;
  return (terminoFriccion * presionDinamicaPa) / 100; // Pa -> mbar
}

// Coeficientes K de accesorios — los mismos de Hidrógeno (Calculos H2.xlsx,
// Cálculo!C16: codo 0,7 · tee 2 · válvula 0,1).
export const K_ACCESORIOS = { codo: 0.7, tee: 2, valvula: 0.1 };

// Barlow: P = 2·S·t·F·E·T / D, con D = diámetro EXTERIOR nominal (así lo
// definen ASME B31.8 §841.1.1 y B31.12 PL-3.7.1). S y t en MPa y mm, D en
// mm → MPa; ×10 → bar.
export function presionMaximaDiseno({ limiteElasticoMPa, espesorMm, diametroExteriorMm, factorDiseno, factorUnion = 1, factorT = 1 }) {
  return 10 * ((2 * limiteElasticoMPa * espesorMm) / diametroExteriorMm) * factorDiseno * factorUnion * factorT;
}

// Factor de derating por temperatura T para tubería de acero — misma tabla
// en ASME B31.8 (Tabla 841.1.8-1) y B31.12 (Tabla PL-3.7.1(b)(8), la que ya
// usa Hidrogeno/js/gas-h2.js). Interpolación lineal, saturada en los extremos.
export const TABLA_FACTOR_TEMPERATURA_T = [
  { tempF: 250, factor: 1.000 },
  { tempF: 300, factor: 0.967 },
  { tempF: 350, factor: 0.933 },
  { tempF: 400, factor: 0.900 },
  { tempF: 450, factor: 0.867 },
];

export function factorT({ temperaturaC }) {
  const tempF = temperaturaC * 9 / 5 + 32;
  const tabla = TABLA_FACTOR_TEMPERATURA_T;
  const ultimo = tabla.length - 1;
  if (tempF <= tabla[0].tempF) return tabla[0].factor;
  if (tempF >= tabla[ultimo].tempF) return tabla[ultimo].factor;
  for (let i = 0; i < ultimo; i++) {
    if (tempF >= tabla[i].tempF && tempF <= tabla[i + 1].tempF) {
      const t = (tempF - tabla[i].tempF) / (tabla[i + 1].tempF - tabla[i].tempF);
      return tabla[i].factor + t * (tabla[i + 1].factor - tabla[i].factor);
    }
  }
}

// Velocidad erosional — API RP 14E, Ve = C/√ρ (ft/s, ρ en lb/ft³),
// C = 100 para servicio continuo. Es la misma fórmula que usa Hidrógeno,
// que la escribe desarrollada para un gas ideal corregido por Z
// (100·√(Z·10,73·T/(29·SG·P))), ya que ρ[lb/ft³] = 29·SG·P/(Z·10,73·T).
// Acá se usa la densidad real que ya calculó Peng-Robinson.
const LB_FT3_POR_KG_M3 = 0.0624279606;
export function velocidadErosional({ densidadKgM3, c = 100 }) {
  return 0.3048 * c / Math.sqrt(densidadKgM3 * LB_FT3_POR_KG_M3);
}

// Screening de caída de presión / proximidad a flujo sónico — idéntico al
// de Hidrogeno/js/physics.js (ver su comentario completo y
// Hidrogeno/CLAUDE.md), con γ del gas elegido en vez de 1,40 fijo.
//   x = (P1 − P2)/P1 ; (P2/P1)crít = (2/(γ+1))^(γ/(γ−1))   [gas ideal]
// ok si x ≤ 0,10 · advertencia si x < 1 − (P2/P1)crít · crítico si no.
export function chequeoCaidaPresion({ presionAguasArribaAbs, presionAguasAbajoAbs, gamma }) {
  const relacionPresionCritica = Math.pow(2 / (gamma + 1), gamma / (gamma - 1));
  const caidaPresionCritica = 1 - relacionPresionCritica;

  const aplica = Number.isFinite(presionAguasArribaAbs) && Number.isFinite(presionAguasAbajoAbs)
    && presionAguasArribaAbs > 0 && presionAguasAbajoAbs >= 0
    && presionAguasAbajoAbs <= presionAguasArribaAbs;

  if (!aplica) {
    return {
      aplica: false, estado: 'no-aplica',
      x: null, caidaPresionPorcentaje: null, relacionPresion: null,
      relacionPresionCritica, caidaPresionCritica,
    };
  }

  const x = (presionAguasArribaAbs - presionAguasAbajoAbs) / presionAguasArribaAbs;
  const relacionPresion = presionAguasAbajoAbs / presionAguasArribaAbs;
  let estado;
  if (x <= 0.10) estado = 'ok';
  else if (x < caidaPresionCritica) estado = 'advertencia';
  else estado = 'critico';

  return {
    aplica: true, estado,
    x, caidaPresionPorcentaje: x * 100, relacionPresion,
    relacionPresionCritica, caidaPresionCritica,
  };
}
