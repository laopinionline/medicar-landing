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
const { onDocumentUpdated, onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onTaskDispatched } = require('firebase-functions/v2/tasks'); // A2-b: recordatorio vía Cloud Tasks
const { getFunctions } = require('firebase-admin/functions');         // A2-b: encolar/cancelar la task
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const { ingestarFeeds } = require('./feed-ingesta'); // PWA-2a: núcleo de la ingesta del feed (compartido con el runner manual)
const { textoAvisoTurno, textoRecordatorioTurno, planRecordatorio, debeRecordar } = require('./push-turno'); // A2: texto N3 + plan/decisión del recordatorio (módulo puro, testeable por smoke)
const crypto = require('crypto'); // Referente R1: aleatoriedad del código
const { docEstadoReferido, generarCodigo, esFormatoCodigo, CONSENT_SINTOMAS, consentSintomasOk, docSintomaReferido } = require('./referente'); // Referente R1 + síntoma-con-consentimiento (F1)
const { docAlerta, guardiaVigente, personasAtendidas } = require('./guardia'); // Guardia G1/G2: shape de la alerta + helpers de cronograma/atendiendo
const { diffCoberturas, nuevaCarencia, coberturasEnCarencia } = require('./plan'); // Autogestión de plan: diff coberturas + carencia diferenciada

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
// A2-b — cola del recordatorio. Path completo (forma probada con el probe). El task ID se deriva del
// turnoId INVERTIDO: determinístico (→ cancelable sin leer nada) y bien distribuido (los IDs secuenciales
// degradan la cola; reversed = distribución ideal, recomendación del SDK). Un turnoId ⇒ un task ID único
// ⇒ reprogramar (cancelar+reservar) nunca cruza tasks (turno nuevo = id nuevo).
const RECORDATORIO_QUEUE = 'locations/southamerica-east1/functions/recordarTurno';
const colaRecordatorio = () => getFunctions().taskQueue(RECORDATORIO_QUEUE);
const taskIdDeTurno = (turnoId) => String(turnoId).split('').reverse().join('');
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
  // A2-b: plan del recordatorio (2hs antes). Se decide ANTES de la tx (ya tengo fecha+hora). Borde <2hs →
  // enviar:false (no se encola). Task ID determinístico del turnoId → va en el MISMO set (sin write extra).
  const plan = planRecordatorio(franja.fecha, hora, new Date());
  const recordatorioTaskId = plan.enviar ? taskIdDeTurno(turnoRef.id) : null;
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
      // A2-b: si se va a encolar recordatorio, guardo el task ID acá para poder cancelarlo. null = sin recordatorio (turno <2hs).
      recordatorioTaskId,
      estado: 'creado', creadoEn: FV(),
    });
  });
  // A2-b: encolar DESPUÉS del commit (si la tx falla, no queda task zombie). Best-effort: el recordatorio
  // no puede voltear una reserva ya hecha. Si falla el enqueue, el turno vale igual (queda sin recordatorio).
  if (recordatorioTaskId) {
    try {
      await colaRecordatorio().enqueue({ turnoId: turnoRef.id }, { id: recordatorioTaskId, scheduleTime: plan.cuando });
      logger.info('[reservarTurno] recordatorio encolado', { turnoId: turnoRef.id, cuando: plan.cuando.toISOString() });
    } catch (e) {
      logger.error('[reservarTurno] no se pudo encolar el recordatorio (el turno queda sin él)', { turnoId: turnoRef.id, error: e.message || String(e) });
    }
  } else {
    logger.info('[reservarTurno] sin recordatorio', { turnoId: turnoRef.id, razon: plan.razon });
  }
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
  // A2-b: cancelar la task del recordatorio (best-effort). Si falla, NO importa: recordarTurno revalida el
  // estado al disparar (turno cancelado → no manda). Pero la borramos igual para no dejar tasks zombie.
  // Solo turnos reservados POST-deploy tienen recordatorioTaskId (null = nunca se encoló → nada que cancelar).
  const taskId = turno.recordatorioTaskId;
  if (taskId) {
    try { await colaRecordatorio().delete(taskId); logger.info('[cancelarTurno] recordatorio cancelado', { turnoId, taskId }); }
    catch (e) { logger.warn('[cancelarTurno] no se pudo cancelar el recordatorio (la revalidación cubre)', { turnoId, taskId, error: e.message || String(e) }); }
  }
  return { ok: true };
});

/* ===================== A2 — Push nativa a los dispositivos de un uid =====================
   Helper compartido por avisarTurno (A2-a) y recordarTurno (A2-b): envía { title, body } a TODOS los
   dispositivos del uid. Token muerto (unregistered/invalid) → borra ese dispositivo. La garantía N3 vive
   fuera de acá: el texto ya llega armado por push-turno.js (solo fecha/hora/médico). Devuelve el conteo. */
