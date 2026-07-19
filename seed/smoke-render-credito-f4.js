'use strict';
/* Smoke de RENDER (lección F-3): EJECUTA las vistas nuevas de Fase 4 con fixtures (no solo compila).
 *  - cobCreditoView (panel): socios con saldo != 0 → a favor (verde + Reintegrar) / deuda (rojo, sin botón).
 *  - movimientosCredito (socio): lista origen/consumo/reintegro/origen-revertido con el tono correcto.
 * node seed/smoke-render-credito-f4.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const appLines = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8').split('\n');
const socLines = fs.readFileSync(path.join(__dirname, '..', 'socio', 'index.html'), 'utf8').split('\n');
const slice = (arr, a, b) => arr.slice(a - 1, b).join('\n');

let ok = 0, fail = 0;
const has = (label, str, needle) => { const p = typeof str === 'string' && str.includes(needle); console.log(`${p ? '✓' : '✗ FALLO'} ${label}`); p ? ok++ : fail++; };
const noThrow = (label, fn) => { try { const r = fn(); ok++; console.log('✓ ' + label); return r; } catch (e) { fail++; console.log('✗ FALLO ' + label + ' → ' + e.message); return null; } };

// ---------- cobCreditoView (app) ----------
const stubsApp = `
  const S = { cob: { saldos: __SALDOS__, facturas: __FACT__ } };
  function esc(s){ return String(s==null?'':s); }
  function facMoney(n){ return '$'+(Number(n)||0); }
  function puedeCobrar(){ return true; }
`;
const cobCredito = slice(appLines, 4986, 5002); // function cobCreditoView(){...}
function runCob(saldos, fact) {
  const src = stubsApp.replace('__SALDOS__', JSON.stringify(saldos)).replace('__FACT__', JSON.stringify(fact)) + '\n' + cobCredito + '\n; cobCreditoView();';
  return vm.runInNewContext(src, {});
}

console.log('\n— cobCreditoView (panel admin) —');
{
  const fact = [{ id: 'f1', personaId: 'pA', nombre: 'Pérez, Ana' }, { id: 'f2', personaId: 'pB', nombre: 'López, Beto' }];
  const saldos = [{ id: 'pA', saldo: 5000 }, { id: 'pB', saldo: -3000 }, { id: 'pC', saldo: 0 }];
  const out = noThrow('ejecuta sin throw (mixto favor/deuda/cero)', () => runCob(saldos, fact));
  has('muestra el nombre a favor', out, 'Pérez, Ana');
  has('botón Reintegrar en el saldo a favor', out, 'Reintegrar');
  has('etiqueta deuda para el negativo', out, 'deuda');
  has('nombre del deudor', out, 'López, Beto');
  has('NO ofrece Reintegrar dos veces (solo el a favor)', String(out.split('Reintegrar').length === 2), 'true');
}
{
  const out = noThrow('ejecuta sin throw (sin saldos)', () => runCob([], []));
  has('empty-state', out, 'Ningún socio');
}
{
  const out = noThrow('ejecuta sin throw (saldos aún cargando = null)', () => runCob(null, []));
  has('muestra "Cargando…"', out, 'Cargando');
}

// ---------- movimientosCredito (socio) ----------
const stubsSoc = `
  function esc(s){ return String(s==null?'':s); }
  function socioMoney(n){ return '$'+(Number(n)||0); }
`;
const movCred = slice(socLines, 663, 677); // function movimientosCredito(movs){...}
function runMov(movs) { return vm.runInNewContext(stubsSoc + '\n' + movCred + '\n; movimientosCredito(' + JSON.stringify(movs) + ');', {}); }

console.log('\n— movimientosCredito (socio) —');
{
  const movs = [
    { tipo: 'origen', monto: 5000, estado: 'activo' },
    { tipo: 'consumo', monto: 3000, estado: 'activo', motivo: 'aplicado a FC-2026-000011' },
    { tipo: 'reintegro', monto: 1000, estado: 'activo', motivo: 'baja del socio' },
    { tipo: 'origen', monto: 2000, estado: 'revertido' },
  ];
  const out = noThrow('ejecuta sin throw (4 tipos)', () => runMov(movs));
  has('crédito por pago de más', out, 'Crédito por pago de más');
  has('consumo con nº de comprobante', out, 'aplicado a FC-2026-000011');
  has('reintegro con motivo', out, 'Reintegro · baja del socio');
  has('origen revertido tachado', out, 'line-through');
  has('contador de movimientos', out, 'Ver movimientos (4)');
}
{
  const out = noThrow('sin movimientos → string vacío', () => runMov([]));
  has('vacío no rompe', String(out === ''), 'true');
}

console.log(`\n${fail ? '✗' : '✓'} smoke-render-credito-f4: ${ok} ok, ${fail} fallo(s)\n`);
process.exit(fail ? 1 : 0);
