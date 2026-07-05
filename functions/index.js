'use strict';
/*
 * MEDICAR — Cloud Functions (1ra gen) para gestión de personal del SUPERADMIN.
 * Estas operaciones tocan Firebase Auth (crear/borrar usuarios, setear contraseña
 * de otros), que NO se puede hacer desde el cliente -> Admin SDK en backend.
 * Región southamerica-east1 (igual que Firestore). El cliente debe llamar con esa región.
 *
 * ROBUSTEZ OBLIGATORIA: cada función valida el ID token del llamante (context.auth)
 * y exige rol 'superadmin' (leído de usuarios/{uid}). Sin eso, cualquiera con la URL
 * podría crear admins.
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const REGION = 'southamerica-east1';
// 'chofer': rol NO-operativo (sin acceso a clínica). Se versiona aquí para habilitar el alta;
// el DEPLOY de esta Function lo hace Lucas aparte (este commit no la deploya).
const ROLES = ['superadmin', 'admin', 'despachante', 'medico', 'chofer', 'afiliado'];
const fn = functions.region(REGION).https;

// Exige llamante autenticado y con rol superadmin. Devuelve su uid.
async function assertSuperadmin(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login requerido.');
  }
  const snap = await db.collection('usuarios').doc(context.auth.uid).get();
  if (!snap.exists || snap.data().rol !== 'superadmin') {
    throw new functions.https.HttpsError('permission-denied', 'Solo el superadmin puede gestionar personal.');
  }
  return context.auth.uid;
}

// createUser: crea Auth + doc usuarios + staff_medico (si rol=medico).
exports.createUser = fn.onCall(async (data, context) => {
  await assertSuperadmin(context);
  const email = ((data && data.email) || '').trim();
  const nombre = ((data && data.nombre) || '').trim();
  const rol = ((data && data.rol) || '').trim();
  const password = (data && data.passwordInicial) || '';
  if (!email || !nombre) throw new functions.https.HttpsError('invalid-argument', 'Email y nombre son requeridos.');
  if (!ROLES.includes(rol)) throw new functions.https.HttpsError('invalid-argument', 'Rol inválido.');
  if (('' + password).length < 6) throw new functions.https.HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');

  let userRec;
  try {
    userRec = await admin.auth().createUser({ email, password, displayName: nombre, emailVerified: true });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') throw new functions.https.HttpsError('already-exists', 'Ya existe una cuenta con ese email.');
    if (e.code === 'auth/invalid-email') throw new functions.https.HttpsError('invalid-argument', 'Email inválido.');
    throw new functions.https.HttpsError('internal', e.message || 'No se pudo crear la cuenta.');
  }
  const uid = userRec.uid;
  await db.collection('usuarios').doc(uid).set({
    rol, email, nombre, afiliadoId: null, medicoId: null, activo: true,
    creadoEn: admin.firestore.FieldValue.serverTimestamp(),
  });
  if (rol === 'medico') {
    await db.collection('staff_medico').doc(uid).set({ nombre, activo: true });
  }
  return { uid };
});

// setPassword: resetea/asigna la contraseña de cualquier usuario.
exports.setPassword = fn.onCall(async (data, context) => {
  await assertSuperadmin(context);
  const uid = ((data && data.uid) || '').trim();
  const nuevaPassword = (data && data.nuevaPassword) || '';
  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid requerido.');
  if (('' + nuevaPassword).length < 6) throw new functions.https.HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
  try {
    await admin.auth().updateUser(uid, { password: nuevaPassword });
  } catch (e) {
    if (e.code === 'auth/user-not-found') throw new functions.https.HttpsError('not-found', 'Usuario no encontrado.');
    throw new functions.https.HttpsError('internal', e.message || 'No se pudo cambiar la contraseña.');
  }
  return { ok: true };
});

// deleteUser: borra si NO tiene episodios; si TIENE -> baja lógica (preserva trazabilidad).
exports.deleteUser = fn.onCall(async (data, context) => {
  const callerUid = await assertSuperadmin(context);
  const uid = ((data && data.uid) || '').trim();
  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid requerido.');
  // Anti-lockout: el superadmin no puede borrarse a sí mismo.
  if (uid === callerUid) throw new functions.https.HttpsError('failed-precondition', 'No podés borrarte a vos mismo.');

  // ¿Tiene episodios asociados? (como médico asignado o como despachador que lo creó)
  const [comoMedico, comoDespachador] = await Promise.all([
    db.collection('episodios').where('medicoId', '==', uid).limit(1).get(),
    db.collection('episodios').where('despachadorId', '==', uid).limit(1).get(),
  ]);
  const tieneEpisodios = !comoMedico.empty || !comoDespachador.empty;

  if (tieneEpisodios) {
    // Baja lógica: no se destruye, para no romper la trazabilidad clínica.
    await db.collection('usuarios').doc(uid).set({ activo: false }, { merge: true });
    const st = await db.collection('staff_medico').doc(uid).get();
    if (st.exists) await db.collection('staff_medico').doc(uid).set({ activo: false }, { merge: true });
    return {
      deleted: false,
      deactivated: true,
      motivo: 'La persona tiene episodios asociados: se desactivó (baja lógica) en vez de borrarse, para preservar la trazabilidad clínica.',
    };
  }

  // Sin episodios -> borrado real (Auth + Firestore).
  try {
    await admin.auth().deleteUser(uid);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw new functions.https.HttpsError('internal', e.message || 'No se pudo borrar la cuenta.');
  }
  await db.collection('usuarios').doc(uid).delete();
  const st = await db.collection('staff_medico').doc(uid).get();
  if (st.exists) await db.collection('staff_medico').doc(uid).delete();
  return { deleted: true };
});

// liberarMovilAlCerrar: trigger onUpdate de episodios. Cuando un episodio pasa A 'cerrado' o
// 'cancelado' (y antes NO era terminal) y tiene un movilId que apunta a un móvil real, libera ese
// móvil (estado:'disponible', episodioActivoId:null). Idempotente: si el móvil ya no está ligado a
// ESTE episodio (libre o reasignado a otro) o no existe -> no-op. NO toca el episodio. Corre con
// privilegios de admin (no depende de las reglas de cliente).
exports.liberarMovilAlCerrar = functions
  .region(REGION)
  .firestore.document('episodios/{id}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const TERMINALES = ['cerrado', 'cancelado'];
    const pasoATerminal = !TERMINALES.includes(before.estado) && TERMINALES.includes(after.estado);
    if (!pasoATerminal) return null;

    const movilId = after.movilId;
    if (!movilId) return null; // sin móvil (o legacy null)

    const ref = db.collection('moviles').doc(movilId);
    const snap = await ref.get();
    if (!snap.exists) return null; // móvil legacy/inexistente -> no-op

    // Solo libero si el móvil SIGUE ligado a este episodio. Si ya está libre o lo tomó otro, no-op.
    if (snap.data().episodioActivoId !== context.params.id) return null;

    await ref.set({
      estado: 'disponible',
      episodioActivoId: null,
      actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return null;
  });

/* ─────────────────────────────────────────────────────────────────────────
 * crearLeadWeb — PUERTA PÚBLICA (Estructura 2 Marketing, Bloque 2).
 * HTTP (onRequest, 1ra gen, southamerica-east1). El form público de la landing
 * medicaronline.ar hace POST acá; escribimos leads/{auto} con Admin SDK, así las
 * REGLAS de Firestore quedan CERRADAS al público (nadie escribe leads directo).
 * Defensa v1: CORS lista blanca + honeypot + validación dura fail-closed.
 * (Rate limiting: mejora futura si aparece spam.)
 * ───────────────────────────────────────────────────────────────────────── */
