'use strict';
/* VERIFICACIÓN EN VIVO — Fase 2 PASO B. Prueba la CF generarFacturasCF DESPLEGADA contra un período NUEVO y LIMPIO.
 *  0) precheck: el período no tiene abonos/facturas (aborta si no).
 *  1) siembra abonos (Admin SDK) para 3 socios individuales del período limpio.
 *  2) EXPECTED local = agruparFacturas (el núcleo puro) sobre esos abonos + config actual.
 *  3) CF dry  → compara contra expected (count, totales, ítems, numeración correlativa).
 *  4) CF write → lee las facturas persistidas, compara contra expected + verifica facturaId linkeado + contador +N.
 *  5) CF write RE-RUN → 0 facturas nuevas (idempotencia por el link atómico).
 *  6) limpieza: borra facturas creadas + abonos sembrados + desvincula (contador NO se rebobina).
 * Invoca la CF onCall real como admindemo (custom token → idToken → POST). No usa el motor cliente en ningún paso. */
const path = require('path'), admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const FV = () => admin.firestore.FieldValue.serverTimestamp();
const { agruparFacturas } = require('../functions/facturas-nucleo');
const money = (n) => '$' + (Math.round(Number(n) || 0)).toLocaleString('es-AR');

const PERIOD = '2099-12';
const FACTURADOR_UID = '5Yjdq6aoDQXbD1OOgjwYkFxyuJY2'; // admindemo (facturar:true)
const API_KEY = 'AIzaSyCXCkuaFC_8qMPAEIUlBoQiv7hBgFDq1iw';
const FN_URL = 'https://southamerica-east1-medicar-sistema.cloudfunctions.net/generarFacturasCF';
const SOCIOS = [
  { socioId: 'DdeKsQYWklK40791hNNw', personaId: '4w8I1gyMxhDE2NQwRqeN', nombreVista: 'Sosa, Tomás', numeroAfiliado: '20805', planId: 'plan-area', planNombre: 'TEST', precioFinal: 10000 },
  { socioId: 'E7xIbE5GQ3OhCg8RHJ1I', personaId: 'YZs9mzKHB6ZNQMVXVVIz', nombreVista: 'LEDESMA, Oscar', numeroAfiliado: '20810', planId: 'plan-senior', planNombre: 'TEST', precioFinal: 20000 },
  { socioId: 'HcLl6KKKFMWSV5Umkgwd', personaId: 'ZrpTKBNUeGJBKDTNjqVE', nombreVista: 'Marino Aguirre, Lucas', numeroAfiliado: '7982', planId: 'PcB28RvKHEOrZ267ny6Z', planNombre: 'TEST', precioFinal: 30000 },
];

let ok = 0, fail = 0;
const chk = (label, cond, extra) => { console.log(`${cond ? '✓' : '✗ FALLO'} ${label}${cond ? '' : (extra ? '  → ' + extra : '')}`); cond ? ok++ : fail++; };
const sig = (items) => items.map((it) => `${it.tipo}|${it.refId || '·'}|${Number(it.monto) || 0}`).sort();
const keyG = (g) => g.clienteTipo === 'empresa' ? ('e:' + g.clienteId) : ('p:' + g.personaId);
const keyF = (f) => f.clienteTipo === 'empresa' ? ('e:' + f.clienteId) : ('p:' + f.personaId);

let ID_TOKEN = null;
async function idToken() {
  if (ID_TOKEN) return ID_TOKEN;
  const custom = await admin.auth().createCustomToken(FACTURADOR_UID);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const j = await r.json(); if (!j.idToken) throw new Error('no idToken: ' + JSON.stringify(j));
  ID_TOKEN = j.idToken; return ID_TOKEN;
}
async function callCF(data) {
  const tok = await idToken();
  const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ data }) });
  const j = await r.json();
  if (j.error) throw new Error('CF error: ' + JSON.stringify(j.error));
  return j.result;
}
async function facturasDe(periodo) { const s = await db.collection('facturas').where('periodo', '==', periodo).get(); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }
async function contador() { const s = await db.collection('contadores').doc('facturas').get(); return s.exists ? (s.data().ultimo || 0) : 0; }

