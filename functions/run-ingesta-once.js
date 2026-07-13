'use strict';
// PWA-2a — runner MANUAL de la ingesta (una vez, para evidencia real). Usa el service account de seed/ contra PROD.
// NO es parte del deploy (la CF es exports.ingestarFeed). Corre local: node functions/run-ingesta-once.js
const admin = require('firebase-admin');
const svc = require('../seed/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(svc) });
const { ingestarFeeds } = require('./feed-ingesta');
(async () => {
  const t0 = Date.now();
  const { resultados, retencion } = await ingestarFeeds(admin.firestore());
  console.log('\n=== INGESTA feed_posts (log por fuente) ===');
  for (const r of resultados) {
    console.log(`${r.error ? '✗' : '✓'} ${String(r.fuente).padEnd(12)} [${r.cat}/${r.origen}]  leídos:${r.leidos}  nuevos:${r.nuevos}  yaExisten:${r.yaExisten}  autoDescApuestas:${r.autoDescartados}${r.error ? ('  ERROR ' + r.error) : ''}`);
  }
  const tot = resultados.reduce((a, r) => ({ leidos: a.leidos + r.leidos, nuevos: a.nuevos + r.nuevos, ya: a.ya + r.yaExisten, auto: a.auto + r.autoDescartados }), { leidos: 0, nuevos: 0, ya: 0, auto: 0 });
  console.log(`--- TOTAL leídos:${tot.leidos}  nuevos:${tot.nuevos}  yaExisten:${tot.ya}  autoDescartadosApuestas:${tot.auto}  ·  ${resultados.filter(r => r.error).length} fuente(s) con error ---`);
  console.log('retención:', JSON.stringify(retencion), `·  ${Math.round((Date.now() - t0) / 1000)}s`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
