'use strict';
/* Tests de reglas — VITALICIO: el flag socios/{id}.vitalicio (socio sin cuota, lo gestiona MEDICAR). SETEAR/CAMBIAR el
 * flag requiere admin/superadmin; gestionar_afiliados solo NO alcanza para ese campo (sí para el resto del socio).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/vitalicio.test.js" */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-vitalicio';
let env;
const SOCIO = (o = {}) => Object.assign({ personaId: 'pX', tipoAfiliado: 'directo', numeroAfiliado: '100', planId: 'plan-joven', esResponsablePago: true, activo: true }, o);

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/super').set({ rol: 'superadmin', roles: ['superadmin'] });
    await db.doc('usuarios/adm').set({ rol: 'admin', roles: ['admin'], permisos: { gestionar_afiliados: true } });
    await db.doc('usuarios/afi').set({ rol: 'despachante', roles: ['despachante'], permisos: { gestionar_afiliados: true } }); // gestionar_afiliados SIN admin
    await db.doc('socios/normal').set(SOCIO());                       // socio común (vitalicio ausente = false)
    await db.doc('socios/vip').set(SOCIO({ vitalicio: true }));       // socio ya vitalicio
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('VITALICIO — setear el flag requiere admin/superadmin', () => {
  it('✓ gestionar_afiliados crea socio SIN vitalicio (o vitalicio:false)', async () => { await assertSucceeds(ctx('afi').doc('socios/n1').set(SOCIO())); });
  it('✗ gestionar_afiliados NO puede crear socio con vitalicio:true', async () => { await assertFails(ctx('afi').doc('socios/n2').set(SOCIO({ vitalicio: true }))); });
  it('✓ admin crea socio con vitalicio:true', async () => { await assertSucceeds(ctx('adm').doc('socios/n3').set(SOCIO({ vitalicio: true }))); });
  it('✓ superadmin crea socio con vitalicio:true', async () => { await assertSucceeds(ctx('super').doc('socios/n4').set(SOCIO({ vitalicio: true }))); });
});
describe('VITALICIO — update: el flag no lo toca un no-admin, pero el resto sí', () => {
  it('✓ gestionar_afiliados edita OTRO campo de un socio NORMAL (vitalicio no cambia)', async () => { await assertSucceeds(ctx('afi').doc('socios/normal').set({ telefonoNota: 'x' }, { merge: true })); });
  it('✓ gestionar_afiliados edita OTRO campo de un socio VITALICIO (flag intacto en true)', async () => { await assertSucceeds(ctx('afi').doc('socios/vip').set({ telefonoNota: 'x' }, { merge: true })); });
  it('✗ gestionar_afiliados NO puede prender vitalicio (false→true)', async () => { await assertFails(ctx('afi').doc('socios/normal').set({ vitalicio: true }, { merge: true })); });
  it('✗ gestionar_afiliados NO puede apagar vitalicio (true→false)', async () => { await assertFails(ctx('afi').doc('socios/vip').set({ vitalicio: false }, { merge: true })); });
  it('✓ admin prende vitalicio (false→true)', async () => { await assertSucceeds(ctx('adm').doc('socios/normal').set({ vitalicio: true }, { merge: true })); });
  it('✓ admin apaga vitalicio (true→false)', async () => { await assertSucceeds(ctx('adm').doc('socios/vip').set({ vitalicio: false }, { merge: true })); });
});
