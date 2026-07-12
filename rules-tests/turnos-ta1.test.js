'use strict';
/*
 * Tests de reglas — Tramo Turnos T-A.1: agenda_turnos + turnos.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/turnos-ta1.test.js"
 *
 * Cubre: el socio crea/lee/cancela SOLO lo suyo; el director (cap gestionar_agenda_turnos) carga agenda;
 * el socio lee agenda pero no la escribe; operativo lee todos los turnos; anónimo no lee nada.
 * NOTA: los 2 casos de "socio actualiza slotsTomados" quedan FRENADOS (mecanismo de reserva pendiente).
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

const PROJECT = 'medicar-turnos-ta1';
let env;

const AG = { fecha: '2026-08-01', horaInicio: '09:00', horaFin: '12:00', duracionSlotMin: 15, medicoId: 'medX', medicoNombre: 'Dr. X', activa: true, slotsTomados: [] };
const turnoDe = (personaId, extra) => Object.assign({ fecha: '2026-08-01', hora: '09:00', agendaId: 'ag1', personaId, nombreVista: 'PEREZ, Juan', medicoId: 'medX', medicoNombre: 'Dr. X', estado: 'creado', creadoEn: 123 }, extra || {});

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/socioA').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pA' });
    await db.doc('usuarios/socioB').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pB' });
    await db.doc('usuarios/director').set({ rol: 'admin', roles: ['admin'], permisos: { gestionar_agenda_turnos: true } });
    await db.doc('usuarios/despa').set({ rol: 'despachante', roles: ['despachante'] });
    await db.doc('agenda_turnos/ag1').set(AG);
    await db.doc('turnos/tA').set(turnoDe('pA'));
    await db.doc('turnos/tB').set(turnoDe('pB'));
  });
}

const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });

describe('T-A.1 — turnos (reserva del socio)', () => {
  it('✓ socio crea turno propio (personaId propio, whitelist, estado creado)', async () => {
    await assertSucceeds(ctx('socioA').doc('turnos/nuevoA').set(turnoDe('pA')));
  });
  it('✗ socio crea turno con personaId AJENO', async () => {
    await assertFails(ctx('socioA').doc('turnos/x1').set(turnoDe('pB')));
  });
  it('✗ socio crea turno con campo EXTRA fuera de whitelist', async () => {
    await assertFails(ctx('socioA').doc('turnos/x2').set(turnoDe('pA', { extra: 'foo' })));
  });
  it("✗ socio crea turno con estado != 'creado'", async () => {
    await assertFails(ctx('socioA').doc('turnos/x3').set(turnoDe('pA', { estado: 'cancelado' })));
  });
  it('✓ socio lee sus turnos', async () => {
    await assertSucceeds(ctx('socioA').doc('turnos/tA').get());
  });
  it('✗ socio lee turno AJENO', async () => {
    await assertFails(ctx('socioA').doc('turnos/tB').get());
  });
  it('✓ socio cancela su turno (solo estado+canceladoEn, estado cancelado)', async () => {
    await assertSucceeds(ctx('socioA').doc('turnos/tA').set({ estado: 'cancelado', canceladoEn: 999 }, { merge: true }));
  });
  it('✗ socio modifica OTRO campo de su turno (medicoId)', async () => {
    await assertFails(ctx('socioA').doc('turnos/tA').set({ medicoId: 'otro' }, { merge: true }));
  });
  it('✗ socio cancela turno AJENO', async () => {
    await assertFails(ctx('socioA').doc('turnos/tB').set({ estado: 'cancelado', canceladoEn: 999 }, { merge: true }));
  });
  it('✓ operativo (despachante) lee CUALQUIER turno', async () => {
    await assertSucceeds(ctx('despa').doc('turnos/tB').get());
  });
});

describe('T-A.1 — agenda_turnos (carga del director)', () => {
  it('✓ director (cap) crea agenda válida', async () => {
    await assertSucceeds(ctx('director').doc('agenda_turnos/ag2').set(AG));
  });
  it('✓ director edita agenda', async () => {
    await assertSucceeds(ctx('director').doc('agenda_turnos/ag1').set({ activa: false }, { merge: true }));
  });
  it('✗ director crea agenda con forma INVÁLIDA (horaInicio >= horaFin)', async () => {
    await assertFails(ctx('director').doc('agenda_turnos/agBad').set(Object.assign({}, AG, { horaInicio: '13:00' })));
  });
  it('✗ socio escribe agenda (no es operativo)', async () => {
    await assertFails(ctx('socioA').doc('agenda_turnos/agSocio').set(AG));
  });
  it('✗ despachante SIN la cap escribe agenda', async () => {
    await assertFails(ctx('despa').doc('agenda_turnos/agDespa').set(AG));
  });
  it('✓ socio LEE agenda (ve disponibilidad)', async () => {
    await assertSucceeds(ctx('socioA').doc('agenda_turnos/ag1').get());
  });
  it('✗ agenda no se puede borrar (delete: false), ni por el director', async () => {
    await assertFails(ctx('director').doc('agenda_turnos/ag1').delete());
  });
});

describe('T-A.1 — anónimo', () => {
  it('✗ anónimo NO lee agenda', async () => { await assertFails(anon().doc('agenda_turnos/ag1').get()); });
  it('✗ anónimo NO lee turnos', async () => { await assertFails(anon().doc('turnos/tA').get()); });
});
