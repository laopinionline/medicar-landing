'use strict';
/* Demostración conductual del RESUMIDOR de memoria (pipeline real contra un modelo). NO toca prod.
 *   node seed/eval-memoria.js                 (ollama local — proxy; en prod el resumidor es claude)
 *   ANTHROPIC_API_KEY=... node seed/eval-memoria.js   (claude, la rama real)
 * Muestra: transcript de salud → memoria estructurada válida → bloque inyectado en una NUEVA sesión. */
const { SYSTEM_RESUMIDOR, promptResumen, parseResumen } = require('../functions/memoria-nucleo');
const { buildContexto } = require('../functions/asistente-prompt');
const KEY = process.env.ANTHROPIC_API_KEY;
const HOY = '2026-07-23';

async function resumir(memPrevia, historia) {
  const mensaje = promptResumen(memPrevia, historia, HOY);
  let texto;
  if (KEY) {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5', max_tokens: 700, temperature: 0.1, system: SYSTEM_RESUMIDOR, messages: [{ role: 'user', content: mensaje }] }) });
    const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error));
    texto = j.content && j.content[0] && j.content[0].text || '';
  } else {
    const r = await fetch('http://localhost:11434/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.MODEL || 'llama3.1:8b', messages: [{ role: 'system', content: SYSTEM_RESUMIDOR }, { role: 'user', content: mensaje }], stream: false, format: 'json', options: { temperature: 0.1 } }) });
    const j = await r.json(); texto = j.message && j.message.content || '';
  }
  return { texto, memoria: parseResumen(texto, HOY) };
}

(async () => {
  console.log('=== RESUMIDOR vía', KEY ? 'CLAUDE' : 'OLLAMA (proxy)', '===\n');
  const historia = [
    { role: 'user', content: 'hola, me duele el pie izquierdo hace 3 días, sobre todo al caminar' },
    { role: 'assistant', content: 'Entiendo. ¿Te lo torciste o empezó solo? ¿Hay hinchazón? Mientras tanto, reposo y frío 15 min. ⚠️ Si el dolor no cede o no podés apoyar, pedí que te vea un médico.' },
    { role: 'user', content: 'no me lo torcí, y sí está un poco hinchado. otra cosa: quiero pasar al plan Familiar el mes que viene' },
    { role: 'assistant', content: 'Para el pie, si sigue hinchado conviene que lo revisen. Sobre el plan Familiar, es un cambio administrativo que podés gestionar desde la app.' },
  ];
  const { texto, memoria } = await resumir({ temas: [], seguimientos: [], pendientes: [], preferencias: [] }, historia);
  console.log('— salida cruda del modelo —\n' + texto.slice(0, 500) + '\n');
  console.log('— memoria VALIDADA (lo que se escribiría) —\n' + JSON.stringify(memoria, null, 1) + '\n');

  // Nueva sesión: el asistente retoma con la memoria inyectada (subordinada a TU CUENTA).
  const ctx = buildContexto({ nombre: 'Lucas', plan: { nombre: 'Plan 01', precio: 18000 }, cubre: ['emergencias'], factura: null, ultimaFactura: null, memoria, tel: '443044' });
  const bloque = ctx.split('\n').filter((l) => /DE CHARLAS ANTERIORES|Consultó|Seguimiento|Pendiente|Preferencia/.test(l)).join('\n');
  console.log('— bloque inyectado en la NUEVA sesión —\n' + (bloque || '(vacío)'));

  const okEstructura = memoria && (memoria.seguimientos.length > 0 || memoria.temas.length > 0);
  console.log('\n' + (okEstructura ? '✅' : '🔴') + ' estructura no vacía y válida · ' + (/DE CHARLAS ANTERIORES/.test(ctx) ? 'inyección OK' : 'sin inyección'));
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
