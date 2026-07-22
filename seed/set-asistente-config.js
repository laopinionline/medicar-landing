'use strict';
/* MEDICAR IA — setea la config del asistente (Admin SDK). NO se corre solo: lo dispara Lucas.
 *   node seed/set-asistente-config.js ollama "https://xxx.trycloudflare.com" "token-opcional"
 *   node seed/set-asistente-config.js claude "" "" "sk-ant-..."
 * Escribe:
 *   asistente_secreto/config  (read/write:false → solo Admin SDK): proveedor, url, token, apiKey, model, timeoutMs.
 *   configuracion/asistente   (client-readable, NO sensible): { habilitado:true } para encender la sección en la PWA.
 */
const path = require('path'), admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();

const [proveedor = 'ollama', url = '', token = '', apiKey = ''] = process.argv.slice(2);
if (!['ollama', 'claude'].includes(proveedor)) { console.error('proveedor debe ser ollama|claude'); process.exit(1); }

const cfg = { proveedor, model: 'llama3.1:8b', timeoutMs: 25000 };
if (proveedor === 'ollama') { if (!url) { console.error('ollama requiere url del túnel'); process.exit(1); } cfg.url = url; cfg.token = token || null; }
if (proveedor === 'claude') { cfg.apiKey = apiKey || null; cfg.model = 'claude-opus-4-8'; }

(async () => {
  await db.collection('asistente_secreto').doc('config').set(cfg, { merge: false });
  await db.collection('configuracion').doc('asistente').set({ habilitado: true }, { merge: true });
  console.log('✓ asistente_secreto/config =', JSON.stringify({ ...cfg, token: cfg.token ? '***' : null, apiKey: cfg.apiKey ? '***' : null }));
  console.log('✓ configuracion/asistente = { habilitado: true }');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
