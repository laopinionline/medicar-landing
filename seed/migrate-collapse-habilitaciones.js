'use strict';
/*
 * Migración — Colapso del acceso del referente a UN SOLO nivel de salud.
 * Elimina el flag binario `habilitaciones.estado` (la ex-ponderación "reportó/no reportó") de los vínculos y de sus
 * códigos, dejando `habilitaciones.sintomas` (el ÚNICO permiso de salud) TAL CUAL está.
 *
 * GARANTÍA (lo que pidió Lucas): NADIE hereda acceso. El script NUNCA setea sintomas:true. Un referente que hoy ve
 * el binario (estado:true, sintomas:false) queda en {sintomas:false} → deja de ver NADA de salud hasta que el titular
 * consienta explícitamente (con su texto). El estado:true viejo se APAGA, no se convierte en consentimiento.
 * Invariante post-migración: acceso a salud ⟺ habilitaciones.sintomas==true ⟺ existe un registro consentimientos/.
 *
 * Además purga los docs huérfanos estado_referido/* (la colección del binario, ya sin lectores ni CFs).
 *
 *   node seed/migrate-collapse-habilitaciones.js            # dry-run (no escribe nada)
 *   node seed/migrate-collapse-habilitaciones.js --apply
 * Idempotente: correrlo dos veces no cambia nada la segunda vez.
 */
const path = require('path');
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const DEL = admin.firestore.FieldValue.delete();

// Calcula los cambios de un doc con `habilitaciones`: borrar 'estado', y si falta 'sintomas' fijarlo en false (NUNCA true).
function planHabilitaciones(data) {
  const h = (data && data.habilitaciones) || {};
  const upd = {};
  if ('estado' in h) upd['habilitaciones.estado'] = DEL;         // apaga el binario viejo
  if (!('sintomas' in h)) upd['habilitaciones.sintomas'] = false; // asegura el flag único; jamás true
  return upd;
}

(async () => {
  console.log(`\n[colapso-salud] Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);
  let heredadosApagados = 0; // referentes que HOY tienen estado:true y sintomas!=true → pierden el acceso heredado

  // 1) Espejos de vínculos: referentes/{refUid}/titulares/{tid}
  console.log('── Vínculos (referentes/*/titulares/*) ──');
  const vSnap = await db.collectionGroup('titulares').get();
  let vTocados = 0, vOk = 0;
  for (const d of vSnap.docs) {
    const parentCol = d.ref.parent.parent && d.ref.parent.parent.parent ? d.ref.parent.parent.parent.id : '';
    if (parentCol !== 'referentes') continue; // solo los vínculos del referente
    const data = d.data() || {};
    const h = data.habilitaciones || {};
    const upd = planHabilitaciones(data);
    if (h.estado === true && h.sintomas !== true) heredadosApagados++;
    if (!Object.keys(upd).length) { vOk++; continue; }
    vTocados++;
    console.log(`  ${d.ref.path}  ${JSON.stringify(h)} → borra estado${('habilitaciones.sintomas' in upd) ? ' + sintomas=false' : ''} (sintomas queda: ${h.sintomas === true ? 'true (consentido, intacto)' : 'false'})`);
    if (APPLY) await d.ref.update(upd);
  }
  console.log(`  Vínculos: ${vOk} ya OK · ${vTocados} ${APPLY ? 'actualizados' : 'a actualizar'}`);

  // 2) Códigos (espejo del flag que lee el titular): codigos_referente/*
  console.log('\n── Códigos (codigos_referente/*) ──');
  const cSnap = await db.collection('codigos_referente').get();
  let cTocados = 0, cOk = 0;
  for (const d of cSnap.docs) {
    const data = d.data() || {};
    const h = data.habilitaciones || {};
    const upd = planHabilitaciones(data);
    if (!Object.keys(upd).length) { cOk++; continue; }
    cTocados++;
    console.log(`  ${d.ref.path}  ${JSON.stringify(h)} → borra estado${('habilitaciones.sintomas' in upd) ? ' + sintomas=false' : ''}`);
    if (APPLY) await d.ref.update(upd);
  }
  console.log(`  Códigos: ${cOk} ya OK · ${cTocados} ${APPLY ? 'actualizados' : 'a actualizar'}`);

  // 3) Purga de la colección huérfana estado_referido/* (binario retirado)
  console.log('\n── Purga estado_referido/* (huérfano) ──');
  const eSnap = await db.collection('estado_referido').get();
  for (const d of eSnap.docs) {
    console.log(`  borrar ${d.ref.path}  ${JSON.stringify(d.data())}`);
    if (APPLY) await d.ref.delete();
  }
  console.log(`  estado_referido: ${eSnap.size} docs ${APPLY ? 'borrados' : 'a borrar'}`);

  console.log(`\n🔑 Referentes que pierden acceso HEREDADO (estado:true, sin consentimiento de síntoma): ${heredadosApagados}`);
  console.log('   → tras migrar NO ven nada de salud hasta que el titular consienta. Ninguno hereda acceso.');
  if (!APPLY) console.log('\nDRY-RUN: nada escrito. Corré con --apply.\n');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