async function pushATurno(uid, texto) {
  const disp = await db.collection('push_tokens').doc(uid).collection('dispositivos').get();
  if (disp.empty) return { dispositivos: 0, enviados: 0, muertos: 0 }; // sin tokens → degradación limpia
  let enviados = 0, muertos = 0;
  for (const d of disp.docs) {
    const token = (d.data() || {}).token;
    if (!token) continue;
    try { await admin.messaging().send({ token, notification: { title: texto.title, body: texto.body } }); enviados++; }
    catch (e) {
      const code = (e && (e.code || (e.errorInfo && e.errorInfo.code))) || '';
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') { await d.ref.delete().catch(() => {}); muertos++; } // token muerto → borrar el dispositivo
    }
  }
  return { dispositivos: disp.size, enviados, muertos };
}

/* ===================== A2-a — Push nativa: aviso al reservar =====================
   onDocumentCreated('turnos/{id}'): dispara cuando reservarTurno comitea el turno (el doc ya trae
   reservadoPorUid del mismo set). Rutea por reservadoPorUid (el que TIENE la app; para un turno de
   dependiente es el titular). N3: texto solo fecha/hora/médico. Región heredada de setGlobalOptions (sae1). */
exports.avisarTurno = onDocumentCreated('turnos/{id}', async (event) => {
  const turno = event.data && event.data.data();
  if (!turno || turno.estado !== 'creado') return null; // solo reservas nuevas
  const uid = turno.reservadoPorUid;
  if (!uid) { logger.warn('[avisarTurno] turno sin reservadoPorUid — no se puede rutear', { id: event.params.id }); return null; }
  const r = await pushATurno(uid, textoAvisoTurno(turno)); // N3: SOLO fecha/hora/medico/nombreVista
  logger.info('[avisarTurno]', { id: event.params.id, uid, ...r });
  return null;
});

/* ===================== A2-b — Push nativa: recordatorio ~2hs antes (Cloud Tasks) =====================
   onTaskDispatched: la task encolada en reservarTurno dispara acá con { turnoId }.
   ⚠️ REVALIDA al momento del envío (relee el turno): solo manda si estado ∈ {creado, confirmado}.
      cancelado/atendido/inexistente → NO manda, sale limpio. Es la RED DE SEGURIDAD ante una cancelación
      cuya task no se pudo borrar. IDEMPOTENCIA: recordatorioEnviadoEn — si ya está, no re-manda (reintentos
      de Cloud Tasks). Mismo resolver (reservadoPorUid) y mismo N3 (push-turno) que A2-a. Región: sae1. */
exports.recordarTurno = onTaskDispatched(
  { retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 }, rateLimits: { maxConcurrentDispatches: 6 } },
  async (req) => {
    const turnoId = (req && req.data && req.data.turnoId) || '';
    if (!turnoId) { logger.warn('[recordarTurno] task sin turnoId'); return; }
    const ref = db.collection('turnos').doc(turnoId);
    const snap = await ref.get();
    const turno = snap.exists ? (snap.data() || {}) : null; // releído al momento de disparar
    const decision = debeRecordar(turno); // revalida estado + idempotencia + uid (pura, smoke-testeada)
    if (!decision.mandar) { logger.info('[recordarTurno] no manda', { turnoId, razon: decision.razon }); return; }
    const uid = turno.reservadoPorUid;
    const r = await pushATurno(uid, textoRecordatorioTurno(turno)); // N3: SOLO fecha/hora/medico/nombreVista
    if (r.dispositivos === 0) { logger.info('[recordarTurno] sin dispositivos — no-op', { turnoId, uid }); return; } // no marcar: no se envió nada
    await ref.update({ recordatorioEnviadoEn: FV() }).catch(() => {}); // sello de idempotencia tras enviar
    logger.info('[recordarTurno]', { turnoId, uid, ...r });
  }
);

/* ===================== REFERENTE R1 — auth + código + ponderación =====================
   El referente es un usuario NUEVO (no socio): cuenta email/pass propia, solo lectura, scope = los titulares
   que lo habilitaron. Multi-titular: los CÓDIGOS AGREGAN vínculos, no crean sesiones. La identidad se marca
   con un CUSTOM CLAIM rol:'referente' (routing en el front); el ACCESO a datos lo gobierna el ESPEJO del
   vínculo (referentes/{uid}/titulares/{titularPersonaId}), no el token. Estas CFs NO acuñan tokens de sesión:
   la auth sigue siendo Firebase email/pass estándar; solo escriben Firestore + setean el claim. */

// Ventana del código sin canjear (7 días). Y ms del helper de expiración.
const REF_CODIGO_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const refRandomInt = (n) => crypto.randomInt(n); // aleatoriedad fuerte para el código

