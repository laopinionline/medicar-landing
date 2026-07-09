'use strict';
/*
 * Medicar — Multi-rol Tramo 1: migración usuarios/{uid}.rol (string) -> roles: [rol] (array).
 * IDEMPOTENTE. Conserva `rol` como espejo del rol por defecto (roles[0]). NO borra nada.
 *
 * DRY-RUN por defecto: imprime qué haría SIN escribir.
 * Escribe SOLO con --apply:  node seed/migrate-roles.js --apply
 *
 * Requiere la service account key del proyecto medicar-sistema (gitignoreada, ver README).
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(KEY_PATH)) {
  console.error('\n[migrate] No encuentro la service account key en:\n          ' + KEY_PATH + '\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();

(async () => {
  console.log(`\n[migrate] Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}\n`);
  const snap = await db.collection('usuarios').get();
  let migrar = 0, yaOk = 0, sinRol = 0, inconsistente = 0;

  for (const doc of snap.docs) {
    const u = doc.data() || {};
    const uid = doc.id;

    if (Array.isArray(u.roles) && u.roles.length) {
      // Ya migrado. Chequeo de consistencia: rol (espejo) debería ser roles[0].
      if (u.rol && u.rol !== u.roles[0]) {
        inconsistente++;
        console.log(`[warn] ${uid}: roles=[${u.roles}] pero rol='${u.rol}' (espejo desalineado) — no lo toco`);
      } else {
        yaOk++;
        console.log(`[skip] ${uid}: ya tiene roles=[${u.roles}]`);
      }
      continue;
    }

    if (!u.rol) {
      sinRol++;
      console.log(`[warn] ${uid}: sin campo rol — SKIP (no migro)`);
      continue;
    }

    migrar++;
    console.log(`[migr] ${uid}: rol='${u.rol}'  ->  roles=['${u.rol}']${APPLY ? '' : '   (dry-run)'}`);
    if (APPLY) {
      // set merge: agrega roles[], deja rol como espejo, no pisa nada más.
      await doc.ref.set({ roles: [u.rol], rol: u.rol }, { merge: true });
    }
  }

  console.log(`\n[migrate] Total ${snap.size} · a migrar ${migrar} · ya ok ${yaOk} · sin rol ${sinRol} · inconsistentes ${inconsistente}`);
  console.log(`[migrate] ${APPLY ? 'ESCRITO.' : 'DRY-RUN: nada escrito. Volvé a correr con --apply para aplicar.'}\n`);
  process.exit(0);
})().catch((err) => { console.error('[migrate] ERROR:', err); process.exit(1); });
