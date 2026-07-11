'use strict';
/*
 * Tramo 5c — REVERSA del vínculo demo (contraparte de vincular-afiliado-demo.js).
 * Borra la persona y el socio demo (N° 90001) y limpia el personaId del usuario afiliadodemo.
 * Idempotente: si algo ya no existe, lo reporta y sigue. NO toca contadores (90001 nunca los usó)
 * ni escribe pacientes. Tras correrlo, la vista "Mi plan" de afiliadodemo vuelve a "sin-vínculo".
 *   node seed/desvincular-afiliado-demo.js           # dry-run
 *   node seed/desvincular-afiliado-demo.js --apply    # revierte
 */
const path = require('path');
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const auth = admin.auth();

const EMAIL = 'afiliadodemo@medicaronline.ar';
const PERSONA_ID = 'demo-afiliado-90001';
const SOCIO_ID = 'demo-socio-90001';

(async () => {
  console.log(`\n[desvincular-demo] Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const uid = (await auth.getUserByEmail(EMAIL)).uid;
  const uDoc = (await db.collection('usuarios').doc(uid).get()).data() || {};
  const pExists = (await db.collection('personas').doc(PERSONA_ID).get()).exists;
  const sExists = (await db.collection('socios').doc(SOCIO_ID).get()).exists;
  const vinculado = uDoc.personaId === PERSONA_ID;

  console.log('afiliadodemo uid:', uid);
  console.log('  personas/' + PERSONA_ID + ' existe?:', pExists, pExists ? '→ a borrar' : '(ya no está)');
  console.log('  socios/' + SOCIO_ID + ' existe?:', sExists, sExists ? '→ a borrar' : '(ya no está)');
  console.log('  usuarios.personaId == demo?:', vinculado, vinculado ? '→ a limpiar (null)' : '(no apunta al demo)');

  if (!APPLY) { console.log('\n[desvincular-demo] DRY-RUN: nada tocado. Corré con --apply.\n'); process.exit(0); }

  if (pExists) await db.collection('personas').doc(PERSONA_ID).delete();
  if (sExists) await db.collection('socios').doc(SOCIO_ID).delete();
  if (vinculado) await db.collection('usuarios').doc(uid).set({ personaId: null }, { merge: true });

  const uAfter = (await db.collection('usuarios').doc(uid).get()).data() || {};
  console.log('\n[desvincular-demo] REVERTIDO ✓');
  console.log('  persona borrada:', pExists, '· socio borrado:', sExists, '· usuarios.personaId ahora:', uAfter.personaId);
  process.exit(0);
})().catch(e => { console.error('[desvincular-demo] ERROR:', e.message); process.exit(1); });
