// Fase2 — crea la cuenta demo del ROL CONTABLE (no-admin): facturar + gestionar_cobranza. Nada más.
// Idempotente: si ya existe el Auth user, reusa el uid y solo (re)escribe el doc usuarios.
//
//   node crear-contabledemo.js           -> DRY-RUN (no escribe). SEGURO.
//   node crear-contabledemo.js --apply   -> crea Auth user + doc usuarios (en el deploy).
//
// Password demo 123456 (convención de los demos @medicaronline.ar; se rotan al pasar a prod real, ver vault).
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const auth = admin.auth(); const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const EMAIL = 'contabledemo@medicaronline.ar';
const PASS = '123456';
const DOC = { email: EMAIL, nombre: 'Contable Demo', rol: 'contable', roles: ['contable'], activo: true,
              permisos: { facturar: true, gestionar_cobranza: true } };

(async () => {
  console.log(`=== crear contabledemo — ${APPLY ? 'APPLY' : 'DRY-RUN (no escribe)'} ===`);
  let uid = null, exists = false;
  try { const u = await auth.getUserByEmail(EMAIL); uid = u.uid; exists = true; } catch (_) {}
  console.log(`Auth user ${EMAIL}: ${exists ? 'YA EXISTE (uid ' + uid + ') → se reusa' : 'no existe → se crearía'}`);
  console.log('Doc usuarios a escribir:', JSON.stringify(DOC));
  if (!APPLY) { console.log('\nDRY-RUN: no se creó nada. Correr con --apply en el deploy.'); process.exit(0); }

  if (!exists) { const u = await auth.createUser({ email: EMAIL, password: PASS, displayName: DOC.nombre }); uid = u.uid; console.log('Auth user creado, uid:', uid); }
  await db.collection('usuarios').doc(uid).set(DOC, { merge: true });
  // read-back
  const snap = await db.collection('usuarios').doc(uid).get(); const p = (snap.data() || {}).permisos || {};
  const okCaps = p.facturar === true && p.gestionar_cobranza === true && Object.keys(p).filter(k => p[k] === true).length === 2;
  console.log(`\n${okCaps ? '✅' : '⚠'} usuarios/${uid} → rol=${(snap.data()||{}).rol} · permisos: ${Object.keys(p).filter(k=>p[k]===true).join(', ')}`);
  process.exit(okCaps ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
