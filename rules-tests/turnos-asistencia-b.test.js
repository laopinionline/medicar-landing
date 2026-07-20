'use strict';
/*
 * Tests de reglas — Turnos FASE B: la rama esOperativo de update quedó ACOTADA a campos de asistencia/cancelación
 * (antes era libre). La marca real la hace la CF marcarAsistencia (Admin SDK); esto es defensa para writes directos.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/turnos-asistencia-b.test.js"
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-turnos-asist-b';
let env;
const T = (extra) => Object.assign({ fecha: '2026-08-01', hora: '09:00', agendaId: 'ag', personaId: 'pA', titularPersonaId: 'pA', nombreVista: 'X', medicoId: 'medUid', medicoNombre: 'Dr', estado: 'creado', creadoEn: 1 }, extra || {});

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/medUid').set({ rol: 'medico', roles: ['medico'] });
    await db.doc('usuarios/adm').set({ rol: 'admin', roles: ['admin'] });
    await db.doc('usuarios/socioA').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pA' });
    await db.doc('turnos/t1').set(T());
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('Fase B — esOperativo update ACOTADO', () => {
  it('✓ operativo marca atendido (campos de asistencia, estado válido)', async () => {
    await assertSucceeds(ctx('medUid').doc('turnos/t1').update({ estado: 'atendido', marcadoPor: 'medUid', marcadoEn: 2 }));
  });
  it('✓ operativo marca ausente', async () => {
    await assertSucceeds(ctx('adm').doc('turnos/t1').update({ estado: 'ausente', marcadoPor: 'adm', marcadoEn: 2 }));
  });
  it('✓ operativo puede cancelar (estado en el enum)', async () => {
    await assertSucceeds(ctx('medUid').doc('turnos/t1').update({ estado: 'cancelado', canceladoEn: 2 }));
  });
  it('✗ operativo NO toca un campo fuera de asistencia (ej. nombreVista)', async () => {
    await assertFails(ctx('medUid').doc('turnos/t1').update({ estado: 'atendido', nombreVista: 'HACKEADO' }));
  });
  it('✗ operativo NO pone un estado fuera del enum', async () => {
    await assertFails(ctx('medUid').doc('turnos/t1').update({ estado: 'basura', marcadoPor: 'medUid', marcadoEn: 2 }));
  });
  it('✗ operativo NO reescribe medicoId/fecha aunque ponga estado válido', async () => {
    await assertFails(ctx('adm').doc('turnos/t1').update({ estado: 'atendido', medicoId: 'otro' }));
  });
});

describe('Fase B — el socio NO marca asistencia', () => {
  it('✗ socio NO pone su turno en atendido', async () => {
    await assertFails(ctx('socioA').doc('turnos/t1').update({ estado: 'atendido', marcadoPor: 'x', marcadoEn: 2 }));
  });
  it('✗ socio NO pone su turno en ausente', async () => {
    await assertFails(ctx('socioA').doc('turnos/t1').update({ estado: 'ausente', marcadoPor: 'x', marcadoEn: 2 }));
  });
  it('✓ socio SIGUE pudiendo cancelar lo suyo (regresión Fase A/base)', async () => {
    await assertSucceeds(ctx('socioA').doc('turnos/t1').update({ estado: 'cancelado', canceladoEn: 2 }));
  });
});