// Rate limit del oracle público validarCodigoReferente: máx 10 intentos por IP cada 10 min. Traba simple
// (Firestore, IP HASHEADA para no guardar IPs crudas) contra brute-force del espacio de códigos. App Check
// sería más limpio pero su variante nativa depende del google-services.json bloqueado por ITECNIS → follow-up.
const REF_RL_MAX = 10, REF_RL_VENTANA_MS = 10 * 60 * 1000;
async function chequearRateLimitValidar(request) {
  const fwd = (request.rawRequest && request.rawRequest.headers && request.rawRequest.headers['x-forwarded-for']) || '';
  const ip = String(fwd).split(',')[0].trim() || (request.rawRequest && request.rawRequest.ip) || 'desconocida';
  const id = crypto.createHash('sha1').update(ip).digest('hex').slice(0, 24); // hash → no guardamos la IP cruda
  const ref = db.collection('rate_validar_referente').doc(id);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const now = Date.now();
    let count = 1, windowStart = now;
    if (s.exists) { const d = s.data() || {}; if (now - (d.windowStart || 0) < REF_RL_VENTANA_MS) { count = (d.count || 0) + 1; windowStart = d.windowStart; } }
    if (count > REF_RL_MAX) throw new HttpsError('resource-exhausted', 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.');
    tx.set(ref, { count, windowStart, actualizadoEn: FV() });
  });
}

// (1) generarCodigoReferente — el TITULAR (afiliado) crea un código para invitar a un referente. Devuelve el código.
exports.generarCodigoReferente = onCall(async (request) => {
  const titularPersonaId = await assertAfiliado(request); // exige afiliado con personaId
  const nombreReferente = String((request.data || {}).nombreReferente || '').trim().slice(0, 60);
  // Genera un código único (reintenta si por casualidad ya existe).
  let codigo = '', ref = null;
  for (let intento = 0; intento < 6; intento++) {
    codigo = generarCodigo(refRandomInt);
    ref = db.collection('codigos_referente').doc(codigo);
    if (!(await ref.get()).exists) break;
    codigo = '';
  }
  if (!codigo) throw new HttpsError('internal', 'No se pudo generar un código único. Reintentá.');
  await ref.set({
    titularPersonaId, estado: 'pendiente',
    habilitaciones: { estado: true }, // R1: SOLO 'estado' (la ponderación). ubicacion/alertas = R2/R3
    referenteUid: null, nombreReferente,
    creadoEn: FV(), canjeadoEn: null, revocadoEn: null,
    expiraEn: admin.firestore.Timestamp.fromMillis(Date.now() + REF_CODIGO_TTL_MS),
  });
  logger.info('[generarCodigoReferente]', { titularPersonaId, codigo });
  return { codigo };
});

// (1b) validarCodigoReferente — PÚBLICA (sin auth): valida un código ANTES de pedir cuenta, para no crear
// cuentas huérfanas si el código es inválido. Solo LECTURA; devuelve válido/motivo + nombre del titular (a quién
// apunta el código que YA tenés). Con RATE LIMIT por IP (oracle acotado). NO consume el código (eso es la canje).
exports.validarCodigoReferente = onCall(async (request) => {
  await chequearRateLimitValidar(request); // traba anti brute-force
  const codigo = String((request.data || {}).codigo || '').trim().toUpperCase();
  if (!esFormatoCodigo(codigo)) return { valido: false, motivo: 'formato' };
  const snap = await db.collection('codigos_referente').doc(codigo).get();
  if (!snap.exists) return { valido: false, motivo: 'inexistente' };
  const c = snap.data() || {};
  if (c.estado === 'activo') return { valido: false, motivo: 'usado' };
  if (c.estado === 'revocado') return { valido: false, motivo: 'revocado' };
  if (c.expiraEn && c.expiraEn.toMillis && c.expiraEn.toMillis() < Date.now()) return { valido: false, motivo: 'vencido' };
  let titularNombre = '';
  try { const p = await db.collection('personas').doc(c.titularPersonaId).get(); if (p.exists) titularNombre = nombreDe(p.data()); } catch (_) {}
  return { valido: true, titularNombre }; // NO se toca el código; la canje (autenticada) lo consume
});

