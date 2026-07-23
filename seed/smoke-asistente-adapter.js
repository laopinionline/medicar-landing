'use strict';
/* Smoke — asistente-adapter.js: shapes de request (ollama/claude), modo 'ruteo' con CASCADA (respaldo mutuo) y
 * degradación. Mockea fetch (no llama a las APIs reales). node seed/smoke-asistente-adapter.js */
const { responder } = require('../functions/asistente-adapter');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };
const withFetch = async (impl, fn) => { const orig = global.fetch; global.fetch = impl; try { return await fn(); } finally { global.fetch = orig; } };
const okOllama = (body) => ({ ok: true, status: 200, json: async () => (body || { message: { content: 'resp ollama' } }) });
const okClaude = (body) => ({ ok: true, status: 200, json: async () => (body || { content: [{ type: 'text', text: 'resp claude' }] }) });
const IN = { system: 'SYS', contexto: 'CTX', historia: [{ role: 'user', content: 'hola' }], mensaje: '¿mi plan?' };

(async () => {
  // ── OLLAMA: shape + CF-Access headers ──
  let cap = null;
  await withFetch(async (url, opts) => { cap = { url, opts }; return okOllama(); }, async () => {
    const r = await responder({ proveedor: 'ollama', url: 'https://ia.x/', model: 'llama3.1:8b', token: 'tk', accessClientId: 'cid', accessClientSecret: 'csec' }, IN);
    t('ollama: devuelve { texto, rama:ollama }', r.texto === 'resp ollama' && r.rama === 'ollama' && r.fallback === false);
  });
  const bo = JSON.parse(cap.opts.body);
  t('ollama: URL /api/chat', cap.url === 'https://ia.x/api/chat');
  t('ollama: system en messages[0]', bo.messages[0].role === 'system' && bo.messages[0].content === 'SYS\n\nCTX');
  t('ollama: Authorization Bearer + CF-Access headers', cap.opts.headers.Authorization === 'Bearer tk' && cap.opts.headers['CF-Access-Client-Id'] === 'cid' && cap.opts.headers['CF-Access-Client-Secret'] === 'csec');

  // ── CLAUDE: shape (system top-level, messages sin system) ──
  cap = null;
  await withFetch(async (url, opts) => { cap = { url, opts }; return okClaude(); }, async () => {
    const r = await responder({ proveedor: 'claude', apiKey: 'sk-test', modelClaude: 'claude-haiku-4-5' }, IN);
    t('claude: devuelve { texto, rama:claude }', r.texto === 'resp claude' && r.rama === 'claude');
  });
  const bc = JSON.parse(cap.opts.body);
  t('claude: URL Anthropic + x-api-key', cap.url === 'https://api.anthropic.com/v1/messages' && cap.opts.headers['x-api-key'] === 'sk-test');
  t('claude: system top-level = SYS+CTX', bc.system === 'SYS\n\nCTX');
  t('claude: messages SIN system (historia + user)', bc.messages.every((m) => m.role !== 'system') && bc.messages[bc.messages.length - 1].content === '¿mi plan?');
  t('claude: model separado (modelClaude)', bc.model === 'claude-haiku-4-5' && bc.max_tokens === 512);

  // ── RUTEO: cascada. orden [claude, ollama]; claude FALLA → cae a ollama (fallback:true) ──
  const cfgR = { proveedor: 'ruteo', url: 'https://ia.x', apiKey: 'sk', model: 'llama3.1:8b' };
  await withFetch(async (url) => { if (/anthropic/.test(url)) return { ok: false, status: 500 }; return okOllama(); }, async () => {
    const r = await responder(cfgR, { ...IN, orden: ['claude', 'ollama'] });
    t('ruteo: claude falla → fallback ollama (rama:ollama, fallback:true)', r.rama === 'ollama' && r.fallback === true);
  });
  // orden [claude] y claude OK → sin fallback
  await withFetch(async () => okClaude(), async () => {
    const r = await responder(cfgR, { ...IN, orden: ['claude'] });
    t('ruteo: claude OK → rama claude, fallback:false', r.rama === 'claude' && r.fallback === false);
  });
  // orden [ollama, claude]; ollama OK a la primera → sin fallback
  await withFetch(async (url) => { if (/anthropic/.test(url)) throw new Error('no debería llamar claude'); return okOllama(); }, async () => {
    const r = await responder(cfgR, { ...IN, orden: ['ollama', 'claude'] });
    t('ruteo: ollama OK primero → NO llama claude', r.rama === 'ollama' && r.fallback === false);
  });
  // AMBAS fallan → throw (la CF degrada)
  let threw = false;
  await withFetch(async () => ({ ok: false, status: 503 }), async () => {
    try { await responder(cfgR, { ...IN, orden: ['claude', 'ollama'] }); } catch (e) { threw = /HTTP 503/.test(e.message); }
  });
  t('ruteo: ambas ramas fallan → throw (degradación)', threw);

  // ── proveedor desconocido → throw ──
  let un = false; try { await responder({ proveedor: 'gpt' }, IN); } catch (e) { un = /desconocido/.test(e.message); }
  t('proveedor desconocido → throw', un);

  console.log(`\n${fail ? '✗' : '✓'} smoke-asistente-adapter: ${ok} ok, ${fail} fallo(s)`);
  process.exit(fail ? 1 : 0);
})();
