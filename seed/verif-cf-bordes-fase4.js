'use strict';
/* VERIFICACIÓN EN VIVO — Fase 4 (bordes del crédito). Triggers + CFs REALES desplegadas. Datos SINTÉTICOS (persona
 * test-f4 / test-f4b, NO toca socios reales). 5 casos:
 *  1) anular pago con crédito NO consumido → origen revertido, saldo 0.
 *  2) anular pago con crédito YA consumido → saldo NEGATIVO (permitido).
 *  3) saldo negativo → no se aplica a facturas nuevas (re-confirma Fase 3).
 *  4) reintegro → saldo baja + movimiento con rastro; guards (excede / saldo negativo) rebotan.
 *  5) el socio LEE sus movimientos (data que alimenta el banner + tono deuda).
 * Limpia TODO al final. */
const path = require('path'), admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const FV = () => admin.firestore.FieldValue.serverTimestamp();
const money = (n) => '$' + (Math.round(Number(n) || 0)).toLocaleString('es-AR');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const P1 = '2099-11', P2 = '2099-12';
const PA = 'test-f4', PB = 'test-f4b'; // personaIds sintéticos
const FACTURADOR_UID = '5Yjdq6aoDQXbD1OOgjwYkFxyuJY2';
const API_KEY = 'AIzaSyCXCkuaFC_8qMPAEIUlBoQiv7hBgFDq1iw';
const FN_URL = 'https://southamerica-east1-medicar-sistema.cloudfunctions.net/generarFacturasCF';
const RE_URL = 'https://southamerica-east1-medicar-sistema.cloudfunctions.net/reintegroCF';

