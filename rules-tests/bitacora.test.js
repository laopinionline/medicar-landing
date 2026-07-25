'use strict';
/* Tests de reglas — BITÁCORA operativa (bitacora/{id}): canal asincrónico operativo→admin.
 *  - create: chofer/medico/despachante (y admin/superadmin) reportan LO PROPIO (reportadoPorUid==uid, 'pendiente',
 *    sin campos de resolución, texto no vacío, refTipo acotado). El afiliado NO puede.
 *  - read: admin/superadmin TODO; el operativo SOLO lo propio.
 *  - update: SOLO admin/superadmin, SOLO resolver (estado→'resuelta' + resueltoPorUid==uid + resueltoEn); texto inmutable.
 *  - delete: nadie.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/bitacora.test.js" */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { serverTimestamp } = require('firebase/firestore');
const PROJECT = 'medicar-bitacora';
let env;

const NOV = (o = {}) => Object.assign({ reportadoPorUid: 'chofer1', rol: 'chofer', texto: 'Apellido mal cargado del afiliado 20001', estado: 'pendiente', creadoEn: serverTimestamp() }, o);

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/super').set({ rol: 'superadmin', roles: ['superadmin'] });
    await db.doc('usuarios/adm').set({ rol: 'admin', roles: ['admin'] });
    await db.doc('usuarios/chofer1').set({ rol: 'chofer', roles: ['chofer'] });
    await db.doc('usuarios/chofer2').set({ rol: 'chofer', roles: ['chofer'] });
    await db.doc('usuarios/medico1').set({ rol: 'medico', roles: ['medico'] });
    await db.doc('usuarios/desp1').set({ rol: 'despachante', roles: ['despachante'] });
    await db.doc('usuarios/afi').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pX' });
    // una novedad pendiente del chofer1 (para read/update)
    await db.doc('bitacora/n1').set({ reportadoPorUid: 'chofer1', rol: 'chofer', texto: 'x', estado: 'pendiente', creadoEn: new Date() });
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('BITÁCORA — create (reportar lo propio)', () => {
  it('✓ chofer reporta lo propio', async () => { await assertSucceeds(ctx('chofer1').collection('bitacora').add(NOV())); });
  it('✓ médico reporta', async () => { await assertSucceeds(ctx('medico1').collection('bitacora').add(NOV({ reportadoPorUid: 'medico1', rol: 'medico' }))); });
  it('✓ despachante reporta', async () => { await assertSucceeds(ctx('desp1').collection('bitacora').add(NOV({ reportadoPorUid: 'desp1', rol: 'despachante' }))); });
  it('✓ con link opcional a afiliado (refTipo/refId)', async () => { await assertSucceeds(ctx('chofer1').collection('bitacora').add(NOV({ refTipo: 'afiliado', refId: 'soc-123' }))); });
  it('✓ con link a despacho', async () => { await assertSucceeds(ctx('desp1').collection('bitacora').add(NOV({ reportadoPorUid: 'desp1', rol: 'despachante', refTipo: 'despacho', refId: 'ep-9' }))); });
  it('✗ reportadoPorUid != uid (suplantar a otro)', async () => { await assertFails(ctx('chofer1').collection('bitacora').add(NOV({ reportadoPorUid: 'chofer2' }))); });
  it('✗ estado inicial != pendiente', async () => { await assertFails(ctx('chofer1').collection('bitacora').add(NOV({ estado: 'resuelta' }))); });
  it('✗ trae campos de resolución en el create', async () => { await assertFails(ctx('chofer1').collection('bitacora').add(NOV({ resueltoPorUid: 'chofer1', resueltoEn: serverTimestamp() }))); });
  it('✗ texto vacío', async () => { await assertFails(ctx('chofer1').collection('bitacora').add(NOV({ texto: '' }))); });
  it('✗ refTipo fuera del enum', async () => { await assertFails(ctx('chofer1').collection('bitacora').add(NOV({ refTipo: 'otro', refId: 'z' }))); });
  it('✗ el AFILIADO no puede reportar', async () => { await assertFails(ctx('afi').collection('bitacora').add(NOV({ reportadoPorUid: 'afi', rol: 'afiliado' }))); });
});

describe('BITÁCORA — read (admin todo; operativo solo lo propio)', () => {
  it('✓ admin lee cualquiera', async () => { await assertSucceeds(ctx('adm').doc('bitacora/n1').get()); });
  it('✓ superadmin lee cualquiera', async () => { await assertSucceeds(ctx('super').doc('bitacora/n1').get()); });
  it('✓ el chofer autor lee lo propio', async () => { await assertSucceeds(ctx('chofer1').doc('bitacora/n1').get()); });
  it('✗ otro operativo NO lee lo ajeno', async () => { await assertFails(ctx('chofer2').doc('bitacora/n1').get()); });
  it('✗ el afiliado NO lee', async () => { await assertFails(ctx('afi').doc('bitacora/n1').get()); });
});

describe('BITÁCORA — update (solo admin/superadmin, solo resolver)', () => {
  it('✓ admin resuelve (estado→resuelta + resueltoPorUid==uid + resueltoEn)', async () => {
    await assertSucceeds(ctx('adm').doc('bitacora/n1').set({ estado: 'resuelta', resueltoPorUid: 'adm', resueltoEn: serverTimestamp() }, { merge: true }));
  });
  it('✓ superadmin resuelve', async () => {
    await assertSucceeds(ctx('super').doc('bitacora/n1').set({ estado: 'resuelta', resueltoPorUid: 'super', resueltoEn: serverTimestamp() }, { merge: true }));
  });
  it('✗ despachante NO resuelve', async () => {
    await assertFails(ctx('desp1').doc('bitacora/n1').set({ estado: 'resuelta', resueltoPorUid: 'desp1', resueltoEn: serverTimestamp() }, { merge: true }));
  });
  it('✗ el chofer autor NO resuelve lo propio', async () => {
    await assertFails(ctx('chofer1').doc('bitacora/n1').set({ estado: 'resuelta', resueltoPorUid: 'chofer1', resueltoEn: serverTimestamp() }, { merge: true }));
  });
  it('✗ admin resuelve con resueltoPorUid de otro (traza falsa)', async () => {
    await assertFails(ctx('adm').doc('bitacora/n1').set({ estado: 'resuelta', resueltoPorUid: 'super', resueltoEn: serverTimestamp() }, { merge: true }));
  });
  it('✗ admin toca el texto (inmutable)', async () => {
    await assertFails(ctx('adm').doc('bitacora/n1').set({ texto: 'editado', estado: 'resuelta', resueltoPorUid: 'adm', resueltoEn: serverTimestamp() }, { merge: true }));
  });
  it('✗ admin pone un estado que no es resuelta', async () => {
    await assertFails(ctx('adm').doc('bitacora/n1').set({ estado: 'archivada', resueltoPorUid: 'adm', resueltoEn: serverTimestamp() }, { merge: true }));
  });
});

describe('BITÁCORA — delete (nadie)', () => {
  it('✗ admin no borra', async () => { await assertFails(ctx('adm').doc('bitacora/n1').delete()); });
  it('✗ superadmin no borra (append-only, excluida del god-mode)', async () => { await assertFails(ctx('super').doc('bitacora/n1').delete()); });
});
