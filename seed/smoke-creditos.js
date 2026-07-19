'use strict';
/*
 * Smoke — Crédito a cuenta FASE 1 (generación por sobrepago).
 *   node seed/smoke-creditos.js
 *
 * Dos capas:
 *  (A) origenPorSobrepago (fórmula PURA de functions/creditos.js): sobrepago→origen, exacto/parcial→0, excedente
 *      capado al monto del pago.
 *  (B) simulación del trigger derivarCredito con un "db" en MEMORIA que calca su algoritmo (misma fórmula real +
 *      doc-id determinista orig_{pagoId} + tx idempotente): sobrepago→origen+saldo; RETRIGGER no re-suma; pago
 *      normal→sin crédito; Σorigenes de varios pagos == excedente total.
 *
 * No toca Firestore ni reglas: prueba la LÓGICA. La entrega en vivo la verifica Lucas por navegador.
 */
const { origenPorSobrepago, consumoCredito } = require('../functions/creditos');

let ok = 0, fail = 0;
const eq = (label, got, exp) => { const p = JSON.stringify(got) === JSON.stringify(exp); console.log(`${p ? '✓' : '✗ FALLO'} ${label}${p ? '' : `  → got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`}`); p ? ok++ : fail++; };

console.log('\n(A) origenPorSobrepago — fórmula pura');
eq('un solo pago que sobra: 1200 sobre 1000 → 200',        origenPorSobrepago(1200, 1200, 1000), 200);
eq('pago exacto: 1000 sobre 1000 → 0',                     origenPorSobrepago(1000, 1000, 1000), 0);
eq('pago parcial (aún debe): 400 de 1000 → 0',             origenPorSobrepago(400, 400, 1000), 0);
eq('2º pago cruza el total: monto 800, Σ1200/1000 → 200',  origenPorSobrepago(800, 1200, 1000), 200);
eq('pago íntegramente excedente: monto 300, Σ1300/1000',   origenPorSobrepago(300, 1300, 1000), 300); // ya estaba saldada, todo el pago es crédito
eq('excedente capado al monto del pago: monto 50, Σ1300',  origenPorSobrepago(50, 1300, 1000), 50);
eq('total 0 (corporativa saldo 0): monto 500 → 500',       origenPorSobrepago(500, 500, 0), 500);
eq('montos no numéricos no rompen',                        origenPorSobrepago('x', 'y', 'z'), 0);

// ── (B) simulación del trigger derivarCredito, con un "db" en memoria ──
// Calca EXACTO el algoritmo del trigger: lee total+Σpagos-registrados, calcula origen con la fórmula real, y en una
// "tx" idempotente crea creditos/orig_{pagoId} (si no existe) + ajusta creditos_saldo. Un pago 'anulado' no cuenta.
function crearDB() {
  return { facturas:{}, pagos:{}, creditos:{}, saldo:{} };
}
function derivar(db, pagoId) {
  const pago = db.pagos[pagoId];
  if (!pago || pago.estado !== 'registrado' || !pago.personaId || !pago.facturaId) return;
  const fac = db.facturas[pago.facturaId];
  if (!fac) return;
  const suma = Object.values(db.pagos).filter(p => p.facturaId === pago.facturaId && p.estado === 'registrado').reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const origen = origenPorSobrepago(pago.monto, suma, Number(fac.total) || 0);
  if (origen <= 0) return;
  const docId = 'orig_' + pagoId;                 // determinista
  if (db.creditos[docId]) return;                 // idempotencia: ya derivado → no re-suma
  db.creditos[docId] = { personaId: pago.personaId, tipo:'origen', monto: origen, refFacturaId: pago.facturaId, refPagoId: pagoId, estado:'activo' };
  db.saldo[pago.personaId] = (db.saldo[pago.personaId] || 0) + origen;
}

console.log('\n(B) simulación del trigger — sobrepago genera origen + saldo');
{
  const db = crearDB();
  db.facturas.fA = { total:1000 };
  db.pagos.p1 = { facturaId:'fA', estado:'registrado', personaId:'pA', monto:1500 };
  derivar(db, 'p1');
  eq('origen creado con doc-id orig_p1',   !!db.creditos.orig_p1, true);
  eq('monto del origen = excedente 500',   db.creditos.orig_p1 && db.creditos.orig_p1.monto, 500);
  eq('saldo del socio pA = 500',           db.saldo.pA, 500);
}

