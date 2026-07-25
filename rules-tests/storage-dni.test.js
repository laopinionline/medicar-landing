'use strict';
/* Rules-unit de Storage — DNI del prospecto: prospectos/{uid}/dni/{clave}/{frente|dorso}.jpg.
 *  - write/delete: SOLO el dueño (su uid), imagen, < 5 MB.
 *  - read: SOLO admin/superadmin. NO el dueño, NO marketing, NO público.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore,storage --project demo-medicar "npx mocha rules-tests/storage-dni.test.js" */
const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');

const PROJECT = 'demo-medicar';
let env;
const img = new Uint8Array([255, 216, 255, 217]);            // jpeg mínimo
const big = new Uint8Array(5 * 1024 * 1024 + 16);            // > 5 MB
const meta = { contentType: 'image/jpeg' };
const P = 'prospectos/u_pros/dni/titular/frente.jpg';        // path del dueño u_pros

async function seedFirestore(uid, roles) {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const url = `http://${host}/v1/projects/${PROJECT}/databases/(default)/documents/usuarios/${uid}`;
  const fields = { rol: { stringValue: roles[0] }, roles: { arrayValue: { values: roles.map((r) => ({ stringValue: r })) } }, activo: { booleanValue: true } };
  const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('seed ' + uid + ' -> ' + r.status + ' ' + (await r.text()));
}
before(async () => {
  await seedFirestore('adm', ['admin']);
  await seedFirestore('super', ['superadmin']);
  await seedFirestore('mkt', ['despachante']);        // marketing = cap, no rol; para Storage cuenta como NO-admin
  await seedFirestore('u_pros', ['afiliado']);        // el prospecto/dueño
  await seedFirestore('otro', ['afiliado']);          // otro usuario cualquiera
  env = await initializeTestEnvironment({ projectId: PROJECT, storage: { rules: fs.readFileSync('storage.rules', 'utf8') } });
});
after(async () => { if (env) await env.cleanup(); });
const st = (uid) => env.authenticatedContext(uid).storage();
const anon = () => env.unauthenticatedContext().storage();
async function seedFoto() { await env.withSecurityRulesDisabled(async (ctx) => { await ctx.storage().ref(P).put(img, meta); }); }

describe('Storage DNI — write (solo el dueño, imagen, < 5 MB)', () => {
  it('✓ el dueño sube su frente', async () => { await assertSucceeds(st('u_pros').ref(P).put(img, meta)); });
  it('✓ el dueño sube el dorso de un integrante', async () => { await assertSucceeds(st('u_pros').ref('prospectos/u_pros/dni/int_2/dorso.jpg').put(img, meta)); });
  it('✗ OTRO usuario NO sube al path del dueño', async () => { await assertFails(st('otro').ref(P).put(img, meta)); });
  it('✗ el admin NO sube por el dueño (write es del dueño)', async () => { await assertFails(st('adm').ref(P).put(img, meta)); });
  it('✗ anónimo NO sube', async () => { await assertFails(anon().ref(P).put(img, meta)); });
  it('✗ archivo NO-imagen rechazado', async () => { await assertFails(st('u_pros').ref(P).put(img, { contentType: 'application/pdf' })); });
  it('✗ imagen > 5 MB rechazada', async () => { await assertFails(st('u_pros').ref(P).put(big, meta)); });
});

describe('Storage DNI — read (SOLO admin/superadmin)', () => {
  beforeEach(seedFoto);
  it('✓ admin lee', async () => { await assertSucceeds(st('adm').ref(P).getMetadata()); });
  it('✓ superadmin lee', async () => { await assertSucceeds(st('super').ref(P).getMetadata()); });
  it('✗ el DUEÑO no re-lee su propia foto', async () => { await assertFails(st('u_pros').ref(P).getMetadata()); });
  it('✗ marketing (rol no-admin) no lee', async () => { await assertFails(st('mkt').ref(P).getMetadata()); });
  it('✗ otro usuario no lee', async () => { await assertFails(st('otro').ref(P).getMetadata()); });
  it('✗ anónimo no lee', async () => { await assertFails(anon().ref(P).getMetadata()); });
});

describe('Storage DNI — delete (dueño re-toma / admin)', () => {
  beforeEach(seedFoto);
  it('✓ el dueño borra (re-tomar)', async () => { await assertSucceeds(st('u_pros').ref(P).delete()); });
  it('✓ admin borra', async () => { await assertSucceeds(st('adm').ref(P).delete()); });
  it('✗ otro usuario no borra', async () => { await assertFails(st('otro').ref(P).delete()); });
});

describe('Storage DNI — el catch-all sigue cerrado fuera del path', () => {
  it('✗ el dueño NO escribe fuera de su carpeta dni', async () => { await assertFails(st('u_pros').ref('prospectos/u_pros/otro/x.jpg').put(img, meta)); });
});
