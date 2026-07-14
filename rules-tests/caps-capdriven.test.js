'use strict';
/*
 * Tests de reglas — CAP-DRIVEN COMPLETO: la cap MANDA, sin importar el rol.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/caps-capdriven.test.js"
 *
 * El conejillo: usuarios rol 'contable' (el que "no debería poder nada") con UNA cap prestada.
 * Verifica que ejerce la cap off-rol, y que ensanchar NO abrió de más (sin cap → denegado).
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-caps-capdriven';
let env;
const ctx = (uid) => env.authenticatedContext(uid).firestore();

async function seed(env) {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    // conejillos: rol contable (NO esInterno/esOperativo) + UNA cap
    const U = (id, permisos) => db.doc('usuarios/' + id).set({ rol: 'contable', roles: ['contable'], personaId: null, permisos });
    await U('cm',  { gestionar_moviles: true });
    await U('cg',  { gestionar_guardias: true });
    await U('ca',  { gestionar_agenda_turnos: true });
    await U('cc',  { clinico: true });
    await U('ccfg',{ configurar_sistema: true });
    await U('ccob',{ gestionar_cobranza: true });
    await U('cd',  { despachar_episodios: true });
    await U('cont',{ facturar: true, gestionar_cobranza: true }); // contable puro, SIN clinico/moviles/etc
    await db.doc('usuarios/afi').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pMio' });
    await db.doc('usuarios/desp').set({ rol: 'despachante', roles: ['despachante'] }); // regresión: sigue leyendo
    // fixtures
    await db.doc('moviles/m1').set({ nombre: 'Móvil 1', estado: 'disponible', activo: true });
    await db.doc('tipos_movil/t1').set({ nombre: 'UTI', activo: true });
    await db.doc('guardias/g1').set({ rol: 'chofer', modalidad: 'pasiva', estado: 'programada' });
    await db.doc('agenda_turnos/at1').set({ fecha: '2099-01-01', horaInicio: '09:00', horaFin: '10:00', duracionSlotMin: 15, medicoId: 'mm', activa: true, slotsTomados: [] });
    await db.doc('staff/sChof').set({ personaId: 'sChof', rol: 'chofer', activo: true, nombre: 'Calvo, Carlin' });
    await db.doc('staff_medico/smed').set({ nombre: 'Dr X', activo: true });
    await db.doc('prestaciones/pr1').set({ nombre: 'Emergencias', activo: true });
    await db.doc('tarifas/tf1').set({ nombre: 'Traslado', activo: true });
    await db.doc('facturas/fac1').set({ periodo: '2099-01', personaId: 'pZ', items: [], total: 1000, estado: 'emitida', nroComprobante: 'FC-2099-000001' });
    await db.doc('respuestas_cuestionario/rq1').set({ personaId: 'pZ', creadoEn: 1 });
    await db.doc('gestiones_contacto/gc1').set({ personaId: 'pZ', creadoEn: 1 });
    await db.doc('reportes_sintomas/rs1').set({ personaId: 'pZ', creadoEn: 1 });
    await db.doc('chequeos_parametros/cp1').set({ personaId: 'pZ', creadoEn: 1 });
    await db.doc('episodios/ep1').set({ estado: 'despacho', motivoLlamado: 'dolor abdominal' }); // dato clínico
  });
}
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('★ La cap MANDA off-rol (contable con cap prestada)', () => {
  it('✓ gestionar_moviles LEE staff (choferes) y moviles', async () => { await assertSucceeds(ctx('cm').doc('staff/sChof').get()); await assertSucceeds(ctx('cm').doc('moviles/m1').get()); });
  it('✓ gestionar_moviles ESCRIBE moviles (crea y edita)', async () => { await assertSucceeds(ctx('cm').doc('moviles/mN').set({ nombre: 'M2', estado: 'disponible', activo: true })); await assertSucceeds(ctx('cm').doc('moviles/m1').set({ nombre: 'M1b' }, { merge: true })); });
  it('✓ gestionar_moviles ESCRIBE tipos_movil', async () => { await assertSucceeds(ctx('cm').doc('tipos_movil/t2').set({ nombre: 'Traslado', activo: true })); });
  it('✓ gestionar_guardias LEE staff_medico + guardias + moviles', async () => { await assertSucceeds(ctx('cg').doc('staff_medico/smed').get()); await assertSucceeds(ctx('cg').doc('guardias/g1').get()); await assertSucceeds(ctx('cg').doc('moviles/m1').get()); });
  it('✓ gestionar_guardias ESCRIBE guardias', async () => { await assertSucceeds(ctx('cg').doc('guardias/gN').set({ rol: 'chofer', modalidad: 'pasiva', estado: 'programada' })); });
  it('✓ gestionar_agenda_turnos ESCRIBE agenda_turnos', async () => { await assertSucceeds(ctx('ca').doc('agenda_turnos/atN').set({ fecha: '2099-02-02', horaInicio: '08:00', horaFin: '09:00', duracionSlotMin: 15, medicoId: 'mm', activa: true, slotsTomados: [] })); });
  it('✓ clinico LEE respuestas/gestiones/reportes (datos de salud)', async () => { await assertSucceeds(ctx('cc').doc('respuestas_cuestionario/rq1').get()); await assertSucceeds(ctx('cc').doc('gestiones_contacto/gc1').get()); await assertSucceeds(ctx('cc').doc('reportes_sintomas/rs1').get()); });
  it('✓ clinico CREA gestiones_contacto (marca atendido)', async () => { await assertSucceeds(ctx('cc').doc('gestiones_contacto/gcN').set({ personaId: 'pZ', creadoEn: 2 })); });
  it('✓ configurar_sistema LEE prestaciones + tarifas', async () => { await assertSucceeds(ctx('ccfg').doc('prestaciones/pr1').get()); await assertSucceeds(ctx('ccfg').doc('tarifas/tf1').get()); });
  it('✓ gestionar_cobranza LEE facturas', async () => { await assertSucceeds(ctx('ccob').doc('facturas/fac1').get()); });
  it('✓ despachar_episodios FLIPEA el móvil (despacho)', async () => { await assertSucceeds(ctx('cd').doc('moviles/m1').set({ estado: 'ocupado', episodioActivoId: 'e1', actualizadoEn: 2 }, { merge: true })); });
});

describe('★ Tests de CIERRE — ensanchar NO abrió de más', () => {
  it('✗ contable SIN clinico NO lee respuestas/gestiones/reportes', async () => { await assertFails(ctx('cont').doc('respuestas_cuestionario/rq1').get()); await assertFails(ctx('cont').doc('gestiones_contacto/gc1').get()); await assertFails(ctx('cont').doc('reportes_sintomas/rs1').get()); });
  it('✗ afiliado NO lee respuestas de OTRO (scope afiliado intacto)', async () => { await assertFails(ctx('afi').doc('respuestas_cuestionario/rq1').get()); });
  it('✓ episodios SIGUE cerrado: despachar_episodios NO lee el episodio (solo el flip)', async () => { await assertFails(ctx('cd').doc('episodios/ep1').get()); });
  it('✗ chequeos_parametros: NADIE nuevo lo lee (contable+clinico tampoco)', async () => { await assertFails(ctx('cc').doc('chequeos_parametros/cp1').get()); await assertFails(ctx('cont').doc('chequeos_parametros/cp1').get()); });
  it('✗ gestionar_moviles NO escribe guardias ni agenda (cap acotada)', async () => { await assertFails(ctx('cm').doc('guardias/gX').set({ rol: 'chofer', modalidad: 'pasiva', estado: 'programada' })); await assertFails(ctx('cm').doc('agenda_turnos/aX').set({ fecha: '2099-01-01', horaInicio: '09:00', horaFin: '10:00', duracionSlotMin: 15, medicoId: 'm', activa: true, slotsTomados: [] })); });
  it('✗ contable SIN configurar_sistema NO lee tarifas', async () => { await assertFails(ctx('cont').doc('tarifas/tf1').get()); });
});

describe('★ Regresión — los roles operativos NO pierden acceso', () => {
  it('✓ despachante sigue leyendo moviles y guardias', async () => { await assertSucceeds(ctx('desp').doc('moviles/m1').get()); await assertSucceeds(ctx('desp').doc('guardias/g1').get()); });
});
