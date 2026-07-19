'use strict';
/*
 * Tests de reglas — PASARELA: intenciones_pago/{id} (mediador). SOLO la CF escribe (write:false); read TRES CARAS:
 * cobrador, facturador, o el socio DUENO (personaId == su persona). El socio ve el estado de SU intento, no el ajeno.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/intenciones-pago.test.js"
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

const PROJECT = 'medicar-intenciones';
let env;
const INT = (over = {}) => Object.assign({ personaId: 'pA', facturaId: 'fA', monto: 5000, estado: 'pendiente', proveedor: 'simulado', preferenciaId: 'SIM-x', creadoEn: 1, creadoPor: 'socioA' }, over);

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/sadm').set({ rol: 'superadmin', roles: ['superadmin'] });
    await db.doc('usuarios/cob').set({ rol: 'despachante', roles: ['despachante'], permisos: { gestionar_cobranza: true } });
    await db.doc('usuarios/fac').set({ rol: 'despachante', roles: ['despachante'], permisos: { facturar: true } });
    await db.doc('usuarios/oper').set({ rol: 'despachante', roles: ['despachante'] });
    await db.doc('usuarios/socioA').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pA' });
    await db.doc('usuarios/socioB').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pB' });
    await db.doc('intenciones_pago/iX').set(INT());
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('Pasarela — intenciones_pago · read tres caras', () => {
  it('✓ cobrador lee un intento',        async () => { await assertSucceeds(ctx('cob').doc('intenciones_pago/iX').get()); });
  it('✓ facturador lee un intento',      async () => { await assertSucceeds(ctx('fac').doc('intenciones_pago/iX').get()); });
  it('✓ socio DUENO lee SU intento',     async () => { await assertSucceeds(ctx('socioA').doc('intenciones_pago/iX').get()); });
  it('✗ socio AJENO NO lo lee',          async () => { await assertFails(ctx('socioB').doc('intenciones_pago/iX').get()); });
  it('✗ operativo sin cap NO lee',       async () => { await assertFails(ctx('oper').doc('intenciones_pago/iX').get()); });
  it('✗ anonimo NO lee',                 async () => { await assertFails(anon().doc('intenciones_pago/iX').get()); });
});

describe('Pasarela — intenciones_pago · write:false para TODOS', () => {
  it('✗ socio DUENO NO crea',            async () => { await assertFails(ctx('socioA').collection('intenciones_pago').add(INT())); });
  it('✗ cobrador NO crea',              async () => { await assertFails(ctx('cob').collection('intenciones_pago').add(INT())); });
  it('✗ socio NO flipea su intento a pagado', async () => { await assertFails(ctx('socioA').doc('intenciones_pago/iX').set({ estado: 'pagado' }, { merge: true })); });
  it('✗ facturador NO edita',            async () => { await assertFails(ctx('fac').doc('intenciones_pago/iX').set({ monto: 1 }, { merge: true })); });
  it('✗ nadie borra',                    async () => { await assertFails(ctx('cob').doc('intenciones_pago/iX').delete()); });
});