(async () => {
  console.log(`\n=== 0) PRECHECK período ${PERIOD} ===`);
  const ab0 = await db.collection('abonos').where('periodo', '==', PERIOD).get();
  const fc0 = await facturasDe(PERIOD);
  if (ab0.size || fc0.length) { console.error(`✗ período NO limpio (abonos ${ab0.size}, facturas ${fc0.length}) — abortado`); process.exit(1); }
  console.log('✓ limpio (0 abonos, 0 facturas)');

  console.log('\n=== 1) SEMBRAR abonos ===');
  const seededAbonoIds = [];
  for (const s of SOCIOS) {
    const ref = await db.collection('abonos').add({ periodo: PERIOD, socioId: s.socioId, personaId: s.personaId, socioNombre: s.nombreVista, numeroAfiliado: s.numeroAfiliado, planId: s.planId, planNombre: s.planNombre, precioSugerido: s.precioFinal, precioFinal: s.precioFinal, motivoAjuste: null, estado: 'generado', generadoEn: FV(), generadoPor: 'verif-cf-fase2' });
    seededAbonoIds.push(ref.id); console.log(`  abono ${ref.id} · ${s.nombreVista} · ${money(s.precioFinal)}`);
  }

  console.log('\n=== 2) EXPECTED local (núcleo puro) ===');
  const socSnap = await db.collection('socios').get(); const empSnap = await db.collection('empresas').get();
  const socMap = {}; socSnap.docs.forEach((d) => { socMap[d.id] = { id: d.id, ...d.data() }; });
  const empMap = {}; empSnap.docs.forEach((d) => { empMap[d.id] = { id: d.id, ...d.data() }; });
  const abIn = (await db.collection('abonos').where('periodo', '==', PERIOD).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const cgIn = (await db.collection('cargos').get()).docs.map((d) => ({ id: d.id, ...d.data() })); // agnósticos (0 sin linkear, precheck)
  const { grupos: expected } = agruparFacturas({ abonos: abIn, cargos: cgIn, socMap, empMap, empresasYaFacturadas: new Set(), periodo: PERIOD });
  console.log(`  expected: ${expected.length} grupo(s) → ${expected.map((g) => keyG(g) + '=' + money(g.total)).join(', ')}`);

  console.log('\n=== 3) CF dry-run (compara contra expected) ===');
  const cont0 = await contador();
  const dry = await callCF({ periodo: PERIOD, dry: true });
  chk('dry count == expected', dry.count === expected.length, `${dry.count} vs ${expected.length}`);
  const dryByKey = new Map(dry.facturas.map((f) => [keyF(f), f]));
  for (const g of expected) {
    const f = dryByKey.get(keyG(g));
    chk(`dry ${keyG(g)} total`, !!f && Number(f.total) === Number(g.total), f ? `${money(f.total)} vs ${money(g.total)}` : 'sin factura');
    chk(`dry ${keyG(g)} ítems`, !!f && JSON.stringify(sig(f.items)) === JSON.stringify(sig(g.items)));
  }
  const dryNros = dry.facturas.map((f) => f.nroComprobante);
  const espNros = expected.map((_, i) => `FC-${new Date().getFullYear()}-${String(cont0 + 1 + i).padStart(6, '0')}`);
  chk('dry numeración correlativa desde el contador', JSON.stringify(dryNros) === JSON.stringify(espNros), `${dryNros.join(',')} vs ${espNros.join(',')}`);
  chk('dry NO tocó el contador', (await contador()) === cont0);
  chk('dry NO creó facturas', (await facturasDe(PERIOD)).length === 0);

  console.log('\n=== 4) CF write (crea + linkea) ===');
  const w1 = await callCF({ periodo: PERIOD, dry: false });
  console.log('  respuesta:', JSON.stringify(w1));
  const persist = await facturasDe(PERIOD);
  chk('write count == expected', persist.length === expected.length, `${persist.length} vs ${expected.length}`);
  const persByKey = new Map(persist.map((f) => [keyF(f), f]));
  for (const g of expected) {
    const f = persByKey.get(keyG(g));
    chk(`persist ${keyG(g)} total`, !!f && Number(f.total) === Number(g.total));
    chk(`persist ${keyG(g)} ítems`, !!f && JSON.stringify(sig(f.items)) === JSON.stringify(sig(g.items)));
    chk(`persist ${keyG(g)} estado emitida`, !!f && f.estado === 'emitida');
  }
  // facturaId linkeado en los abonos sembrados
  let linked = 0; for (const id of seededAbonoIds) { const a = await db.collection('abonos').doc(id).get(); if (a.exists && a.data().facturaId) linked++; }
  chk('los 3 abonos quedaron linkeados', linked === seededAbonoIds.length, `${linked}/${seededAbonoIds.length}`);
  chk('contador avanzó +expected', (await contador()) === cont0 + expected.length, `${await contador()} vs ${cont0 + expected.length}`);
  const nros = persist.map((f) => f.nroComprobante).sort();
  chk('numeración persistida correlativa', JSON.stringify(nros) === JSON.stringify(espNros.slice().sort()), nros.join(','));

  console.log('\n=== 5) CF write RE-RUN (idempotencia) ===');
  const contPre = await contador();
  const w2 = await callCF({ periodo: PERIOD, dry: false });
  console.log('  respuesta re-run:', JSON.stringify(w2));
  chk('re-run creó 0 facturas', (w2.facturas || 0) === 0, 'facturas=' + w2.facturas);
  chk('re-run: total de facturas sin cambios', (await facturasDe(PERIOD)).length === expected.length);
  chk('re-run: contador sin cambios', (await contador()) === contPre);

  console.log('\n=== 6) LIMPIEZA ===');
  for (const f of await facturasDe(PERIOD)) { await db.collection('facturas').doc(f.id).delete(); }
  for (const id of seededAbonoIds) { await db.collection('abonos').doc(id).delete(); }
  const restFc = (await facturasDe(PERIOD)).length; const restAb = (await db.collection('abonos').where('periodo', '==', PERIOD).get()).size;
  chk('limpieza: 0 facturas y 0 abonos en el período', restFc === 0 && restAb === 0, `fc ${restFc} ab ${restAb}`);
  console.log(`  (contador queda en ${await contador()} — NO se rebobina, correcto)`);

  console.log(`\n${fail ? '✗' : '✓'} VERIF CF período limpio: ${ok} ok, ${fail} fallo(s)\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message || e, e.stack || ''); process.exit(1); });
