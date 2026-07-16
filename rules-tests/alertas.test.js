'use strict';
/*
 * Reglas — Guardia G1 (alertas). Las DOS CARAS: la bandeja la ven medico/despachante; el afiliado y el
 * referente NO (la alerta referencia dato clínico crudo). Create solo CF; update solo para marcar 'atendida'.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/alertas.test.js"
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-alertas';
let env;
const ctx = (uid, claims) => env.authenticatedContext(uid, claims).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const ALERTA = { personaId: 'pAna', personaNombre: 'Pérez, Ana', personaTelefono: '2477000010', origenReporteId: 'REP1', tieneBanderaRoja: true, estado: 'nueva', atendidaPor: null, atendidaEn: null };

async function seed(env) {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    // usuarios con rol + roles (mismo shape que crea prod: createUser setea ambos). rolesActual() evalúa el
    // default [rolActual()] que lee .data.rol → tiene que existir o la regla erra y deniega hasta al médico.
    await db.doc('usuarios/medUid').set({ rol: 'medico', roles: ['medico'] });
    await db.doc('usuarios/despUid').set({ rol: 'despachante', roles: ['despachante'] });
    await db.doc('usuarios/afilUid').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pAna' });
    // referente: cuenta con vínculo (roles referente NO es medico/despachante)
    await db.doc('usuarios/refUid').set({ rol: 'referente', roles: ['referente'] });
    await db.doc('alertas/a1').set(ALERTA);
  });
}
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(env); });

describe('alertas — la ven medico + despachante (SÍ)', () => {
  it('✓ el médico lee la bandeja', async () => { await assertSucceeds(ctx('medUid').collection('alertas').get()); });
  it('✓ el despachante lee la bandeja', async () => { await assertSucceeds(ctx('despUid').doc('alertas/a1').get()); });
  it('✓ el médico marca ATENDIDA (estado/atendidaPor/atendidaEn)', async () => {
    await assertSucceeds(ctx('medUid').doc('alertas/a1').set({ estado: 'atendida', atendidaPor: 'medUid', atendidaEn: 1 }, { merge: true }));
  });
  it('✓ el despachante marca ATENDIDA', async () => {
    await assertSucceeds(ctx('despUid').doc('alertas/a1').set({ estado: 'atendida', atendidaPor: 'despUid', atendidaEn: 1 }, { merge: true }));
  });
});

describe('alertas — el afiliado y el referente NO (crudo clínico → NO)', () => {
  it('✗ el AFILIADO NO lee la alerta (aunque sea la suya)', async () => { await assertFails(ctx('afilUid').doc('alertas/a1').get()); });
  it('✗ el AFILIADO NO lista la bandeja', async () => { await assertFails(ctx('afilUid').collection('alertas').get()); });
  it('✗ el REFERENTE NO lee la alerta', async () => { await assertFails(ctx('refUid', { rol: 'referente' }).doc('alertas/a1').get()); });
  it('✗ un anónimo NO lee la alerta', async () => { await assertFails(anon().doc('alertas/a1').get()); });
});

describe('alertas — create/update/delete blindados', () => {
  it('✗ NADIE crea alertas por reglas (solo la CF Admin SDK) — ni el médico', async () => {
    await assertFails(ctx('medUid').doc('alertas/nueva').set(ALERTA));
  });
  it('✗ el afiliado NO crea alertas', async () => { await assertFails(ctx('afilUid').doc('alertas/x').set(ALERTA)); });
  it('✗ el médico NO puede tocar otros campos al atender (solo estado/atendidaPor/atendidaEn)', async () => {
    await assertFails(ctx('medUid').doc('alertas/a1').set({ personaNombre: 'Otro', estado: 'atendida' }, { merge: true }));
  });
  it('✗ el médico NO puede poner un estado que no sea atendida', async () => {
    await assertFails(ctx('medUid').doc('alertas/a1').set({ estado: 'nueva', atendidaPor: 'x' }, { merge: true }));
  });
  it('✗ nadie borra una alerta (cambia de estado, no se borra)', async () => {
    await assertFails(ctx('medUid').doc('alertas/a1').delete());
  });
});
