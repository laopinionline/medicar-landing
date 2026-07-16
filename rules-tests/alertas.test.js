'use strict';
/*
 * Reglas — Guardia G1+G2 (alertas + permiso dinámico). Las DOS CARAS:
 *  - la bandeja (pool) la ve el médico PRESENTE-y-en-guardia + el despachante; el médico ausente NO;
 *  - el médico con episodio abierto de la persona ve la alerta de SU paciente (GET) aunque no esté presente;
 *  - afiliado/referente NO (N3 intacto); estado_guardia lo escribe solo la CF.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/alertas.test.js"
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-alertas';
let env;
const ctx = (uid, claims) => env.authenticatedContext(uid, claims).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const A1 = { personaId: 'pAna', personaNombre: 'Pérez, Ana', origenReporteId: 'REP1', tieneBanderaRoja: true, descubierta: false, estado: 'nueva', atendidaPor: null, atendidaEn: null };
const A2 = { ...A1, personaId: 'pOtro', origenReporteId: 'REP2' };
const FUT = () => new Date(Date.now() + 3600000); // presenteHasta futuro → presente
const PAST = () => new Date(Date.now() - 3600000); // presenteHasta pasado → expiró

async function seed(env) {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await db.doc('usuarios/medPresente').set({ rol: 'medico', roles: ['medico'] });
    await db.doc('usuarios/medAusente').set({ rol: 'medico', roles: ['medico'] });
    await db.doc('usuarios/medExpirado').set({ rol: 'medico', roles: ['medico'] });
    await db.doc('usuarios/medAtiende').set({ rol: 'medico', roles: ['medico'] });
    await db.doc('usuarios/despUid').set({ rol: 'despachante', roles: ['despachante'] });
    await db.doc('usuarios/afilUid').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pAna' });
    await db.doc('usuarios/refUid').set({ rol: 'referente', roles: ['referente'] });
    // estado_guardia (lo escribe la CF; acá se siembra)
    await db.doc('estado_guardia/medPresente').set({ presenteHasta: FUT(), atendiendo: [] });
    await db.doc('estado_guardia/medExpirado').set({ presenteHasta: PAST(), atendiendo: [] });
    await db.doc('estado_guardia/medAtiende').set({ presenteHasta: PAST(), atendiendo: ['pAna'] }); // no presente, pero atiende a pAna
    // medAusente: sin doc estado_guardia
    await db.doc('alertas/a1').set(A1); // pAna
    await db.doc('alertas/a2').set(A2); // pOtro
  });
}
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(env); });

describe('bandeja (pool) — médico PRESENTE + despachante (SÍ)', () => {
  it('✓ médico presente lee el pool (lista where estado=nueva)', async () => { await assertSucceeds(ctx('medPresente').collection('alertas').where('estado', '==', 'nueva').get()); });
  it('✓ médico presente hace GET de una alerta', async () => { await assertSucceeds(ctx('medPresente').doc('alertas/a1').get()); });
  it('✓ despachante lee el pool (respaldo, siempre)', async () => { await assertSucceeds(ctx('despUid').collection('alertas').where('estado', '==', 'nueva').get()); });
  it('✓ médico presente marca ATENDIDA', async () => { await assertSucceeds(ctx('medPresente').doc('alertas/a1').set({ estado: 'atendida', atendidaPor: 'medPresente', atendidaEn: 1 }, { merge: true })); });
});

describe('permiso DINÁMICO — sin presencia NO se ve el pool', () => {
  it('✗ médico AUSENTE (sin estado_guardia) NO lee el pool', async () => { await assertFails(ctx('medAusente').collection('alertas').where('estado', '==', 'nueva').get()); });
  it('✗ médico AUSENTE NO hace GET de una alerta', async () => { await assertFails(ctx('medAusente').doc('alertas/a1').get()); });
  it('✗ médico con presencia EXPIRADA (presenteHasta pasado) NO lee (auto-expiración)', async () => { await assertFails(ctx('medExpirado').collection('alertas').where('estado', '==', 'nueva').get()); });
  it('✗ médico ausente NO puede marcar atendida', async () => { await assertFails(ctx('medAusente').doc('alertas/a1').set({ estado: 'atendida', atendidaPor: 'medAusente', atendidaEn: 1 }, { merge: true })); });
});

describe('episodio que sobrevive — GET de la alerta de SU paciente (aunque no esté presente)', () => {
  it('✓ médico que atiende a pAna hace GET de la alerta de pAna', async () => { await assertSucceeds(ctx('medAtiende').doc('alertas/a1').get()); });
  it('✗ ese médico NO ve la alerta de OTRA persona (pOtro)', async () => { await assertFails(ctx('medAtiende').doc('alertas/a2').get()); });
  it('✗ ese médico NO ve el pool entero (no está presente, solo GET puntual)', async () => { await assertFails(ctx('medAtiende').collection('alertas').where('estado', '==', 'nueva').get()); });
});

describe('N3 — afiliado y referente NO (crudo clínico)', () => {
  it('✗ el AFILIADO NO lee la alerta (aunque sea la suya)', async () => { await assertFails(ctx('afilUid').doc('alertas/a1').get()); });
  it('✗ el REFERENTE NO lee la alerta', async () => { await assertFails(ctx('refUid', { rol: 'referente' }).doc('alertas/a1').get()); });
  it('✗ un anónimo NO lee la alerta', async () => { await assertFails(anon().doc('alertas/a1').get()); });
});

describe('estado_guardia — dueño lee el suyo; nadie escribe por reglas', () => {
  it('✓ el médico lee SU estado_guardia (la app decide bandeja o botón)', async () => { await assertSucceeds(ctx('medPresente').doc('estado_guardia/medPresente').get()); });
  it('✗ un médico NO lee el estado_guardia de OTRO', async () => { await assertFails(ctx('medAusente').doc('estado_guardia/medPresente').get()); });
  it('✗ NADIE escribe estado_guardia por reglas (solo la CF)', async () => { await assertFails(ctx('medPresente').doc('estado_guardia/medPresente').set({ presenteHasta: FUT() }, { merge: true })); });
});

describe('create/delete blindados (G1 sigue)', () => {
  it('✗ NADIE crea alertas por reglas (solo la CF) — ni el médico presente', async () => { await assertFails(ctx('medPresente').doc('alertas/nueva').set(A1)); });
  it('✗ nadie borra una alerta', async () => { await assertFails(ctx('medPresente').doc('alertas/a1').delete()); });
  it('✗ atender no puede tocar otros campos (whitelist)', async () => { await assertFails(ctx('medPresente').doc('alertas/a1').set({ personaNombre: 'X', estado: 'atendida' }, { merge: true })); });
});
