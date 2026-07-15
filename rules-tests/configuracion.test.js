'use strict';
/*
 * Tests de reglas — configuracion/{id} (WhatsApp institucional): read autenticado, write configurar_sistema.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/configuracion.test.js"
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-configuracion';
let env;
const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

async function seed(env) {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await db.doc('usuarios/cfg').set({ rol: 'despachante', roles: ['despachante'], permisos: { configurar_sistema: true } });
    await db.doc('usuarios/afi').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pA' });
    await db.doc('usuarios/plano').set({ rol: 'despachante', roles: ['despachante'] }); // sin caps
    await db.doc('configuracion/club').set({ whatsapp: '2477123456' });
  });
}
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('configuracion — read autenticado', () => {
  it('✓ el afiliado (autenticado) lee configuracion/club', async () => { await assertSucceeds(ctx('afi').doc('configuracion/club').get()); });
  it('✓ un operativo sin caps también lo lee (no es dato sensible)', async () => { await assertSucceeds(ctx('plano').doc('configuracion/club').get()); });
  it('✗ anónimo NO lee', async () => { await assertFails(anon().doc('configuracion/club').get()); });
});
describe('configuracion — write configurar_sistema', () => {
  it('✓ configurar_sistema escribe el whatsapp', async () => { await assertSucceeds(ctx('cfg').doc('configuracion/club').set({ whatsapp: '2477999888' }, { merge: true })); });
  it('✗ afiliado NO escribe', async () => { await assertFails(ctx('afi').doc('configuracion/club').set({ whatsapp: 'hack' }, { merge: true })); });
  it('✗ operativo sin configurar_sistema NO escribe', async () => { await assertFails(ctx('plano').doc('configuracion/club').set({ whatsapp: 'hack' }, { merge: true })); });
});
