'use strict';
/* Sonda del bug PWA-2c: ¿la regla de Storage feed/ (esAdminStorage con firestore.get) autoriza a un admin?
 * Siembra el doc de Firestore por REST del emulador (evita el conflicto firestore-SDK del harness) y prueba
 * SOLO el contexto de Storage.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore,storage --project demo-medicar "npx mocha rules-tests/storage-feed-probe.test.js" */
const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');

const PROJECT = 'demo-medicar';
let env;
const bytes = new Uint8Array([255, 216, 255, 217]);

async function seedFirestore(uid, fields) {
  const host = process.env.FIRESTORE_EMULATOR_HOST; // lo setea emulators:exec
  const url = `http://${host}/v1/projects/${PROJECT}/databases/(default)/documents/usuarios/${uid}`;
  const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' }, body: JSON.stringify({ fields }) }); // 'owner' bypassa reglas en el emulador
  if (!r.ok) throw new Error('seed ' + uid + ' -> ' + r.status + ' ' + (await r.text()));
}

before(async () => {
  await seedFirestore('adm', { rol: { stringValue: 'admin' }, roles: { arrayValue: { values: [{ stringValue: 'admin' }] } }, activo: { booleanValue: true } });
  await seedFirestore('soc', { rol: { stringValue: 'afiliado' }, roles: { arrayValue: { values: [{ stringValue: 'afiliado' }] } } });
  env = await initializeTestEnvironment({ projectId: PROJECT, storage: { rules: fs.readFileSync('storage.rules', 'utf8') } });
});
after(async () => { if (env) await env.cleanup(); });

describe('Storage feed/ — esAdminStorage (firestore.get cross-service)', () => {
  it('✓ admin sube a feed/__probe__/img.jpg', async () => {
    await assertSucceeds(env.authenticatedContext('adm').storage().ref('feed/__probe__/img.jpg').put(bytes, { contentType: 'image/jpeg' }));
  });
  it('✗ afiliado NO sube', async () => {
    await assertFails(env.authenticatedContext('soc').storage().ref('feed/__probe__/img.jpg').put(bytes, { contentType: 'image/jpeg' }));
  });
});
