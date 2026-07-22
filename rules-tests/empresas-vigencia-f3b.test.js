'use strict';
/*
 * Tests de reglas — F3b: vigenciaDesde/Hasta en empresas (área protegida).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/empresas-vigencia-f3b.test.js"
 *
 * Vigencia = término del contrato, gate PADRÓN (gestionar_afiliados), NO 'convenio'/monto. hasOnly sigue cerrado.
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

const PROJECT = 'medicar-emp-vig-f3b';
let env;
const TS = firebase.firestore ? null : null; // usamos números/serverTimestamp según el contexto de test

const EMP = (o={}) => Object.assign({ razonSocial:'Los Robles', cuit:'20-1', contacto:'c', telefono:'t', email:'e', tipo:'area_protegida', planIdDefault:null, activo:true, creadoEn:1, numeroConvenio:'40010', ultimoSufijo:0 }, o);

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/adm').set({ rol:'admin', roles:['admin'], permisos:{ gestionar_afiliados:true, configurar_sistema:true } });
    await db.doc('usuarios/afi').set({ rol:'despachante', roles:['despachante'], permisos:{ gestionar_afiliados:true } });
    await db.doc('usuarios/cont').set({ rol:'despachante', roles:['despachante'], permisos:{ facturar:true } }); // contable: NO gestionar_afiliados
    await db.doc('empresas/eA').set(EMP());
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('F3b — empresas.vigencia', () => {
  it('✓ gestionar_afiliados set vigenciaDesde/Hasta', async () => {
    await assertSucceeds(ctx('afi').doc('empresas/eA').set({ vigenciaDesde: 1000, vigenciaHasta: 2000, actualizadoEn: 3 }, { merge:true }));
  });
  it('✓ admin set vigencia', async () => {
    await assertSucceeds(ctx('adm').doc('empresas/eA').set({ vigenciaDesde: 1000, actualizadoEn: 3 }, { merge:true }));
  });
  it('✓ vigencia a null (limpiar) OK', async () => {
    await assertSucceeds(ctx('afi').doc('empresas/eA').set({ vigenciaDesde: null, vigenciaHasta: null, actualizadoEn: 3 }, { merge:true }));
  });
  it('✗ contable (sin gestionar_afiliados/config) NO toca vigencia', async () => {
    await assertFails(ctx('cont').doc('empresas/eA').set({ vigenciaDesde: 1000 }, { merge:true }));
  });
  it('✗ clave extra sigue rechazada (hasOnly cerrado)', async () => {
    await assertFails(ctx('afi').doc('empresas/eA').set({ vigenciaDesde: 1000, hackFlag: true }, { merge:true }));
  });
  it('✓ create de área con vigencia (hasOnly la admite)', async () => {
    await assertSucceeds(ctx('afi').doc('empresas/eB').set(EMP({ numeroConvenio:'40011', vigenciaDesde: 1000, vigenciaHasta: 2000 })));
  });
  it('✓ update de identidad SIN vigencia (regresión E-1)', async () => {
    await assertSucceeds(ctx('afi').doc('empresas/eA').set({ contacto:'nuevo', actualizadoEn: 3 }, { merge:true }));
  });
});
