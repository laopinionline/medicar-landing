'use strict';
/*
 * Tests de reglas — push_tokens/{uid}/dispositivos/{deviceId} (A2). El dueño escribe/lee LO SUYO; nadie más.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/push-tokens.test.js"
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-push-tokens';
let env;
const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const TOK = { token: 'fcm-abc123', plataforma: 'android', actualizadoEn: 1 };

async function seed(env) {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await db.doc('usuarios/socioA').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pA' });
    await db.doc('usuarios/socioB').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pB' });
    await db.doc('push_tokens/socioA/dispositivos/dev1').set(TOK);
  });
}
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('push_tokens — el dueño (SÍ)', () => {
  it('✓ el dueño escribe su propio dispositivo', async () => { await assertSucceeds(ctx('socioA').doc('push_tokens/socioA/dispositivos/dev2').set(TOK)); });
  it('✓ el dueño actualiza (rotación de token) su dispositivo', async () => { await assertSucceeds(ctx('socioA').doc('push_tokens/socioA/dispositivos/dev1').set({ token: 'fcm-nuevo' }, { merge: true })); });
  it('✓ el dueño lee su propio dispositivo', async () => { await assertSucceeds(ctx('socioA').doc('push_tokens/socioA/dispositivos/dev1').get()); });
  it('✓ el dueño lista sus dispositivos', async () => { await assertSucceeds(ctx('socioA').collection('push_tokens/socioA/dispositivos').get()); });
});
describe('push_tokens — nadie más (NO)', () => {
  it('✗ otro socio NO lee el token ajeno', async () => { await assertFails(ctx('socioB').doc('push_tokens/socioA/dispositivos/dev1').get()); });
  it('✗ otro socio NO escribe en el ajeno', async () => { await assertFails(ctx('socioB').doc('push_tokens/socioA/dispositivos/dev9').set(TOK)); });
  it('✗ otro socio NO lista los dispositivos ajenos', async () => { await assertFails(ctx('socioB').collection('push_tokens/socioA/dispositivos').get()); });
  it('✗ anónimo NO lee ni escribe', async () => { await assertFails(anon().doc('push_tokens/socioA/dispositivos/dev1').get()); await assertFails(anon().doc('push_tokens/socioA/dispositivos/devX').set(TOK)); });
});
