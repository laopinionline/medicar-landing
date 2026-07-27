// Carnet pleno — backfill de `socios.dni` (denorm del DNI, dato de CARNET para la tarjeta del grupo).
// Lee el DNI desde personas/{personaId} y lo denormaliza en socios/{id}. El DNI NO es dato de salud: es identidad de
// cobertura, para que la tarjeta de cada integrante del grupo lo muestre sin que el titular lea la persona ajena.
// Idempotente. NO toca personas ni nada clínico (solo dni).
//
//   node backfill-socio-dni.js           -> DRY-RUN (no escribe). SEGURO.
//   node backfill-socio-dni.js --apply   -> escribe socios.dni.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');

(async () => {
  console.log(`=== backfill socios.dni — ${APPLY ? 'APPLY' : 'DRY-RUN (no escribe)'} ===`);
  const soc = await db.collection('socios').get();
  console.log('socios:', soc.size, '\n');
  let escritos = 0, ok = 0, sin = 0, deps = 0;
  for (const d of soc.docs) {
    const s = d.data();
    let dni = '';
    if (s.personaId) { try { const per = await db.collection('personas').doc(s.personaId).get(); if (per.exists) dni = String(per.data().dni || '').trim(); } catch (_) {} }
    const actual = String(s.dni || '').trim();
    const yaOk = actual && actual === dni;
    const esDep = !!s.titularSocioId;
    if (esDep) deps++;
    const tag = yaOk ? '(ya OK)' : (!dni ? '⚠ sin dni en persona' : '→ escribir');
    console.log(`  ${d.id.slice(0, 10)}… nº=${String(s.numeroAfiliado || '').padEnd(9)}${esDep ? '[dep] ' : '     '}actual=${JSON.stringify(s.dni || null)} nuevo=${JSON.stringify(dni || null)}  ${tag}`);
    if (yaOk) { ok++; continue; }
    if (!dni) { sin++; continue; }
    if (APPLY) { await db.collection('socios').doc(d.id).set({ dni }, { merge: true }); }
    escritos++;
  }
  console.log(`\n${APPLY ? 'APLICADO' : 'DRY-RUN'}: ${escritos} a escribir · ${ok} ya OK · ${sin} sin dni en persona · (${deps} dependientes en total).`);
  if (!APPLY) console.log('Correr con --apply para escribir.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
