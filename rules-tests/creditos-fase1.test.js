'use strict';
/*
 * Tests de reglas — Crédito a cuenta FASE 1: creditos/ (ledger) + creditos_saldo/{personaId} (doc-saldo).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/creditos-fase1.test.js"
 *
 * DISENO (decision de Lucas): SOLO la CF (Admin SDK, que bypassa reglas) escribe -> write:false para TODOS desde el
 * cliente, incluso superadmin/admin/facturador/cobrador. Read TRES CARAS: facturador, cobrador, o el socio DUENO
 * (su personaId). El socio ve LO SUYO, nunca lo ajeno.
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

const PROJECT = 'medicar-creditos-f1';
let env;

const CRED  = (over={}) => Object.assign({ personaId:'pA', tipo:'origen', monto:500, refFacturaId:'fA', refPagoId:'p1', motivo:'sobrepago', estado:'activo', creadoEn:1, creadoPor:'derivarCredito' }, over);
const SALDO = (over={}) => Object.assign({ saldo:500, actualizadoEn:1 }, over);

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/adm').set({ rol:'admin', roles:['admin'], permisos:{ facturar:true, gestionar_cobranza:true } });
    await db.doc('usuarios/sadm').set({ rol:'superadmin', roles:['superadmin'] });
    await db.doc('usuarios/cob').set({ rol:'despachante', roles:['despachante'], permisos:{ gestionar_cobranza:true } }); // cobrador puro
    await db.doc('usuarios/fac').set({ rol:'despachante', roles:['despachante'], permisos:{ facturar:true } });            // facturador puro
    await db.doc('usuarios/oper').set({ rol:'despachante', roles:['despachante'] });                                       // sin caps
    await db.doc('usuarios/socioA').set({ rol:'afiliado', roles:['afiliado'], personaId:'pA' });                           // socio DUENO
    await db.doc('usuarios/socioB').set({ rol:'afiliado', roles:['afiliado'], personaId:'pB' });                           // socio AJENO
    // movimientos + saldo del socio pA (los escribe la CF; acá se siembran con reglas desactivadas)
    await db.doc('creditos/orig_p1').set(CRED());
    await db.doc('creditos_saldo/pA').set(SALDO());
  });
}
const ctx  = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('Crédito F1 — creditos/ (ledger) · read tres caras', () => {
  it('✓ facturador lee un movimiento',        async () => { await assertSucceeds(ctx('fac').doc('creditos/orig_p1').get()); });
  it('✓ cobrador lee un movimiento',          async () => { await assertSucceeds(ctx('cob').doc('creditos/orig_p1').get()); });
  it('✓ superadmin lee un movimiento',        async () => { await assertSucceeds(ctx('sadm').doc('creditos/orig_p1').get()); });
  it('✓ socio DUENO lee SU movimiento',       async () => { await assertSucceeds(ctx('socioA').doc('creditos/orig_p1').get()); });
  it('✗ socio AJENO NO lee el movimiento',    async () => { await assertFails(ctx('socioB').doc('creditos/orig_p1').get()); });
  it('✗ operativo sin cap NO lee',            async () => { await assertFails(ctx('oper').doc('creditos/orig_p1').get()); });
  it('✗ anonimo NO lee',                      async () => { await assertFails(anon().doc('creditos/orig_p1').get()); });
});

describe('Crédito F1 — creditos/ (ledger) · write:false para TODOS', () => {
  it('✗ cobrador NO crea',                    async () => { await assertFails(ctx('cob').collection('creditos').add(CRED())); });
  it('✗ facturador NO crea',                  async () => { await assertFails(ctx('fac').collection('creditos').add(CRED())); });
  it('✗ admin NO crea',                       async () => { await assertFails(ctx('adm').collection('creditos').add(CRED())); });
  it('✗ superadmin NO crea',                  async () => { await assertFails(ctx('sadm').collection('creditos').add(CRED())); });
  it('✗ socio DUENO NO crea',                 async () => { await assertFails(ctx('socioA').collection('creditos').add(CRED())); });
  it('✗ nadie edita un movimiento',           async () => { await assertFails(ctx('cob').doc('creditos/orig_p1').set({ monto:999 }, { merge:true })); });
  it('✗ nadie revierte (estado) un mov.',     async () => { await assertFails(ctx('fac').doc('creditos/orig_p1').set({ estado:'revertido' }, { merge:true })); });
  it('✗ nadie borra un movimiento',           async () => { await assertFails(ctx('sadm').doc('creditos/orig_p1').delete()); });
});

describe('Crédito F1 — creditos_saldo/{personaId} (doc-saldo) · read tres caras', () => {
  it('✓ facturador lee el saldo',             async () => { await assertSucceeds(ctx('fac').doc('creditos_saldo/pA').get()); });
  it('✓ cobrador lee el saldo',               async () => { await assertSucceeds(ctx('cob').doc('creditos_saldo/pA').get()); });
  it('✓ socio DUENO lee SU saldo',            async () => { await assertSucceeds(ctx('socioA').doc('creditos_saldo/pA').get()); });
  it('✗ socio AJENO NO lee el saldo',         async () => { await assertFails(ctx('socioB').doc('creditos_saldo/pA').get()); });
  it('✗ operativo sin cap NO lee',            async () => { await assertFails(ctx('oper').doc('creditos_saldo/pA').get()); });
  it('✗ anonimo NO lee',                      async () => { await assertFails(anon().doc('creditos_saldo/pA').get()); });
});

describe('Crédito F1 — creditos_saldo/{personaId} (doc-saldo) · write:false para TODOS', () => {
  it('✗ cobrador NO escribe el saldo',        async () => { await assertFails(ctx('cob').doc('creditos_saldo/pA').set(SALDO({ saldo:9999 }), { merge:true })); });
  it('✗ facturador NO escribe el saldo',      async () => { await assertFails(ctx('fac').doc('creditos_saldo/pA').set(SALDO({ saldo:9999 }), { merge:true })); });
  it('✗ superadmin NO escribe el saldo',      async () => { await assertFails(ctx('sadm').doc('creditos_saldo/pA').set(SALDO({ saldo:9999 }), { merge:true })); });
  it('✗ socio DUENO NO escribe su saldo',     async () => { await assertFails(ctx('socioA').doc('creditos_saldo/pA').set(SALDO({ saldo:9999 }), { merge:true })); });
  it('✗ socio DUENO NO crea saldo de cero',   async () => { await assertFails(ctx('socioA').doc('creditos_saldo/pNuevo').set(SALDO())); });
  it('✗ nadie borra el doc-saldo',            async () => { await assertFails(ctx('sadm').doc('creditos_saldo/pA').delete()); });
});
