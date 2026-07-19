'use strict';
/* Smoke — vencimiento de facturas. node seed/smoke-vencimiento.js
 *  (A) vencimientoISO (functions/facturas-nucleo.js): día 5 del mes del período, fin del día AR (-03:00). Bordes:
 *      meses de 28/30/31 días (el día 5 siempre existe), período mal formado.
 *  (B) derivación "vencida" + antigüedad (calco del helper del cliente/socio): vencida = emitida && saldo>0 &&
 *      hoy>venceEl; sin venceEl → NO vencida; y el borde "facturar DESPUÉS del 5" (la factura nace vencida). */
const { vencimientoISO, DIA_VENCIMIENTO } = require('../functions/facturas-nucleo');
let ok = 0, fail = 0;
const eq = (l, got, exp) => { const p = JSON.stringify(got) === JSON.stringify(exp); console.log(`${p ? '✓' : '✗ FALLO'} ${l}${p ? '' : `  → ${JSON.stringify(got)} != ${JSON.stringify(exp)}`}`); p ? ok++ : fail++; };
const ms = (iso) => new Date(iso).getTime();

console.log('\n(A) vencimientoISO — día', DIA_VENCIMIENTO, 'del mes del período, fin del día AR');
eq('2026-07 → 05/07 fin del día -03:00', vencimientoISO('2026-07'), '2026-07-05T23:59:59-03:00');
eq('febrero (28 días) → día 5 OK', vencimientoISO('2026-02'), '2026-02-05T23:59:59-03:00');
eq('abril (30 días) → día 5 OK', vencimientoISO('2026-04'), '2026-04-05T23:59:59-03:00');
eq('diciembre (31 días) → día 5 OK', vencimientoISO('2026-12'), '2026-12-05T23:59:59-03:00');
eq('período mal formado → null', vencimientoISO('2026-7'), null);
eq('vacío → null', vencimientoISO(''), null);
// el instante cae el día 5 en hora AR (formateado en AR)
eq('formateado en AR = 5 del mes', new Date(ms(vencimientoISO('2026-07'))).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }), '5/7/2026');

// (B) derivación (mirror del helper cliente): días vencida = floor((hoy - venceEl)/día); vencida si >0.
function diasVencida(venceMs, hoyMs) { if (venceMs == null) return null; return Math.floor((hoyMs - venceMs) / 86400000); }
function esVencida(f, hoyMs) { if (f.estado !== 'emitida' || !(f.saldo > 0)) return false; const v = f.venceEl == null ? null : ms(f.venceEl); if (v == null) return false; return hoyMs > v; }
const V = ms(vencimientoISO('2026-07')); // venceEl del período 2026-07

console.log('\n(B) "vencida" + antigüedad');
eq('el día 5 al mediodía AR → NO vencida (vence a fin del 5)', esVencida({ estado: 'emitida', saldo: 100, venceEl: vencimientoISO('2026-07') }, ms('2026-07-05T12:00:00-03:00')), false);
eq('el día 5 a las 23:00 AR → NO vencida', esVencida({ estado: 'emitida', saldo: 100, venceEl: vencimientoISO('2026-07') }, ms('2026-07-05T23:00:00-03:00')), false);
eq('el día 6 → VENCIDA', esVencida({ estado: 'emitida', saldo: 100, venceEl: vencimientoISO('2026-07') }, ms('2026-07-06T09:00:00-03:00')), true);
eq('emitir el 20 (después del 5) → nace VENCIDA', esVencida({ estado: 'emitida', saldo: 100, venceEl: vencimientoISO('2026-07') }, ms('2026-07-20T10:00:00-03:00')), true);
eq('   …antigüedad = 14 días', diasVencida(V, ms('2026-07-20T10:00:00-03:00')), 14);
eq('pagada → NO vencida (aunque pasó la fecha)', esVencida({ estado: 'pagada', saldo: 0, venceEl: vencimientoISO('2026-07') }, ms('2026-08-01T10:00:00-03:00')), false);
eq('saldo 0 → NO vencida', esVencida({ estado: 'emitida', saldo: 0, venceEl: vencimientoISO('2026-07') }, ms('2026-08-01T10:00:00-03:00')), false);
eq('SIN venceEl (factura vieja) → NO vencida ("sin vencimiento")', esVencida({ estado: 'emitida', saldo: 100, venceEl: null }, ms('2027-01-01T10:00:00-03:00')), false);
eq('antigüedad sin venceEl → null', diasVencida(null, Date.now()), null);
eq('antes del vencimiento → antigüedad negativa (no vencida)', diasVencida(V, ms('2026-07-01T10:00:00-03:00')) < 0, true);

console.log(`\n${fail ? '✗' : '✓'} smoke-vencimiento: ${ok} ok, ${fail} fallo(s)\n`);
process.exit(fail ? 1 : 0);
