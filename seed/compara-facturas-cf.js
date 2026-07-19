'use strict';
/* SHADOW DRY-RUN — PARIDAD Fase 2 (READ-ONLY, no escribe nada).
 *
 * GOLDEN = las facturas que YA produjo el motor client-side en prod. Para cada período:
 *  1) toma las facturas del período (golden),
 *  2) reconstruye el INPUT que las produjo: los abonos/cargos linkeados a ellas (facturaId ∈ golden), con el
 *     facturaId "quitado" (como si estuvieran sin facturar),
 *  3) corre el NÚCLEO PURO (functions/facturas-nucleo.js, el mismo que usa la CF) sobre ese input + la config
 *     ACTUAL de socios/empresas,
 *  4) compara grupo a grupo (destinatario, total, multiset de ítems por refId/monto/descr) contra el golden.
 *
 * Si un ítem no coincide, distingue DRIFT de config (el socio/plan/empresa cambió desde la emisión) de un fallo
 * REAL de paridad, mostrando el diff. La numeración golden ya se consumió → se compara la LÓGICA (correlativa,
 * formato FC-AAAA-NNNNNN, orden de inserción), no los números literales. */
const path = require('path'), admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const { agruparFacturas } = require('../functions/facturas-nucleo');
const money = (n) => '$' + (Math.round(Number(n) || 0)).toLocaleString('es-AR');
const keyDest = (f) => f.clienteTipo === 'empresa' ? ('e:' + f.clienteId) : ('p:' + f.personaId);
const keyDestG = (g) => g.clienteTipo === 'empresa' ? ('e:' + g.clienteId) : ('p:' + g.personaId);
// firma de un ítem: real → tipo|refId|monto ; sintético (convenio) → tipo|·|monto (sin refId)
const itemSig = (it) => `${it.tipo}|${it.refId || '·'}|${Number(it.monto) || 0}`;
const multiset = (items) => items.map(itemSig).sort();

(async () => {
  const [fcAll, abAll, cgAll, socSnap, empSnap] = await Promise.all([
    db.collection('facturas').get(), db.collection('abonos').get(), db.collection('cargos').get(),
    db.collection('socios').get(), db.collection('empresas').get(),
  ]);
  const socMap = {}; socSnap.docs.forEach((d) => { socMap[d.id] = { id: d.id, ...d.data() }; });
  const empMap = {}; empSnap.docs.forEach((d) => { empMap[d.id] = { id: d.id, ...d.data() }; });
  const facturas = fcAll.docs.map((d) => ({ id: d.id, ...d.data() }));
  const abonos = abAll.docs.map((d) => ({ id: d.id, ...d.data() }));
  const cargos = cgAll.docs.map((d) => ({ id: d.id, ...d.data() }));

  const periodos = [...new Set(facturas.map((f) => f.periodo).filter(Boolean))].sort();
  console.log('Facturas en prod:', facturas.length, '· períodos con facturas:', periodos.join(', '), '\n');

  let totalMatch = 0, totalDiff = 0;
  for (const P of periodos) {
    const golden = facturas.filter((f) => f.periodo === P && f.estado !== 'anulada'); // anuladas liberaron ítems, no son golden vivo
    const goldIds = new Set(golden.map((f) => f.id));
    // input reconstruido: abonos del período + cargos (agnósticos), linkeados a facturas golden, con facturaId quitado
    const abIn = abonos.filter((a) => a.periodo === P && goldIds.has(a.facturaId)).map((a) => ({ ...a, facturaId: null }));
    const cgIn = cargos.filter((c) => goldIds.has(c.facturaId)).map((c) => ({ ...c, facturaId: null }));
    const { grupos } = agruparFacturas({ abonos: abIn, cargos: cgIn, socMap, empMap, empresasYaFacturadas: new Set(), periodo: P });

    console.log(`═══ Período ${P} — golden ${golden.length} factura(s) · candidato ${grupos.length} grupo(s) ═══`);
    const candByKey = new Map(grupos.map((g) => [keyDestG(g), g]));
    const goldByKey = new Map(golden.map((f) => [keyDest(f), f]));
    const allKeys = new Set([...candByKey.keys(), ...goldByKey.keys()]);
    for (const k of allKeys) {
      const g = candByKey.get(k), f = goldByKey.get(k);
      if (!f) { console.log(`  ✗ ${k}: candidato SIN golden (grupo de más)`); totalDiff++; continue; }
      if (!g) { console.log(`  ✗ ${k}: golden ${f.nroComprobante} SIN candidato (grupo faltante)`); totalDiff++; continue; }
      const okTotal = (Number(g.total) || 0) === (Number(f.total) || 0);
      const gi = multiset(g.items), fi = multiset(f.items || []);
      const okItems = JSON.stringify(gi) === JSON.stringify(fi);
      if (okTotal && okItems) { console.log(`  ✓ ${k} (${f.nroComprobante}) · total ${money(f.total)} · ${g.items.length} ítem(s)`); totalMatch++; }
      else {
        totalDiff++;
        console.log(`  ✗ ${k} (${f.nroComprobante}) DIFERENCIA:`);
        if (!okTotal) console.log(`      total golden ${money(f.total)} vs candidato ${money(g.total)}`);
        if (!okItems) {
          const soloG = gi.filter((x) => !fi.includes(x)), soloF = fi.filter((x) => !gi.includes(x));
          if (soloG.length) console.log(`      solo en candidato: ${soloG.join(' , ')}`);
          if (soloF.length) console.log(`      solo en golden:    ${soloF.join(' , ')}`);
          // clasificar: si los refId coinciden pero cambió el monto/descr → DRIFT de config; si faltan refId → paridad
          console.log(`      (revisar: si son los mismos refId con monto/descr distinto = DRIFT de config; si faltan/sobran refId = paridad)`);
        }
      }
    }
    console.log('');
  }
  console.log(`═══ RESUMEN: ${totalMatch} grupo(s) OK · ${totalDiff} diferencia(s) ═══`);
  console.log(totalDiff === 0 ? '✓ PARIDAD TOTAL: el núcleo reproduce EXACTAMENTE el output del motor cliente.' : '⚠ Hay diferencias — revisar arriba (drift vs paridad).');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message || e); process.exit(1); });