// (2) canjearCodigoReferente — el REFERENTE (ya autenticado con SU cuenta email/pass) canjea un código y queda
// vinculado al titular. Marca el claim rol:'referente', escribe el espejo del vínculo, consume el código.
exports.canjearCodigoReferente = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login requerido.');
  const uid = request.auth.uid;
  const codigo = String((request.data || {}).codigo || '').trim().toUpperCase();
  if (!esFormatoCodigo(codigo)) throw new HttpsError('invalid-argument', 'Código inválido.');
  const ref = db.collection('codigos_referente').doc(codigo);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Ese código no existe.');
  const c = snap.data() || {};
  if (c.estado === 'activo') throw new HttpsError('already-exists', 'Ese código ya fue usado.');
  if (c.estado === 'revocado') throw new HttpsError('failed-precondition', 'Ese código fue dado de baja.');
  if (c.expiraEn && c.expiraEn.toMillis && c.expiraEn.toMillis() < Date.now()) throw new HttpsError('failed-precondition', 'Ese código venció.');
  // El referente no puede ser el propio titular (una cuenta afiliada no se auto-refiere).
  const uDoc = await db.collection('usuarios').doc(uid).get();
  if (uDoc.exists && (uDoc.data() || {}).personaId === c.titularPersonaId) throw new HttpsError('failed-precondition', 'No podés referirte a vos mismo.');

  const titularPersonaId = c.titularPersonaId;
  // Nombre del titular denorm en el ESPEJO: el referente NO puede leer /personas (regla afiliado-propia),
  // así que su selector muestra este nombre. Es el único dato del titular (aparte de la ponderación) que ve.
  let titularNombre = '';
  try { const p = await db.collection('personas').doc(titularPersonaId).get(); if (p.exists) titularNombre = nombreDe(p.data()); } catch (_) {}
  const espejo = db.collection('referentes').doc(uid).collection('titulares').doc(titularPersonaId);
  const batch = db.batch();
  batch.set(ref, { referenteUid: uid, estado: 'activo', canjeadoEn: FV() }, { merge: true });
  batch.set(espejo, { estado: 'activo', habilitaciones: c.habilitaciones || { estado: true }, codigo, titularNombre, titularPersonaId, canjeadoEn: FV() }, { merge: true }); // titularPersonaId denorm → fan-out del síntoma por collectionGroup
  await batch.commit();
  // Custom claim rol:'referente' (merge con claims existentes). Marca la cuenta como referente para el routing.
  const user = await admin.auth().getUser(uid);
  await admin.auth().setCustomUserClaims(uid, { ...(user.customClaims || {}), rol: 'referente' });
  logger.info('[canjearCodigoReferente]', { uid, titularPersonaId, codigo });
  return { titularPersonaId, titularNombre };
});

// (3) revocarVinculoReferente — el TITULAR corta un código/vínculo. Pasa el código Y el espejo a 'revocado' en
// un batch atómico → el referente pierde acceso a ESE titular AL INSTANTE (la regla lee estado!='activo'). Sus
// otros vínculos siguen; el claim NO se toca (marca "es referente", no da acceso por sí solo).
exports.revocarVinculoReferente = onCall(async (request) => {
  const titularPersonaId = await assertAfiliado(request);
  const codigo = String((request.data || {}).codigo || '').trim().toUpperCase();
  const ref = db.collection('codigos_referente').doc(codigo);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Ese código no existe.');
  const c = snap.data() || {};
  if (c.titularPersonaId !== titularPersonaId) throw new HttpsError('permission-denied', 'Ese código no es tuyo.');
  const batch = db.batch();
  batch.set(ref, { estado: 'revocado', revocadoEn: FV() }, { merge: true });
  if (c.referenteUid) {
    const espejo = db.collection('referentes').doc(c.referenteUid).collection('titulares').doc(titularPersonaId);
    // Revocar el vínculo ENTERO también apaga el consentimiento de síntomas y PURGA el crudo copiado (minimización).
    batch.set(espejo, { estado: 'revocado', revocadoEn: FV(), habilitaciones: { estado: false, sintomas: false } }, { merge: true });
    batch.delete(db.collection('sintoma_referido').doc(c.referenteUid + '_' + titularPersonaId));
  }
  await batch.commit();
  logger.info('[revocarVinculoReferente]', { titularPersonaId, codigo, referenteUid: c.referenteUid || null });
  return { ok: true };
});

// (4) derivarEstadoReferido — onCreate de un reporte de síntomas → estado_referido/{personaId} = 'con_sintomas'.
// ⚠️ N3: lee SOLO el personaId del reporte; NO copia sintomas/texto/tieneBanderaRoja/score/nivel. El doc queda
// con EXACTAMENTE {ponderacion, actualizadoEn} (docEstadoReferido lo garantiza). Admin SDK → saltea reglas.
exports.derivarEstadoReferido = onDocumentCreated('reportes_sintomas/{id}', async (event) => {
  const data = event.data && event.data.data();
  const personaId = data && data.personaId;
  if (!personaId) { logger.warn('[derivarEstadoReferido] reporte sin personaId', { id: event.params.id }); return null; }
  await db.collection('estado_referido').doc(personaId).set(docEstadoReferido('con_sintomas', FV())); // pisa el doc entero → sin residuos
  logger.info('[derivarEstadoReferido]', { personaId }); // NO logueo nada del reporte
  return null;
});

/* ===================== SÍNTOMA-CON-CONSENTIMIENTO (Fase 1) =====================
   El referente ve el síntoma EXACTO (nombres + relato) SOLO con consentimiento explícito del titular, per-referente.
   Deroga el binario como techo. Registro auditable + log de cada lectura. El referente NUNCA lee reportes_sintomas
   crudo — lee el derivado consentido, y SOLO vía CF (para poder loguear el acceso). Ref al doc: sintoma_referido/{refUid_tid}. */
const SINTOMA_VENTANA_MS = 72 * 60 * 60 * 1000; // solo el reporte más reciente (72h) — coherente con la ponderación binaria
const sintomaDocId = (refUid, tid) => refUid + '_' + tid;