const CORS_WHITELIST = [
  'https://medicaronline.ar',
  'https://www.medicaronline.ar',
  'http://127.0.0.1:8000', // pruebas locales
];
function limpiar(v) {
  return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim(); // strip de tags básico + trim
}
function emailValido(e) {
  return e.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

exports.crearLeadWeb = fn.onRequest(async (req, res) => {
  const origin = req.get('origin') || '';
  // CORS: solo orígenes de la lista blanca. Fuera de lista -> 403 (también para preflight).
  if (CORS_WHITELIST.indexOf(origin) === -1) {
    return res.status(403).json({ ok: false, error: 'Origen no permitido.' });
  }
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '3600');

  if (req.method === 'OPTIONS') return res.status(204).send(''); // preflight
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' });

  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};

    // HONEYPOT: si 'website' viene con contenido -> bot. 200 {ok:true} SIN crear nada (no dar pistas).
    if (limpiar(body.website)) return res.status(200).json({ ok: true });

    const nombre = limpiar(body.nombre);
    const telefono = limpiar(body.telefono);
    const email = limpiar(body.email);
    const mensaje = limpiar(body.mensaje);

    // VALIDACIÓN dura, fail-closed. Campos extra inesperados -> ignorados (no se leen).
    const generico = { ok: false, error: 'Datos inválidos.' };
    if (nombre.length < 2 || nombre.length > 80) return res.status(400).json(generico);
    if (!telefono && !email) return res.status(400).json(generico);
    if (telefono && (telefono.length < 6 || telefono.length > 25)) return res.status(400).json(generico);
    if (email && !emailValido(email)) return res.status(400).json(generico);
    if (mensaje.length > 500) return res.status(400).json(generico);

    // Crear lead (MISMO schema que los leads internos -> aparece igual en el panel Marketing).
    await db.collection('leads').add({
      nombre,
      telefono: telefono || '',
      email: email || '',
      origen: 'web',
      estado: 'nuevo',
      notas: mensaje || '',
      motivoDescarte: null,
      personaId: null,
      socioId: null,
      campanaId: null,
      creadoEn: admin.firestore.FieldValue.serverTimestamp(),
      creadoPor: 'web-publico',
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[crearLeadWeb]', e);
    return res.status(500).json({ ok: false, error: 'Error interno.' }); // 500 genérico, sin detalles
  }
});
