'use strict';
/*
 * MEDICAR — Cloud Functions (2da gen) para gestión de personal del SUPERADMIN.
 * Estas operaciones tocan Firebase Auth (crear/borrar usuarios, setear contraseña
 * de otros), que NO se puede hacer desde el cliente -> Admin SDK en backend.
 * Región southamerica-east1 (igual que Firestore). El cliente debe llamar con esa región.
 *
 * ROBUSTEZ OBLIGATORIA: cada función valida el ID token del llamante (request.auth)
 * y exige rol 'superadmin' (leído de usuarios/{uid}). Sin eso, cualquiera con la URL
 * podría crear admins.
 *
 * Migración 1ra -> 2da gen (Etapa 28): Node 20 muere 2026-10-30 y Node 22 no existe en
 * 1ra gen. CERO cambios de lógica de negocio: mismas validaciones, mismos permisos, mismos
 * mensajes y códigos de error, mismos efectos. Solo cambia el chasis (v1 -> v2):
 *   - (data, context)  -> (request): request.data / request.auth
 *   - change.before/after.data() -> event.data.before/after.data(); context.params -> event.params
 *   - functions.region(REGION) -> setGlobalOptions({ region: REGION })
 */
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const { ingestarFeeds } = require('./feed-ingesta'); // PWA-2a: núcleo de la ingesta del feed (compartido con el runner manual)
const { textoAvisoTurno } = require('./push-turno'); // A2: texto N3 de las push de turno (módulo puro, testeable por smoke)

const REGION = 'southamerica-east1';
// CRÍTICO: la región debe conservarse EXACTA. El cliente llama con
// functions('southamerica-east1').httpsCallable — si cambia, se rompe el alta de usuarios.
setGlobalOptions({ region: REGION });

// 'chofer': rol NO-operativo (sin acceso a clínica). Se versiona aquí para habilitar el alta.
// DEPLOY: lo hace Claude Code con `firebase deploy --only functions` (mandato de Lucas, Tramo Turnos
// T-B.1; deroga la nota previa de que el deploy lo hacía Lucas aparte).
const ROLES = ['superadmin', 'admin', 'despachante', 'medico', 'chofer', 'afiliado'];

// ── Helpers Turnos (T-B.1) ──
const FV = () => admin.firestore.FieldValue.serverTimestamp();
const toMin = (s) => { const p = String(s || '').split(':'); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); };
const nombreDe = (p) => (((((p && p.apellido) || '') + ', ' + ((p && p.nombre) || '')).replace(/^, /, '').replace(/, $/, '')) || (p && p.dni) || '');
// "Hoy" y ventana de reserva en horario de Argentina (NO el reloj UTC del runtime): un socio a las 22hs
// no debe caer del otro lado de la medianoche UTC. Devuelve strings 'YYYY-MM-DD' comparables.
function ventanaBA() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
  const d = new Date(hoy + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 7); // +7 días (fin de ventana inclusive)
  const fin = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(d);
  return { hoy, fin };
}
// Caller autenticado con personaId vinculado. Devuelve su personaId. Errores tipados.
async function assertAfiliado(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login requerido.');
  const snap = await db.collection('usuarios').doc(request.auth.uid).get();
  const personaId = snap.exists ? (snap.data() || {}).personaId : null;
  if (!personaId) throw new HttpsError('failed-precondition', 'Tu cuenta no está vinculada a un socio.');
  return personaId;
}

// Exige llamante autenticado y con rol superadmin. Devuelve su uid.
async function assertSuperadmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login requerido.');
  }
  const snap = await db.collection('usuarios').doc(request.auth.uid).get();
  const d = snap.exists ? (snap.data() || {}) : {};
  // Multi-rol: superadmin si roles[] lo incluye; fallback al campo rol viejo (compat migración).
  const roles = Array.isArray(d.roles) ? d.roles : (d.rol ? [d.rol] : []);
  if (!snap.exists || !roles.includes('superadmin')) {
    throw new HttpsError('permission-denied', 'Solo el superadmin puede gestionar personal.');
  }
  return request.auth.uid;
}