// derivarSintomaReferido — SEGUNDO trigger sobre reportes_sintomas (independiente de derivarEstadoReferido, que NO
// cambia). Fan-out: por cada vínculo ACTIVO del titular con habilitaciones.sintomas → copia el síntoma a su
// sintoma_referido. Encuentra los vínculos por collectionGroup('titulares') filtrando titularPersonaId+estado+flag.
exports.derivarSintomaReferido = onDocumentCreated('reportes_sintomas/{id}', async (event) => {
  const data = event.data && event.data.data();
  const personaId = data && data.personaId;
  if (!personaId) return null;
  let vinc;
  try {
    vinc = await db.collectionGroup('titulares')
      .where('titularPersonaId', '==', personaId).where('estado', '==', 'activo').where('habilitaciones.sintomas', '==', true).get();
  } catch (e) { logger.error('[derivarSintomaReferido] query falló (¿falta el índice compuesto?)', { error: e.message || String(e) }); return null; }
  if (vinc.empty) return null;
  const doc = docSintomaReferido(data, FV());
  let escritos = 0;
  for (const d of vinc.docs) {
    const refUid = d.ref.parent.parent.id; // referentes/{refUid}/titulares/{tid} → refUid
    await db.collection('sintoma_referido').doc(sintomaDocId(refUid, personaId)).set(doc); // pisa entero → solo el último
    escritos++;
  }
  logger.info('[derivarSintomaReferido]', { personaId, vinculosConsentidos: escritos }); // NO logueo sintomas/texto
  return null;
});

// otorgarConsentimientoSintomas — el TITULAR habilita a un referente a ver sus síntomas. RECHAZA si no hay texto
// de consentimiento real (invariante). Setea el flag (vínculo + código), siembra el síntoma actual si hay uno < 72h,
// y REGISTRA el consentimiento (texto + version). El titular nunca escribe el flag ni el registro directo.
exports.otorgarConsentimientoSintomas = onCall(async (request) => {
  const titularPersonaId = await assertAfiliado(request);
  if (!consentSintomasOk()) throw new HttpsError('failed-precondition', 'El consentimiento no está disponible en este momento.'); // invariante: sin texto real, no se graba nada
  const referenteUid = String((request.data || {}).referenteUid || '').trim();
  if (!referenteUid) throw new HttpsError('invalid-argument', 'Falta el referente.');
  const espejoRef = db.collection('referentes').doc(referenteUid).collection('titulares').doc(titularPersonaId);
  const espejo = await espejoRef.get();
  if (!espejo.exists || (espejo.data() || {}).estado !== 'activo') throw new HttpsError('failed-precondition', 'Ese vínculo no está activo.');

  const batch = db.batch();
  batch.set(espejoRef, { habilitaciones: { estado: (espejo.data().habilitaciones || {}).estado !== false, sintomas: true } }, { merge: true });
  // Espejo del flag en el código (lo que el titular puede LEER para el toggle). Busca el código de este vínculo.
  const codSnap = await db.collection('codigos_referente').where('titularPersonaId', '==', titularPersonaId).where('referenteUid', '==', referenteUid).limit(1).get();
  if (!codSnap.empty) batch.set(codSnap.docs[0].ref, { habilitaciones: { estado: true, sintomas: true } }, { merge: true });
  // Siembra el síntoma actual si hay un reporte reciente (< 72h) → el referente lo ve ya, sin esperar el próximo.
  // BLINDADO (fail-open): la siembra es COSMÉTICA — si no siembra, el próximo reporte del titular llega igual por el
  // fan-out (derivarSintomaReferido). Lo IMPORTANTE es que el consentimiento se otorgue. Un fallo de ESTA query —hoy
  // por índice faltante, mañana por otra causa— NO debe volver a tumbar el otorgamiento. Se loguea y se sigue.
  try {
    const rs = await db.collection('reportes_sintomas').where('personaId', '==', titularPersonaId).orderBy('creadoEn', 'desc').limit(1).get();
    if (!rs.empty) {
      const r = rs.docs[0].data() || {};
      const ms = r.creadoEn && r.creadoEn.toMillis ? r.creadoEn.toMillis() : 0;
      if (Date.now() - ms < SINTOMA_VENTANA_MS) batch.set(db.collection('sintoma_referido').doc(sintomaDocId(referenteUid, titularPersonaId)), docSintomaReferido(r, FV()));
    }
  } catch (e) {
    logger.error('[otorgarConsentimientoSintomas] siembra del síntoma actual falló — se otorga igual', { titularPersonaId, referenteUid, err: String((e && e.message) || e) });
  }
  batch.set(db.collection('consentimientos').doc(), {
    titularPersonaId, referenteUid, tipo: 'sintomas', accion: 'otorga',
    textoConsentimiento: CONSENT_SINTOMAS.texto, version: CONSENT_SINTOMAS.version,
    en: FV(), actorUid: request.auth.uid,
  });
  await batch.commit();
  logger.info('[otorgarConsentimientoSintomas]', { titularPersonaId, referenteUid, version: CONSENT_SINTOMAS.version });
  return { ok: true };
});

