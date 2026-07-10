'use strict';
/*
 * Seed one-shot: inicializa los contadores de numeración de socios por serie.
 *   contadores/socios_directo (20xxx) · socios_corp (30xxx) · socios_area (40xxx)
 *
 * Lee el máximo numeroAfiliado NUMÉRICO (parte pelada, antes de un '-') por serie sobre socios Y pacientes,
 * y setea ultimo = max(base_serie, máximo encontrado). Así los números nuevos caen ARRIBA de lo histórico y
 * nunca colisionan. NO baja un contador ya existente (usa transacción max()).
 * DRY-RUN por defecto (reporta los máximos); escribe solo con --apply.
 *
 *   node seed/seed-contadores-socios.js            # dry-run (no escribe)
 *   node seed/seed-contadores-socios.js --apply    # aplica
 *
 * Requiere serviceAccountKey.json (gitignoreada, ver README).
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(KEY)) { console.error('[contadores] falta serviceAccountKey.json'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

const SERIES = [
  { key: 'directo', counter: 'socios_directo', base: 20000, min: 20000, max: 29999 },
  { key: 'corp',    counter: 'socios_corp',    base: 30000, min: 30000, max: 39999 },
  { key: 'area',    counter: 'socios_area',    base: 40000, min: 40000, max: 49999 },
];

// Parte pelada (antes de un '-') como entero; null si no es numérico.
function bareNum(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  const bare = s.split('-')[0].replace(/\D/g, '');
  if (!bare) return null;
  const n = parseInt(bare, 10);
  return Number.isFinite(n) ? n : null;
}

(async () => {
  console.log(`\n[contadores] Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}\n`);

  const nums = [];
  for (const col of ['socios', 'pacientes']) {
    const snap = await db.collection(col).get();
    snap.forEach(d => { const n = bareNum((d.data() || {}).numeroAfiliado); if (n != null) nums.push({ col, id: d.id, n }); });
    console.log(`[contadores] ${col}: ${snap.size} docs leídos`);
  }

  const fuera = nums.filter(x => !SERIES.some(s => x.n >= s.min && x.n <= s.max));
  console.log(`[contadores] numeroAfiliado numéricos: ${nums.length} · fuera de rango 20000-49999: ${fuera.length}`);
  if (fuera.length) {
    const muestra = fuera.slice(0, 20).map(x => x.n).join(', ');
    console.log(`  fuera de rango (NO afectan contadores): ${muestra}${fuera.length > 20 ? ' …' : ''}`);
  }

  for (const s of SERIES) {
    const enSerie = nums.filter(x => x.n >= s.min && x.n <= s.max);
    const maxFound = enSerie.reduce((m, x) => Math.max(m, x.n), 0);
    const ultimo = Math.max(s.base, maxFound);
    console.log(`\n[serie ${s.key}] contadores/${s.counter}`);
    console.log(`  en serie: ${enSerie.length} números · máximo encontrado: ${maxFound || '(ninguno)'} · base: ${s.base}`);
    console.log(`  -> ultimo = max(${s.base}, ${maxFound}) = ${ultimo}   (próximo número = ${ultimo + 1})${APPLY ? '' : '   (dry-run)'}`);
    if (APPLY) {
      const ref = db.collection('contadores').doc(s.counter);
      await db.runTransaction(async tx => {
        const cs = await tx.get(ref);
        const actual = cs.exists ? (cs.data().ultimo || 0) : 0;
        const nuevo = Math.max(actual, ultimo);   // nunca baja
        tx.set(ref, { ultimo: nuevo, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      });
    }
  }

  console.log(`\n[contadores] ${APPLY ? 'ESCRITO.' : 'DRY-RUN: nada escrito. Correr con --apply para aplicar.'}\n`);
  process.exit(0);
})().catch(e => { console.error('[contadores] ERROR:', e); process.exit(1); });
