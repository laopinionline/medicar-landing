'use strict';
/* Rules-unit — invitaciones_afiliado/{token}: link de invitación para que un integrante cree su cuenta de socio.
 *  - read: SOLO el titular dueño (titularPersonaId == su personaId) + staff con gestionar_afiliados.
 *  - create/update/delete: NADIE por regla (todo por CF Admin SDK); ni el superadmin por god-mode (excluida).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/invitaciones-afiliado.test.js" */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-invitaciones';
let env;
const INV = (o = {}) => Object.assign({ personaId: 'p_dep', titularPersonaId: 'p_tit', estado: 'pendiente', creadoEn: new Date(), expiraEn: new Date(Date.now() + 7 * 864e5) }, o);

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/super').set({ rol: 'superadmin', roles: ['superadmin'] });
    await db.doc('usuarios/adm').set({ rol: 'admin', roles: ['admin'], permisos: { gestionar_afiliados: true } });
    await db.doc('usuarios/tit').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'p_tit' }); // el titular
    await db.doc('usuarios/otro').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'p_otro' }); // otro socio
    await db.doc('usuarios/dep').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'p_dep' }); // el invitado (si ya tuviera cuenta)
    await db.doc('invitaciones_afiliado/TOKEN123').set(INV());
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('invitaciones_afiliado — read', () => {
  it('✓ el titular dueño lee su invitación (para revocar)', async () => { await assertSucceeds(ctx('tit').doc('invitaciones_afiliado/TOKEN123').get()); });
  it('✓ admin con gestionar_afiliados lee', async () => { await assertSucceeds(ctx('adm').doc('invitaciones_afiliado/TOKEN123').get()); });
  it('✗ otro socio NO lee la invitación ajena', async () => { await assertFails(ctx('otro').doc('invitaciones_afiliado/TOKEN123').get()); });
  it('✗ el invitado (si tuviera cuenta) NO lee la invitación (validar es CF, cero-oráculo)', async () => { await assertFails(ctx('dep').doc('invitaciones_afiliado/TOKEN123').get()); });
});

describe('invitaciones_afiliado — write cerrado (solo CF Admin SDK)', () => {
  it('✗ el titular NO crea directo (va por CF)', async () => { await assertFails(ctx('tit').doc('invitaciones_afiliado/NEW').set(INV())); });
  it('✗ admin NO crea directo', async () => { await assertFails(ctx('adm').doc('invitaciones_afiliado/NEW').set(INV())); });
  it('✗ el titular NO actualiza (revocar es CF)', async () => { await assertFails(ctx('tit').doc('invitaciones_afiliado/TOKEN123').set({ estado: 'revocado' }, { merge: true })); });
  it('✗ nadie borra', async () => { await assertFails(ctx('tit').doc('invitaciones_afiliado/TOKEN123').delete()); });
  it('✗ el superadmin tampoco escribe por god-mode (excluida)', async () => { await assertFails(ctx('super').doc('invitaciones_afiliado/NEW').set(INV())); });
  it('✗ el superadmin tampoco borra por god-mode', async () => { await assertFails(ctx('super').doc('invitaciones_afiliado/TOKEN123').delete()); });
});
