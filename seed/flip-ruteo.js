'use strict';
/* MEDICAR IA — FLIP a modo 'ruteo' (semáforo determinista claude/ollama). Lo corre LUCAS (DATA, no deploy).
 * MERGE seguro: NO pisa url/token/CF-Access del túnel. Setea proveedor='ruteo' + la apiKey de Claude de prod.
 *   ANTHROPIC_API_KEY=sk-ant-... node seed/flip-ruteo.js      (key por env — recomendado)
 *   node seed/flip-ruteo.js sk-ant-...                         (key por arg)
 *   node seed/flip-ruteo.js --ollama                           (ROLLBACK a ollama; no toca apiKey)
 * La cascada y el mapa categoría→proveedor tienen defaults en código (asistente-ruteo); para cambiarlos, editar
 * asistente_secreto/config.ruteo = { mapa:{salud,rojo,urgencia,resto}, cascada:bool } (DATA, sin redeploy).
 */
const path = require('path'), admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const arg = process.argv[2];

(async () => {
  if (arg === '--ollama') {
    await db.doc('asistente_secreto/config').set({ proveedor: 'ollama' }, { merge: true });
    console.log('✓ rollback: proveedor=ollama (apiKey/ruteo/url intactos)');
    return process.exit(0);
  }
  const apiKey = (arg && arg.startsWith('sk-ant-')) ? arg : (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!/^sk-ant-/.test(apiKey)) { console.error('Falta la API key de Claude (arg sk-ant-... o env ANTHROPIC_API_KEY).'); process.exit(1); }
  await db.doc('asistente_secreto/config').set({
    proveedor: 'ruteo', apiKey, modelClaude: 'claude-haiku-4-5', maxTokens: 512,
    timeoutMs: 25000, timeoutClaudeMs: 18000, // presupuesto de cascada ≈ 43s (< 60s del CF)
  }, { merge: true });
  const d = (await db.doc('asistente_secreto/config').get()).data();
  console.log('✓ proveedor=ruteo · modelClaude=' + d.modelClaude + ' · apiKey=[set] · url=' + d.url + ' · CF-Access=' + (!!d.accessClientId));
  console.log('  cascada ON (defaults en código). Rollback: node seed/flip-ruteo.js --ollama');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
