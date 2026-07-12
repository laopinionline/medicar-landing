'use strict';
/*
 * Tests de reglas — D-3.1: gestión del "pedido" (bandera roja) sobre reportes_sintomas.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/reportes-pedido-d3.test.js"
 *
 * SOLO el operativo gestiona estadoPedido/episodioId/notaGestion (whitelist + valor válido).
 * El socio NUNCA toca el estado; su create (7 campos) queda intacto.
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

const PROJECT = 'medicar-reportes-d3';
let env;

const REP7 = (personaId) => ({ personaId, personaNombre: 'PEREZ, Ana', personaTelefono: '2477000000', sintomas: [{ id: 's1', nombre: 'Dolor de pecho', banderaRoja: true }], texto: 'me duele', tieneBanderaRoja: true, creadoEn: 123 });

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/despa').set({ rol: 'despachante', roles: ['despachante'] });
    await db.doc('usuarios/socioA').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pA' });
    await db.doc('reportes_sintomas/r1').set(REP7('pA')); // reporte ya existente de socioA
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });

describe('D-3.1 — gestión del pedido (reportes_sintomas)', () => {
  it('✓ operativo (despachante) setea estadoPedido despachado + episodioId + gestión', async () => {
    await assertSucceeds(ctx('despa').doc('reportes_sintomas/r1').set({ estadoPedido: 'despachado', episodioId: 'ep1', gestionadoPor: 'despa', gestionadoEn: 999 }, { merge: true }));
  });
  it('✓ operativo descarta con notaGestion', async () => {
    await assertSucceeds(ctx('despa').doc('reportes_sintomas/r1').set({ estadoPedido: 'descartado', notaGestion: 'falsa alarma' }, { merge: true }));
  });
  it('✗ operativo toca un campo FUERA de la whitelist (texto)', async () => {
    await assertFails(ctx('despa').doc('reportes_sintomas/r1').set({ texto: 'editado' }, { merge: true }));
  });
  it('✗ operativo setea estadoPedido con valor INVÁLIDO', async () => {
    await assertFails(ctx('despa').doc('reportes_sintomas/r1').set({ estadoPedido: 'foo' }, { merge: true }));
  });
  it('✗ socio setea estadoPedido de su propio reporte', async () => {
    await assertFails(ctx('socioA').doc('reportes_sintomas/r1').set({ estadoPedido: 'despachado' }, { merge: true }));
  });
  it('✗ socio CREA reporte con estadoPedido incluido (create hasOnly lo cubre)', async () => {
    await assertFails(ctx('socioA').doc('reportes_sintomas/nuevoX').set(Object.assign(REP7('pA'), { estadoPedido: 'nuevo' })));
  });
  it('✓ socio CREA reporte normal (7 campos) — regresión', async () => {
    await assertSucceeds(ctx('socioA').doc('reportes_sintomas/nuevoOK').set(REP7('pA')));
  });
  it('✗ anónimo actualiza el pedido', async () => {
    await assertFails(anon().doc('reportes_sintomas/r1').set({ estadoPedido: 'despachado' }, { merge: true }));
  });
});
