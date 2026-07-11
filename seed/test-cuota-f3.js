'use strict';
/*
 * F3 — Tests de la lógica de cuota de la PWA (socio/index.html), sin Firestore.
 * Extrae planPrecioTotal REAL del archivo + replica el conteo de dependientes ACTIVOS por titularSocioId
 * (criterio EXACTO de generarAbonos) para confirmar que la vista y la facturación coinciden.
 *   node seed/test-cuota-f3.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'socio', 'index.html'), 'utf8');
const m = src.match(/function planPrecioTotal\(plan, integrantes\)\{[\s\S]*?\n\}/);
if (!m) throw new Error('no encontré planPrecioTotal en socio/index.html');
const planPrecioTotal = new Function(m[0] + '\n; return planPrecioTotal;')();

// Conteo idéntico a la vista F3 y a generarAbonos: dependientes ACTIVOS con titularSocioId === socioId.
const contarActivos = (deps, socioId) => deps.filter(d => d.titularSocioId === socioId && d.activo !== false).length;

const FIJO = { modeloPrecio: 'fijo', precio: 20000 };
const PORINT = { modeloPrecio: 'por_integrante', precio: 40000, precioExtraIntegrante: 10000, integrantesBase: 1 };

let fails = 0;
const chk = (cond, msg) => { if (!cond) { console.error('  ✗ ' + msg); fails++; } else console.log('  ✓ ' + msg); };

console.log('\n[test-cuota-f3]');

// 1. fijo → siempre el precio, sin importar integrantes
chk(planPrecioTotal(FIJO, 0) === 20000 && planPrecioTotal(FIJO, 5) === 20000, 'fijo → cuota = precio (ignora integrantes)');

// 2. por_integrante, 0 activos → base
chk(planPrecioTotal(PORINT, 0) === 40000, 'por_integrante, 0 activos → base ($40.000)');

// 3. por_integrante, activos == base (1) → base
chk(planPrecioTotal(PORINT, 1) === 40000, 'por_integrante, activos = base → base ($40.000)');

// 4. por_integrante, activos > base → base + (activos-base)*extra
chk(planPrecioTotal(PORINT, 2) === 50000, 'por_integrante, 2 activos → $50.000');
chk(planPrecioTotal(PORINT, 3) === 60000, 'por_integrante, 3 activos → $60.000');

// 5. conteo: solo ACTIVOS por titularSocioId (excluye baja y excluye dependientes de otro socio)
const deps = [
  { titularSocioId: 'sT', activo: true },   // cuenta
  { titularSocioId: 'sT', activo: false },  // baja → NO cuenta
  { titularSocioId: 'sT' },                 // activo ausente = activo → cuenta
  { titularSocioId: 'sOtro', activo: true },// de otro socio → NO cuenta
];
chk(contarActivos(deps, 'sT') === 2, 'conteo activos por titularSocioId = 2 (excluye baja y ajeno)');
chk(planPrecioTotal(PORINT, contarActivos(deps, 'sT')) === 50000, 'cuota con ese conteo (2 activos) → $50.000');

// 6. el caso del fixture: 1 activo + 1 baja → $40.000 (la baja no sube la cuota)
const fx = [{ titularSocioId: 'demo-socio-90002', activo: true }, { titularSocioId: 'demo-socio-90002', activo: false }];
chk(planPrecioTotal(PORINT, contarActivos(fx, 'demo-socio-90002')) === 40000, 'fixture (1 activo + 1 baja) → $40.000 (baja excluida)');

console.log(`\n${fails === 0 ? '✅ TODOS LOS TESTS PASARON' : '❌ ' + fails + ' FALLO(S)'}\n`);
process.exit(fails === 0 ? 0 : 1);