console.log('\n(B) idempotencia — retrigger del MISMO pago no re-suma');
{
  const db = crearDB();
  db.facturas.fA = { total:1000 };
  db.pagos.p1 = { facturaId:'fA', estado:'registrado', personaId:'pA', monto:1500 };
  derivar(db, 'p1');
  derivar(db, 'p1');   // retrigger (reintento del trigger)
  derivar(db, 'p1');   // y otro más
  eq('un solo movimiento creado',          Object.keys(db.creditos).length, 1);
  eq('saldo sigue en 500 (no 1500)',       db.saldo.pA, 500);
}

console.log('\n(B) pago normal — sin sobrepago, sin crédito');
{
  const db = crearDB();
  db.facturas.fA = { total:1000 };
  db.pagos.p1 = { facturaId:'fA', estado:'registrado', personaId:'pA', monto:1000 }; // exacto
  derivar(db, 'p1');
  eq('ningún movimiento creado',           Object.keys(db.creditos).length, 0);
  eq('saldo del socio ausente/0',          db.saldo.pA || 0, 0);
}

console.log('\n(B) varios pagos — Σorigenes == excedente total');
{
  const db = crearDB();
  db.facturas.fA = { total:1000 };
  db.pagos.p1 = { facturaId:'fA', estado:'registrado', personaId:'pA', monto:400 };  // Σ400 → no over
  derivar(db, 'p1');
  db.pagos.p2 = { facturaId:'fA', estado:'registrado', personaId:'pA', monto:800 };  // Σ1200 → cruza, aporta 200
  derivar(db, 'p2');
  db.pagos.p3 = { facturaId:'fA', estado:'registrado', personaId:'pA', monto:300 };  // Σ1500 → todo excedente, aporta 300
  derivar(db, 'p3');
  const sumOrig = Object.values(db.creditos).reduce((s, c) => s + c.monto, 0);
  eq('p1 no generó crédito',               !!db.creditos.orig_p1, false);
  eq('p2 aportó 200',                      db.creditos.orig_p2 && db.creditos.orig_p2.monto, 200);
  eq('p3 aportó 300',                      db.creditos.orig_p3 && db.creditos.orig_p3.monto, 300);
  eq('Σorigenes (500) == excedente 1500-1000', sumOrig, 500);
  eq('saldo del socio pA = 500',           db.saldo.pA, 500);
}

console.log('\n(B) pago anulado — no cuenta, no genera');
{
  const db = crearDB();
  db.facturas.fA = { total:1000 };
  db.pagos.p1 = { facturaId:'fA', estado:'anulado', personaId:'pA', monto:1500 };
  derivar(db, 'p1');
  eq('anulado no genera crédito',          Object.keys(db.creditos).length, 0);
}

console.log('\n(C) consumoCredito — Fase 3: consumo en la factura');
eq('sin saldo → sin ítem, total intacto',        consumoCredito(10000, 0),     { aplicado: 0, itemCredito: null, totalNeto: 10000 });
eq('saldo < total → aplica saldo, ítem negativo', consumoCredito(10000, 3000),  { aplicado: 3000, itemCredito: { tipo: 'credito', descripcion: 'Crédito a favor', monto: -3000 }, totalNeto: 7000 });
eq('saldo == total → factura en $0',             consumoCredito(10000, 10000),  { aplicado: 10000, itemCredito: { tipo: 'credito', descripcion: 'Crédito a favor', monto: -10000 }, totalNeto: 0 });
eq('saldo > total → aplica hasta el total ($0)', consumoCredito(10000, 15000),  { aplicado: 10000, itemCredito: { tipo: 'credito', descripcion: 'Crédito a favor', monto: -10000 }, totalNeto: 0 });
eq('saldo NEGATIVO → no aplica nada',            consumoCredito(10000, -5000),  { aplicado: 0, itemCredito: null, totalNeto: 10000 });
eq('total 0 → no aplica',                        consumoCredito(0, 5000),       { aplicado: 0, itemCredito: null, totalNeto: 0 });
// el saldo remanente lo calcula la CF como saldo − aplicado (acá se comprueba el aplicado)
eq('remanente tras saldo>total = saldo−aplicado (15000−10000=5000)', 15000 - consumoCredito(10000, 15000).aplicado, 5000);

console.log(`\n${fail ? '✗' : '✓'} smoke-creditos: ${ok} ok, ${fail} fallo(s)\n`);
process.exit(fail ? 1 : 0);
