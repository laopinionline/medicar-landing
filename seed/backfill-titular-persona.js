'use strict';
/*
 * F1 (denorm afiliado) — Backfill de titularPersonaId + nombreVista en los socios DEPENDIENTES existentes.
 * Universo: socios con titularSocioId (dependientes). Por cada uno:
 *   - titularPersonaId = personaId del socio titular (titularSocioId → socios/{tit}.personaId)  [llave de scoping para F2]
 *   - nombreVista      = "Apellido, Nombre" de la persona del dependiente (mismo formato que generarAbonos.socioNombre)
 * Idempotente (merge; re-correr no duplica). Skip+log si falta el titular, su personaId, o la persona del dependiente.
 * NO toca numeración, ni el espejo pacientes, ni reglas. Solo escribe esos 2 campos en socios/{dep}.
 *   node seed/backfill-titular-persona.js           # dry-run
 *   node seed/backfill-titular-persona.js --apply    # aplica
 */
const path = require('path');
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const FV = () => admin.firestore.FieldValue.serverTimestamp();

const nombreDe = (p) => (((((p || {}).apellido) || '') + ', ' + (((p || {}).nombre) || '')).replace(/^, /, '').replace(/, $/, '')) || ((p || {}).dni) || '';

(async () => {
  console.log(`\n[bf-titular] Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);
  const socSnap = await db.collection('socios').get();
  const deps = socSnap.docs.filter(d => (d.data() || {}).titularSocioId);
  console.log(`[bf-titular] socios: ${socSnap.size} · dependientes (con titularSocioId): ${deps.length}`);
  if (!deps.length) { console.log('\n[bf-titular] Universo VACÍO — nada para backfillear (los nuevos nacen con la llave desde el alta).\n'); process.exit(0); }

  // Cache de titulares y personas ya leídos (evita gets repetidos).
  const socById = {}; socSnap.docs.forEach(d => { socById[d.id] = d.data(); });
  const cont = { escritos: 0, skip: 0, sinCambio: 0 };
  const plan = [];

  for (const d of deps) {
    const dep = d.data();
    const tit = socById[dep.titularSocioId] || (await db.collection('socios').doc(dep.titularSocioId).get()).data();
    if (!tit || !tit.personaId) { console.log(`  SKIP ${d.id} N°${dep.numeroAfiliado}: titular ${dep.titularSocioId} inexistente o sin personaId`); cont.skip++; continue; }
    let per = null;
    if (dep.personaId) { const ps = await db.collection('personas').doc(dep.personaId).get(); per = ps.exists ? ps.data() : null; }
    const titularPersonaId = tit.personaId;
    const nombreVista = nombreDe(per);
    const yaOk = dep.titularPersonaId === titularPersonaId && dep.nombreVista === nombreVista;
    if (yaOk) { cont.sinCambio++; plan.push(`  = ${d.id} N°${dep.numeroAfiliado}: ya OK (titularPersonaId+nombreVista)`); continue; }
    plan.push(`  → ${d.id} N°${dep.numeroAfiliado}: titularPersonaId=${titularPersonaId} · nombreVista="${nombreVista}"${per ? '' : ' (persona del dependiente FALTA → nombreVista vacío)'}`);
    if (APPLY) { await d.ref.set({ titularPersonaId, nombreVista, actualizadoEn: FV() }, { merge: true }); }
    cont.escritos++;
  }

  plan.forEach(l => console.log(l));
  console.log(`\n[bf-titular] ${APPLY ? 'ESCRITO' : 'A escribir'}: ${cont.escritos} · ya OK: ${cont.sinCambio} · skip: ${cont.skip}`);
  if (!APPLY) console.log('\n[bf-titular] DRY-RUN: nada escrito. Corré con --apply.\n');
  process.exit(0);
})().catch(e => { console.error('[bf-titular] ERROR:', e.message); process.exit(1); });
