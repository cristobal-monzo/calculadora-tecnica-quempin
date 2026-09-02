import assert from 'node:assert/strict';
import {
  buscarTuberiaRedGas, caudalBajaPresion, perdidaPresionBajaPresion,
  caudalMediaAltaPresion, perdidaPresionMediaAltaPresion, factorZPengRobinson,
  TABLA_TUBERIA_RED_GAS,
} from '../js/pipe-network.js';

function cerca(actual, esperado, tolerancia = 1e-6) {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia * Math.max(1, Math.abs(esperado)),
    `esperado ${esperado}, obtuvo ${actual}`
  );
}

// Fixture: Libro11111111.xlsx, hoja "Bases de Cálculo", caso por defecto
// (B5=H2, B6="<10 kPa", B7="Acero Sch40", B11=1"), 2026-09-01.
// La fórmula es gas-agnóstica (Renouard baja presión); se verifica con
// este caso porque es el único cacheado en el Excel fuente.
const tuberia1in = buscarTuberiaRedGas(1);
assert.equal(tuberia1in.diAceroMm, 26.64);
assert.equal(tuberia1in.d5Acero, 10100000);
assert.equal(tuberia1in.k, 1800);

const caudal = caudalBajaPresion({
  k: 1800, diametro5: 10100000, perdidaPresionPa: 63.39954095917689,
  densidadRelativa: 0.069, longitudM: 7,
});
cerca(caudal, 20.00000004618117); // B20

const perdidaInvertida = perdidaPresionBajaPresion({
  k: 1800, diametro5: 10100000, caudalM3H: caudal, densidadRelativa: 0.069, longitudM: 7,
});
cerca(perdidaInvertida, 63.39954095917689); // round-trip: recupera el ΔP original

// Rama >10kPa: sin caso cacheado en el Excel (B6 por defecto es "<10 kPa"),
// se verifica autoconsistencia algebraica: invertir el caudal calculado
// debe devolver exactamente el ΔP de entrada.
const paramsAltaPresion = { diametroMm: 52.5, presionInicialPa: 200000, factorSuperexp: 1.02, factorCr: 0.045, longitudM: 15 };
const caudalAlta = caudalMediaAltaPresion({ ...paramsAltaPresion, perdidaPresionPa: 5000 });
const perdidaAltaInvertida = perdidaPresionMediaAltaPresion({ ...paramsAltaPresion, caudalM3H: caudalAlta });
cerca(perdidaAltaInvertida, 5000);

// Fixtures: Bases de Cálculo!R40 (GLP) y R41 (GN), presión inicial B8=1000 Pa -> M40=0.01 bar
cerca(
  factorZPengRobinson({ presionBarG: 0.01, temperaturaCriticaK: 397.45, presionCriticaBar: 40.23, factorAcentrico: 0.176 }),
  0.9997779878016306
); // R40 (GLP)
cerca(
  factorZPengRobinson({ presionBarG: 0.01, temperaturaCriticaK: 190.6, presionCriticaBar: 45.99, factorAcentrico: 0.011 }),
  0.9999765036980676
); // R41 (GN)

// Filas agregadas (2026-09-02, "listado más amplio de tuberías", no
// vienen del Excel — ver comentario en TABLA_TUBERIA_RED_GAS): 1/8", 5",
// 6", 8". Se verifica que el DI (de ASME B36.10 / ASTM B88) crece
// monótonamente con la pulgada nominal en toda la tabla, y que para estas
// filas nuevas específicamente d5 SÍ es DI^5 exacto (a diferencia de las
// filas del Excel, donde d5 viene de otra tabla y NO es DI^5).
for (let i = 1; i < TABLA_TUBERIA_RED_GAS.length; i++) {
  assert.ok(TABLA_TUBERIA_RED_GAS[i].diAceroMm > TABLA_TUBERIA_RED_GAS[i - 1].diAceroMm,
    `DI acero debe crecer con la pulgada: fila ${i}`);
  assert.ok(TABLA_TUBERIA_RED_GAS[i].diCobreMm > TABLA_TUBERIA_RED_GAS[i - 1].diCobreMm,
    `DI cobre debe crecer con la pulgada: fila ${i}`);
}
['0.125', '5', '6', '8'].forEach((p) => {
  const fila = buscarTuberiaRedGas(Number(p));
  cerca(fila.d5Acero, fila.diAceroMm ** 5, 1e-4);
  cerca(fila.d5Cobre, fila.diCobreMm ** 5, 1e-4);
});

console.log('pipe-network.test.js: OK');
