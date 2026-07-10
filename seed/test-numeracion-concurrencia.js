'use strict';
/*
 * Test de concurrencia de la numeración de socios (Fase 1) contra el EMULADOR de Firestore.
 * Replica EXACTO las primitivas de app/index.html (asignarNumeroRaiz / asignarSufijo).
 * Corre vía:
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "node seed/test-numeracion-concurrencia.js"
 */
const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-medicar' });
const db = admin.firestore();
const FV = () => admin.firestore.FieldValue.serverTimestamp();

const SOCIO_SERIES = {
  directo: { counter: 'socios_directo', base: 20000 },
  corp:    { counter: 'socios_corp',    base: 30000 },
  area:    { counter: 'socios_area',    base: 40000 },
};
// --- primitivas idénticas a app/index.html ---
async function asignarNumeroRaiz(serie, targetRef, buildDoc) {
  const cfg = SOCIO_SERIES[serie];
  const counterRef = db.collection('contadores').doc(cfg.counter);
  return await db.runTransaction(async tx => {
    const cs = await tx.get(counterRef);
    const ultimo = cs.exists ? (cs.data().ultimo || cfg.base) : cfg.base;
    const next = ultimo + 1;
    tx.set(counterRef, { ultimo: next, actualizadoEn: FV() }, { merge: true });
    const correlativo = String(next);
    tx.set(targetRef, buildDoc(correlativo));
    return { correlativo, id: targetRef.id };
  });
}
async function asignarSufijo(raizRef, targetRef, buildDoc) {
  return await db.runTransaction(async tx => {
    const rs = await tx.get(raizRef);
    if (!rs.exists) throw new Error('raíz inexistente: ' + raizRef.id);
    const d = rs.data() || {};
    const base = String(d.numeroRaiz || d.numeroConvenio || (String(d.numeroAfiliado || '').split('-')[0]) || '');
    if (!base) throw new Error('la raíz no tiene número base');
    const next = (d.ultimoSufijo || 0) + 1;
    const sufijo = String(next).padStart(2, '0');
    tx.set(raizRef, { ultimoSufijo: next }, { merge: true });
    const numeroAfiliado = base + '-' + sufijo;
    tx.set(targetRef, buildDoc(numeroAfiliado, sufijo));
    return { sufijo, numeroAfiliado };
  });
}

let fails = 0;
const assert = (cond, msg) => { if (!cond) { console.error('  ✗ FALLO: ' + msg); fails++; } else { console.log('  ✓ ' + msg); } };

(async () => {
  const N = 20;

  console.log(`\n[Test A] ${N} altas concurrentes de la MISMA serie (directo), contador arranca en 20790`);
  await db.collection('contadores').doc('socios_directo').set({ ultimo: 20790 });
  const resA = await Promise.all(Array.from({ length: N }, (_, i) =>
    asignarNumeroRaiz('directo', db.collection('socios').doc(), c => ({ numeroAfiliado: c, numeroRaiz: c, grupoTipo: 'directo', _t: i }))
  ));
  const numsA = resA.map(r => Number(r.correlativo)).sort((a, b) => a - b);
  assert(new Set(numsA).size === N, `${N} correlativos ÚNICOS (sin colisión)`);
  assert(numsA[0] === 20791 && numsA[N - 1] === 20790 + N, `secuencia contigua 20791..${20790 + N} (min=${numsA[0]}, max=${numsA[N - 1]})`);
  const cA = (await db.collection('contadores').doc('socios_directo').get()).data().ultimo;
  assert(cA === 20790 + N, `contador quedó en ${20790 + N} (=${cA})`);
  const nSoc = (await db.collection('socios').get()).size;
  assert(nSoc === N, `exactamente ${N} docs socios creados (=${nSoc}) — nunca contador incrementado sin doc`);

  console.log(`\n[Test B] ${N} integrantes concurrentes de la MISMA raíz (sufijos -NN)`);
  const raizRef = db.collection('socios').doc('RAIZ_FAM');
  await raizRef.set({ numeroRaiz: '20500', ultimoSufijo: 0, grupoTipo: 'familiar', esResponsablePago: true });
  const resB = await Promise.all(Array.from({ length: N }, (_, i) =>
    asignarSufijo(raizRef, db.collection('socios').doc(), (num) => ({ numeroAfiliado: num, titularSocioId: 'RAIZ_FAM', grupoTipo: 'familiar', _s: i }))
  ));
  const sufs = resB.map(r => r.sufijo).sort();
  assert(new Set(sufs).size === N, `${N} sufijos ÚNICOS (sin repetición): ${sufs[0]}..${sufs[N - 1]}`);
  assert(new Set(resB.map(r => r.numeroAfiliado)).size === N, `${N} numeroAfiliado 20500-NN únicos`);
  const cB = (await raizRef.get()).data().ultimoSufijo;
  assert(cB === N, `ultimoSufijo de la raíz quedó en ${N} (=${cB})`);

  console.log(`\n[Test C] doc socio existente SIN los campos nuevos se lee bien (compat)`);
  const viejoRef = db.collection('socios').doc('VIEJO_PRE_F1');
  await viejoRef.set({ personaId: 'p1', tipoAfiliado: 'directo', numeroAfiliado: '20100', planId: null, activo: true }); // shape pre-Fase1
  const v = (await viejoRef.get()).data();
  assert(v.numeroAfiliado === '20100' && v.grupoTipo === undefined && v.titularSocioId === undefined && v.empresaId === undefined && v.esResponsablePago === undefined,
    'doc viejo se lee OK; campos nuevos ausentes (undefined) — compat total');

  console.log(`\n${fails === 0 ? '✅ TODOS LOS TESTS PASARON' : '❌ ' + fails + ' FALLO(S)'}\n`);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR test:', e); process.exit(1); });
