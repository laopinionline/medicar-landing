// Verificación EN VIVO de la mecánica A2-b (NO la push — la cañería enqueue/cancel/revalidación).
// Ejercita los callables REALES deployados (reservarTurno/cancelarTurno) e inspecciona Cloud Tasks por REST.
// Autenticación sin passwords: custom token (Admin) → idToken (Identity Toolkit REST).
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();
const { GoogleAuth } = require('google-auth-library');
const { instanteTurno } = require('../functions/push-turno');

const PROJECT = 'medicar-sistema';
const REGION = 'southamerica-east1';
const APIKEY = 'AIzaSyCXCkuaFC_8qMPAEIUlBoQiv7hBgFDq1iw';
const CALLABLE = (fn) => `https://${REGION}-${PROJECT}.cloudfunctions.net/${fn}`;
const QUEUE_TASK = (id) => `https://cloudtasks.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/queues/recordarTurno/tasks/${id}`;
const TITULAR = { uid: '5mx273Fu17POXBcZF9nppveY9nh2', persona: 'demo-titular', email: 'titulardemo@medicaronline.ar' };
const AFIL = { uid: 'It71hNRaHqXnxCzoEGYEMPT4z8h1', persona: 'demo-afiliado-90001', email: 'afiliadodemo@medicaronline.ar' };

const pad = (n) => String(n).padStart(2, '0');
const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const arNow = () => { // fecha 'YYYY-MM-DD' y minuto-del-día en horario Argentina
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const [h, m] = hm.split(':').map(Number);
  return { fecha: f, min: h * 60 + m };
};
const masDias = (fecha, n) => { const d = new Date(fecha + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(d); };

async function idToken(uid) {
  const ct = await admin.auth().createCustomToken(uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${APIKEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ct, returnSecureToken: true }) });
  const j = await r.json();
  if (!j.idToken) throw new Error('signInWithCustomToken falló: ' + JSON.stringify(j));
  return j.idToken;
}
async function callable(fn, token, data) {
  const r = await fetch(CALLABLE(fn), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ data }) });
  const j = await r.json();
  if (j.error) throw new Error(`${fn} error: ` + JSON.stringify(j.error));
  return j.result;
}
async function getTask(id) {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'], keyFile: __dirname + '/serviceAccountKey.json' });
  const client = await auth.getClient();
  try { const res = await client.request({ url: QUEUE_TASK(id) }); return { found: true, scheduleTime: res.data.scheduleTime, name: res.data.name }; }
  catch (e) { const code = e.response && e.response.status; return { found: false, status: code }; }
}
// deja limpio el máx-1-activo: cancela (Admin) cualquier turno 'creado' futuro de la persona
async function limpiarActivos(persona) {
  const hoy = arNow().fecha;
  const q = await db.collection('turnos').where('personaId', '==', persona).where('estado', '==', 'creado').get();
  let n = 0;
  for (const d of q.docs) { if (String((d.data() || {}).fecha || '') >= hoy) { await d.ref.update({ estado: 'cancelado', canceladoEn: admin.firestore.FieldValue.serverTimestamp() }); n++; } }
  return n;
}

