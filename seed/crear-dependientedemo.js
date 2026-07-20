'use strict';
/*
 * Cuenta de login para el DEPENDIENTE demo — dependientedemo@medicaronline.ar.
 * NO crea persona/socio: REUSA el dependiente activo que el fixture del titular ya sembró
 * (persona demo-dep-uno / socio 90002-01: titularSocioId=demo-socio-90002, esResponsablePago:false,
 * planId:null, activo). Así NO se agrega un integrante nuevo al grupo → la cuota del titular no cambia.
 * Solo agrega: cuenta Auth (pass 123456, como los otros login-demo) + usuarios/{uid}.personaId=demo-dep-uno.
 * Objetivo: poder ENTRAR como dependiente y verificar en vivo su pantalla (nota "la facturación la
 * gestiona el titular", sin comprobantes ni acciones de plata). Idempotente.
 *   node seed/crear-dependientedemo.js            # dry-run
 *   node seed/crear-dependientedemo.js --apply
 */
const path = require('path');
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const auth = admin.auth();
const FV = () => admin.firestore.FieldValue.serverTimestamp();

const EMAIL = 'dependientedemo@medicaronline.ar';
const PASSWORD = '123456'; // mismo pass demo que seed-login-demo (cuenta de prueba, no prod real)
const PERSONA_ID = 'demo-dep-uno'; // dependiente activo del titulardemo (ya sembrado por fixture-titular-demo)

(async () => {
  console.log(`\n[dependientedemo] Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  // Precondición: el dependiente debe existir y SER dependiente (titularSocioId) activo.
  const soc = await db.collection('socios').doc('demo-socio-90002-01').get();
  if (!soc.exists) { console.error('⚠️ socio demo-socio-90002-01 NO existe. Corré antes fixture-titular-demo.js --apply. Abortado.'); process.exit(1); }
  const s = soc.data();
  console.log(`dependiente 90002-01: titularSocioId=${s.titularSocioId} · esResponsablePago=${s.esResponsablePago} · planId=${s.planId} · activo=${s.activo}`);
  if (!s.titularSocioId || s.esResponsablePago !== false || s.activo !== true) console.log('  ⚠️ el socio no luce como dependiente-activo-no-pagador; revisar antes de confiar en la verificación.');

  let uid = null;
  try { uid = (await auth.getUserByEmail(EMAIL)).uid; console.log(`Auth ${EMAIL}: YA existe uid=${uid}`); }
  catch { console.log(`Auth ${EMAIL}: NO existe → --apply la crea`); }

  console.log('\nOperaciones:');
  console.log(`  Auth: ${EMAIL} (pass ${PASSWORD})`);
  console.log(`  usuarios/{uid}: rol/roles afiliado, personaId=${PERSONA_ID}  (→ esDependiente=true en la PWA)`);

  if (!APPLY) { console.log('\n[dependientedemo] DRY-RUN: nada escrito. Corré con --apply.\n'); process.exit(0); }

  if (!uid) { uid = (await auth.createUser({ email: EMAIL, password: PASSWORD, displayName: 'Dependiente Demo', emailVerified: true })).uid; console.log(`[dependientedemo] Auth creado → ${uid}`); }
  else { await auth.updateUser(uid, { password: PASSWORD }).catch(() => {}); } // re-asegura el pass demo

  const uref = db.collection('usuarios').doc(uid);
  const ubase = { rol: 'afiliado', roles: ['afiliado'], email: EMAIL, nombre: 'Dependiente Demo', medicoId: null, personaId: PERSONA_ID };
  if (!(await uref.get()).exists) ubase.creadoEn = FV();
  await uref.set(ubase, { merge: true });

  console.log(`\n[dependientedemo] APLICADO ✓  email=${EMAIL}  uid=${uid}  personaId=${PERSONA_ID}\n`);
  process.exit(0);
})().catch(e => { console.error('[dependientedemo] ERROR:', e.message); process.exit(1); });