// createUser: crea Auth + doc usuarios + staff_medico (si rol=medico).
exports.createUser = onCall(async (request) => {
  await assertSuperadmin(request);
  const data = request.data || {};
  const email = ((data && data.email) || '').trim();
  const nombre = ((data && data.nombre) || '').trim();
  const rol = ((data && data.rol) || '').trim();
  const password = (data && data.passwordInicial) || '';
  if (!email || !nombre) throw new HttpsError('invalid-argument', 'Email y nombre son requeridos.');
  if (!ROLES.includes(rol)) throw new HttpsError('invalid-argument', 'Rol inválido.');
  if (('' + password).length < 6) throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');

  let userRec;
  try {
    userRec = await admin.auth().createUser({ email, password, displayName: nombre, emailVerified: true });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Ya existe una cuenta con ese email.');
    if (e.code === 'auth/invalid-email') throw new HttpsError('invalid-argument', 'Email inválido.');
    throw new HttpsError('internal', e.message || 'No se pudo crear la cuenta.');
  }
  const uid = userRec.uid;
  await db.collection('usuarios').doc(uid).set({
    rol, roles: [rol], email, nombre, afiliadoId: null, medicoId: null, activo: true,
    creadoEn: admin.firestore.FieldValue.serverTimestamp(),
  });
  if (rol === 'medico') {
    await db.collection('staff_medico').doc(uid).set({ nombre, activo: true });
  }
  return { uid };
});

// setPassword: resetea/asigna la contraseña de cualquier usuario.
exports.setPassword = onCall(async (request) => {
  await assertSuperadmin(request);
  const data = request.data || {};
  const uid = ((data && data.uid) || '').trim();
  const nuevaPassword = (data && data.nuevaPassword) || '';
  if (!uid) throw new HttpsError('invalid-argument', 'uid requerido.');
  if (('' + nuevaPassword).length < 6) throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
  try {
    await admin.auth().updateUser(uid, { password: nuevaPassword });
  } catch (e) {
    if (e.code === 'auth/user-not-found') throw new HttpsError('not-found', 'Usuario no encontrado.');
    throw new HttpsError('internal', e.message || 'No se pudo cambiar la contraseña.');
  }
  return { ok: true };
});

