'use strict';
/*
 * Backfill (síntoma-con-consentimiento F1): agrega `titularPersonaId` (= el doc id) a los vínculos existentes
 * referentes/{refUid}/titulares/{tid}. El fan-out del síntoma los busca por collectionGroup('titulares').where(
 * 'titularPersonaId', ...) — los vínculos creados ANTES de F1 no tienen ese campo. Idempotente.
 *   node seed/backfill-vinculo-titularpersonaid.js            # dry-run
 *   node seed/backfill-vinculo-titularpersonaid.js --apply
 */
const path = require('path');
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();

(async () => {
  console.log(`\n[backfill titularPersonaId] Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);
  const snap = await db.collectionGroup('titulares').get();
  let faltan = 0, ok = 0;
  for (const d of snap.docs) {
    // solo los vínculos de referentes (referentes/{refUid}/titulares/{tid}); doc id = titularPersonaId
    const parentCol = d.ref.parent.parent && d.ref.parent.parent.parent ? d.ref.parent.parent.parent.id : '';
    if (parentCol !== 'referentes') continue;
    const tid = d.id;
    if ((d.data() || {}).titularPersonaId === tid) { ok++; continue; }
    faltan++;
    console.log(`  ${d.ref.path}  → titularPersonaId=${tid}${(d.data() || {}).titularPersonaId ? ' (corrige)' : ' (faltaba)'}`);
    if (APPLY) await d.ref.set({ titularPersonaId: tid }, { merge: true });
  }
  console.log(`\nVínculos: ${ok} ya OK · ${faltan} ${APPLY ? 'actualizados' : 'a actualizar'}`);
  if (!APPLY) console.log('DRY-RUN: nada escrito. Corré con --apply.\n');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
