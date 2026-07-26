'use strict';
/* Rules-unit — paquete QR: accesos_qr (log CF-only) · calificaciones (socio completa la suya) · notas_socio (staff-only).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/qr-calificaciones.test.js" */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { serverTimestamp } = require('firebase/firestore');
const PROJECT = 'medicar-qr';
let env;

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/super').set({ rol: 'superadmin', roles: ['superadmin'] });
    await db.doc('usuarios/adm').set({ rol: 'admin', roles: ['admin'], permisos: { configurar_sistema: true } });
    await db.doc('usuarios/med').set({ rol: 'medico', roles: ['medico'] });
    await db.doc('usuarios/soc').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pSoc' });
    await db.doc('usuarios/otro').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pOtro' });
    // calificación pendiente del socio pSoc (la CF la crea al cerrar)
    await db.doc('calificaciones/ep1').set({ episodioId: 'ep1', personaId: 'pSoc', medicoId: 'med', medicoNombre: 'Dr X', estado: 'pendiente', estrellas: null, fecha: new Date() });
    await db.doc('accesos_qr/a1').set({ personaId: 'pSoc', porUid: 'med', en: new Date() });
    await db.doc('notas_socio/n1').set({ personaId: 'pSoc', medicoId: 'med', estrellas: 4, nota: 'ok', visibleSocio: false, en: new Date() });
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('accesos_qr — log CF-only, staff-legal lee', () => {
  it('✓ admin (configurar_sistema) lee', async () => { await assertSucceeds(ctx('adm').doc('accesos_qr/a1').get()); });
  it('✗ el médico común NO lee (no es legal)', async () => { await assertFails(ctx('med').doc('accesos_qr/a1').get()); });
  it('✗ nadie crea (solo la CF)', async () => { await assertFails(ctx('adm').collection('accesos_qr').add({ personaId: 'x', porUid: 'y', en: serverTimestamp() })); });
  it('✗ el superadmin tampoco escribe por god-mode (excluida)', async () => { await assertFails(ctx('super').doc('accesos_qr/a2').set({ x: 1 })); });
});

describe('calificaciones — el socio completa la SUYA (pendiente→calificada)', () => {
  it('✓ el socio dueño lee su calificación', async () => { await assertSucceeds(ctx('soc').doc('calificaciones/ep1').get()); });
  it('✓ el staff (operativo) lee', async () => { await assertSucceeds(ctx('med').doc('calificaciones/ep1').get()); });
  it('✗ otro socio NO lee la ajena', async () => { await assertFails(ctx('otro').doc('calificaciones/ep1').get()); });
  it('✓ el socio la completa (estrellas 5 + comentario, pendiente→calificada)', async () => {
    await assertSucceeds(ctx('soc').doc('calificaciones/ep1').set({ estrellas: 5, comentario: 'excelente', estado: 'calificada', calificadoEn: serverTimestamp() }, { merge: true }));
  });
  it('✗ estrellas fuera de rango (6)', async () => { await assertFails(ctx('soc').doc('calificaciones/ep1').set({ estrellas: 6, estado: 'calificada' }, { merge: true })); });
  it('✗ otro socio NO la completa', async () => { await assertFails(ctx('otro').doc('calificaciones/ep1').set({ estrellas: 5, estado: 'calificada' }, { merge: true })); });
  it('✗ no puede tocar el medicoId (fuera de la whitelist)', async () => { await assertFails(ctx('soc').doc('calificaciones/ep1').set({ estrellas: 5, estado: 'calificada', medicoId: 'otro' }, { merge: true })); });
  it('✗ el socio NO crea una calificación de la nada (solo la CF)', async () => { await assertFails(ctx('soc').doc('calificaciones/ep9').set({ episodioId: 'ep9', personaId: 'pSoc', estado: 'pendiente' })); });
  it('✗ no se re-califica una ya calificada', async () => {
    await env.withSecurityRulesDisabled(async (c) => { await c.firestore().doc('calificaciones/ep1').set({ estado: 'calificada', estrellas: 3 }, { merge: true }); });
    await assertFails(ctx('soc').doc('calificaciones/ep1').set({ estrellas: 5, estado: 'calificada' }, { merge: true }));
  });
});

describe('notas_socio — INTERNA del staff, el socio JAMÁS la ve', () => {
  it('✓ el médico crea su nota (medicoId==uid)', async () => { await assertSucceeds(ctx('med').collection('notas_socio').add({ personaId: 'pSoc', medicoId: 'med', estrellas: 3, nota: 'x', visibleSocio: false, en: serverTimestamp() })); });
  it('✗ médico NO crea con medicoId ajeno', async () => { await assertFails(ctx('med').collection('notas_socio').add({ personaId: 'pSoc', medicoId: 'otro', estrellas: 3, visibleSocio: false, en: serverTimestamp() })); });
  it('✓ staff lee', async () => { await assertSucceeds(ctx('med').doc('notas_socio/n1').get()); });
  it('✗ el SOCIO NO lee (asimetría)', async () => { await assertFails(ctx('soc').doc('notas_socio/n1').get()); });
  it('✗ nadie actualiza/borra (append-only)', async () => { await assertFails(ctx('med').doc('notas_socio/n1').set({ nota: 'z' }, { merge: true })); });
  it('✗ el superadmin tampoco escribe por god-mode (excluida)', async () => { await assertFails(ctx('super').doc('notas_socio/n2').set({ x: 1 })); });
});