// revocarConsentimientoSintomas — el TITULAR corta. ATÓMICO: flag→false (vínculo+código) + DELETE del síntoma copiado
// (purga, minimización Ley 25.326) + registro accion:'revoca'. No basta el flag: hay que purgar el crudo en reposo.
exports.revocarConsentimientoSintomas = onCall(async (request) => {
  const titularPersonaId = await assertAfiliado(request);
  const referenteUid = String((request.data || {}).referenteUid || '').trim();
  if (!referenteUid) throw new HttpsError('invalid-argument', 'Falta el referente.');
  const espejoRef = db.collection('referentes').doc(referenteUid).collection('titulares').doc(titularPersonaId);
  const espejo = await espejoRef.get();
  if (!espejo.exists) throw new HttpsError('not-found', 'Ese vínculo no existe.');

  const batch = db.batch();
  batch.set(espejoRef, { habilitaciones: { estado: (espejo.data().habilitaciones || {}).estado !== false, sintomas: false } }, { merge: true }); // corte por regla instantáneo
  batch.delete(db.collection('sintoma_referido').doc(sintomaDocId(referenteUid, titularPersonaId))); // PURGA del crudo
  const codSnap = await db.collection('codigos_referente').where('titularPersonaId', '==', titularPersonaId).where('referenteUid', '==', referenteUid).limit(1).get();
  if (!codSnap.empty) batch.set(codSnap.docs[0].ref, { habilitaciones: { estado: true, sintomas: false } }, { merge: true });
  batch.set(db.collection('consentimientos').doc(), { titularPersonaId, referenteUid, tipo: 'sintomas', accion: 'revoca', textoConsentimiento: CONSENT_SINTOMAS.texto, version: CONSENT_SINTOMAS.version, en: FV(), actorUid: request.auth.uid });
  await batch.commit();
  logger.info('[revocarConsentimientoSintomas]', { titularPersonaId, referenteUid });
  return { ok: true };
});

// leerSintomaReferido — el REFERENTE lee el síntoma del titular tid. Es el ÚNICO camino de lectura (sintoma_referido
// es read:false) → así se puede LOGUEAR cada acceso (Firestore no da hook de read). Valida el consentimiento vivo,
// respeta la ventana 72h, REGISTRA el acceso ANTES de devolver, y devuelve {sintomas, texto} o null.
exports.leerSintomaReferido = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login requerido.');
  const refUid = request.auth.uid;
  const tid = String((request.data || {}).titularPersonaId || '').trim();
  if (!tid) throw new HttpsError('invalid-argument', 'Falta el titular.');
  // Consentimiento vivo: vínculo activo + habilitaciones.sintomas (defensa server-side, aunque el doc no se lea por regla).
  const espejo = await db.collection('referentes').doc(refUid).collection('titulares').doc(tid).get();
  const h = espejo.exists ? ((espejo.data() || {}).habilitaciones || {}) : {};
  if (!espejo.exists || (espejo.data() || {}).estado !== 'activo' || h.sintomas !== true) throw new HttpsError('permission-denied', 'No tenés autorización para ver los síntomas de esta persona.');
  // LOG del acceso (antes de devolver — el registro no depende de que la lectura del doc salga bien).
  await db.collection('accesos_sintoma').add({ referenteUid: refUid, titularPersonaId: tid, tipo: 'sintomas', en: FV() });
  const snap = await db.collection('sintoma_referido').doc(sintomaDocId(refUid, tid)).get();
  if (!snap.exists) return { sintoma: null };
  const s = snap.data() || {};
  const ms = s.actualizadoEn && s.actualizadoEn.toMillis ? s.actualizadoEn.toMillis() : 0;
  if (Date.now() - ms >= SINTOMA_VENTANA_MS) return { sintoma: null }; // fuera de la ventana 72h → como si no hubiera
  return { sintoma: { sintomas: s.sintomas || [], texto: s.texto || '' } };
});

/* ===================== GUARDIA G1 — derivarAlerta =====================
   onDocumentCreated('reportes_sintomas/{id}'): CUALQUIER reporte del afiliado → una alerta en la bandeja de la
   guardia (sin umbral, decisión de Lucas). SEGUNDO trigger sobre el MISMO path que derivarEstadoReferido: son CFs
   independientes que escriben colecciones distintas (alertas/{autogen} vs estado_referido/{personaId}) → conviven
   sin pisarse. MODELO REFERENCIA: la alerta apunta al reporte (origenReporteId), NO copia el crudo (docAlerta). */
