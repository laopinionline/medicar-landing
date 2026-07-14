'use strict';
/*
 * Tests de reglas — C-1: cobranza (pagos + flip derivado + endurecimiento de contadores + cap gestionar_cobranza).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/cobranza-c1.test.js"
 *
 * Blindado desde el nacimiento (leccion F-1): pagos INMUTABLES (create + anulacion, nunca edicion),
 * gate puedeCobrar() separado de puedeFacturar(), contadores solo-incremento, socio NO lee pagos.
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
const FV = firebase.firestore.FieldValue;

const PROJECT = 'medicar-cobranza-c1';
let env;

const PAGO = (over={}) => Object.assign({
  pagadorId:'pA', pagadorTipo:'persona', facturaId:'fEmit', personaId:'pA', monto:500, fecha:1,
  medio:'efectivo', reciboNro:'RC-2099-000001', nota:null, estado:'registrado', registradoEn:1, registradoPor:'cob'
}, over);
const FACT = (over={}) => Object.assign({ periodo:'2099-01', personaId:'pA', socioId:'s1', nombre:'X', numeroAfiliado:'100', items:[{tipo:'abono',refId:'ab1',descripcion:'d',monto:1000}], total:1000, estado:'emitida', emitidaEn:1, emitidaPor:'cfg', nroComprobante:'FC-2099-000001' }, over);

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/adm').set({ rol:'admin', roles:['admin'], permisos:{ facturar:true, gestionar_cobranza:true } }); // Tablero-Fase1: admin post-migración (caps sembradas, sin bypass)
    await db.doc('usuarios/sadm').set({ rol:'superadmin', roles:['superadmin'] });                                 // superadmin: todo
    await db.doc('usuarios/cob').set({ rol:'despachante', roles:['despachante'], permisos:{ gestionar_cobranza:true } });   // COBRADOR puro
    await db.doc('usuarios/cfg').set({ rol:'despachante', roles:['despachante'], permisos:{ facturar:true } });   // facturador (cap 'facturar', NO cobra)
    await db.doc('usuarios/oper').set({ rol:'despachante', roles:['despachante'] });                              // operativo sin caps
    await db.doc('usuarios/socioU').set({ rol:'afiliado', roles:['afiliado'], personaId:'pA' });                  // afiliado
    await db.doc('pagos/pReg').set(PAGO());
    await db.doc('pagos/pAnul').set(PAGO({ estado:'anulado', motivoAnulacion:'m', anuladoEn:1, anuladoPor:'cob' }));
    await db.doc('facturas/fEmit').set(FACT());
    await db.doc('facturas/fPagada').set(FACT({ estado:'pagada' }));
    await db.doc('contadores/facturas').set({ ultimo:5, actualizadoEn:1 });
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('C-1 — PAGOS · create (gate y shape)', () => {
  it('✓ cobrador crea pago valido',                 async () => { await assertSucceeds(ctx('cob').collection('pagos').add(PAGO())); });
  it('✓ admin crea pago (bypass isAdmin)',          async () => { await assertSucceeds(ctx('adm').collection('pagos').add(PAGO())); });
  it('✓ superadmin crea pago',                       async () => { await assertSucceeds(ctx('sadm').collection('pagos').add(PAGO())); });
  it('✓ pagadorTipo empresa (polimorfico v1)',      async () => { await assertSucceeds(ctx('cob').collection('pagos').add(PAGO({ pagadorTipo:'empresa' }))); });
  it('✓ medio transferencia / deposito',            async () => { await assertSucceeds(ctx('cob').collection('pagos').add(PAGO({ medio:'transferencia' }))); await assertSucceeds(ctx('cob').collection('pagos').add(PAGO({ medio:'deposito' }))); });
  it('✗ facturador (configurar_sistema) NO crea',   async () => { await assertFails(ctx('cfg').collection('pagos').add(PAGO())); });
  it('✗ operativo sin cap NO crea',                 async () => { await assertFails(ctx('oper').collection('pagos').add(PAGO())); });
  it('✗ anonimo NO crea',                            async () => { await assertFails(anon().collection('pagos').add(PAGO())); });
  it('✗ monto 0',                                    async () => { await assertFails(ctx('cob').collection('pagos').add(PAGO({ monto:0 }))); });
  it('✗ monto negativo',                             async () => { await assertFails(ctx('cob').collection('pagos').add(PAGO({ monto:-100 }))); });
  it('✗ monto no numerico',                          async () => { await assertFails(ctx('cob').collection('pagos').add(PAGO({ monto:'500' }))); });
  it('✗ medio invalido',                             async () => { await assertFails(ctx('cob').collection('pagos').add(PAGO({ medio:'mercadopago' }))); });
  it('✗ pagadorTipo invalido',                       async () => { await assertFails(ctx('cob').collection('pagos').add(PAGO({ pagadorTipo:'club' }))); });
  it('✗ reciboNro mal formado',                      async () => { await assertFails(ctx('cob').collection('pagos').add(PAGO({ reciboNro:'RC-99-1' }))); });
  it('✗ estado inicial != registrado',              async () => { await assertFails(ctx('cob').collection('pagos').add(PAGO({ estado:'anulado' }))); });
  it('✗ facturaId ausente (falta required)',        async () => { const p=PAGO(); delete p.facturaId; await assertFails(ctx('cob').collection('pagos').add(p)); });
  it('✗ campo extra fuera del shape',               async () => { await assertFails(ctx('cob').collection('pagos').add(PAGO({ intereses:99 }))); });
});

describe('C-1 — PAGOS · inmutabilidad y anulacion', () => {
  it('✗ editar monto de un pago',                   async () => { await assertFails(ctx('cob').doc('pagos/pReg').set({ monto:999 }, { merge:true })); });
  it('✗ editar medio de un pago',                   async () => { await assertFails(ctx('cob').doc('pagos/pReg').set({ medio:'deposito' }, { merge:true })); });
  it('✓ anular con motivo (registrado->anulado)',   async () => { await assertSucceeds(ctx('cob').doc('pagos/pReg').set({ estado:'anulado', motivoAnulacion:'error', anuladoEn:2, anuladoPor:'cob' }, { merge:true })); });
  it('✗ anular sin tocar solo los campos permitidos', async () => { await assertFails(ctx('cob').doc('pagos/pReg').set({ estado:'anulado', motivoAnulacion:'m', anuladoEn:2, anuladoPor:'cob', monto:1 }, { merge:true })); });
  it('✗ re-anular un pago ya anulado',              async () => { await assertFails(ctx('cob').doc('pagos/pAnul').set({ estado:'anulado', motivoAnulacion:'x', anuladoEn:3, anuladoPor:'cob' }, { merge:true })); });
  it('✗ facturador anula pago (no es su gate)',     async () => { await assertFails(ctx('cfg').doc('pagos/pReg').set({ estado:'anulado', motivoAnulacion:'m', anuladoEn:2, anuladoPor:'cfg' }, { merge:true })); });
  it('✗ delete lo prohibe a cualquiera (cobrador)', async () => { await assertFails(ctx('cob').doc('pagos/pReg').delete()); });
  it('✗ delete lo prohibe al superadmin tambien',   async () => { await assertFails(ctx('sadm').doc('pagos/pReg').delete()); });
});

describe('C-1 — PAGOS · lectura', () => {
  it('✓ cobrador lee pagos',                         async () => { await assertSucceeds(ctx('cob').doc('pagos/pReg').get()); });
  it('✓ facturador lee pagos (el que emite ve cobros)', async () => { await assertSucceeds(ctx('cfg').doc('pagos/pReg').get()); });
  it('✗ socio NO lee pagos (su verdad es el badge)', async () => { await assertFails(ctx('socioU').doc('pagos/pReg').get()); });
  it('✗ operativo sin cap NO lee pagos',            async () => { await assertFails(ctx('oper').doc('pagos/pReg').get()); });
});

describe('C-1 — FACTURAS · flip derivado (pagada <-> emitida) + pagadaLegacy', () => {
  it('✓ cobrador flip emitida->pagada',             async () => { await assertSucceeds(ctx('cob').doc('facturas/fEmit').set({ estado:'pagada', pagadaEn:2, pagadaPor:'cob' }, { merge:true })); });
  it('✓ facturador flip emitida->pagada (sigue pudiendo)', async () => { await assertSucceeds(ctx('cfg').doc('facturas/fEmit').set({ estado:'pagada', pagadaEn:2, pagadaPor:'cfg' }, { merge:true })); });
  it('✓ cobrador flip inverso pagada->emitida',     async () => { await assertSucceeds(ctx('cob').doc('facturas/fPagada').set({ estado:'emitida', pagadaEn:null, pagadaPor:null }, { merge:true })); });
  it('✓ cobrador estampa pagadaLegacy en pagada',   async () => { await assertSucceeds(ctx('cob').doc('facturas/fPagada').set({ pagadaLegacy:true }, { merge:true })); });
  it('✗ facturador NO estampa pagadaLegacy (solo cobrador)', async () => { await assertFails(ctx('cfg').doc('facturas/fPagada').set({ pagadaLegacy:true }, { merge:true })); });
  it('✗ operativo sin cap NO flipea',               async () => { await assertFails(ctx('oper').doc('facturas/fEmit').set({ estado:'pagada', pagadaEn:2, pagadaPor:'oper' }, { merge:true })); });
});

describe('C-1 — CONTADORES · endurecimiento (solo incremento +1)', () => {
  it('✓ incremento atomico +1 (ultimo 5->6)',       async () => { await assertSucceeds(ctx('oper').doc('contadores/facturas').set({ ultimo:6, actualizadoEn:2 }, { merge:true })); });
  it('✓ bootstrap de serie nueva (recibos, ultimo:1)', async () => { await assertSucceeds(ctx('oper').doc('contadores/recibos').set({ ultimo:1, actualizadoEn:2 })); });
  it('✗ pisada sin avanzar (5->5)',                 async () => { await assertFails(ctx('oper').doc('contadores/facturas').set({ ultimo:5, actualizadoEn:2 }, { merge:true })); });
  it('✗ retroceso (5->4)',                           async () => { await assertFails(ctx('oper').doc('contadores/facturas').set({ ultimo:4, actualizadoEn:2 }, { merge:true })); });
  it('✗ salto (5->10)',                              async () => { await assertFails(ctx('oper').doc('contadores/facturas').set({ ultimo:10, actualizadoEn:2 }, { merge:true })); });
  it('✗ tocar campo extra ademas de ultimo',        async () => { await assertFails(ctx('oper').doc('contadores/facturas').set({ ultimo:6, actualizadoEn:2, hack:1 }, { merge:true })); });
  it('✗ operativo NO borra contador',               async () => { await assertFails(ctx('oper').doc('contadores/facturas').delete()); });
  it('✓ superadmin borra contador (limpieza)',      async () => { await assertSucceeds(ctx('sadm').doc('contadores/facturas').delete()); });
});
