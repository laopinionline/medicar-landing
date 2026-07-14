// Fase-usuarios-hardening — backfill de `staff.nombre` (fuente NO sensible para los selectores de Móviles/Cronograma).
// Lee el nombre desde personas/{personaId} y lo denormaliza en staff/{id}. Formato "Apellido, Nombre".
// Idempotente. NO toca personas ni usuarios.
//
//   node backfill-staff-nombre.js           -> DRY-RUN (no escribe). SEGURO.
//   node backfill-staff-nombre.js --apply   -> escribe staff.nombre.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');
const nombreStaff = (a, n) => ((a || '') + ', ' + (n || '')).replace(/^, /, '').replace(/, $/, '') || '';

(async () => {
  console.log(`=== backfill staff.nombre — ${APPLY ? 'APPLY' : 'DRY-RUN (no escribe)'} ===`);
  const staff = await db.collection('staff').get();
  console.log('staff docs:', staff.size, '\n');
  let escritos = 0, saltados = 0;
  for (const d of staff.docs) {
    const s = d.data();
    const pid = s.personaId || d.id;
    let nombre = '';
    try { const per = await db.collection('personas').doc(pid).get(); if (per.exists) { const p = per.data(); nombre = nombreStaff(p.apellido, p.nombre) || p.dni || ''; } } catch (_) {}
    const yaOk = s.nombre === nombre && nombre;
    console.log(`  ${d.id.slice(0, 10)}… rol=${(s.rol || '').padEnd(12)} nombre actual=${JSON.stringify(s.nombre || null)} → ${JSON.stringify(nombre)}${yaOk ? '  (ya OK)' : ''}`);
    if (yaOk) { saltados++; continue; }
    if (!nombre) { console.log('     ⚠ sin nombre en persona; se deja como está'); saltados++; continue; }
    if (APPLY) { await db.collection('staff').doc(d.id).set({ nombre }, { merge: true }); }
    escritos++;
  }
  console.log(`\n${APPLY ? 'APLICADO' : 'DRY-RUN'}: ${escritos} a escribir, ${saltados} sin cambio.`);
  if (!APPLY) console.log('Correr con --apply para escribir.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
