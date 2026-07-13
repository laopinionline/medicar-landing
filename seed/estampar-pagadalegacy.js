/* C-2 · pagadaLegacy — SCRIPT DE UNA VEZ (correr en la CONSOLA del navegador logueado como admin/cobrador).
 *
 * Estampa pagadaLegacy:true en las facturas que YA estaban 'pagada' ANTES del modulo de cobranza
 * (fixtures pagadas sin ningun pago registrado). Asi el calculo de saldo y las reconciliaciones futuras
 * las distinguen de las pagadas via Cobranza (que si tienen docs en /pagos).
 *
 * La regla C-1 exige: puedeCobrar() && estado=='pagada' && tocadas().hasOnly(['pagadaLegacy']) && ==true.
 * Idempotente: re-correrlo no rompe (vuelve a poner true en las que ya lo tienen; salta las que tienen pagos).
 *
 * USO: pegar en la consola del panel (F12) estando logueado con la cap. Devuelve el resumen.
 */
(async () => {
  const [factSnap, pagosSnap] = await Promise.all([
    db.collection('facturas').where('estado','==','pagada').get(),
    db.collection('pagos').get()
  ]);
  const conPago = new Set(pagosSnap.docs.map(d => d.data().facturaId).filter(Boolean));
  let estampadas = 0, saltadasConPago = 0, yaMarcadas = 0;
  for (const d of factSnap.docs) {
    const f = d.data();
    if (conPago.has(d.id)) { saltadasConPago++; continue; }   // pagada por Cobranza real: NO es legacy
    if (f.pagadaLegacy === true) { yaMarcadas++; continue; }  // idempotencia
    await db.collection('facturas').doc(d.id).set({ pagadaLegacy: true }, { merge: true });
    estampadas++;
  }
  const resumen = { pagadasTotal: factSnap.size, estampadas, yaMarcadas, saltadasConPago };
  console.log('[pagadaLegacy]', resumen);
  return resumen;
})();