exports.derivarAlerta = onDocumentCreated('reportes_sintomas/{id}', async (event) => {
  const data = event.data && event.data.data();
  if (!data || !data.personaId) { logger.warn('[derivarAlerta] reporte sin personaId', { id: event.params.id }); return null; }
  // G2 — guardia descubierta: ¿hay algún médico PRESENTE ahora? (estado_guardia con presenteHasta > now). Si no,
  // la alerta nace 'descubierta' (marcador, NO estado → sigue en el pool). El despachante la ve destacada; el médico
  // que llegue después también (su bandeja trae todas las 'nueva'). Query 'ligera' (limit 1) por Admin SDK.
  let descubierta = false;
  try {
    const presentes = await db.collection('estado_guardia').where('presenteHasta', '>', admin.firestore.Timestamp.now()).limit(1).get();
    descubierta = presentes.empty;
  } catch (e) { logger.error('[derivarAlerta] no se pudo chequear presencia (se marca descubierta por las dudas)', { error: e.message || String(e) }); descubierta = true; }
  const ref = await db.collection('alertas').add(docAlerta(data, event.params.id, FV(), descubierta));
  logger.info('[derivarAlerta]', { alertaId: ref.id, origenReporteId: event.params.id, personaId: data.personaId, descubierta }); // NO logueo sintomas/texto
  return null;
});

/* ===================== GUARDIA G2 — confirmarPresencia (check-in del médico) =====================
   El médico toca "Estoy de guardia". VALIDA contra el cronograma SERVER-SIDE (no se puede falsear fuera de la
   franja): busca una guardia médica vigente ahora (inicio <= now < fin, no cerrada) y estampa presenteHasta = su
   fin en estado_guardia/{uid}. La presencia expira sola por ese timestamp (la regla compara con request.time). */
exports.confirmarPresencia = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login requerido.');
  const uid = request.auth.uid;
  const u = await db.collection('usuarios').doc(uid).get();
  const roles = u.exists ? (Array.isArray((u.data() || {}).roles) ? u.data().roles : ((u.data() || {}).rol ? [u.data().rol] : [])) : [];
  if (!roles.includes('medico')) throw new HttpsError('permission-denied', 'Solo un médico confirma presencia de guardia.');
  const now = Date.now();
  // guardias del médico (personaId == su uid). Normalizo inicio/fin a ms absolutos.
  const snap = await db.collection('guardias').where('personaId', '==', uid).get();
  const guardias = snap.docs.map((d) => { const g = d.data() || {}; return { rol: g.rol, estado: g.estado, inicioMs: g.inicio && g.inicio.toMillis ? g.inicio.toMillis() : 0, finMs: g.fin && g.fin.toMillis ? g.fin.toMillis() : 0 }; });
  const vig = guardiaVigente(guardias, now);
  if (!vig) throw new HttpsError('failed-precondition', 'No tenés una guardia médica vigente en este momento.');
  const presenteHasta = admin.firestore.Timestamp.fromMillis(vig.finMs);
  await db.collection('estado_guardia').doc(uid).set({ presenteHasta, confirmadaEn: FV() }, { merge: true }); // merge → preserva atendiendo
  logger.info('[confirmarPresencia]', { uid, presenteHasta: presenteHasta.toDate().toISOString() });
  return { presenteHasta: vig.finMs };
});

/* ===================== GUARDIA G2 — mantenerAtendiendo (episodio que sobrevive) =====================
   onDocumentWritten('episodios/{id}'): recomputa estado_guardia/{medicoId}.atendiendo = pacientes (personaId) de
   los episodios ABIERTOS del médico. Cubre reasignación (recomputa el médico nuevo Y el anterior). El override
   atiendeAlerta de la regla usa esta lista → la alerta del paciente le sigue visible aunque termine la guardia. */
exports.mantenerAtendiendo = onDocumentWritten('episodios/{id}', async (event) => {
  const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  const afectados = new Set();
  if (before && before.medicoId) afectados.add(before.medicoId);
  if (after && after.medicoId) afectados.add(after.medicoId);
  for (const medicoId of afectados) {
    const eps = await db.collection('episodios').where('medicoId', '==', medicoId).get();
    const atendiendo = personasAtendidas(eps.docs.map((d) => d.data()));
    await db.collection('estado_guardia').doc(medicoId).set({ atendiendo }, { merge: true }); // merge → preserva presenteHasta
  }
  return null;
});

// (5) barrerEstadoReferido — onSchedule diaria: 'con_sintomas' con más de 72h sin refresco vuelve a 'sin_sintomas'
// (el binario significa "reportó RECIENTEMENTE"). Barrido en memoria (pocos docs). Admin SDK.
const REF_VENTANA_MS = 72 * 60 * 60 * 1000;
exports.barrerEstadoReferido = onSchedule(
  { schedule: 'every day 05:00', timeZone: 'America/Argentina/Buenos_Aires' },
  async () => {
    const corte = Date.now() - REF_VENTANA_MS;
    const snap = await db.collection('estado_referido').where('ponderacion', '==', 'con_sintomas').get();
    let vueltos = 0;
    for (const d of snap.docs) {
      const ms = (d.data().actualizadoEn && d.data().actualizadoEn.toMillis) ? d.data().actualizadoEn.toMillis() : 0;
      if (ms < corte) { await d.ref.set(docEstadoReferido('sin_sintomas', FV())); vueltos++; }
    }
    logger.info('[barrerEstadoReferido]', { revisados: snap.size, vueltos });
    return null;
  }
);