(async () => {
  const now = arNow();
  console.log(`\n== AR now: ${now.fecha} ${toHHMM(now.min)} (min ${now.min}) ==\n`);

  // ── franjas de prueba ──
  // A (LEJANA, >2hs): +180min, redondeado a slot de 30'. Si cruza medianoche → mañana 10:00.
  let minA = Math.ceil((now.min + 180) / 30) * 30, fechaA = now.fecha;
  if (minA + 30 > 1440) { fechaA = masDias(now.fecha, 1); minA = 600; }
  // B (INMINENTE, <2hs): +45min redondeado a 30' (queda < 2hs y en el futuro).
  let minB = Math.ceil((now.min + 45) / 30) * 30, fechaB = now.fecha;
  if (minB + 30 > 1440) { console.error('Demasiado cerca de medianoche AR para el test <2hs. Reintentá más temprano.'); process.exit(2); }
  const horaA = toHHMM(minA), horaB = toHHMM(minB);
  const franjaA = { fecha: fechaA, horaInicio: horaA, horaFin: toHHMM(minA + 30), duracionSlotMin: 30, activa: true, medicoId: 'medDemo', medicoNombre: 'Dra. Verif A2b', slotsTomados: [], _verifA2b: true };
  const franjaB = { ...franjaA, fecha: fechaB, horaInicio: horaB, horaFin: toHHMM(minB + 30), medicoNombre: 'Dr. Verif A2b', slotsTomados: [] };
  const refA = await db.collection('agenda_turnos').add(franjaA);
  const refB = await db.collection('agenda_turnos').add(franjaB);
  console.log(`franja A (lejana): ${fechaA} ${horaA}  agendaId=${refA.id}`);
  console.log(`franja B (inminente): ${fechaB} ${horaB}  agendaId=${refB.id}`);

  const limpA = await limpiarActivos(TITULAR.persona), limpB = await limpiarActivos(AFIL.persona);
  if (limpA || limpB) console.log(`(limpieza previa máx-1-activo: titular ${limpA}, afiliado ${limpB})`);

  // ── (a) reservar LEJANO con titulardemo ──
  console.log('\n──────── (a) turno >2hs → debe encolar ────────');
  const tokT = await idToken(TITULAR.uid);
  const resA = await callable('reservarTurno', tokT, { agendaId: refA.id, hora: horaA });
  const turnoAId = resA.turnoId;
  const docA = (await db.collection('turnos').doc(turnoAId).get()).data();
  const taskIdEsperado = String(turnoAId).split('').reverse().join('');
  const cuandoEsperado = new Date(instanteTurno(fechaA, horaA).getTime() - 2 * 3600 * 1000);
  console.log(`turnoId=${turnoAId}`);
  console.log(`  turno.recordatorioTaskId = ${docA.recordatorioTaskId}  ${docA.recordatorioTaskId === taskIdEsperado ? '✓ (=turnoId invertido)' : '✗ ESPERABA ' + taskIdEsperado}`);
  const taskA = await getTask(docA.recordatorioTaskId);
  const okST = taskA.found && Math.abs(new Date(taskA.scheduleTime).getTime() - cuandoEsperado.getTime()) < 60000;
  console.log(`  Cloud Tasks task encolada: ${taskA.found ? 'SÍ' : 'NO (status ' + taskA.status + ')'}`);
  console.log(`  scheduleTime real     = ${taskA.scheduleTime}`);
  console.log(`  scheduleTime esperado = ${cuandoEsperado.toISOString()}  (= horaTurno−2hs)  ${okST ? '✓ COINCIDE' : '✗'}`);

  // ── (b) reservar INMINENTE con afiliadodemo ──
  console.log('\n──────── (b) turno <2hs → NO debe encolar ────────');
  const tokA = await idToken(AFIL.uid);
  const resB = await callable('reservarTurno', tokA, { agendaId: refB.id, hora: horaB });
  const turnoBId = resB.turnoId;
  const docB = (await db.collection('turnos').doc(turnoBId).get()).data();
  console.log(`turnoId=${turnoBId}  (reservado ✓, estado=${docB.estado})`);
  console.log(`  turno.recordatorioTaskId = ${docB.recordatorioTaskId}  ${docB.recordatorioTaskId === null ? '✓ null → NO encoló (inminente)' : '✗ ESPERABA null'}`);

  // ── (c) cancelar el LEJANO → la task se borra ──
  console.log('\n──────── (c) cancelar (a) → la task se borra ────────');
  await callable('cancelarTurno', tokT, { turnoId: turnoAId });
  const docAc = (await db.collection('turnos').doc(turnoAId).get()).data();
  const taskAc = await getTask(docA.recordatorioTaskId);
  console.log(`  turno.estado = ${docAc.estado}`);
  console.log(`  Cloud Tasks task tras cancelar: ${taskAc.found ? '✗ TODAVÍA EXISTE' : '✓ BORRADA (status ' + taskAc.status + ')'}`);

  // datos para el paso (d) y la limpieza
  console.log('\n== IDS ==');
  console.log(JSON.stringify({ turnoAId, turnoBId, agendaA: refA.id, agendaB: refB.id, taskIdA: docA.recordatorioTaskId, fechaB, horaB }));
  process.exit(0);
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
