'use strict';
/*
 * F4 — Siembra 2 abonos demo para titulardemo (personaId=demo-titular, socio 90002) que la corrida
 * real de generarAbonos NO produce: uno FACTURADO (facturaId fake) y uno ANULADO. Períodos distintos
 * (2099-02 / 2099-01) para no colisionar con la idempotencia de generarAbonos 2099-03 (el EMITIDO) y
 * para ver el orden descendente en la PWA. Todo esDemo. Shape idéntico al de generarAbonos.
 *   node seed/sembrar-abonos-demo-f4.js           # dry-run
 *   node seed/sembrar-abonos-demo-f4.js --apply    # aplica
 *
 * El EMITIDO (2099-03) lo genera generarAbonos real desde el panel (verifica end-to-end el personaId).
 */
const path = require('path');
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const FV = () => admin.firestore.FieldValue.serverTimestamp();

const BASE = { socioId: 'demo-socio-90002', personaId: 'demo-titular', socioNombre: 'DEMO, Titular', numeroAfiliado: '90002', planId: 'plan-familiar', planNombre: 'Plan Familiar', precioSugerido: 40000, precioFinal: 40000, integrantesFacturados: 1, esDemo: true };

const ABONOS = {
  'abono-demo-90002-2099-02': { ...BASE, periodo: '2099-02', estado: 'generado', facturaId: 'demo-factura-2099-02', motivoAjuste: null }, // FACTURADO (facturaId presente)
  'abono-demo-90002-2099-01': { ...BASE, periodo: '2099-01', estado: 'anulado', motivoAnulacion: 'demo', motivoAjuste: null },             // ANULADO
};

(async () => {
  console.log(`\n[sembrar-f4] Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);
  // Confirmar que titulardemo/socio existen (dependencia del fixture F3).
  const soc = await db.collection('socios').doc('demo-socio-90002').get();
  console.log(`socio demo-socio-90002 (titulardemo): existe=${soc.exists}${soc.exists ? '' : ' ⚠️ corré antes seed/fixture-titular-demo.js'}`);

  console.log('\nAbonos a sembrar (personaId=demo-titular → los ve titulardemo en la PWA):');
  for (const [id, a] of Object.entries(ABONOS)) {
    const display = a.estado === 'anulado' ? 'ANULADO' : (a.facturaId ? 'FACTURADO' : 'EMITIDO');
    console.log(`  abonos/${id}: período ${a.periodo} · ${display} · $${a.precioFinal.toLocaleString('es-AR')}`);
  }
  console.log('  (el EMITIDO 2099-03 lo genera generarAbonos real desde el panel)');

  if (!APPLY) { console.log('\n[sembrar-f4] DRY-RUN: nada escrito. Corré con --apply.\n'); process.exit(0); }

  for (const [id, a] of Object.entries(ABONOS)) {
    await db.collection('abonos').doc(id).set({ ...a, generadoEn: FV(), generadoPor: 'seed-f4' }, { merge: true });
  }
  const mine = await db.collection('abonos').where('personaId', '==', 'demo-titular').get();
  console.log(`\n[sembrar-f4] SEMBRADO ✓  abonos de titulardemo ahora: ${mine.size} → ${mine.docs.map(d => d.data().periodo + '(' + (d.data().estado === 'anulado' ? 'anulado' : (d.data().facturaId ? 'facturado' : 'emitido')) + ')').sort().join(', ')}\n`);
  process.exit(0);
})().catch(e => { console.error('[sembrar-f4] ERROR:', e.message); process.exit(1); });
