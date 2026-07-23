'use strict';
/*
 * MEDICAR IA — ADAPTADOR DEL MODELO. Aísla del proveedor concreto. asistente_secreto/config.proveedor:
 *  - 'ollama' : POST al túnel (cloudflared) /api/chat. Headers CF-Access (cierra la URL pública, ver 9f59dfe). FUNCIONAL.
 *  - 'claude' : Anthropic Messages API (system top-level). FUNCIONAL.
 *  - 'ruteo'  : semáforo determinista — el CF decide el ORDEN de ramas por categoría (asistente-ruteo) y las prueba
 *               en CASCADA (si la 1ª falla: timeout/error/túnel caído → la otra). Objetivo de prod.
 *
 * responder(cfg, { system, contexto, historia, mensaje, orden }) -> { texto, rama, fallback }
 *   orden = p.ej. ['claude','ollama'] (solo se usa en 'ruteo'; lo arma el CF con ramas() de asistente-ruteo).
 *   apiKey/token/CF-Access viven SOLO en asistente_secreto/config (read/write:false), nunca llegan al cliente.
 *   Lanza si todas las ramas fallan (la CF captura y DEGRADA limpio).
 */

const TIMEOUT_OLLAMA = 25000, TIMEOUT_CLAUDE = 18000; // presupuesto por rama; cascada peor caso ≈ suma (ver timeoutSeconds del CF)

async function viaOllama(cfg, { system, contexto, historia, mensaje }) {
  if (!cfg.url) throw new Error('ollama: falta url del túnel (asistente_secreto/config.url)');
  const messages = [{ role: 'system', content: system + '\n\n' + contexto }, ...(Array.isArray(historia) ? historia : []), { role: 'user', content: String(mensaje || '') }];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(cfg.timeoutMs) || TIMEOUT_OLLAMA);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
    if (cfg.accessClientId && cfg.accessClientSecret) { headers['CF-Access-Client-Id'] = cfg.accessClientId; headers['CF-Access-Client-Secret'] = cfg.accessClientSecret; }
    const r = await fetch(cfg.url.replace(/\/$/, '') + '/api/chat', {
      method: 'POST', headers,
      body: JSON.stringify({ model: cfg.model || 'llama3.1:8b', messages, stream: false, options: { temperature: 0.1 } }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error('ollama HTTP ' + r.status);
    const j = await r.json();
    const texto = j && j.message && j.message.content;
    if (!texto) throw new Error('ollama: respuesta vacía');
    return String(texto).trim();
  } finally { clearTimeout(timer); }
}

async function viaClaude(cfg, { system, contexto, historia, mensaje }) {
  if (!cfg.apiKey) throw new Error('claude: falta apiKey (asistente_secreto/config.apiKey)');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(cfg.timeoutClaudeMs) || TIMEOUT_CLAUDE);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: cfg.modelClaude || 'claude-haiku-4-5',        // separado del model de ollama (en ruteo se usan los dos)
        max_tokens: Number(cfg.maxTokens) || 512,
        temperature: 0.1,
        system: system + '\n\n' + contexto,                    // system separado de los turnos (contrato Anthropic)
        messages: [...(Array.isArray(historia) ? historia : []), { role: 'user', content: String(mensaje || '') }],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error('claude HTTP ' + r.status);
    const j = await r.json();
    const texto = j && Array.isArray(j.content) && j.content[0] && j.content[0].text;
    if (!texto) throw new Error('claude: respuesta vacía');
    return String(texto).trim();
  } finally { clearTimeout(timer); }
}

const VIA = { ollama: viaOllama, claude: viaClaude };

async function responder(cfg, payload) {
  const proveedor = (cfg && cfg.proveedor) || 'ollama';
  if (proveedor === 'ollama' || proveedor === 'claude') {
    return { texto: await VIA[proveedor](cfg, payload), rama: proveedor, fallback: false };
  }
  if (proveedor === 'ruteo') {
    const orden = (payload && Array.isArray(payload.orden) && payload.orden.length) ? payload.orden : ['ollama'];
    let lastErr;
    for (let i = 0; i < orden.length; i++) {
      const prov = orden[i];
      if (!VIA[prov]) { lastErr = new Error('ruteo: rama desconocida ' + prov); continue; }
      try { return { texto: await VIA[prov](cfg, payload), rama: prov, fallback: i > 0, intentos: orden.slice(0, i + 1) }; }
      catch (e) { lastErr = e; } // CASCADA: la elegida falló → probar la siguiente
    }
    throw lastErr || new Error('ruteo: sin ramas');
  }
  throw new Error('asistente: proveedor "' + proveedor + '" desconocido');
}

module.exports = { responder, viaOllama, viaClaude, TIMEOUT_OLLAMA, TIMEOUT_CLAUDE };
