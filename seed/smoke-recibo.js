'use strict';
/* Smoke — recibo del pago para el socio.
 *  (A) whitelist de la CF (functions/recibo.js): reciboPublico NO filtra… digo, NO EXPONE nota/registradoPor/etc.
 *  (B) render: recibosComprobante muestra solo pagos REGISTRADOS (anulados fuera) y reciboView imprimible con la
 *      leyenda no-fiscal, ejecutados con fixtures. node seed/smoke-recibo.js */
const vm = require('vm');
const { lines, range } = require('./lib/extract'); // extracción POR NOMBRE (robusta a mover código)
const { reciboPublico } = require('../functions/recibo');
const L = lines('socio/index.html');

let ok = 0, fail = 0;
const chk = (l, c, e) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}${c ? '' : (e ? '  → ' + e : '')}`); c ? ok++ : fail++; };

console.log('\n(A) reciboPublico — campos limpios (oculta lo interno)');
const pagoCrudo = { id: 'p1', reciboNro: 'RC-2026-000012', monto: 13456, fecha: '2026-07-19', medio: 'pasarela', facturaId: 'fA', estado: 'registrado',
  nota: 'ojo: cobró tarde, hablar con el titular', registradoPor: 'uid-empleado-123', registradoEn: 111, pagadorId: 'pA', pagadorTipo: 'persona', motivoAnulacion: null };
const limpio = reciboPublico(pagoCrudo);
chk('expone reciboNro/monto/fecha/medio/facturaId/estado', ['reciboNro', 'monto', 'fecha', 'medio', 'facturaId', 'estado'].every(k => k in limpio));
chk('NO expone nota (texto interno)', !('nota' in limpio));
chk('NO expone registradoPor (uid empleado)', !('registradoPor' in limpio));
chk('NO expone registradoEn / pagadorId / motivoAnulacion', !('registradoEn' in limpio) && !('pagadorId' in limpio) && !('motivoAnulacion' in limpio));
chk('exactamente 6 claves', Object.keys(limpio).length === 6, Object.keys(limpio).join(','));
chk('valores correctos', limpio.reciboNro === 'RC-2026-000012' && limpio.monto === 13456 && limpio.medio === 'pasarela');

// (B) render — slice del bloque de helpers del recibo (medioLabel..reciboView)
const bloque = range(L, 'medioLabel', 'reciboView');
const stubs = `
  function esc(s){ return String(s==null?'':s); }
  function socioMoney(n){ return '$'+(Number(n)||0); }
  function chv(){ return ''; }
  var S = { cred: __CRED__, recibo: __REC__ };
`;
const run = (fn, cred, rec) => vm.runInNewContext(stubs.replace('__CRED__', JSON.stringify(cred || {})).replace('__REC__', JSON.stringify(rec || {})) + '\n' + bloque + `\n; (${fn});`, {});

console.log('\n(B) recibosComprobante — solo pagos registrados (anulados fuera)');
{
  const cred = { pagos: [
    { reciboNro: 'RC-1', monto: 5000, fecha: '2026-07-10', medio: 'efectivo', facturaId: 'fA', estado: 'registrado' },
    { reciboNro: 'RC-ANUL', monto: 5000, fecha: '2026-07-09', medio: 'efectivo', facturaId: 'fA', estado: 'anulado' },
    { reciboNro: 'RC-OTRA', monto: 9000, fecha: '2026-07-11', medio: 'pasarela', facturaId: 'fB', estado: 'registrado' },
  ] };
  const out = run(`recibosComprobante({ id:'fA' })`, cred);
  chk('muestra el recibo válido (RC-1)', out.includes('RC-1'));
  chk('NO muestra el pago ANULADO (RC-ANUL)', !out.includes('RC-ANUL'));
  chk('NO muestra el pago de OTRA factura (RC-OTRA)', !out.includes('RC-OTRA'));
  chk('tiene botón Ver recibo', out.includes('Ver recibo'));
  chk('etiqueta "Pagado el 10/07/2026"', out.includes('Pagado el 10/07/2026'));
  const vacio = run(`recibosComprobante({ id:'fSinPagos' })`, cred);
  chk('factura sin pagos → sin línea', vacio === '');
}

console.log('\n(B) reciboView — imprimible con leyenda no-fiscal');
{
  const rec = { pago: { reciboNro: 'RC-2026-000012', monto: 13456, fecha: '2026-07-19', medio: 'pasarela', estado: 'registrado' }, factura: { nroComprobante: 'FC-2026-000011', nombre: 'Pérez, Ana', numeroAfiliado: '90001', periodo: '2026-07' } };
  const out = run(`reciboView()`, { pagos: [] }, rec);
  chk('rotula "Recibo de pago" (no "factura")', out.includes('Recibo de pago'));
  chk('muestra el nº de recibo', out.includes('RC-2026-000012'));
  chk('muestra el monto', out.includes('$13456'));
  chk('medio "Pago online"', out.includes('Pago online'));
  chk('leyenda NO fiscal', out.includes('no válido como factura fiscal'));
  chk('referencia al comprobante', out.includes('FC-2026-000011'));
  chk('botón imprimir', out.includes('window.print()'));
}

console.log('\n(B) helpers sueltos');
{
  chk('fmtFechaRecibo 2026-07-19 → 19/07/2026', run(`fmtFechaRecibo('2026-07-19')`) === '19/07/2026');
  chk('medioLabel pasarela → Pago online', run(`medioLabel('pasarela')`) === 'Pago online');
}

console.log(`\n${fail ? '✗' : '✓'} smoke-recibo: ${ok} ok, ${fail} fallo(s)\n`);
process.exit(fail ? 1 : 0);
