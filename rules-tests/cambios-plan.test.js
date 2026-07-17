'use strict';
/*
 * Reglas — cambios_plan (autogestión). Lo escribe SOLO la CF (Admin SDK); lo lee el propio socio + staff.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/cambios-plan.test.js"
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-cambios-plan';
let env;
const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const REG = { socioId: 'socA', personaId: 'pTitular', planViejo: 'p1', planNuevo: 'p2', coberturasGanadas: ['C'], en: 1, actorUid: 'titUid' };

async function seed(env) {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await db.doc('usuarios/titUid').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pTitular' });
    await db.doc('usuarios/otroUid').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pOtro' });
    await db.doc('usuarios/staffUid').set({ rol: 'admin', roles: ['admin'], permisos: { gestionar_afiliados: true } });
    await db.doc('usuarios/refUid').set({ rol: 'referente', roles: ['referente'] });
    await db.doc('cambios_plan/cp1').set(REG);
  });
}
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(env); });

describe('cambios_plan — read (SÍ)', () => {
  it('✓ el propio socio lee su cambio (personaId == miPersonaId)', async () => { await assertSucceeds(ctx('titUid').doc('cambios_plan/cp1').get()); });
  it('✓ el staff (gestionar_afiliados) lee cualquiera', async () => { await assertSucceeds(ctx('staffUid').doc('cambios_plan/cp1').get()); });
});
describe('cambios_plan — read (NO)', () => {
  it('✗ OTRO socio NO lee el cambio ajeno', async () => { await assertFails(ctx('otroUid').doc('cambios_plan/cp1').get()); });
  it('✗ un referente NO lo lee', async () => { await assertFails(ctx('refUid').doc('cambios_plan/cp1').get()); });
  it('✗ un anónimo NO lo lee', async () => { await assertFails(anon().doc('cambios_plan/cp1').get()); });
});
describe('cambios_plan — write blindado (solo CF Admin SDK)', () => {
  it('✗ el socio NO crea un cambio (lo escribe la CF)', async () => { await assertFails(ctx('titUid').doc('cambios_plan/nuevo').set(REG)); });
  it('✗ el staff NO crea un cambio por reglas', async () => { await assertFails(ctx('staffUid').doc('cambios_plan/nuevo').set(REG)); });
  it('✗ nadie actualiza/borra un cambio', async () => {
    await assertFails(ctx('titUid').doc('cambios_plan/cp1').set({ planNuevo: 'x' }, { merge: true }));
    await assertFails(ctx('staffUid').doc('cambios_plan/cp1').delete());
  });
});
