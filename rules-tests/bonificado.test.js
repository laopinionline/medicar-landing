'use strict';
/* Tests de reglas — BONIFICADO de Área Protegida: socios/{id}.bonificado (flag PROPIO, jamas vitalicio). Socio sin cuota
 * atado a que la empresa pague el area. SETEAR/CAMBIAR = admin/superadmin (como vitalicio; degradar = true->false).
 * origen/empresaId INMUTABLES una vez seteados. Empresa: contactoDni/contactoFechaNac permitidos en el whitelist.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/bonificado.test.js" */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-bonificado';
let env;
const SOCIO = (o = {}) => Object.assign({ personaId: 'pX', tipoAfiliado: 'directo', numeroAfiliado: '100', planId: 'plan-joven', esResponsablePago: true, activo: true }, o);
const BONI = (o = {}) => SOCIO(Object.assign({ bonificado: true, origen: 'area_protegida', empresaId: 'emp1' }, o));
const EMP = (o = {}) => Object.assign({ razonSocial: 'DEMO SA', tipo: 'area_protegida', numeroConvenio: '40001', activo: true }, o);

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/super').set({ rol: 'superadmin', roles: ['superadmin'] });
    await db.doc('usuarios/adm').set({ rol: 'admin', roles: ['admin'], permisos: { gestionar_afiliados: true } });
    await db.doc('usuarios/afi').set({ rol: 'despachante', roles: ['despachante'], permisos: { gestionar_afiliados: true } }); // gestionar_afiliados SIN admin
    await db.doc('usuarios/cfg').set({ rol: 'contable', roles: ['contable'], permisos: { configurar_sistema: true } });
    await db.doc('socios/normal').set(SOCIO());                                  // socio comun (bonificado ausente = false)
    await db.doc('socios/boni').set(BONI());                                     // socio ya bonificado por area
    await db.doc('socios/vip').set(SOCIO({ vitalicio: true }));                  // vitalicio real (distinto del bonificado)
    await db.doc('empresas/emp1').set(EMP());
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('BONIFICADO — setear el flag requiere admin/superadmin (como vitalicio)', () => {
  it('✓ gestionar_afiliados crea socio SIN bonificado', async () => { await assertSucceeds(ctx('afi').doc('socios/n1').set(SOCIO())); });
  it('✗ gestionar_afiliados NO puede crear socio con bonificado:true', async () => { await assertFails(ctx('afi').doc('socios/n2').set(BONI())); });
  it('✓ admin crea socio bonificado (true + origen + empresaId)', async () => { await assertSucceeds(ctx('adm').doc('socios/n3').set(BONI())); });
  it('✓ superadmin crea socio bonificado', async () => { await assertSucceeds(ctx('super').doc('socios/n4').set(BONI())); });
});

describe('BONIFICADO — update: el flag no lo toca un no-admin; degradar = admin true->false', () => {
  it('✓ gestionar_afiliados edita OTRO campo de un socio NORMAL', async () => { await assertSucceeds(ctx('afi').doc('socios/normal').set({ telefonoNota: 'x' }, { merge: true })); });
  it('✓ gestionar_afiliados edita OTRO campo de un socio BONIFICADO (flag intacto)', async () => { await assertSucceeds(ctx('afi').doc('socios/boni').set({ telefonoNota: 'x' }, { merge: true })); });
  it('✗ gestionar_afiliados NO puede prender bonificado (false→true)', async () => { await assertFails(ctx('afi').doc('socios/normal').set({ bonificado: true, origen: 'area_protegida', empresaId: 'emp1' }, { merge: true })); });
  it('✗ gestionar_afiliados NO puede degradar (true→false)', async () => { await assertFails(ctx('afi').doc('socios/boni').set({ bonificado: false }, { merge: true })); });
  it('✓ admin degrada a pagador (bonificado true→false), conserva origen/empresaId', async () => { await assertSucceeds(ctx('adm').doc('socios/boni').set({ bonificado: false }, { merge: true })); });
});

// INMUTABLES para los roles OPERATIVOS (admin + gestionar_afiliados). El superadmin bypassa por god-mode (break-glass,
// como con CUALQUIER campo de socios — la colección no está en la exclusión del catch-all, por diseño).
describe('BONIFICADO — origen / empresaId INMUTABLES para roles operativos (admin + gestionar_afiliados)', () => {
  it('✗ admin NO puede cambiar origen de un bonificado', async () => { await assertFails(ctx('adm').doc('socios/boni').set({ origen: 'otro' }, { merge: true })); });
  it('✗ admin NO puede cambiar empresaId de un bonificado', async () => { await assertFails(ctx('adm').doc('socios/boni').set({ empresaId: 'emp2' }, { merge: true })); });
  it('✗ gestionar_afiliados NO puede cambiar empresaId', async () => { await assertFails(ctx('afi').doc('socios/boni').set({ empresaId: 'emp2' }, { merge: true })); });
  it('✓ re-escribir el MISMO origen/empresaId (no cambian) es válido', async () => { await assertSucceeds(ctx('afi').doc('socios/boni').set({ origen: 'area_protegida', empresaId: 'emp1', telefonoNota: 'y' }, { merge: true })); });
  it('· superadmin SÍ puede (god-mode break-glass, documentado)', async () => { await assertSucceeds(ctx('super').doc('socios/boni').set({ empresaId: 'emp2' }, { merge: true })); });
});

describe('VITALICIO real intacto y DISTINGUIBLE del bonificado', () => {
  it('✓ admin crea vitalicio (sin bonificado)', async () => { await assertSucceeds(ctx('adm').doc('socios/v1').set(SOCIO({ vitalicio: true }))); });
  it('✗ gestionar_afiliados NO puede prender vitalicio', async () => { await assertFails(ctx('afi').doc('socios/normal').set({ vitalicio: true }, { merge: true })); });
  it('✓ el socio bonificado NO es vitalicio (flags independientes)', async () => { await assertSucceeds(ctx('adm').doc('socios/n5').set(BONI({ vitalicio: false }))); });
});

describe('EMPRESA — contactoDni + contactoFechaNac permitidos (default 1-click del bonificado)', () => {
  it('✓ gestionar_afiliados crea empresa área con DNI + fecha nac del contacto', async () => {
    await assertSucceeds(ctx('afi').doc('empresas/e10').set(EMP({ numeroConvenio: '40010', contacto: 'Juan Perez', contactoDni: '20111222', contactoFechaNac: '1980-05-01' })));
  });
  it('✓ update: cargar DNI+fecha nac del contacto a un área existente', async () => {
    await assertSucceeds(ctx('afi').doc('empresas/emp1').set({ contactoDni: '20111222', contactoFechaNac: '1980-05-01' }, { merge: true }));
  });
  it('✗ un campo desconocido en la empresa sigue rechazado (whitelist intacto)', async () => {
    await assertFails(ctx('afi').doc('empresas/e11').set(EMP({ numeroConvenio: '40011', campoRaro: 'x' })));
  });
});
