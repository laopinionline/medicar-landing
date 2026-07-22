'use strict';
/*
 * MEDICAR IA — ADAPTADOR DEL MODELO (F1). Aísla al resto del sistema del proveedor concreto (como pasarela-adapter).
 * Una sola función. El proveedor lo elige asistente_secreto/config.proveedor ('ollama' | 'claude').
 *  - 'ollama' (prototipo): POST al túnel (cloudflared) /api/chat, con token en Authorization. FUNCIONAL.
 *  - 'claude' (producción): Anthropic Messages API. STUB documentado (rama a completar al pasar a prod).
 *
 * responder(cfg, { system, contexto, historia, mensaje }) -> { texto }
 *   cfg = asistente_secreto/config (proveedor, url, token, model, apiKey...). NUNCA llega al cliente.
 *   historia = [{role:'user'|'assistant', content}] (turnos previos, ya acotados por la CF).
 *   Lanza si el proveedor no está implementado o la llamada falla (la CF captura y DEGRADA limpio).
 */

async function responder(cfg, { system, contexto, historia, mensaje }) {
  const proveedor = (cfg && cfg.proveedor) || 'ollama';
  const messages = [
    { role: 'system', content: system + '\n\n' + contexto },
    ...(Array.isArray(historia) ? historia : []),
    { role: 'user', content: String(mensaje || '') },
  ];

  if (proveedor === 'ollama') {
    if (!cfg.url) throw new Error('ollama: falta url del túnel (asistente_secreto/config.url)');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Number(cfg.timeoutMs) || 25000); // no colgar la CF si el túnel/compu no responde
    try {
      const r = await fetch(cfg.url.replace(/\/$/, '') + '/api/chat', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {}),
        body: JSON.stringify({ model: cfg.model || 'llama3.1:8b', messages, stream: false, options: { temperature: 0.1 } }),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error('ollama HTTP ' + r.status);
      const j = await r.json();
      const texto = j && j.message && j.message.content;
      if (!texto) throw new Error('ollama: respuesta vacía');
      return { texto: String(texto).trim() };
    } finally { clearTimeout(timer); }
  }

  if (proveedor === 'claude') {
    // ───────── PRODUCCIÓN (rama a completar al pasar a prod) ─────────
    // POST https://api.anthropic.com/v1/messages con headers { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' }
    //   y body { model: cfg.model || 'claude-...', max_tokens: 512, system: system+'\n\n'+contexto,
    //   messages: [...historia, {role:'user', content: mensaje}] }. Devolver { texto: resp.content[0].text }.
    // Mismo timeout/abort que ollama. NUNCA exponer la apiKey al cliente (vive en asistente_secreto/config).
    throw new Error('asistente: proveedor "claude" no implementado (stub para producción)');
  }

  throw new Error('asistente: proveedor "' + proveedor + '" desconocido');
}

module.exports = { responder };
