'use strict';
/*
 * Prueba multi-rol (Tramo 2): convierte a medicodemo en el usuario MULTI-ROL de prueba.
 * - usuarios/{uid}.roles = ['medico','afiliado']  (mantiene rol='medico' como espejo)
 * - le crea/asegura una persona de JUGUETE y la linkea via personaId (para que el modo afiliado
 *   tenga a quién apuntar). Datos de juguete, sin DNI real.
 * IDEMPOTENTE (merge). Requiere serviceAccountKey.json (gitignoreada).
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(KEY)) { console.error('[demo] falta serviceAccountKey.json'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

const UID = '7ttXCnv7QbdD8KhRM3fG4RBlXwH3';   // medicodemo@medicaronline.ar
const PID = 'persona-demo-medicodemo';         // persona de juguete (id fijo -> idempotente)

(async () => {
  // 1) persona de juguete
  await db.collection('personas').doc(PID).set({
    nombre: 'Médico Demo', apellido: '', dni: '00000000',
    esAfiliadoDemo: true, creadoEn: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`[demo] persona ok: personas/${PID}`);

  // 2) usuarios/{uid}: roles multi + personaId (rol espejo se conserva)
  await db.collection('usuarios').doc(UID).set(
    { roles: ['medico', 'afiliado'], rol: 'medico', personaId: PID },
    { merge: true }
  );
  const snap = await db.collection('usuarios').doc(UID).get();
  const d = snap.data() || {};
  console.log(`[demo] usuarios/${UID}: roles=[${d.roles}] rol='${d.rol}' personaId='${d.personaId}'`);
  console.log('\n[demo] medicodemo listo como MULTI-ROL de prueba.\n');
  process.exit(0);
})().catch((e) => { console.error('[demo] ERROR:', e); process.exit(1); });
