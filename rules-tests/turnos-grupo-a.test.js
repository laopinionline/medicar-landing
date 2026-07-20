'use strict';
/*
 * Tests de reglas — Turnos FASE A: gestión del grupo familiar (titularPersonaId denormalizado).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/turnos-grupo-a.test.js"
 *
 * Tres caras: (1) el TITULAR (cabeza) lee y cancela los turnos de su grupo (titularPersonaId==él); (2) el
 * dependiente-CON-login sigue viendo/cancelando SOLO los suyos (personaId==él), no los de otros miembros; (3) un
 * socio AJENO no ve nada del grupo. + la rama vieja intacta + solo-cancelar (no otras transiciones en Fase A).
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-turnos-grupo-a';
let env;

// turno con titularPersonaId (la cabeza del grupo)
const T = (personaId, titularPersonaId, extra) => Object.assign({ fecha: '2026-08-01', hora: '09:00', agendaId: 'ag1', personaId, titularPersonaId, nombreVista: 'X', medicoId: 'm', medicoNombre: 'Dr', estado: 'creado', creadoEn: 1 }, extra || {});
const CANCEL = { estado: 'cancelado', canceladoEn: 2 };

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/titular').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pT' });
    await db.doc('usuarios/depe').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pD' });   // dependiente CON login
    await db.doc('usuarios/depe2').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pD2' }); // otro dependiente CON login
    await db.doc('usuarios/ajeno').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pX' });
    await db.doc('usuarios/oper').set({ rol: 'despachante', roles: ['despachante'] });
    await db.doc('turnos/tOwn').set(T('pT', 'pT'));   // del titular
    await db.doc('turnos/tDep').set(T('pD', 'pT'));   // de un dependiente (rueda a pT)
    await db.doc('turnos/tDep2').set(T('pD2', 'pT')); // de OTRO dependiente (rueda a pT)
    await db.doc('turnos/tAjeno').set(T('pX', 'pX')); // de un socio ajeno
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('Fase A — TITULAR (cabeza) ve y cancela el grupo', () => {
  it('✓ lee su turno propio', async () => { await assertSucceeds(ctx('titular').doc('turnos/tOwn').get()); });
  it('✓ lee el turno de un dependiente (titularPersonaId==él)', async () => { await assertSucceeds(ctx('titular').doc('turnos/tDep').get()); });
  it('✓ lee el turno de OTRO dependiente del grupo', async () => { await assertSucceeds(ctx('titular').doc('turnos/tDep2').get()); });
  it('✓ CANCELA el turno de un dependiente', async () => { await assertSucceeds(ctx('titular').doc('turnos/tDep').update(CANCEL)); });
  it('✗ NO puede otra transición que no sea cancelar (Fase A)', async () => { await assertFails(ctx('titular').doc('turnos/tDep').update({ estado: 'atendido' })); });
  it('✗ NO lee el turno de un socio ajeno', async () => { await assertFails(ctx('titular').doc('turnos/tAjeno').get()); });
});

describe('Fase A — DEPENDIENTE con login conserva su autonomía', () => {
  it('✓ lee su propio turno (personaId==él)', async () => { await assertSucceeds(ctx('depe').doc('turnos/tDep').get()); });
  it('✓ CANCELA su propio turno (rama vieja intacta)', async () => { await assertSucceeds(ctx('depe').doc('turnos/tDep').update(CANCEL)); });
  it('✗ NO ve el turno del titular (no es su persona ni él es cabeza)', async () => { await assertFails(ctx('depe').doc('turnos/tOwn').get()); });
  it('✗ NO ve el turno de OTRO dependiente del mismo grupo', async () => { await assertFails(ctx('depe').doc('turnos/tDep2').get()); });
});

describe('Fase A — AJENO no ve nada del grupo', () => {
  it('✗ no lee el turno del titular', async () => { await assertFails(ctx('ajeno').doc('turnos/tOwn').get()); });
  it('✗ no lee el turno de un dependiente', async () => { await assertFails(ctx('ajeno').doc('turnos/tDep').get()); });
  it('✗ no cancela un turno del grupo', async () => { await assertFails(ctx('ajeno').doc('turnos/tDep').update(CANCEL)); });
  it('✗ anónimo no lee', async () => { await assertFails(anon().doc('turnos/tDep').get()); });
});

describe('Fase A — regresión / operativo / create', () => {
  it('✓ operativo (despachante) lee cualquier turno', async () => { await assertSucceeds(ctx('oper').doc('turnos/tAjeno').get()); });
  it('✓ socio crea su turno con titularPersonaId en el whitelist', async () => { await assertSucceeds(ctx('titular').doc('turnos/nuevo').set(T('pT', 'pT'))); });
  it('✗ socio crea turno con personaId ajeno (aunque ponga titularPersonaId suyo)', async () => { await assertFails(ctx('titular').doc('turnos/malo').set(T('pX', 'pT'))); });
});
