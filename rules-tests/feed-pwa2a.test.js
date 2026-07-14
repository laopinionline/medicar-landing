'use strict';
/*
 * Tests de reglas — PWA-2a: feed_posts (cola de curaduría del feed).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/feed-pwa2a.test.js"
 *
 * INVARIANTE: el admin lee TODO (curaduría); el socio NO-admin lee SOLO 'publicado' (nunca pendiente/descartado).
 * Escritura solo admin. La CF ingesta escribe por Admin SDK (saltea reglas).
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

const PROJECT = 'medicar-feed-pwa2a';
let env;

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/adm').set({ rol:'admin', roles:['admin'], permisos:{ curar_novedades:true } }); // Tablero-Fase1: curaduría por cap (antes era rol admin)
    await db.doc('usuarios/socioU').set({ rol:'afiliado', roles:['afiliado'], personaId:'pA' });
    await db.doc('usuarios/oper').set({ rol:'despachante', roles:['despachante'] });
    await db.doc('feed_posts/fPend').set({ estado:'pendiente', origen:'laopinion', titulo:'X' });
    await db.doc('feed_posts/fPub').set({ estado:'publicado', origen:'externo', titulo:'Y' });
    await db.doc('feed_posts/fDesc').set({ estado:'descartado', origen:'externo', titulo:'Z' });
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('PWA-2a — feed_posts (curaduría + lectura scoped)', () => {
  // El fix: admin lee TODO (la cola de curaduría).
  it('✓ admin lee un pendiente',                 async () => { await assertSucceeds(ctx('adm').doc('feed_posts/fPend').get()); });
  it('✓ admin QUERY estado==pendiente',          async () => { await assertSucceeds(ctx('adm').collection('feed_posts').where('estado','==','pendiente').get()); });
  it('✓ admin lee un descartado',                async () => { await assertSucceeds(ctx('adm').doc('feed_posts/fDesc').get()); });
  // Invariante que NO se relaja: el socio NO-admin lee SOLO publicado.
  it('✓ afiliado lee un publicado',              async () => { await assertSucceeds(ctx('socioU').doc('feed_posts/fPub').get()); });
  it('✓ afiliado QUERY estado==publicado',       async () => { await assertSucceeds(ctx('socioU').collection('feed_posts').where('estado','==','publicado').get()); });
  it('✗ afiliado QUERY estado==pendiente (permission-denied)', async () => { await assertFails(ctx('socioU').collection('feed_posts').where('estado','==','pendiente').get()); });
  it('✗ afiliado lee un pendiente por id',       async () => { await assertFails(ctx('socioU').doc('feed_posts/fPend').get()); });
  it('✗ afiliado lee un descartado por id',      async () => { await assertFails(ctx('socioU').doc('feed_posts/fDesc').get()); });
  it('✗ operativo no-admin QUERY pendiente',     async () => { await assertFails(ctx('oper').collection('feed_posts').where('estado','==','pendiente').get()); });
  it('✗ anónimo lee un publicado',               async () => { await assertFails(anon().doc('feed_posts/fPub').get()); });
  // Escritura solo admin.
  it('✓ admin crea (alta manual interno)',       async () => { await assertSucceeds(ctx('adm').collection('feed_posts').add({ estado:'publicado', origen:'interno', titulo:'M' })); });
  it('✓ admin aprueba (update a publicado)',     async () => { await assertSucceeds(ctx('adm').doc('feed_posts/fPend').set({ estado:'publicado', aprobadoPor:'adm' }, { merge:true })); });
  it('✗ afiliado escribe',                       async () => { await assertFails(ctx('socioU').doc('feed_posts/fPub').set({ titulo:'hack' }, { merge:true })); });
  it('✗ operativo no-admin escribe',             async () => { await assertFails(ctx('oper').collection('feed_posts').add({ estado:'publicado', titulo:'M' })); });
});
