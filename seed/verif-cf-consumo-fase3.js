'use strict';
/* VERIFICACIÓN EN VIVO — Fase 3 (consumo del crédito en generarFacturasCF). Contra la CF DESPLEGADA, período limpio.
 * 5 casos: (1) sin crédito → factura normal; (2) crédito<total → ítem negativo, total reducido, saldo 0, consumo con
 * refFacturaId; (3) crédito>total → factura $0, consume hasta el total, sobra saldo; (4) RE-RUN → no crea ni consume;
 * (5) saldo negativo → no aplica. Siembra creditos_saldo por Admin SDK (write:false para el cliente), limpia todo. */
const path = require('path'), admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const FV = () => admin.firestore.FieldValue.serverTimestamp();
const money = (n) => '$' + (Math.round(Number(n) || 0)).toLocaleString('es-AR');

const PERIOD = '2099-12';
const FACTURADOR_UID = '5Yjdq6aoDQXbD1OOgjwYkFxyuJY2';
const API_KEY = 'AIzaSyCXCkuaFC_8qMPAEIUlBoQiv7hBgFDq1iw';
const FN_URL = 'https://southamerica-east1-medicar-sistema.cloudfunctions.net/generarFacturasCF';
// caso → socio + saldo sembrado + total del abono
const CASOS = [
  { caso: 'sin credito',     socioId: 'DdeKsQYWklK40791hNNw', personaId: '4w8I1gyMxhDE2NQwRqeN', nombre: 'Sosa, Tomás',           total: 10000, saldo: null },
  { caso: 'credito < total', socioId: 'E7xIbE5GQ3OhCg8RHJ1I', personaId: 'YZs9mzKHB6ZNQMVXVVIz', nombre: 'LEDESMA, Oscar',         total: 10000, saldo: 3000 },
  { caso: 'credito > total', socioId: 'HcLl6KKKFMWSV5Umkgwd', personaId: 'ZrpTKBNUeGJBKDTNjqVE', nombre: 'Marino Aguirre, Lucas',  total: 10000, saldo: 25000 },
  { caso: 'saldo negativo',  socioId: 'Isuo75ea9WpxiWVrQjZj', personaId: '7MQH0t1jjmVD2fscnuoA', nombre: 'López, Julieta',         total: 10000, saldo: -5000 },
];