// deleteUser: borra si NO tiene episodios; si TIENE -> baja lógica (preserva trazabilidad).
exports.deleteUser = onCall(async (request) => {
  const callerUid = await assertSuperadmin(request);
  const data = request.data || {};
  const uid = ((data && data.uid) || '').trim();
  if (!uid) throw new HttpsError('invalid-argument', 'uid requerido.');
  // Anti-lockout: el superadmin no puede borrarse a sí mismo.
  if (uid === callerUid) throw new HttpsError('failed-precondition', 'No podés borrarte a vos mismo.');

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
    if (e.code !== 'auth/user-not-found') throw new HttpsError('internal', e.message || 'No se pudo borrar la cuenta.');
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
exports.liberarMovilAlCerrar = onDocumentUpdated('episodios/{id}', async (event) => {
  if (!event.data) return null; // guarda v2 (un onUpdate siempre trae before/after; defensivo)
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  const TERMINALES = ['cerrado', 'cancelado'];
  const pasoATerminal = !TERMINALES.includes(before.estado) && TERMINALES.includes(after.estado);
  if (!pasoATerminal) return null;

  const movilId = after.movilId;
  if (!movilId) return null; // sin móvil (o legacy null)

  const ref = db.collection('moviles').doc(movilId);
  const snap = await ref.get();
  if (!snap.exists) return null; // móvil legacy/inexistente -> no-op

  // Solo libero si el móvil SIGUE ligado a este episodio. Si ya está libre o lo tomó otro, no-op.
  if (snap.data().episodioActivoId !== event.params.id) return null;

  await ref.set({
    estado: 'disponible',
    episodioActivoId: null,
    actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return null;
});

/* ─────────────────────────────────────────────────────────────────────────
 * crearLeadWeb — PUERTA PÚBLICA (Estructura 2 Marketing, Bloque 2).
 * HTTP (onRequest, 2da gen, southamerica-east1). El form público de la landing
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

exports.crearLeadWeb = onRequest(async (req, res) => {
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

/* ─────────────────────────────────────────────────────────────────────────
 * TURNOS (Tramo Turnos T-B.1) — reserva/cancelación de turnos de videollamada.
 * El SOCIO no escribe agenda_turnos.slotsTomados ni turnos directo (las reglas no pueden acoplar
 * la reserva al slot de forma segura). Estas CFs corren con Admin SDK (bypass de reglas) y hacen la
 * TRANSACCIÓN atómica: validar slot libre / marcar-desmarcar slotsTomados / crear-cancelar el turno.
 * Decisiones: (B) el titular opera para sí y sus dependientes; ventana hoy+7; máx 1 turno 'creado'
 * a futuro POR PERSONA; cancelar hasta la hora del turno; cancelar en franja inactiva permitido.
 * ───────────────────────────────────────────────────────────────────────── */

// Resuelve el personaId destino y su nombreVista. self → persona del caller; dependiente → validado
// server-side (socios: personaId==destino && titularPersonaId==caller && activo) + nombreVista denorm (F1).
async function resolverDestino(callerPersonaId, paraPersonaId) {
  if (!paraPersonaId || paraPersonaId === callerPersonaId) {
    const per = (await db.collection('personas').doc(callerPersonaId).get()).data() || {};
    return { personaId: callerPersonaId, nombreVista: nombreDe(per) };
  }
  const q = await db.collection('socios')
    .where('personaId', '==', paraPersonaId)
    .where('titularPersonaId', '==', callerPersonaId).get();
  const dep = q.docs.map((d) => d.data()).find((s) => s.activo !== false);
  if (!dep) throw new HttpsError('permission-denied', 'Solo podés reservar/cancelar para vos o tus dependientes.');
  let nombreVista = dep.nombreVista || '';
  if (!nombreVista) { const per = (await db.collection('personas').doc(paraPersonaId).get()).data() || {}; nombreVista = nombreDe(per); }
  return { personaId: paraPersonaId, nombreVista };
}

exports.reservarTurno = onCall(async (request) => {
  const caller = await assertAfiliado(request);
  const data = request.data || {};
  const agendaId = String(data.agendaId || '').trim();
  const hora = String(data.hora || '').trim();
  const paraPersonaId = String(data.paraPersonaId || '').trim();
  if (!agendaId || !hora) throw new HttpsError('invalid-argument', 'agendaId y hora son requeridos.');
  if (!/^\d{2}:\d{2}$/.test(hora)) throw new HttpsError('invalid-argument', 'Hora inválida.');

  // (2) destino (self o dependiente validado)
  const destino = await resolverDestino(caller, paraPersonaId);

  // (3) franja: existe + activa + fecha en [hoy, hoy+7] (horario Argentina)
  const franjaRef = db.collection('agenda_turnos').doc(agendaId);
  const franjaSnap = await franjaRef.get();
  if (!franjaSnap.exists) throw new HttpsError('not-found', 'La franja no existe.');
  const franja = franjaSnap.data() || {};
  if (franja.activa === false) throw new HttpsError('failed-precondition', 'La franja no está disponible.');
  const { hoy, fin } = ventanaBA();
  if (!(franja.fecha >= hoy && franja.fecha <= fin)) throw new HttpsError('failed-precondition', 'La fecha está fuera de la ventana de reserva (próximos 7 días).');

  // (4) hora dentro de [horaInicio, horaFin) + alineada a duracionSlotMin + el slot entra completo
  const dur = Number(franja.duracionSlotMin) || 0;
  if (dur <= 0) throw new HttpsError('failed-precondition', 'Franja mal configurada (duración).');
  const iniMin = toMin(franja.horaInicio), finMin = toMin(franja.horaFin), hMin = toMin(hora);
  if (!(hMin >= iniMin && hMin < finMin && (hMin - iniMin) % dur === 0 && hMin + dur <= finMin)) {
    throw new HttpsError('invalid-argument', 'Ese horario no es un turno válido de la franja.');
  }

  // (5) TX atómica: slot libre + máx-1-activo del destino + escribir
  const turnoRef = db.collection('turnos').doc();
  await db.runTransaction(async (tx) => {
    const fr = await tx.get(franjaRef);
    const slots = (fr.data() || {}).slotsTomados || [];
    if (slots.includes(hora)) throw new HttpsError('already-exists', 'Ese horario ya fue tomado.');
    // máx 1 turno 'creado' a futuro POR PERSONA (dos equalities → sin índice compuesto; fecha se filtra en memoria)
    const activosSnap = await tx.get(db.collection('turnos').where('personaId', '==', destino.personaId).where('estado', '==', 'creado'));
    const activosFuturos = activosSnap.docs.map((d) => d.data()).filter((t) => String(t.fecha || '') >= hoy);
    if (activosFuturos.length >= 1) throw new HttpsError('failed-precondition', 'Esa persona ya tiene un turno reservado a futuro. Cancelalo antes de sacar otro.');
    tx.update(franjaRef, { slotsTomados: [...slots, hora] });
    tx.set(turnoRef, {
      fecha: franja.fecha, hora, agendaId,
      personaId: destino.personaId, nombreVista: destino.nombreVista,
      medicoId: franja.medicoId || '', medicoNombre: franja.medicoNombre || '',
      // A2: uid de AUTH de quien reserva (el que tiene la app). Para un turno de DEPENDIENTE es el TITULAR por
      // construcción. La CF de push (onDocumentCreated) rutea por ESTE campo — va en el MISMO set que crea el turno
      // (misma tx) → el trigger ve el doc completo, sin race ni update posterior.
      reservadoPorUid: request.auth.uid,
      estado: 'creado', creadoEn: FV(),
    });
  });
  return { turnoId: turnoRef.id };
});

exports.cancelarTurno = onCall(async (request) => {
  const caller = await assertAfiliado(request);
  const turnoId = String((request.data || {}).turnoId || '').trim();
  if (!turnoId) throw new HttpsError('invalid-argument', 'turnoId requerido.');
  const turnoRef = db.collection('turnos').doc(turnoId);
  const snap = await turnoRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'El turno no existe.');
  const turno = snap.data() || {};
  if (turno.estado !== 'creado') throw new HttpsError('failed-precondition', 'El turno no está activo (ya cancelado).');
  // dueño: self o dependiente del caller
  if (turno.personaId !== caller) {
    const q = await db.collection('socios').where('personaId', '==', turno.personaId).where('titularPersonaId', '==', caller).limit(1).get();
    if (q.empty) throw new HttpsError('permission-denied', 'No podés cancelar este turno.');
  }
  const franjaRef = db.collection('agenda_turnos').doc(turno.agendaId);
  await db.runTransaction(async (tx) => {
    const t = await tx.get(turnoRef);
    if ((t.data() || {}).estado !== 'creado') throw new HttpsError('failed-precondition', 'El turno ya fue cancelado.');
    const fr = await tx.get(franjaRef); // cancelar en franja inactiva o inexistente: permitido (solo libera)
    if (fr.exists) { const slots = (fr.data() || {}).slotsTomados || []; tx.update(franjaRef, { slotsTomados: slots.filter((s) => s !== turno.hora) }); }
    tx.update(turnoRef, { estado: 'cancelado', canceladoEn: FV() });
  });
  return { ok: true };
});

/* ===================== A2-a — Push nativa: aviso al reservar =====================
   onDocumentCreated('turnos/{id}'): dispara cuando reservarTurno comitea el turno (el doc ya trae
   reservadoPorUid del mismo set). Rutea por reservadoPorUid (el que TIENE la app; para un turno de
   dependiente es el titular). Envía a TODOS los dispositivos del uid. N3: texto solo fecha/hora/médico.
   Token muerto (unregistered) → borra ese dispositivo. Región heredada de setGlobalOptions (sae1). */
exports.avisarTurno = onDocumentCreated('turnos/{id}', async (event) => {
  const turno = event.data && event.data.data();
  if (!turno || turno.estado !== 'creado') return null; // solo reservas nuevas
  const uid = turno.reservadoPorUid;
  if (!uid) { logger.warn('[avisarTurno] turno sin reservadoPorUid — no se puede rutear', { id: event.params.id }); return null; }
  const disp = await db.collection('push_tokens').doc(uid).collection('dispositivos').get();
  if (disp.empty) return null; // sin tokens (no instaló la app / permiso negado) — degradación limpia
  const { title, body } = textoAvisoTurno(turno); // N3: SOLO fecha/hora/medico/nombreVista
  let enviados = 0, muertos = 0;
  for (const d of disp.docs) {
    const token = (d.data() || {}).token;
    if (!token) continue;
    try { await admin.messaging().send({ token, notification: { title, body } }); enviados++; }
    catch (e) {
      const code = (e && (e.code || (e.errorInfo && e.errorInfo.code))) || '';
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') { await d.ref.delete().catch(() => {}); muertos++; } // token muerto → borrar el dispositivo
    }
  }
  logger.info('[avisarTurno]', { id: event.params.id, uid, dispositivos: disp.size, enviados, muertos });
  return null;
});

/* ===================== PWA-2a — Ingesta diaria del feed "Para vos" =====================
   onSchedule (Cloud Scheduler auto-aprovisionado). TIMEZONE EXPLÍCITO: sin timeZone, '06:00' dispararía 03:00 AR.
   Escribe feed_posts en estado:'pendiente' (Admin SDK saltea reglas). Nada se publica solo — cola de aprobación en el panel.
   Núcleo en ./feed-ingesta (compartido con el runner manual). */
exports.ingestarFeed = onSchedule(
  { schedule: 'every day 06:00', timeZone: 'America/Argentina/Buenos_Aires' },
  async () => {
    const { resultados, retencion } = await ingestarFeeds(db);
    for (const r of resultados) {
      logger.info('[ingestarFeed] fuente', { fuente: r.fuente, cat: r.cat, leidos: r.leidos, nuevos: r.nuevos, yaExisten: r.yaExisten, autoDescartados: r.autoDescartados, error: r.error });
    }
    logger.info('[ingestarFeed] retención', retencion);
    return null;
  }
);
