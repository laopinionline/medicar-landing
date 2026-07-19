'use strict';
/* Smoke — PASARELA de pago. node seed/smoke-pasarela.js
 *  (A) adaptador (functions/pasarela-adapter.js): crearPreferencia + verificarWebhook, rama SIM (completa) y real (stub).
 *  (B) IDEMPOTENCIA del webhook: confirmarPagoIntent (mediado por intenciones_pago) simulado en memoria — DOS entregas
 *      del mismo intentId = UN solo pago. Calca la lógica de la tx real (si el intento ya está 'pagado' → devuelve el
 *      pagoId existente, no crea otro). */
const { crearPreferencia, verificarWebhook } = require('../functions/pasarela-adapter');

let ok = 0, fail = 0;
const eq = (l, got, exp) => { const p = JSON.stringify(got) === JSON.stringify(exp); console.log(`${p ? '✓' : '✗ FALLO'} ${l}${p ? '' : `  → ${JSON.stringify(got)} != ${JSON.stringify(exp)}`}`); p ? ok++ : fail++; };
const chk = (l, c, e) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}${c ? '' : (e ? '  → ' + e : '')}`); c ? ok++ : fail++; };

(async () => {
  console.log('\n(A) adaptador');
  const pref = await crearPreferencia('simulado', { intentId: 'i1', monto: 5000, descripcion: 'x', personaId: 'p' });
  eq('SIM crearPreferencia devuelve preferenciaId + initPoint', pref, { preferenciaId: 'SIM-i1', initPoint: 'sim://i1' });
  let threw = false; try { await crearPreferencia('mercadopago', { intentId: 'i1' }); } catch (_) { threw = true; }
  chk('real crearPreferencia (sin impl) → throw (stub Xavi)', threw);
  eq('SIM verificarWebhook válido con intentId', verificarWebhook('simulado', { body: { intentId: 'i1', estado: 'pagado' } }), { valido: true, intentId: 'i1', estado: 'pagado' });
  eq('SIM verificarWebhook sin intentId → inválido', verificarWebhook('simulado', { body: {} }), { valido: false, intentId: null, estado: 'pagado' });
  eq('SIM lee intentId anidado (data.intentId)', verificarWebhook('simulado', { body: { data: { intentId: 'i9' } } }), { valido: true, intentId: 'i9', estado: 'pagado' });
  eq('real verificarWebhook → inválido (stub, NO confía en el body)', verificarWebhook('mercadopago', { body: { intentId: 'i1', estado: 'pagado' } }), { valido: false, intentId: null, estado: null });

  // (B) idempotencia — calca la tx confirmarPagoIntent mediada por el intento
  function confirmarPagoIntent(db, intentId, fuente) {
    const intent = db.intenciones[intentId];
    if (!intent) throw new Error('not-found');
    if (intent.estado === 'pagado') return { yaPagado: true, pagoId: intent.pagoId };  // ← IDEMPOTENCIA
    const pagoId = 'pago_' + (++db.seq);
    db.pagos[pagoId] = { facturaId: intent.facturaId, personaId: intent.personaId, monto: intent.monto, medio: 'pasarela', estado: 'registrado' };
    const f = db.facturas[intent.facturaId]; if (f && f.estado === 'emitida') f.estado = 'pagada';
    intent.estado = 'pagado'; intent.pagoId = pagoId; intent.fuente = fuente;
    return { yaPagado: false, pagoId };
  }
  const nuevoDB = () => ({ seq: 0, pagos: {}, facturas: { fA: { estado: 'emitida', total: 5000 } }, intenciones: { iX: { facturaId: 'fA', personaId: 'pA', monto: 5000, estado: 'pendiente' } } });

  console.log('\n(B) idempotencia del webhook — dos entregas del mismo intentId = un pago');
  {
    const db = nuevoDB();
    const r1 = confirmarPagoIntent(db, 'iX', 'webhook');
    const r2 = confirmarPagoIntent(db, 'iX', 'webhook');  // segunda entrega (reintento del proveedor)
    chk('1ª entrega crea el pago', r1.yaPagado === false && !!r1.pagoId);
    chk('2ª entrega NO crea otro (yaPagado)', r2.yaPagado === true && r2.pagoId === r1.pagoId);
    eq('un solo pago en la base', Object.keys(db.pagos).length, 1);
    eq('factura quedó pagada', db.facturas.fA.estado, 'pagada');
  }
  console.log('\n(B) triple entrega (webhook + simulador + webhook) — sigue siendo un pago');
  {
    const db = nuevoDB();
    confirmarPagoIntent(db, 'iX', 'webhook');
    confirmarPagoIntent(db, 'iX', 'simulado');
    confirmarPagoIntent(db, 'iX', 'webhook');
    eq('un solo pago pese a 3 confirmaciones', Object.keys(db.pagos).length, 1);
  }
  console.log('\n(B) el monto del pago = saldo del intento (v1: saldo completo)');
  {
    const db = nuevoDB();
    const r = confirmarPagoIntent(db, 'iX', 'webhook');
    eq('monto del pago = 5000', db.pagos[r.pagoId].monto, 5000);
    eq('medio pasarela', db.pagos[r.pagoId].medio, 'pasarela');
  }

  console.log(`\n${fail ? '✗' : '✓'} smoke-pasarela: ${ok} ok, ${fail} fallo(s)\n`);
  process.exit(fail ? 1 : 0);
})();
