'use strict';
/* Smoke de RENDER (lección F-3): EJECUTA las vistas nuevas del cobro a empresa con fixtures.
 *  - cobEmpCuentaView: cuenta corriente (facturas pend/pagadas + vencimiento, pagos, saldo consolidado, Registrar pago).
 *  - cobReciboView: recibo imprimible A NOMBRE DE LA EMPRESA (razón social) + leyenda no-fiscal + "Recibo de pago".
 * node seed/smoke-render-empresa-cobro.js */
const vm = require('vm');
const { lines, fn, fns } = require('./lib/extract'); // extracción POR NOMBRE (robusta a mover código)
const L = lines('app/index.html');
let ok = 0, fail = 0;
const has = (l, s, n) => { const p = typeof s === 'string' && s.includes(n); console.log(`${p ? '✓' : '✗ FALLO'} ${l}`); p ? ok++ : fail++; };
const noThrow = (l, fn) => { try { const r = fn(); ok++; console.log('✓ ' + l); return r; } catch (e) { fail++; console.log('✗ FALLO ' + l + ' → ' + e.message); return null; } };

// helpers reales usados por las vistas
const helpers = fns(L, ['cobFechaRecibo', 'cobMedioLbl', 'periodoLbl2']);
const cobEmp = fn(L, 'cobEmpCuentaView');
const cobRec = fn(L, 'cobReciboView');

const stubs = `
  function esc(s){ return String(s==null?'':s); }
  function facMoney(n){ return '$'+(Number(n)||0); }
  function facEstBadge(e){ return '['+e+']'; }
  function facVencChip(f){ return f.venceEl ? '<venc>' : '<sinvenc>'; }
  function cobPagadoDe(fid){ return (S.cob.pagos||[]).filter(p=>p.facturaId===fid && p.estado==='registrado').reduce((s,p)=>s+(Number(p.monto)||0),0); }
`;
const run = (fnCall, cob) => vm.runInNewContext(`var S={cob:${JSON.stringify(cob)}};` + stubs + helpers + cobEmp + cobRec + `\n; (${fnCall});`, {});

console.log('\n— cobEmpCuentaView: cuenta corriente de la empresa —');
{
  const cob = { empVer: 'E1', facturas: [
    { id: 'f1', clienteTipo: 'empresa', clienteId: 'E1', clienteNombre: 'DEMO Convenios SA', nroComprobante: 'FC-2026-000022', periodo: '2026-07', total: 80000, estado: 'emitida', venceEl: { seconds: 111 } },
    { id: 'f2', clienteTipo: 'empresa', clienteId: 'E1', clienteNombre: 'DEMO Convenios SA', nroComprobante: 'FC-2026-000010', periodo: '2026-06', total: 80000, estado: 'pagada' },
    { id: 'fx', clienteTipo: 'empresa', clienteId: 'OTRA', nroComprobante: 'FC-9', periodo: '2026-07', total: 5000, estado: 'emitida' },
  ], pagos: [
    { id: 'p1', facturaId: 'f1', reciboNro: 'RC-2026-000030', fecha: '2026-07-10', medio: 'transferencia', monto: 30000, estado: 'registrado' },
    { id: 'p2', facturaId: 'f2', reciboNro: 'RC-2026-000020', fecha: '2026-06-08', medio: 'transferencia', monto: 80000, estado: 'registrado' },
    { id: 'pan', facturaId: 'f1', reciboNro: 'RC-2026-000031', fecha: '2026-07-09', medio: 'efectivo', monto: 10000, estado: 'anulado' },
  ] };
  const out = noThrow('ejecuta sin throw', () => run('cobEmpCuentaView()', cob));
  has('razón social en el header', out, 'DEMO Convenios SA');
  has('factura pendiente (FC-…022)', out, 'FC-2026-000022');
  has('factura pagada (FC-…010)', out, 'FC-2026-000010');
  has('NO mezcla la empresa OTRA (FC-9)', String(!out.includes('FC-9')), 'true');
  has('saldo consolidado = 50000 (80000-30000, la pagada no suma)', out, '$50000');
  has('botón Registrar pago en la pendiente', out, 'cobVerFactura(\'f1\')');
  has('pago registrado con Ver recibo', out, 'cobVerReciboEmpresa(\'p1\')');
  has('pago anulado marcado (sin recibo)', out, 'anulado');
  has('fecha del pago en DD/MM/AAAA', out, '10/07/2026');
}

console.log('\n— cobReciboView: recibo a nombre de la empresa —');
{
  const cob = { recibo: { pago: { reciboNro: 'RC-2026-000030', fecha: '2026-07-10', medio: 'transferencia', monto: 30000, estado: 'registrado' }, factura: { clienteTipo: 'empresa', clienteNombre: 'DEMO Convenios SA', nroComprobante: 'FC-2026-000022', periodo: '2026-07' } } };
  const out = noThrow('ejecuta sin throw', () => run('cobReciboView()', cob));
  has('rotula "Recibo de pago" (no factura)', out, 'Recibo de pago');
  has('a nombre de la RAZÓN SOCIAL', out, 'DEMO Convenios SA');
  has('marca "Empresa"', out, 'Empresa');
  has('nº de recibo', out, 'RC-2026-000030');
  has('monto', out, '$30000');
  has('medio "Transferencia"', out, 'Transferencia');
  has('leyenda NO fiscal', out, 'no válido como factura fiscal');
  has('botón imprimir', out, 'window.print()');
}

console.log(`\n${fail ? '✗' : '✓'} smoke-render-empresa-cobro: ${ok} ok, ${fail} fallo(s)\n`);
process.exit(fail ? 1 : 0);
