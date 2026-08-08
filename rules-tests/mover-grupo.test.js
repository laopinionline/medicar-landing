'use strict';
/* Tests de reglas — MOVER DE GRUPO: titularPersonaId/titularSocioId se SETEAN en el alta (create) pero son INMUTABLES
 * por cliente en update (se suman a vitalicio/bonificado/origen/empresaId). Cambiar de grupo o independizar = SOLO la CF
 * moverDeGrupo (Admin SDK). El superadmin bypassa por god-mode (como con cualquier campo de socios).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/mover-grupo.test.js" */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-mover-grupo';
let env;
const SOCIO = (o = {}) => Object.assign({ personaId: 'pX', tipoAfiliado: 'directo', numeroAfiliado: '100', planId: 'plan-joven', esResponsablePago: true, activo: true }, o);
const DEP = (o = {}) => SOCIO(Object.assign({ personaId: 'pDep', numeroAfiliado: '100-2', planId: null, titularSocioId: 'tit', titularPersonaId: 'pTit' }, o));

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/super').set({ rol: 'superadmin', roles: ['superadmin'] });
    await db.doc('usuarios/adm').set({ rol: 'admin', roles: ['admin'], permisos: { gestionar_afiliados: true } });
    await db.doc('usuarios/afi').set({ rol: 'despachante', roles: ['despachante'], permisos: { gestionar_afiliados: true } }); // gestionar_afiliados SIN admin
    await db.doc('socios/tit').set(SOCIO({ personaId: 'pTit' }));  // titular (sin titularSocioId)
    await db.doc('socios/tit2').set(SOCIO({ personaId: 'pTit2', numeroAfiliado: '200' })); // otro titular (destino)
    await db.doc('socios/dep').set(DEP());                          // dependiente del grupo 'tit'
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('MOVER DE GRUPO — titularPersonaId/titularSocioId INMUTABLES en update (CF-only)', () => {
  it('✗ gestionar_afiliados NO puede cambiar titularSocioId (mover de grupo por cliente)', async () => {
    await assertFails(ctx('afi').doc('socios/dep').set({ titularSocioId: 'tit2', titularPersonaId: 'pTit2' }, { merge: true }));
  });
  it('✗ gestionar_afiliados NO puede cambiar solo titularPersonaId', async () => {
    await assertFails(ctx('afi').doc('socios/dep').set({ titularPersonaId: 'pTit2' }, { merge: true }));
  });
  it('✗ gestionar_afiliados NO puede LIMPIAR titularSocioId (independizar por cliente)', async () => {
    await assertFails(ctx('afi').doc('socios/dep').set({ titularSocioId: null, titularPersonaId: null }, { merge: true }));
  });
  it('✗ admin TAMPOCO puede cambiar titularSocioId (inmutable para operativos)', async () => {
    await assertFails(ctx('adm').doc('socios/dep').set({ titularSocioId: 'tit2' }, { merge: true }));
  });
  it('· superadmin SÍ puede (god-mode break-glass, como cualquier campo de socios)', async () => {
    await assertSucceeds(ctx('super').doc('socios/dep').set({ titularSocioId: 'tit2' }, { merge: true }));
  });
});

describe('MOVER DE GRUPO — el resto de la ficha sigue funcionando (sin regresión)', () => {
  it('✓ afi edita OTRO campo del dependiente (titular fields intactos)', async () => {
    await assertSucceeds(ctx('afi').doc('socios/dep').set({ numeroAfiliado: '100-2b', vigenteDesde: null }, { merge: true }));
  });
  it('✓ afi re-escribe el MISMO titularSocioId/titularPersonaId + otro campo', async () => {
    await assertSucceeds(ctx('afi').doc('socios/dep').set({ titularSocioId: 'tit', titularPersonaId: 'pTit', numeroAfiliado: '100-2c' }, { merge: true }));
  });
  it('✓ afi edita un titular (no toca campos de grupo)', async () => {
    await assertSucceeds(ctx('afi').doc('socios/tit').set({ numeroAfiliado: '100b' }, { merge: true }));
  });
  it('✓ alta (create) de un dependiente CON titularSocioId/titularPersonaId es válida', async () => {
    await assertSucceeds(ctx('afi').doc('socios/dep2').set(DEP({ personaId: 'pDep2', numeroAfiliado: '100-3' })));
  });
});
