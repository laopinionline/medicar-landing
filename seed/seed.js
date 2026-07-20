'use strict';
/*
 * Medicar — Etapa 1 (estructura medica)
 * Seed IDEMPOTENTE de los 3 usuarios demo: crea/asegura las cuentas Auth reales
 * Y sus docs en usuarios/{uid} en una sola pasada, consistentes.
 *
 * Requiere una service account key del proyecto medicar-sistema.
 * NUNCA se commitea (esta en .gitignore). Ver README.md para generarla.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(KEY_PATH)) {
  console.error('\n[seed] No encuentro la service account key en:\n       ' + KEY_PATH);
  console.error('       Generala en la consola de Firebase y colocala ahi (ver README.md).');
  console.error('       O exporta GOOGLE_APPLICATION_CREDENTIALS apuntando al JSON.\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const auth = admin.auth();
const db = admin.firestore();

const PASSWORD = '123456'; // Firebase Auth exige >= 6 caracteres

// Tramo 7a — VACIADO deliberado: los demos viejos @demo.com se retiraron (el repo es PÚBLICO y
// email+123456 eran credenciales de producción con roles elevados). Ya NO se siembran cuentas ni
// staff_medico desde acá; los demos actuales (@medicaronline.ar) y el staff real se gestionan a mano
// / desde el panel. La maquinaria idempotente de abajo queda por si en el futuro hiciera falta.
// IMPORTANTE: no volver a hardcodear uids reales ni credenciales en este archivo (es público).
const USERS = [];
const STAFF_MEDICO = [];

async function ensureStaffMedico(s) {
  await db.collection('staff_medico').doc(s.uid).set(
    { nombre: s.nombre, activo: s.activo },
    { merge: true }
  );
  console.log(`[staff] ok:      staff_medico/${s.uid} (${s.nombre}, activo=${s.activo})`);
}

async function ensureAuthUser(u) {
  try {
    const existing = await auth.getUserByEmail(u.email);
    console.log(`[auth] ya existe: ${u.email} -> ${existing.uid}`);
    return existing.uid;
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    const created = await auth.createUser({
      email: u.email,
      password: PASSWORD,
      displayName: u.nombre,
      emailVerified: true,
    });
    console.log(`[auth] creado:   ${u.email} -> ${created.uid}`);
    return created.uid;
  }
}

async function ensureUserDoc(uid, u) {
  const ref = db.collection('usuarios').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      rol: u.rol,
      email: u.email,
      nombre: u.nombre,
      medicoId: null,   // gancho a la estructura Medica (vacio por ahora)
      creadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[doc]  creado:   usuarios/${uid}`);
  } else {
    // Idempotente: refresca campos base sin pisar creadoEn ni vinculos ya seteados.
    const cur = snap.data() || {};
    const upd = { rol: u.rol, email: u.email, nombre: u.nombre };
    if (cur.medicoId === undefined) upd.medicoId = null;
    await ref.set(upd, { merge: true });
    console.log(`[doc]  ok:       usuarios/${uid} (merge)`);
  }
}

(async () => {
  for (const u of USERS) {
    const uid = await ensureAuthUser(u);
    await ensureUserDoc(uid, u);
    // Médicos marcados staffMedico -> su doc en staff_medico con el uid de Auth recién resuelto.
    if (u.staffMedico) await ensureStaffMedico({ uid, nombre: u.nombre, activo: true });
  }
  for (const s of STAFF_MEDICO) {
    await ensureStaffMedico(s);
  }
  console.log(`\n[seed] Listo. ${USERS.length} usuarios + ${STAFF_MEDICO.length} staff_medico asegurados. Password: ${PASSWORD}\n`);
  process.exit(0);
})().catch((err) => {
  console.error('[seed] ERROR:', err);
  process.exit(1);
});
