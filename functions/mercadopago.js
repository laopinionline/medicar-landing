'use strict';
/* MEDICAR — Mercado Pago (Checkout Pro por REDIRECT), aislado del resto. Cobra MEDICAR DIRECTO: sin split, sin
 * marketplace, sin multi-tenant. Tres piezas:
 *   crearPreferencia({accessToken, monto, descripcion, externalReference, backUrls, notificationUrl, expiraISO, fetchImpl})
 *     → POST /checkout/preferences → { preferenciaId, initPoint }. amount = `monto` (el server manda; NUNCA el cliente).
 *   validarFirma({xSignature, xRequestId, dataId, secret}) → bool. HMAC-SHA256 del manifest de MP; NUNCA confiar en el body.
 *   consultarPago({accessToken, paymentId, fetchImpl}) → { status, externalReference, monto }. La VERDAD del pago sale de acá.
 * Test vs prod = SOLO el access token (TEST-… vs APP_USR-…): el código es idéntico. */
const crypto = require('crypto');
const API = 'https://api.mercadopago.com';

async function crearPreferencia(opts) {
  const o = opts || {};
  const fetchImpl = o.fetchImpl || fetch;
  const body = {
    items: [{ title: String(o.descripcion || 'MEDICAR').slice(0, 250), quantity: 1, unit_price: Number(o.monto) || 0, currency_id: 'ARS' }],
    external_reference: String(o.externalReference || ''),
    notification_url: o.notificationUrl || undefined,
    back_urls: o.backUrls || undefined,
    auto_return: 'approved',
    expiration_date_to: o.expiraISO || undefined,
    binary_mode: true, // aprobado o rechazado (sin estados intermedios raros); pending real (efectivo) sigue existiendo
  };
  const r = await fetchImpl(API + '/checkout/preferences', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + (o.accessToken || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('MP preference ' + r.status + ' ' + t.slice(0, 300)); }
  const pref = await r.json();
  // init_point (prod) / sandbox_init_point (test). Con token TEST-… MP devuelve sandbox_init_point.
  const isTest = /^TEST-/.test(String(o.accessToken || ''));
  const initPoint = (isTest && pref.sandbox_init_point) ? pref.sandbox_init_point : (pref.init_point || pref.sandbox_init_point);
  return { preferenciaId: pref.id, initPoint };
}

// Valida la firma de la notificación (x-signature: "ts=...,v1=..."). manifest = id:<dataId>;request-id:<xRequestId>;ts:<ts>;
function validarFirma(a) {
  const secret = a && a.secret; if (!secret) return false;
  const xSig = String((a && a.xSignature) || '');
  const parts = {}; xSig.split(',').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); });
  const ts = parts.ts, v1 = parts.v1; if (!ts || !v1) return false;
  const dataId = String((a && a.dataId) || '').toLowerCase(); // MP: id alfanumérico va en minúsculas
  const manifest = 'id:' + dataId + ';request-id:' + String((a && a.xRequestId) || '') + ';ts:' + ts + ';';
  const calc = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  // comparación en tiempo constante
  try { return calc.length === v1.length && crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(v1)); } catch (_) { return false; }
}

async function consultarPago(opts) {
  const o = opts || {};
  const fetchImpl = o.fetchImpl || fetch;
  const r = await fetchImpl(API + '/v1/payments/' + encodeURIComponent(o.paymentId), { headers: { 'Authorization': 'Bearer ' + (o.accessToken || '') } });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('MP payment ' + r.status + ' ' + t.slice(0, 200)); }
  const p = await r.json();
  return { status: p.status || null, externalReference: p.external_reference || null, monto: Number(p.transaction_amount) || 0, paymentId: String(p.id || o.paymentId) };
}

// dataId desde el query/body de la notificación MP (topic 'payment'): ?data.id=... | ?id=... | body.data.id
function dataIdDeNotificacion(query, body) {
  query = query || {}; body = body || {};
  return String(query['data.id'] || query.id || (body.data && body.data.id) || body.id || '').trim();
}

// Decisión de promoción del lead al confirmar un pago APPROVED (idempotencia + gate integrados):
//   'pendiente_pago' → promover · 'afiliacion_en_proceso' → idempotente (segunda notificación no duplica) · otro → ignorar.
function promocionAfiliacion(estadoActual) {
  if (estadoActual === 'afiliacion_en_proceso') return 'idempotente';
  if (estadoActual === 'pendiente_pago') return 'promover';
  return 'ignorar';
}

module.exports = { crearPreferencia, validarFirma, consultarPago, dataIdDeNotificacion, promocionAfiliacion, API };
