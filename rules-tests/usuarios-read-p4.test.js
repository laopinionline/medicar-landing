'use strict';
/*
 * Tests de reglas — PASO 4: cerrar el read de usuarios a "esSuperadmin() || uid propio" (sin isAdmin).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/usuarios-read-p4.test.js"
 *
 * usuarios/{uid} lleva los `permisos` de todos → el admin ya NO debe leer la colección.
 * Los nombres/conteo de los selectores salen de staff/staff_medico/socios (fuentes NO sensibles).
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-usuarios-p4';
let env;
const ctx = (uid) => env.authenticatedContext(uid).firestore();

async function seed(env) {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await db.doc('usuarios/super').set({ rol: 'superadmin', roles: ['superadmin'] });
    await db.doc('usuarios/adm').set({ rol: 'admin', roles: ['admin'], permisos: { gestionar_afiliados: true } });
    await db.doc('usuarios/otro').set({ rol: 'medico', roles: ['medico'], permisos: { clinico: true } });
    await db.doc('usuarios/cm').set({ rol: 'contable', roles: ['contable'], permisos: { gestionar_moviles: true } });
    await db.doc('staff/sChof').set({ personaId: 'sChof', rol: 'chofer', activo: true, nombre: 'Calvo, Carlin' }); // fuente del selector
  });
}
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('PASO 4 — read de usuarios cerrado (esSuperadmin || uid propio)', () => {
  it('✓ superadmin lee CUALQUIER usuarios/{uid}', async () => {
    await assertSucceeds(ctx('super').doc('usuarios/otro').get());
    await assertSucceeds(ctx('super').doc('usuarios/adm').get());
  });
  it('✓ cada usuario lee su PROPIO doc', async () => {
    await assertSucceeds(ctx('adm').doc('usuarios/adm').get());
    await assertSucceeds(ctx('otro').doc('usuarios/otro').get());
    await assertSucceeds(ctx('cm').doc('usuarios/cm').get());
  });
  it('✗ un admin NO lee el doc de OTRO usuario (ya no ve los permisos de todos)', async () => {
    await assertFails(ctx('adm').doc('usuarios/otro').get());
    await assertFails(ctx('adm').doc('usuarios/cm').get());
  });
  it('✓ los selectores NO se rompen: leen de staff, NO de usuarios', async () => {
    // el cap-holder (gestionar_moviles) llena el selector desde staff...
    await assertSucceeds(ctx('cm').doc('staff/sChof').get());
    // ...y NO necesita usuarios (que además ya le está cerrado el de otro):
    await assertFails(ctx('cm').doc('usuarios/sChof').get());
    await assertFails(ctx('cm').doc('usuarios/otro').get());
  });
});
