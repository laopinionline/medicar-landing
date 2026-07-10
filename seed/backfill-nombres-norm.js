'use strict';
/*
 * Backfill de búsqueda: pacientes/{id}.apellidoNorm + nombreNorm (minúsculas, sin tildes).
 * Habilita la búsqueda por apellido/nombre en Nuevo Despacho.
 * IDEMPOTENTE (merge). DRY-RUN por defecto; escribe solo con --apply.
 *
 *   node seed/backfill-nombres-norm.js            # dry-run (no escribe)
 *   node seed/backfill-nombres-norm.js --apply    # aplica
 *
 * Requiere serviceAccountKey.json (gitignoreada, ver README).
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(KEY)) { console.error('[backfill] falta serviceAccountKey.json'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

// MISMA normalización que el cliente (normNombre en app/index.html): lowercase + NFD sin tildes + trim.
const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

(async () => {
  console.log(`\n[backfill] Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}\n`);
  const snap = await db.collection('pacientes').get();
  let escribir = 0, yaOk = 0, sinNombre = 0;

  for (const doc of snap.docs) {
    const p = doc.data() || {};
    const an = norm(p.apellido), nn = norm(p.nombre);
    if (!p.apellido && !p.nombre) { sinNombre++; console.log(`[warn] ${doc.id}: sin apellido/nombre — SKIP`); continue; }
    if (p.apellidoNorm === an && p.nombreNorm === nn) { yaOk++; console.log(`[skip] ${doc.id}: ya normalizado (${an} / ${nn})`); continue; }
    escribir++;
    console.log(`[norm] ${doc.id}: '${p.apellido || ''}'/'${p.nombre || ''}' -> apellidoNorm='${an}' nombreNorm='${nn}'${APPLY ? '' : '   (dry-run)'}`);
    if (APPLY) await doc.ref.set({ apellidoNorm: an, nombreNorm: nn }, { merge: true });
  }

  console.log(`\n[backfill] Total ${snap.size} · a escribir ${escribir} · ya ok ${yaOk} · sin nombre ${sinNombre}`);
  console.log(`[backfill] ${APPLY ? 'ESCRITO.' : 'DRY-RUN: nada escrito. Correr con --apply para aplicar.'}\n`);
  process.exit(0);
})().catch((e) => { console.error('[backfill] ERROR:', e); process.exit(1); });
