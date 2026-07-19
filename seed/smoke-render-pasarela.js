'use strict';
/* Smoke de RENDER (lección F-3): EJECUTA las vistas de la pasarela con fixtures.
 *  - comprobanteDetalle: muestra "Pagar online" SOLO en comprobante 'emitida'.
 *  - pagoSimView: pantalla del simulador en sus 3 estados (pendiente/procesando/pagado). */
const fs = require('fs'), vm = require('vm'), path = require('path');
const L = fs.readFileSync(path.join(__dirname, '..', 'socio', 'index.html'), 'utf8').split('\n');
const slice = (a, b) => L.slice(a - 1, b).join('\n');
let ok = 0, fail = 0;
const has = (l, s, n) => { const p = typeof s === 'string' && s.includes(n); console.log(`${p ? '✓' : '✗ FALLO'} ${l}`); p ? ok++ : fail++; };
const noThrow = (l, fn) => { try { const r = fn(); ok++; console.log('✓ ' + l); return r; } catch (e) { fail++; console.log('✗ FALLO ' + l + ' → ' + e.message); return null; } };

const stubs = `
  function esc(s){ return String(s==null?'':s); }
  function socioMoney(n){ return '$'+(Number(n)||0); }
  function chv(){ return ''; }
`;
const comprobanteDetalle = slice(701, 713);
const pagoSimView = slice(742, 758);

console.log('\n— comprobanteDetalle: botón Pagar online —');
{
  const run = (estado) => vm.runInNewContext(stubs + comprobanteDetalle + `; comprobanteDetalle({ estado:'${estado}', total:5000, items:[] });`, {});
  const emit = noThrow('ejecuta (emitida)', () => run('emitida'));
  has('emitida → muestra "Pagar online"', emit, 'Pagar online');
  has('emitida → engancha pagarOnline', emit, 'pagarOnline(');
  const pag = noThrow('ejecuta (pagada)', () => run('pagada'));
  has('pagada → SIN botón de pago', String(!String(pag).includes('Pagar online')), 'true');
}

console.log('\n— pagoSimView: simulador —');
{
  const run = (pagoSim) => vm.runInNewContext(stubs + `var S=${JSON.stringify({ pagoSim })};` + pagoSimView + '; pagoSimView();', {});
  const pend = noThrow('ejecuta (pendiente)', () => run({ intentId: 'i1', monto: 5000, nro: 'FC-1', estado: 'pendiente', msg: '' }));
  has('pendiente → botón Simular pago aprobado', pend, 'Simular pago aprobado');
  has('pendiente → monto visible', pend, '$5000');
  const proc = noThrow('ejecuta (procesando)', () => run({ intentId: 'i1', monto: 5000, estado: 'procesando', msg: '' }));
  has('procesando → "Procesando…"', proc, 'Procesando');
  const done = noThrow('ejecuta (pagado)', () => run({ intentId: 'i1', monto: 5000, estado: 'pagado', msg: '' }));
  has('pagado → "Pago acreditado"', done, 'Pago acreditado');
  const err = noThrow('ejecuta (con msg de error)', () => run({ intentId: 'i1', monto: 5000, estado: 'pendiente', msg: 'No se pudo confirmar el pago.' }));
  has('error → muestra el mensaje', err, 'No se pudo confirmar el pago.');
}

console.log(`\n${fail ? '✗' : '✓'} smoke-render-pasarela: ${ok} ok, ${fail} fallo(s)\n`);
process.exit(fail ? 1 : 0);
