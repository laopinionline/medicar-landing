'use strict';
/*
 * F4 — Tests de la lógica del historial de abonos (socio/index.html), sin Firestore.
 * Extrae periodoLbl + abonoEstado REALES + replica el orden desc / cap 12 / empty-state de homeView.
 *   node seed/test-historial-f4.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'socio', 'index.html'), 'utf8');
const grab = (name, re) => { const m = src.match(re); if (!m) throw new Error('no encontré ' + name); return m[0]; };
const periodoLbl = new Function(grab('periodoLbl', /function periodoLbl\(p\)\{[\s\S]*?\n\}/) + '\n; return periodoLbl;')();
const abonoEstado = new Function(grab('abonoEstado', /function abonoEstado\(a\)\{[^\n]*\}/) + '\n; return abonoEstado;')();

// Réplica del pipeline de homeView: orden período desc + cap 12.
const CAP = 12;
const pipeline = (abonos) => abonos.slice().sort((a, b) => String(b.periodo || '').localeCompare(String(a.periodo || ''))).slice(0, CAP);

let fails = 0;
const chk = (cond, msg) => { if (!cond) { console.error('  ✗ ' + msg); fails++; } else console.log('  ✓ ' + msg); };

console.log('\n[test-historial-f4]');

// 1. periodoLbl
chk(periodoLbl('2026-07') === 'Julio 2026', 'periodoLbl "2026-07" → "Julio 2026"');
chk(periodoLbl('2099-01') === 'Enero 2099' && periodoLbl('2099-12') === 'Diciembre 2099', 'periodoLbl bordes (Enero/Diciembre)');
chk(periodoLbl('cualquiera') === 'cualquiera' && periodoLbl('') === '—', 'periodoLbl formato inválido → crudo / vacío → —');

// 2. abonoEstado — facturado se deriva de facturaId, no de estado
chk(abonoEstado({ estado: 'generado' }) === 'emitido', 'estado generado sin facturaId → emitido');
chk(abonoEstado({ estado: 'generado', facturaId: 'F1' }) === 'facturado', 'facturaId presente → facturado');
chk(abonoEstado({ estado: 'anulado', facturaId: 'F1' }) === 'anulado', 'anulado gana aunque tenga facturaId');

// 3. orden período desc
const ords = pipeline([{ periodo: '2099-01' }, { periodo: '2099-03' }, { periodo: '2099-02' }]).map(a => a.periodo);
chk(JSON.stringify(ords) === JSON.stringify(['2099-03', '2099-02', '2099-01']), 'orden período descendente');

// 4. cap 12
const muchos = Array.from({ length: 15 }, (_, i) => ({ periodo: '20' + String(10 + i).padStart(2, '0') + '-01' }));
const capd = pipeline(muchos);
chk(capd.length === 12 && capd[0].periodo === '2024-01', 'cap 12 (15 abonos → 12, el más reciente primero)');
chk(muchos.length > CAP, 'con >12 se muestra la nota "últimas 12" (length > CAP)');

// 5. empty-state
chk(pipeline([]).length === 0, 'sin abonos → lista vacía (empty-state)');

// 6. caso demo (fixture F4): 3 estados en 3 períodos
const demo = [
  { periodo: '2099-03', estado: 'generado' },                         // emitido
  { periodo: '2099-02', estado: 'generado', facturaId: 'demo-f' },    // facturado
  { periodo: '2099-01', estado: 'anulado' },                          // anulado
];
const orden = pipeline(demo);
chk(orden.map(a => periodoLbl(a.periodo)).join(' > ') === 'Marzo 2099 > Febrero 2099 > Enero 2099', 'demo: orden Marzo>Febrero>Enero');
chk(orden.map(abonoEstado).join(',') === 'emitido,facturado,anulado', 'demo: estados emitido/facturado/anulado');

console.log(`\n${fails === 0 ? '✅ TODOS LOS TESTS PASARON' : '❌ ' + fails + ' FALLO(S)'}\n`);
process.exit(fails === 0 ? 0 : 1);
