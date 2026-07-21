'use strict';
/*
 * Tests de reglas — F2: direcciones_protegidas (eje LUGAR / Área Protegida).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/direcciones-protegidas-f2.test.js"
 *
 * Gate: gestionar_afiliados (padrón) o admin/superadmin escriben; el DESPACHO (operativo) LEE (F3); el contable
 * y el médico NO escriben. calleId NULLABLE a propósito (calle fuera del callejero). Baja lógica via activo.
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

const PROJECT = 'medicar-dirprot-f2';
let env;

const DIR = (o={}) => Object.assign({ empresaId:'eA', calleId:'bartolome-mitre', altura:1234, calleTexto:'Mitre 1234', etiqueta:'portería', activo:true, creadoEn:1 }, o);

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/adm').set({ rol:'admin', roles:['admin'], permisos:{ gestionar_afiliados:true, configurar_sistema:true } });
    await db.doc('usuarios/afi').set({ rol:'despachante', roles:['despachante'], permisos:{ gestionar_afiliados:true } }); // ABM del padrón
    await db.doc('usuarios/desp').set({ rol:'despachante', roles:['despachante'] });                                       // operativo, SIN cap (despacho puro → lee, no escribe)
    await db.doc('usuarios/med').set({ rol:'medico', roles:['medico'] });                                                  // operativo, NO escribe
    await db.doc('usuarios/cont').set({ rol:'despachante', roles:['despachante'], permisos:{ facturar:true, cobranza:true } }); // contable puro: NO gestionar_afiliados, NO operativo real de escritura
    await db.doc('usuarios/socioU').set({ rol:'afiliado', roles:['afiliado'], personaId:'pA' });
    await db.doc('super/whatever'); // no-op
    await db.doc('usuarios/sup').set({ rol:'superadmin', roles:['superadmin'] });
    await db.doc('empresas/eA').set({ razonSocial:'Barrio Los Robles', tipo:'area_protegida', numeroConvenio:'40001', activo:true });
    await db.doc('direcciones_protegidas/d1').set(DIR());
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('F2 — direcciones_protegidas READ', () => {
  it('✓ gestionar_afiliados lee (ABM)',        async () => { await assertSucceeds(ctx('afi').doc('direcciones_protegidas/d1').get()); });
  it('✓ despachante operativo lee (F3 match)', async () => { await assertSucceeds(ctx('desp').doc('direcciones_protegidas/d1').get()); });
  it('✓ médico operativo lee',                 async () => { await assertSucceeds(ctx('med').doc('direcciones_protegidas/d1').get()); });
  it('✓ admin lee',                            async () => { await assertSucceeds(ctx('adm').doc('direcciones_protegidas/d1').get()); });
  it('✗ afiliado NO lee',                      async () => { await assertFails(ctx('socioU').doc('direcciones_protegidas/d1').get()); });
  it('✗ anónimo NO lee',                       async () => { await assertFails(anon().doc('direcciones_protegidas/d1').get()); });
});

describe('F2 — direcciones_protegidas CREATE', () => {
  it('✓ gestionar_afiliados crea',                async () => { await assertSucceeds(ctx('afi').doc('direcciones_protegidas/n1').set(DIR())); });
  it('✓ admin crea',                             async () => { await assertSucceeds(ctx('adm').doc('direcciones_protegidas/n2').set(DIR())); });
  it('✓ crea con calleId NULL (fuera callejero)', async () => { await assertSucceeds(ctx('afi').doc('direcciones_protegidas/n3').set(DIR({ calleId:null, calleTexto:'Loteo nuevo 10' }))); });
  it('✗ despachante puro (sin cap) NO crea',      async () => { await assertFails(ctx('desp').doc('direcciones_protegidas/n4').set(DIR())); });
  it('✗ médico NO crea',                          async () => { await assertFails(ctx('med').doc('direcciones_protegidas/n5').set(DIR())); });
  it('✗ contable (facturar/cobranza) NO crea',    async () => { await assertFails(ctx('cont').doc('direcciones_protegidas/n6').set(DIR())); });
  it('✗ afiliado NO crea',                        async () => { await assertFails(ctx('socioU').doc('direcciones_protegidas/n7').set(DIR())); });
  it('✗ create con clave extra (rechazo shape)',  async () => { await assertFails(ctx('afi').doc('direcciones_protegidas/n8').set(DIR({ hackFlag:true }))); });
  it('✗ create sin altura (falta requerido)',     async () => { const d=DIR(); delete d.altura; await assertFails(ctx('afi').doc('direcciones_protegidas/n9').set(d)); });
  it('✗ create con altura string (tipo)',         async () => { await assertFails(ctx('afi').doc('direcciones_protegidas/n10').set(DIR({ altura:'1234' }))); });
});

describe('F2 — direcciones_protegidas UPDATE', () => {
  it('✓ gestionar_afiliados da de baja (activo:false)', async () => { await assertSucceeds(ctx('afi').doc('direcciones_protegidas/d1').set({ activo:false, actualizadoEn:2 }, { merge:true })); });
  it('✓ admin corrige altura/etiqueta',                async () => { await assertSucceeds(ctx('adm').doc('direcciones_protegidas/d1').set({ altura:1240, etiqueta:'pileta', actualizadoEn:2 }, { merge:true })); });
  it('✗ contable NO actualiza',                        async () => { await assertFails(ctx('cont').doc('direcciones_protegidas/d1').set({ activo:false }, { merge:true })); });
  it('✗ update tocando empresaId (fuera de whitelist)',async () => { await assertFails(ctx('afi').doc('direcciones_protegidas/d1').set({ empresaId:'otra' }, { merge:true })); });
});