let ok = 0, fail = 0;
const chk = (l, c, e) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}${c ? '' : (e ? '  → ' + e : '')}`); c ? ok++ : fail++; };
let TOK = null;
async function idToken() { if (TOK) return TOK; const ct = await admin.auth().createCustomToken(FACTURADOR_UID); const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ct, returnSecureToken: true }) }); const j = await r.json(); if (!j.idToken) throw new Error('no idToken'); TOK = j.idToken; return TOK; }
async function callCF(data) { const t = await idToken(); const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ data }) }); const j = await r.json(); if (j.error) throw new Error('CF error: ' + JSON.stringify(j.error)); return j.result; }
async function facturasDe(p) { const s = await db.collection('facturas').where('periodo', '==', p).get(); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }
async function saldoDe(pid) { const s = await db.collection('creditos_saldo').doc(pid).get(); return s.exists ? (Number(s.data().saldo) || 0) : null; }
const creditItem = (f) => (f.items || []).find((it) => it.tipo === 'credito');

(async () => {
  console.log(`\n=== 0) PRECHECK período ${PERIOD} ===`);
  if ((await db.collection('abonos').where('periodo', '==', PERIOD).get()).size || (await facturasDe(PERIOD)).length) { console.error('✗ período no limpio'); process.exit(1); }
  for (const c of CASOS) { if ((await saldoDe(c.personaId)) !== null) { console.error('✗ ya hay saldo para ' + c.personaId); process.exit(1); } }
  console.log('✓ limpio (0 abonos/facturas, 0 saldos en las personas de prueba)');

  console.log('\n=== 1) SEMBRAR abonos + saldos ===');
  const seededAb = [];
  for (const c of CASOS) {
    const ref = await db.collection('abonos').add({ periodo: PERIOD, socioId: c.socioId, personaId: c.personaId, socioNombre: c.nombre, numeroAfiliado: '000', planId: 'x', planNombre: 'TEST', precioSugerido: c.total, precioFinal: c.total, motivoAjuste: null, estado: 'generado', generadoEn: FV(), generadoPor: 'verif-f3' });
    seededAb.push(ref.id); c._abono = ref.id;
    if (c.saldo !== null) { await db.collection('creditos_saldo').doc(c.personaId).set({ saldo: c.saldo, actualizadoEn: FV() }); }
    console.log(`  ${c.caso}: abono ${money(c.total)} · saldo sembrado ${c.saldo === null ? '(ninguno)' : money(c.saldo)}`);
  }

  console.log('\n=== 2) CF write ===');
  const w1 = await callCF({ periodo: PERIOD, dry: false });
  console.log('  respuesta:', JSON.stringify(w1));
  const fac = await facturasDe(PERIOD);
  const byPersona = new Map(fac.filter((f) => f.personaId).map((f) => [f.personaId, f]));

  console.log('\n--- Caso 1: sin crédito → factura normal ---');
  { const f = byPersona.get(CASOS[0].personaId); chk('factura creada', !!f); chk('total = 10000', f && f.total === 10000, f && money(f.total)); chk('SIN ítem de crédito', f && !creditItem(f)); }

  console.log('\n--- Caso 2: crédito 3000 < total 10000 ---');
  { const c = CASOS[1]; const f = byPersona.get(c.personaId);
    chk('total reducido a 7000', f && f.total === 7000, f && money(f.total));
    chk('ítem "Crédito a favor" −3000', f && creditItem(f) && creditItem(f).monto === -3000);
    chk('saldo del socio a 0', (await saldoDe(c.personaId)) === 0, money(await saldoDe(c.personaId)));
    const cons = await db.collection('creditos').doc('cons_' + f.id).get();
    chk('movimiento consumo existe con refFacturaId', cons.exists && cons.data().refFacturaId === f.id && cons.data().monto === 3000 && cons.data().tipo === 'consumo');
    chk('motivo "aplicado a FC-..."', cons.exists && /^aplicado a FC-/.test(cons.data().motivo || ''), cons.exists ? cons.data().motivo : '');
  }

  console.log('\n--- Caso 3: crédito 25000 > total 10000 → factura $0 ---');
  { const c = CASOS[2]; const f = byPersona.get(c.personaId);
    chk('factura creada (NO salteada)', !!f);
    chk('total = 0', f && f.total === 0, f && money(f.total));
    chk('ítem crédito −10000 (solo hasta el total)', f && creditItem(f) && creditItem(f).monto === -10000);
    chk('sobra saldo: 25000−10000 = 15000', (await saldoDe(c.personaId)) === 15000, money(await saldoDe(c.personaId)));
    const cons = await db.collection('creditos').doc('cons_' + f.id).get();
    chk('consumo = 10000 (no 25000)', cons.exists && cons.data().monto === 10000);
  }

  console.log('\n--- Caso 5: saldo negativo → no aplica ---');
  { const c = CASOS[3]; const f = byPersona.get(c.personaId);
    chk('total intacto 10000', f && f.total === 10000, f && money(f.total));
    chk('SIN ítem de crédito', f && !creditItem(f));
    chk('saldo sigue en −5000', (await saldoDe(c.personaId)) === -5000, money(await saldoDe(c.personaId)));
    chk('sin movimiento consumo', !(await db.collection('creditos').doc('cons_' + f.id).get()).exists);
  }

  console.log('\n=== 4) RE-RUN (idempotencia: ni factura ni consumo de nuevo) ===');
  const saldoPre = { s2: await saldoDe(CASOS[1].personaId), s3: await saldoDe(CASOS[2].personaId), s4: await saldoDe(CASOS[3].personaId) };
  const facCountPre = (await facturasDe(PERIOD)).length;
  const w2 = await callCF({ periodo: PERIOD, dry: false });
  console.log('  respuesta re-run:', JSON.stringify(w2));
  chk('re-run creó 0 facturas', (w2.facturas || 0) === 0);
  chk('re-run aplicó 0 crédito', (w2.creditoAplicado || 0) === 0);
  chk('total de facturas sin cambios', (await facturasDe(PERIOD)).length === facCountPre);
  chk('saldo caso2 intacto (0)', (await saldoDe(CASOS[1].personaId)) === saldoPre.s2);
  chk('saldo caso3 intacto (15000)', (await saldoDe(CASOS[2].personaId)) === saldoPre.s3);
  chk('saldo caso5 intacto (−5000)', (await saldoDe(CASOS[3].personaId)) === saldoPre.s4);

  console.log('\n=== 5) LIMPIEZA ===');
  for (const f of await facturasDe(PERIOD)) { await db.collection('creditos').doc('cons_' + f.id).delete().catch(() => {}); await db.collection('facturas').doc(f.id).delete(); }
  for (const id of seededAb) { await db.collection('abonos').doc(id).delete(); }
  for (const c of CASOS) { await db.collection('creditos_saldo').doc(c.personaId).delete().catch(() => {}); }
  const restFc = (await facturasDe(PERIOD)).length, restAb = (await db.collection('abonos').where('periodo', '==', PERIOD).get()).size;
  let restSaldo = 0; for (const c of CASOS) { if ((await saldoDe(c.personaId)) !== null) restSaldo++; }
  chk('limpieza total (0 facturas/abonos/saldos de prueba)', restFc === 0 && restAb === 0 && restSaldo === 0, `fc ${restFc} ab ${restAb} saldos ${restSaldo}`);

  console.log(`\n${fail ? '✗' : '✓'} VERIF CONSUMO Fase 3: ${ok} ok, ${fail} fallo(s)\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message || e, e.stack || ''); process.exit(1); });
