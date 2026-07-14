// contable-abonos — backfill de `socios.nombreVista` (denorm del nombre, fuente para generarAbonos).
// Lee el nombre desde personas/{personaId} y lo denormaliza en socios/{id}. Formato "Apellido, Nombre" || dni.
// Idempotente. NO toca personas ni ningún dato clínico (solo apellido/nombre/dni).
//
//   node backfill-socio-nombre.js           -> DRY-RUN (no escribe). SEGURO.
//   node backfill-socio-nombre.js --apply   -> escribe socios.nombreVista.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');
const nom = (a, n, dni) => (((a || '') + ', ' + (n || '')).replace(/^, /, '').replace(/, $/, '')) || dni || '';

(async () => {
  console.log(`=== backfill socios.nombreVista — ${APPLY ? 'APPLY' : 'DRY-RUN (no escribe)'} ===`);
  const soc = await db.collection('socios').get();
  console.log('socios:', soc.size, '\n');
  let escritos = 0, ok = 0, sin = 0;
  for (const d of soc.docs) {
    const s = d.data();
    let nombre = '';
    if (s.personaId) { try { const per = await db.collection('personas').doc(s.personaId).get(); if (per.exists) { const p = per.data(); nombre = nom(p.apellido, p.nombre, p.dni); } } catch (_) {} }
    const yaOk = s.nombreVista === nombre && nombre;
    const tag = yaOk ? '(ya OK)' : (!nombre ? '⚠ sin nombre en persona' : '→ escribir');
    console.log(`  ${d.id.slice(0, 10)}… nº=${String(s.numeroAfiliado || '').padEnd(8)} actual=${JSON.stringify(s.nombreVista || null)} nuevo=${JSON.stringify(nombre)}  ${tag}`);
    if (yaOk) { ok++; continue; }
    if (!nombre) { sin++; continue; }
    if (APPLY) { await db.collection('socios').doc(d.id).set({ nombreVista: nombre }, { merge: true }); }
    escritos++;
  }
  console.log(`\n${APPLY ? 'APLICADO' : 'DRY-RUN'}: ${escritos} a escribir, ${ok} ya OK, ${sin} sin nombre.`);
  if (!APPLY) console.log('Correr con --apply para escribir.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
