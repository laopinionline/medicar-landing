'use strict';
/* PARIDAD Fase-cargos (READ-ONLY). GOLDEN = los cargos que YA produjo el motor client-side. Para cada cargo, busca su
 * episodio (por episodioId) y corre el NÚCLEO PURO sobre él + las tarifas ACTUALES; compara el cargo candidato contra
 * el golden en los campos de GENERACIÓN (regla, tarifa, precioSugerido base, tipo, personaId, socioId, nroIncidenteFmt).
 * precioFinal NO se compara (puede haberse ajustado a mano post-generación). Distingue drift de config de fallo real. */
const path = require('path'), admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const { cargoDeEpisodio } = require('../functions/cargos-nucleo');
const CAMPOS = ['regla', 'tarifaId', 'tarifaNombre', 'tipoCalculo', 'precioSugerido', 'valorPorKm', 'personaId', 'socioId', 'nroIncidenteFmt'];

(async () => {
  const [cgSnap, epSnap, tarSnap] = await Promise.all([db.collection('cargos').get(), db.collection('episodios').get(), db.collection('tarifas').get()]);
  const eps = {}; epSnap.docs.forEach((d) => { eps[d.id] = d.data(); });
  const tarifas = tarSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const golden = cgSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log('Cargos en prod:', golden.length, '· episodios:', epSnap.size, '· tarifas:', tarifas.length, '\n');

  let match = 0, diff = 0, sinEp = 0;
  for (const g of golden) {
    const ep = eps[g.episodioId];
    if (!ep) { console.log(`· ${g.id} (INC ${g.nroIncidente}) — episodio ${g.episodioId} ya no existe (no comparable)`); sinEp++; continue; }
    const anio = ep.creadoEn && ep.creadoEn.toDate ? ep.creadoEn.toDate().getFullYear() : (g.nroIncidenteFmt ? Number(String(g.nroIncidenteFmt).split('-')[1]) : 2026);
    const r = cargoDeEpisodio(ep, g.episodioId, tarifas, anio);
    if (r.skip) { console.log(`✗ ${g.id} (INC ${g.nroIncidente}) — el núcleo NO generaría cargo (skip:${r.skip}) pero el golden SÍ existe`); diff++; continue; }
    const dif = CAMPOS.filter((k) => JSON.stringify(r.cargo[k]) !== JSON.stringify(g[k]));
    if (!dif.length) { console.log(`✓ ${g.id} (INC ${g.nroIncidente}) · regla ${g.regla} · ${g.tarifaNombre} · base $${g.precioSugerido}`); match++; }
    else {
      diff++; console.log(`✗ ${g.id} (INC ${g.nroIncidente}) DIFERENCIA en: ${dif.join(', ')}`);
      dif.forEach((k) => console.log(`      ${k}: golden ${JSON.stringify(g[k])} vs candidato ${JSON.stringify(r.cargo[k])}`));
      console.log('      (si es precioSugerido/tarifaNombre = la tarifa cambió desde la generación = DRIFT; si es regla/tarifaId = paridad)');
    }
  }
  console.log(`\n═══ RESUMEN: ${match} OK · ${diff} diferencia(s) · ${sinEp} sin episodio ═══`);
  console.log(diff === 0 ? '✓ PARIDAD: el núcleo reproduce los cargos del motor cliente.' : '⚠ Revisar diferencias (drift vs paridad).');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message || e); process.exit(1); });
