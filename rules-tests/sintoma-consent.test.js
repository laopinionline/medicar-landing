'use strict';
/*
 * Reglas — síntoma-con-consentimiento (F1). El crudo per-referente (sintoma_referido) NO se lee por regla (solo CF,
 * para poder loguear); consentimientos/ y accesos_sintoma/ son append-only y solo los lee admin/legal.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/sintoma-consent.test.js"
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-sintoma-consent';
let env;
const ctx = (uid, claims) => env.authenticatedContext(uid, claims).firestore();
const anon = () => env.unauthenticatedContext().firestore();

async function seed(env) {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await db.doc('usuarios/refUid').set({ rol: 'referente', roles: ['referente'] });
    await db.doc('usuarios/afilUid').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pTit' });
    await db.doc('usuarios/legalUid').set({ rol: 'admin', roles: ['admin'], permisos: { configurar_sistema: true } });
    await db.doc('usuarios/staffUid').set({ rol: 'despachante', roles: ['despachante'] }); // interno pero SIN configurar_sistema
    // vínculo activo con consentimiento de síntomas
    await db.doc('referentes/refUid/titulares/pTit').set({ estado: 'activo', habilitaciones: { estado: true, sintomas: true }, titularPersonaId: 'pTit' });
    await db.doc('sintoma_referido/refUid_pTit').set({ sintomas: ['Dolor'], texto: 'crudo', actualizadoEn: 1 });
    await db.doc('consentimientos/c1').set({ titularPersonaId: 'pTit', referenteUid: 'refUid', tipo: 'sintomas', accion: 'otorga', textoConsentimiento: 'texto', version: 1, en: 1 });
    await db.doc('accesos_sintoma/a1').set({ referenteUid: 'refUid', titularPersonaId: 'pTit', tipo: 'sintomas', en: 1 });
  });
}
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(env); });

describe('sintoma_referido — NADIE lo lee/escribe por regla (solo la CF)', () => {
  it('✗ el REFERENTE (aunque consentido) NO lee el doc directo — el acceso es por CF', async () => {
    await assertFails(ctx('refUid', { rol: 'referente' }).doc('sintoma_referido/refUid_pTit').get());
  });
  it('✗ el AFILIADO no lo lee', async () => { await assertFails(ctx('afilUid').doc('sintoma_referido/refUid_pTit').get()); });
  it('✗ ni admin/legal lo lee por regla (es CF-only)', async () => { await assertFails(ctx('legalUid').doc('sintoma_referido/refUid_pTit').get()); });
  it('✗ nadie escribe el crudo por regla', async () => { await assertFails(ctx('refUid', { rol: 'referente' }).doc('sintoma_referido/refUid_pTit').set({ texto: 'x' }, { merge: true })); });
});

describe('consentimientos — append-only, read admin/legal', () => {
  it('✓ admin/legal (configurar_sistema) lee el registro', async () => { await assertSucceeds(ctx('legalUid').doc('consentimientos/c1').get()); });
  it('✗ un interno SIN configurar_sistema NO lo lee', async () => { await assertFails(ctx('staffUid').doc('consentimientos/c1').get()); });
  it('✗ el afiliado/referente NO lo lee', async () => {
    await assertFails(ctx('afilUid').doc('consentimientos/c1').get());
    await assertFails(ctx('refUid', { rol: 'referente' }).doc('consentimientos/c1').get());
  });
  it('✗ nadie crea/actualiza/borra por regla (solo la CF)', async () => {
    await assertFails(ctx('afilUid').doc('consentimientos/nuevo').set({ tipo: 'sintomas' }));
    await assertFails(ctx('legalUid').doc('consentimientos/c1').delete());
  });
});

describe('accesos_sintoma — log de lecturas, read admin/legal, CF-only', () => {
  it('✓ admin/legal lee el log', async () => { await assertSucceeds(ctx('legalUid').doc('accesos_sintoma/a1').get()); });
  it('✗ el referente NO lee el log de sus propios accesos', async () => { await assertFails(ctx('refUid', { rol: 'referente' }).doc('accesos_sintoma/a1').get()); });
  it('✗ nadie escribe el log por regla (solo la CF)', async () => { await assertFails(ctx('refUid', { rol: 'referente' }).doc('accesos_sintoma/nuevo').set({ referenteUid: 'refUid' })); });
});