/* ===================== AUTOGESTIÓN DE PLAN — cambiarMiPlan =====================
   Self-service: el TITULAR responsable de pago cambia su plan (upgrade/downgrade/lateral). El socio NO escribe
   socios (Admin SDK). Carencia diferenciada por diff de coberturas (ganadas → carencia; mantenidas → conservan;
   perdidas → fuera). Rige el próximo período por el motor de abonos existente (sin prorrateo). Corporativo(precio 0)
   y Plan 01 legacy excluidos. */
const PLAN_EXCLUIDOS = ['plan-corporativo', 'PcB28RvKHEOrZ267ny6Z']; // corporativo (precio 0) + Plan 01 legacy
exports.cambiarMiPlan = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login requerido.');
  const uid = request.auth.uid;
  const nuevoPlanId = String((request.data || {}).planId || '').trim();
  if (!nuevoPlanId) throw new HttpsError('invalid-argument', 'Falta el plan.');

  // (1) resolver el socio del caller y validar que es el TITULAR responsable de pago.
  const u = await db.collection('usuarios').doc(uid).get();
  const personaId = u.exists ? (u.data() || {}).personaId : null;
  if (!personaId) throw new HttpsError('failed-precondition', 'Tu cuenta no está vinculada a un socio.');
  const socSnap = await db.collection('socios').where('personaId', '==', personaId).where('activo', '==', true).limit(1).get();
  if (socSnap.empty) throw new HttpsError('failed-precondition', 'No encontramos tu afiliación activa.');
  const socioRef = socSnap.docs[0].ref;
  const socio = socSnap.docs[0].data() || {};
  if (socio.esResponsablePago !== true || !socio.planId) throw new HttpsError('permission-denied', 'Solo el titular responsable de pago puede cambiar el plan.');
  if (socio.planId === nuevoPlanId) throw new HttpsError('failed-precondition', 'Ya tenés ese plan.');
  if (PLAN_EXCLUIDOS.includes(nuevoPlanId)) throw new HttpsError('permission-denied', 'Ese plan no está disponible para autogestión.');

  // (2) validar el plan nuevo + traer el viejo (para el diff de coberturas).
  const [pnSnap, pvSnap] = await Promise.all([db.collection('planes').doc(nuevoPlanId).get(), db.collection('planes').doc(socio.planId).get()]);
  if (!pnSnap.exists) throw new HttpsError('not-found', 'El plan no existe.');
  const planNuevo = pnSnap.data() || {};
  if (planNuevo.activo === false) throw new HttpsError('failed-precondition', 'Ese plan no está disponible.');
  const planViejo = pvSnap.exists ? (pvSnap.data() || {}) : {};

  // (3) carencia diferenciada por diff de coberturas.
  const now = Date.now();
  const carenciaActualMs = {};
  const cpActual = socio.carenciaPorCobertura || {};
  for (const k of Object.keys(cpActual)) { const v = cpActual[k]; carenciaActualMs[k] = v && v.toMillis ? v.toMillis() : (typeof v === 'number' ? v : 0); }
  const carMs = nuevaCarencia(carenciaActualMs, planViejo.coberturas || {}, planNuevo.coberturas || {}, planNuevo.carenciaDias || 0, now);
  const { ganadas } = diffCoberturas(planViejo.coberturas || {}, planNuevo.coberturas || {});
  const enCarencia = coberturasEnCarencia(carMs, now);
  const carenciaPorCobertura = {};
  for (const k of Object.keys(carMs)) carenciaPorCobertura[k] = admin.firestore.Timestamp.fromMillis(carMs[k]);

  // (4) batch: cambia el plan + carencia + log. El motor de abonos existente cobra la cuota nueva el próximo período.
  const logRef = db.collection('cambios_plan').doc();
  const batch = db.batch();
  batch.set(socioRef, { planId: nuevoPlanId, planCambiadoEn: FV(), carenciaPorCobertura }, { merge: true });
  batch.set(logRef, {
    socioId: socioRef.id, personaId,
    planViejo: socio.planId, planViejoNombre: planViejo.nombre || '',
    planNuevo: nuevoPlanId, planNuevoNombre: planNuevo.nombre || '',
    coberturasGanadas: ganadas, coberturasEnCarencia: enCarencia,
    carenciaDias: planNuevo.carenciaDias || 0,
    en: FV(), actorUid: uid,
  });
  await batch.commit();
  logger.info('[cambiarMiPlan]', { socioId: socioRef.id, de: socio.planId, a: nuevoPlanId, ganadas: ganadas.length, enCarencia: enCarencia.length });
  return { ok: true, coberturasEnCarencia: enCarencia };
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
