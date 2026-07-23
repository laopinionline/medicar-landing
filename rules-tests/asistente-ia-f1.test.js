'use strict';
/* Tests de reglas — MEDICAR IA (F1): colecciones lockeadas.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/asistente-ia-f1.test.js" */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

const PROJECT = 'medicar-ia-f1';
let env;
async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/socioU').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pA' });
    await db.doc('usuarios/medico').set({ rol: 'medico', roles: ['medico'] });   // esInterno
    await db.doc('usuarios/adm').set({ rol: 'admin', roles: ['admin'], permisos: { configurar_sistema: true } });
    await db.doc('asistente_secreto/config').set({ proveedor: 'ollama', url: 'https://tunel', token: 'SECRETO' });
    await db.doc('rate_asistente/socioU').set({ count: 1, ventanaMs: 1 });
    await db.doc('asistente_incidentes/i1').set({ uid: 'socioU', motivo: 'diagnostico', creadoEn: 1 });
    await db.doc('asistente_memoria/pA').set({ personaId: 'pA', temas: [{ t: 'dolor de pie', fecha: '2026-07-20' }] });
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('MEDICAR IA — asistente_secreto (token del túnel)', () => {
  it('✗ socio NO lee el secreto', async () => { await assertFails(ctx('socioU').doc('asistente_secreto/config').get()); });
  it('✗ admin NO lee el secreto desde el cliente', async () => { await assertFails(ctx('adm').doc('asistente_secreto/config').get()); });
  it('✗ nadie escribe el secreto desde el cliente', async () => { await assertFails(ctx('adm').doc('asistente_secreto/config').set({ token: 'x' })); });
});
describe('MEDICAR IA — rate_asistente', () => {
  it('✗ socio NO lee su rate', async () => { await assertFails(ctx('socioU').doc('rate_asistente/socioU').get()); });
  it('✗ socio NO pisa su rate (no puede resetear el contador)', async () => { await assertFails(ctx('socioU').doc('rate_asistente/socioU').set({ count: 0 })); });
});
describe('MEDICAR IA — asistente_incidentes (log del guardrail)', () => {
  it('✓ staff (médico=esInterno) lee incidentes', async () => { await assertSucceeds(ctx('medico').doc('asistente_incidentes/i1').get()); });
  it('✗ socio NO lee incidentes', async () => { await assertFails(ctx('socioU').doc('asistente_incidentes/i1').get()); });
  it('✗ nadie escribe incidentes desde el cliente (solo CF)', async () => { await assertFails(ctx('medico').doc('asistente_incidentes/i2').set({ uid: 'x' })); });
});
describe('MEDICAR IA — asistente_memoria (memoria por socio, calco de asistente_secreto)', () => {
  it('✗ el socio NO lee su propia memoria desde el cliente (solo la CF, inyectada)', async () => { await assertFails(ctx('socioU').doc('asistente_memoria/pA').get()); });
  it('✗ el socio NO pisa/borra su memoria desde el cliente ("olvidate" pasa por la CF)', async () => { await assertFails(ctx('socioU').doc('asistente_memoria/pA').set({ temas: [] })); });
  it('✗ staff NO lee la memoria del socio desde el cliente', async () => { await assertFails(ctx('medico').doc('asistente_memoria/pA').get()); });
});