let ok = 0, fail = 0;
const chk = (l, c, e) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}${c ? '' : (e ? '  → ' + e : '')}`); c ? ok++ : fail++; };
let TOK = null;
async function idToken() { if (TOK) return TOK; const ct = await admin.auth().createCustomToken(FACTURADOR_UID); const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ct, returnSecureToken: true }) }); const j = await r.json(); TOK = j.idToken; return TOK; }
async function callFn(url, data) { const t = await idToken(); const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ data }) }); return r.json(); }
async function saldo(pid) { const s = await db.collection('creditos_saldo').doc(pid).get(); return s.exists ? (Number(s.data().saldo) || 0) : null; }
async function poll(fn, pred, n = 12) { for (let i = 0; i < n; i++) { await sleep(2000); const v = await fn(); if (pred(v)) return v; } return fn(); }

// crea una factura + un pago que la sobre-paga → derivarCredito genera el origen. Devuelve {facId, pagoId}.
async function overpay(personaId, total, montoPago) {
  const fac = await db.collection('facturas').add({ periodo: P2, personaId, socioId: 't', nombre: 'TEST F4', numeroAfiliado: '0', items: [{ tipo: 'cargo', refId: null, descripcion: 'test', monto: total }], total, estado: 'emitida', emitidaEn: FV(), emitidaPor: 'verif-f4', nroComprobante: 'FC-9999-000000' });
  const pago = await db.collection('pagos').add({ pagadorId: personaId, pagadorTipo: 'persona', facturaId: fac.id, personaId, monto: montoPago, fecha: '2099-12-01', medio: 'transferencia', reciboNro: 'RC-9999-000000', nota: 'verif-f4', estado: 'registrado', registradoEn: FV(), registradoPor: 'verif-f4' });
  return { facId: fac.id, pagoId: pago.id };
}

async function cleanup() {
  for (const P of [P1, P2]) { const fs = await db.collection('facturas').where('periodo', '==', P).get(); for (const d of fs.docs) { await db.collection('creditos').doc('cons_' + d.id).delete().catch(() => {}); await d.ref.delete(); } const abs = await db.collection('abonos').where('periodo', '==', P).get(); for (const d of abs.docs) await d.ref.delete(); }
  for (const pid of [PA, PB]) { const cs = await db.collection('creditos').where('personaId', '==', pid).get(); for (const d of cs.docs) await d.ref.delete(); await db.collection('creditos_saldo').doc(pid).delete().catch(() => {}); }
  const pgs = await db.collection('pagos').where('registradoPor', '==', 'verif-f4').get(); for (const d of pgs.docs) await d.ref.delete();
  await db.collection('socios').doc('test-f4-socioA').delete().catch(() => {});
}

async function seedAbono(personaId, socioId, periodo, total) { return (await db.collection('abonos').add({ periodo, socioId, personaId, socioNombre: 'TEST F4', numeroAfiliado: '0', planId: 'x', planNombre: 'TEST', precioSugerido: total, precioFinal: total, motivoAjuste: null, estado: 'generado', generadoEn: FV(), generadoPor: 'verif-f4' })).id; }

(async () => {
  console.log('=== 0) limpieza previa + socio sintético ===');
  await cleanup();
  await db.collection('socios').doc('test-f4-socioA').set({ personaId: PA, tipoAfiliado: 'individual', activo: true, planId: 'x', nombreVista: 'TEST F4' });
  console.log('  listo (persona sintética', PA, '→ socio test-f4-socioA)');

  console.log('\n=== CASO 1: anular pago con crédito NO consumido → saldo vuelve a 0 ===');
  { const { pagoId } = await overpay(PA, 10000, 15000); // sobrepago 5000
    await poll(() => saldo(PA), (v) => v === 5000);
    chk('crédito generado: saldo 5000', (await saldo(PA)) === 5000, money(await saldo(PA)));
    await db.collection('pagos').doc(pagoId).set({ estado: 'anulado', motivoAnulacion: 'test', anuladoEn: FV(), anuladoPor: 'verif-f4' }, { merge: true });
    await poll(() => saldo(PA), (v) => v === 0);
    chk('tras anular: saldo vuelve a 0', (await saldo(PA)) === 0, money(await saldo(PA)));
    const orig = await db.collection('creditos').doc('orig_' + pagoId).get();
    chk('origen marcado revertido', orig.exists && orig.data().estado === 'revertido');
  }

  console.log('\n=== CASO 2: anular pago con crédito YA consumido → saldo NEGATIVO (permitido) ===');
  let pagoB;
  { const { pagoId } = await overpay(PA, 10000, 15000); pagoB = pagoId; // saldo 0 → +5000
    await poll(() => saldo(PA), (v) => v === 5000);
    chk('saldo repuesto a 5000', (await saldo(PA)) === 5000, money(await saldo(PA)));
    await seedAbono(PA, 'test-f4-socioA', P2, 10000);       // consume vía factura
    const w = await callFn(FN_URL, { periodo: P2, dry: false });
    chk('la CF consumió crédito', (w.result && w.result.creditoAplicado) === 5000, JSON.stringify(w.result));
    chk('saldo consumido a 0', (await saldo(PA)) === 0, money(await saldo(PA)));
    await db.collection('pagos').doc(pagoId).set({ estado: 'anulado', motivoAnulacion: 'test', anuladoEn: FV(), anuladoPor: 'verif-f4' }, { merge: true });
    await poll(() => saldo(PA), (v) => v === -5000);
    chk('tras anular el pago YA consumido: saldo NEGATIVO −5000', (await saldo(PA)) === -5000, money(await saldo(PA)));
    chk('origen (consumido) igual queda revertido', (await db.collection('creditos').doc('orig_' + pagoId).get()).data().estado === 'revertido');
  }

  console.log('\n=== CASO 3: saldo negativo → NO se aplica a facturas nuevas ===');
  { await seedAbono(PA, 'test-f4-socioA', P1, 8000);
    const w = await callFn(FN_URL, { periodo: P1, dry: false });
    chk('la CF NO aplicó crédito (saldo negativo)', (w.result && w.result.creditoAplicado) === 0, JSON.stringify(w.result));
    const f = (await db.collection('facturas').where('periodo', '==', P1).get()).docs.map((d) => d.data()).find((x) => x.personaId === PA);
    chk('factura con total intacto 8000', f && f.total === 8000, f && money(f.total));
    chk('sin ítem de crédito', f && !(f.items || []).some((it) => it.tipo === 'credito'));
    chk('saldo sigue en −5000', (await saldo(PA)) === -5000, money(await saldo(PA)));
  }

  console.log('\n=== CASO 4: reintegro → saldo baja + rastro; guards rebotan ===');
  { await db.collection('creditos_saldo').doc(PB).set({ saldo: 5000, actualizadoEn: FV() }); // persona con saldo a favor
    const bad1 = await callFn(RE_URL, { personaId: PB, monto: 9999, motivo: 'excede' });
    chk('guard: reintegro > saldo → rechazado', !!(bad1.error), bad1.error && bad1.error.status);
    const bad2 = await callFn(RE_URL, { personaId: PA, monto: 100, motivo: 'sobre negativo' });
    chk('guard: reintegro sobre saldo negativo → rechazado', !!(bad2.error));
    const good = await callFn(RE_URL, { personaId: PB, monto: 5000, motivo: 'baja del socio' });
    chk('reintegro OK: saldoNuevo 0', good.result && good.result.saldoNuevo === 0, JSON.stringify(good.result || good.error));
    chk('saldo del socio a 0', (await saldo(PB)) === 0, money(await saldo(PB)));
    const mov = (await db.collection('creditos').where('personaId', '==', PB).get()).docs.map((d) => d.data()).find((m) => m.tipo === 'reintegro');
    chk('movimiento reintegro con motivo (rastro)', !!mov && mov.monto === 5000 && mov.motivo === 'baja del socio');
  }

  console.log('\n=== CASO 5: el socio LEE sus movimientos (data del banner + tono deuda) ===');
  { const movs = (await db.collection('creditos').where('personaId', '==', PA).get()).docs.map((d) => d.data());
    const s = await saldo(PA);
    chk('movimientos legibles para el socio', movs.length >= 2, 'n=' + movs.length);
    chk('hay origen(es) revertido(s)', movs.some((m) => m.tipo === 'origen' && m.estado === 'revertido'));
    chk('hay un consumo con refFacturaId', movs.some((m) => m.tipo === 'consumo' && m.refFacturaId));
    chk('saldo negativo → banner mostraría DEUDA', s < 0, money(s));
    console.log('  (el banner "Tenés una deuda de ' + money(-s) + '" lo verifica Lucas por navegador)');
  }

  console.log('\n=== 6) LIMPIEZA ===');
  await cleanup();
  let rest = 0; for (const pid of [PA, PB]) { if ((await saldo(pid)) !== null) rest++; rest += (await db.collection('creditos').where('personaId', '==', pid).get()).size; }
  for (const P of [P1, P2]) rest += (await db.collection('facturas').where('periodo', '==', P).get()).size + (await db.collection('abonos').where('periodo', '==', P).get()).size;
  rest += (await db.collection('pagos').where('registradoPor', '==', 'verif-f4').get()).size;
  chk('limpieza total (0 rastros de prueba)', rest === 0, 'quedan ' + rest);

  console.log(`\n${fail ? '✗' : '✓'} VERIF BORDES Fase 4: ${ok} ok, ${fail} fallo(s)\n`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('ERROR:', e.message || e, e.stack || ''); try { await cleanup(); } catch (_) {} process.exit(1); });
