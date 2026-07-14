'use strict';
/*
 * Tests de reglas — F-1: blindaje del carril de dinero (abonos/cargos/facturas).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/facturacion-f1.test.js"
 *
 * Integridad financiera en REGLAS (no solo cliente): whitelists por acción calcadas al motor real,
 * inmutabilidad de montos/refs, transiciones de estado válidas, gate configurar_sistema, regresión F2.
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
const DEL = firebase.firestore.FieldValue.delete();

const PROJECT = 'medicar-facturacion-f1';
let env;

const ABONO = (over={}) => Object.assign({ periodo:'2099-01', socioId:'s1', personaId:'pA', socioNombre:'X', numeroAfiliado:'100', planId:'pl1', planNombre:'Plan', precioSugerido:1000, precioFinal:1000, motivoAjuste:null, estado:'generado', generadoEn:1, generadoPor:'cfg' }, over);
const CARGO = (over={}) => Object.assign({ episodioId:'e1', nroIncidente:5, nroIncidenteFmt:'INC-5', personaId:'pA', socioId:'s1', pacNombre:'X', regla:'no_socio', tarifaId:'t1', tarifaNombre:'Tarifa', tipoCalculo:'fija', precioSugerido:500, valorPorKm:0, km:null, kmPendiente:false, precioFinal:500, motivoAjuste:null, estado:'generado', generadoEn:1, generadoPor:'cfg' }, over);
const FACT = (over={}) => Object.assign({ periodo:'2099-01', personaId:'pA', socioId:'s1', nombre:'X', numeroAfiliado:'100', items:[{tipo:'abono',refId:'ab1',descripcion:'d',monto:1000}], total:1000, estado:'emitida', emitidaEn:1, emitidaPor:'cfg', nroComprobante:'FC-2099-000001' }, over);

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/adm').set({ rol:'admin', roles:['admin'], permisos:{ facturar:true } }); // Tablero-Fase1: admin post-migración (sin bypass; factura por la cap)
    await db.doc('usuarios/cfg').set({ rol:'despachante', roles:['despachante'], permisos:{ facturar:true } }); // facturador = cap 'facturar' (partida de configurar_sistema)
    await db.doc('usuarios/oper').set({ rol:'despachante', roles:['despachante'] }); // operativo SIN cap
    await db.doc('usuarios/socioU').set({ rol:'afiliado', roles:['afiliado'], personaId:'pA' });
    await db.doc('abonos/ab1').set(ABONO());
    await db.doc('abonos/abFact').set(ABONO({ facturaId:'f1' }));
    await db.doc('abonos/abOtro').set(ABONO({ personaId:'pZ' }));
    await db.doc('cargos/cg1').set(CARGO());
    await db.doc('cargos/cgFact').set(CARGO({ facturaId:'f1' }));
    await db.doc('facturas/fEmit').set(FACT());
    await db.doc('facturas/fPagada').set(FACT({ estado:'pagada' }));
    await db.doc('facturas/fAnulada').set(FACT({ estado:'anulada' }));
    await db.doc('facturas/fOtro').set(FACT({ personaId:'pZ' })); // F-3: factura de OTRA persona
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('F-1 — ABONOS', () => {
  it('✓ configurar_sistema crea abono válido', async () => { await assertSucceeds(ctx('cfg').doc('abonos/n1').set(ABONO())); });
  it('✓ admin crea abono válido', async () => { await assertSucceeds(ctx('adm').doc('abonos/n2').set(ABONO())); });
  it('✗ crea abono con estado != generado', async () => { await assertFails(ctx('cfg').doc('abonos/n3').set(ABONO({ estado:'facturado' }))); });
  it('✗ crea abono con campo fuera del shape', async () => { await assertFails(ctx('cfg').doc('abonos/n4').set(ABONO({ hackeado:true }))); });
  it('✗ crea abono con período mal formado', async () => { await assertFails(ctx('cfg').doc('abonos/n5').set(ABONO({ periodo:'2099/1' }))); });
  it('✗ crea abono con precioFinal negativo', async () => { await assertFails(ctx('cfg').doc('abonos/n6').set(ABONO({ precioFinal:-1 }))); });
  it('✓ ajusta precioFinal (no facturado)', async () => { await assertSucceeds(ctx('cfg').doc('abonos/ab1').set({ precioFinal:1200, motivoAjuste:'x', actualizadoEn:2 }, { merge:true })); });
  it('✗ ajusta precioFinal de abono FACTURADO', async () => { await assertFails(ctx('cfg').doc('abonos/abFact').set({ precioFinal:1200, motivoAjuste:'x', actualizadoEn:2 }, { merge:true })); });
  it('✗ toca campo INMUTABLE (periodo)', async () => { await assertFails(ctx('cfg').doc('abonos/ab1').set({ periodo:'2099-12' }, { merge:true })); });
  it('✗ toca campo INMUTABLE (socioId)', async () => { await assertFails(ctx('cfg').doc('abonos/ab1').set({ socioId:'otro' }, { merge:true })); });
  it('✓ anula (no facturado)', async () => { await assertSucceeds(ctx('cfg').doc('abonos/ab1').set({ estado:'anulado', motivoAnulacion:'m', anuladoEn:2, anuladoPor:'cfg' }, { merge:true })); });
  it('✗ anula abono FACTURADO', async () => { await assertFails(ctx('cfg').doc('abonos/abFact').set({ estado:'anulado', motivoAnulacion:'m', anuladoEn:2, anuladoPor:'cfg' }, { merge:true })); });
  it('✓ asigna facturaId (null -> string)', async () => { await assertSucceeds(ctx('cfg').doc('abonos/ab1').set({ facturaId:'fNueva' }, { merge:true })); });
  it('✗ re-asigna facturaId cuando ya tiene', async () => { await assertFails(ctx('cfg').doc('abonos/abFact').set({ facturaId:'f2' }, { merge:true })); });
  it('✓ libera facturaId (facturado -> removido)', async () => { await assertSucceeds(ctx('cfg').doc('abonos/abFact').set({ facturaId:DEL }, { merge:true })); });
  it('✓ afiliado lee SU abono (regresión F2)', async () => { await assertSucceeds(ctx('socioU').doc('abonos/ab1').get()); });
  it('✗ afiliado lee abono de OTRO', async () => { await assertFails(ctx('socioU').doc('abonos/abOtro').get()); });
  it('✗ afiliado escribe abono', async () => { await assertFails(ctx('socioU').doc('abonos/ab1').set({ precioFinal:0 }, { merge:true })); });
  it('✗ operativo SIN configurar_sistema crea abono', async () => { await assertFails(ctx('oper').doc('abonos/nX').set(ABONO())); });
  it('✗ operativo SIN cap lee abono', async () => { await assertFails(ctx('oper').doc('abonos/ab1').get()); });
  it('✗ anónimo lee abono', async () => { await assertFails(anon().doc('abonos/ab1').get()); });
});

describe('F-1 — CARGOS', () => {
  it('✓ configurar_sistema crea cargo válido', async () => { await assertSucceeds(ctx('cfg').doc('cargos/nc1').set(CARGO())); });
  it('✗ crea cargo estado != generado', async () => { await assertFails(ctx('cfg').doc('cargos/nc2').set(CARGO({ estado:'anulado' }))); });
  it('✗ crea cargo con campo fuera del shape', async () => { await assertFails(ctx('cfg').doc('cargos/nc3').set(CARGO({ x:1 }))); });
  it('✓ ajusta km + precioFinal (no facturado)', async () => { await assertSucceeds(ctx('cfg').doc('cargos/cg1').set({ km:10, kmPendiente:false, precioFinal:900, motivoAjuste:'m', actualizadoEn:2 }, { merge:true })); });
  it('✗ ajusta cargo FACTURADO', async () => { await assertFails(ctx('cfg').doc('cargos/cgFact').set({ precioFinal:900, motivoAjuste:'m', actualizadoEn:2 }, { merge:true })); });
  it('✗ toca campo INMUTABLE (episodioId)', async () => { await assertFails(ctx('cfg').doc('cargos/cg1').set({ episodioId:'otro' }, { merge:true })); });
  it('✓ anula (no facturado)', async () => { await assertSucceeds(ctx('cfg').doc('cargos/cg1').set({ estado:'anulado', motivoAnulacion:'m', anuladoEn:2, anuladoPor:'cfg' }, { merge:true })); });
  it('✓ libera facturaId de cargo facturado', async () => { await assertSucceeds(ctx('cfg').doc('cargos/cgFact').set({ facturaId:DEL }, { merge:true })); });
  it('✗ operativo SIN cap crea cargo', async () => { await assertFails(ctx('oper').doc('cargos/nX').set(CARGO())); });
});

describe('F-1 — FACTURAS', () => {
  it('✓ configurar_sistema crea factura emitida', async () => { await assertSucceeds(ctx('cfg').doc('facturas/nf1').set(FACT())); });
  it('✗ crea factura estado != emitida', async () => { await assertFails(ctx('cfg').doc('facturas/nf2').set(FACT({ estado:'pagada' }))); });
  it('✗ crea factura con total negativo', async () => { await assertFails(ctx('cfg').doc('facturas/nf3').set(FACT({ total:-5 }))); });
  it('✗ crea factura SIN nroComprobante (F-2, requerido)', async () => { const f=FACT(); delete f.nroComprobante; await assertFails(ctx('cfg').doc('facturas/nf4').set(f)); });
  it('✗ crea factura con nroComprobante no-string (F-2)', async () => { await assertFails(ctx('cfg').doc('facturas/nf5').set(FACT({ nroComprobante:1 }))); });
  it('✗ crea factura con nroComprobante mal formado (F-2)', async () => { await assertFails(ctx('cfg').doc('facturas/nf6').set(FACT({ nroComprobante:'0001' }))); });
  it('✗ toca nroComprobante post-emisión (F-2, inmutable)', async () => { await assertFails(ctx('cfg').doc('facturas/fEmit').set({ nroComprobante:'FC-2099-000999' }, { merge:true })); });
  it('✓ paga (emitida -> pagada)', async () => { await assertSucceeds(ctx('cfg').doc('facturas/fEmit').set({ estado:'pagada', pagadaEn:2, pagadaPor:'cfg' }, { merge:true })); });
  it('✓ anula (emitida -> anulada)', async () => { await assertSucceeds(ctx('cfg').doc('facturas/fEmit').set({ estado:'anulada', motivoAnulacion:'m', anuladaEn:2, anuladaPor:'cfg' }, { merge:true })); });
  it('✗ toca campo INMUTABLE (total)', async () => { await assertFails(ctx('cfg').doc('facturas/fEmit').set({ total:9999 }, { merge:true })); });
  it('✗ toca campo INMUTABLE (items)', async () => { await assertFails(ctx('cfg').doc('facturas/fEmit').set({ items:[] }, { merge:true })); });
  it('✓ transición pagada -> emitida (C-1: flip inverso al anular el último pago)', async () => { await assertSucceeds(ctx('cfg').doc('facturas/fPagada').set({ estado:'emitida' }, { merge:true })); });
  it('✗ transición inválida pagada -> anulada', async () => { await assertFails(ctx('cfg').doc('facturas/fPagada').set({ estado:'anulada', motivoAnulacion:'m', anuladaEn:2, anuladaPor:'cfg' }, { merge:true })); });
  it('✗ transición inválida anulada -> pagada', async () => { await assertFails(ctx('cfg').doc('facturas/fAnulada').set({ estado:'pagada', pagadaEn:2, pagadaPor:'cfg' }, { merge:true })); });
  it('✓ afiliado lee SU factura (F-3, personaId propio)', async () => { await assertSucceeds(ctx('socioU').doc('facturas/fEmit').get()); });
  it('✗ afiliado lee factura AJENA (F-3, personaId de otro)', async () => { await assertFails(ctx('socioU').doc('facturas/fOtro').get()); });
  it('✗ afiliado escribe factura (F-3 es solo lectura)', async () => { await assertFails(ctx('socioU').doc('facturas/fEmit').set({ estado:'pagada' }, { merge:true })); });
  it('✗ operativo SIN cap lee factura', async () => { await assertFails(ctx('oper').doc('facturas/fEmit').get()); });
  it('✗ anónimo escribe factura', async () => { await assertFails(anon().doc('facturas/fEmit').set({ estado:'pagada' }, { merge:true })); });
});
