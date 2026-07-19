'use strict';
/*
 * Pasarela de pago — ADAPTADOR del proveedor. Interfaz mínima de 2 funciones que aíslan al resto del sistema del
 * proveedor concreto. La lógica de negocio (crear intento, confirmar pago idempotente) NO conoce al proveedor: solo
 * habla con este adaptador. Xavi implementa la rama real (mercadopago | modo); la rama 'simulado' está COMPLETA.
 *
 * El proveedor lo elige configuracion/pasarela.modo ('simulado' | 'mercadopago' | 'modo'), editable por el admin.
 *
 *  - crearPreferencia(modo, {intentId, monto, descripcion, personaId}) → { preferenciaId, initPoint }
 *      SIM: devuelve un preferenceId sintético; la PWA (viendo modo simulado) abre su propia pantalla, no redirige.
 *      REAL: llama a la API del proveedor y devuelve el init_point/checkout URL real. STUB documentado.
 *  - verificarWebhook(modo, { headers, body, secret }) → { valido, intentId, estado }
 *      SIM: no hay firma; confía en el body (el webhook real NO se usa en modo simulado — el simulador confirma por CF).
 *      REAL: verifica la FIRMA del proveedor (HMAC) antes de confiar en nada. STUB documentado.
 */

async function crearPreferencia(modo, { intentId, monto, descripcion, personaId }) {
  if (modo === 'simulado') {
    // Sin llamada externa: la PWA abre la pantalla del simulador con el intentId. initPoint es informativo.
    return { preferenciaId: 'SIM-' + intentId, initPoint: 'sim://' + intentId };
  }
  // ───────── XAVI (real) ─────────
  // mercadopago: POST https://api.mercadopago.com/checkout/preferences con { items:[{title:descripcion, unit_price:monto,
  //   quantity:1}], external_reference: intentId, notification_url: <webhookPasarela>, back_urls:{...} } y Bearer del
  //   access token. Devolver { preferenciaId: pref.id, initPoint: pref.init_point }.
  // modo: equivalente con la API de MODO. Devolver { preferenciaId, initPoint }.
  throw new Error('crearPreferencia: proveedor "' + modo + '" no implementado (stub para Xavi)');
}

function verificarWebhook(modo, { headers, body, secret }) {
  if (modo === 'simulado') {
    const intentId = body && (body.intentId || (body.data && body.data.intentId));
    return { valido: !!intentId, intentId: intentId || null, estado: (body && body.estado) || 'pagado' };
  }
  // ───────── XAVI (real) ─────────
  // mercadopago: verificar el header x-signature (HMAC-SHA256 del template "id:<data.id>;request-id:<x-request-id>;
  //   ts:<ts>;" con el secret del webhook). Solo si valida, leer el pago y mapear a { valido:true, intentId:
  //   pago.external_reference, estado: pago.status==='approved'?'pagado':'error' }.
  // modo: verificar la firma equivalente de MODO. NUNCA confiar en el body sin validar la firma.
  return { valido: false, intentId: null, estado: null };
}

module.exports = { crearPreferencia, verificarWebhook };
