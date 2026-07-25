'use strict';
/* Smoke — núcleo Mercado Pago (functions/mercadopago.js): preference con AMOUNT del server, firma válida/inválida,
 * consulta de pago, extracción de data.id, decisión de promoción (idempotencia+gate). fetch mockeado.
 * node seed/smoke-mercadopago.js */
const crypto = require('crypto');
const MP = require('../functions/mercadopago');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// --- crearPreferencia: el body lleva el AMOUNT del server (monto), refs y config; initPoint sandbox con token TEST- ---
(async () => {
  let capturado = null;
  const fakeFetch = async (url, opts) => { capturado = { url, opts }; return { ok: true, json: async () => ({ id: 'pref_123', init_point: 'https://mp/prod', sandbox_init_point: 'https://mp/sbx' }) }; };
  const r = await MP.crearPreferencia({
    accessToken: 'TEST-abc', monto: 20000, descripcion: 'MEDICAR — Plan Joven (afiliación)', externalReference: 'uid_1',
    notificationUrl: 'https://fn/webhookAfiliacionMP', backUrls: { success: 'https://back', pending: 'https://back', failure: 'https://back' },
    expiraISO: '2026-01-01T00:00:00.000Z', fetchImpl: fakeFetch,
  });
  const body = JSON.parse(capturado.opts.body);
  t('preference: URL de preferences + Bearer del token', /checkout\/preferences$/.test(capturado.url) && capturado.opts.headers.Authorization === 'Bearer TEST-abc');
  t('preference: unit_price = monto del SERVER (20000), no del cliente', body.items[0].unit_price === 20000 && body.items[0].quantity === 1 && body.items[0].currency_id === 'ARS');
  t('preference: external_reference = uid', body.external_reference === 'uid_1');
  t('preference: notification_url + back_urls + auto_return', body.notification_url === 'https://fn/webhookAfiliacionMP' && body.back_urls.success === 'https://back' && body.auto_return === 'approved');
  t('preference: expiración + binary_mode', body.expiration_date_to === '2026-01-01T00:00:00.000Z' && body.binary_mode === true);
  t('preference: token TEST- → initPoint = sandbox_init_point', r.preferenciaId === 'pref_123' && r.initPoint === 'https://mp/sbx');

  // token de PROD → init_point real
  const rp = await MP.crearPreferencia({ accessToken: 'APP_USR-xyz', monto: 100, externalReference: 'u', fetchImpl: fakeFetch });
  t('preference: token prod → initPoint = init_point', rp.initPoint === 'https://mp/prod');

  // error HTTP → throw (no persiste basura)
  let tiro = false;
  try { await MP.crearPreferencia({ accessToken: 'x', monto: 1, externalReference: 'u', fetchImpl: async () => ({ ok: false, status: 400, text: async () => 'bad' }) }); } catch (_) { tiro = true; }
  t('preference: HTTP no-2xx → throw', tiro);

  // --- validarFirma: HMAC del manifest de MP, con SEGMENTOS CONDICIONALES (el fix del 401) ---
  const secret = 'whooksecret', ts = '1700000000', dataId = 'PAY123', reqId = 'req-1';
  const hmac = (m) => crypto.createHmac('sha256', secret).update(m).digest('hex');
  const v1con = hmac('id:' + dataId.toLowerCase() + ';request-id:' + reqId + ';ts:' + ts + ';'); // manifest CON request-id
  const v1sin = hmac('id:' + dataId.toLowerCase() + ';ts:' + ts + ';');                          // manifest SIN request-id (segmento omitido)
  t('firma VÁLIDA con x-request-id pasa', MP.validarFirma({ xSignature: 'ts=' + ts + ',v1=' + v1con, xRequestId: reqId, dataId, secret }).valido === true);
  t('firma VÁLIDA SIN x-request-id (segmento omitido) pasa', MP.validarFirma({ xSignature: 'ts=' + ts + ',v1=' + v1sin, xRequestId: '', dataId, secret }).valido === true);
  t('el manifest con/sin request-id difiere (por eso importa el fix)', v1con !== v1sin);
  t('NO cruzar: v1-sin no valida cuando SÍ hay request-id', MP.validarFirma({ xSignature: 'ts=' + ts + ',v1=' + v1sin, xRequestId: reqId, dataId, secret }).valido === false);
  t('firma con secret equivocado NO pasa', MP.validarFirma({ xSignature: 'ts=' + ts + ',v1=' + v1con, xRequestId: reqId, dataId, secret: 'otro' }).valido === false);
  t('firma con v1 alterado NO pasa', MP.validarFirma({ xSignature: 'ts=' + ts + ',v1=deadbeef' + v1con.slice(8), xRequestId: reqId, dataId, secret }).valido === false);
  t('firma sin ts/v1 → motivo sin-ts-o-v1', MP.validarFirma({ xSignature: 'nada', xRequestId: reqId, dataId, secret }).motivo === 'sin-ts-o-v1');
  t('firma sin secret → motivo sin-secret', MP.validarFirma({ xSignature: 'ts=1,v1=2', xRequestId: reqId, dataId, secret: '' }).motivo === 'sin-secret');
  t('diag SEGURO: hasRequestId + prefijos de HMAC (nunca el secret)', (() => { const r = MP.validarFirma({ xSignature: 'ts=' + ts + ',v1=' + v1con, xRequestId: reqId, dataId, secret }); return r.hasRequestId === true && r.calcPrefix.length === 8 && r.v1Prefix.length === 8; })());

  // --- buscarPagoAprobado (confirmador de retorno): la API es la verdad, por external_reference ---
  let capSearch = null;
  const searchFetch = (results) => async (url, opts) => { capSearch = { url, auth: opts.headers.Authorization }; return { ok: true, json: async () => ({ results }) }; };
  const bAppr = await MP.buscarPagoAprobado({ accessToken: 'TEST-abc', externalReference: 'uid_1', fetchImpl: searchFetch([{ id: 1, status: 'rejected' }, { id: 2, status: 'approved', transaction_amount: 40000, external_reference: 'uid_1' }]) });
  t('search: URL /v1/payments/search por external_reference + Bearer', /\/v1\/payments\/search\?/.test(capSearch.url) && /external_reference=uid_1/.test(capSearch.url) && capSearch.auth === 'Bearer TEST-abc');
  t('search: encuentra el approved entre varios', bAppr.encontrado === true && bAppr.status === 'approved' && bAppr.paymentId === '2' && bAppr.monto === 40000);
  t('search: sin approved → encontrado false + status del último', (await MP.buscarPagoAprobado({ accessToken: 'x', externalReference: 'u', fetchImpl: searchFetch([{ id: 9, status: 'rejected' }]) })).status === 'rejected');
  t('search: sin pagos → sin_pagos', (await MP.buscarPagoAprobado({ accessToken: 'x', externalReference: 'u', fetchImpl: searchFetch([]) })).status === 'sin_pagos');

  // --- consultarPago: la VERDAD sale de la API ---
  const pago = await MP.consultarPago({ accessToken: 'TEST-abc', paymentId: 'PAY123', fetchImpl: async (url, opts) => { t('consulta: GET /v1/payments/{id} con Bearer', /\/v1\/payments\/PAY123$/.test(url) && opts.headers.Authorization === 'Bearer TEST-abc'); return { ok: true, json: async () => ({ id: 'PAY123', status: 'approved', external_reference: 'uid_1', transaction_amount: 20000 }) }; } });
  t('consulta: mapea status/externalReference/monto', pago.status === 'approved' && pago.externalReference === 'uid_1' && pago.monto === 20000 && pago.paymentId === 'PAY123');

  // --- dataId de la notificación ---
  t('dataId: de query "data.id"', MP.dataIdDeNotificacion({ 'data.id': 'A1' }, {}) === 'A1');
  t('dataId: de body.data.id', MP.dataIdDeNotificacion({}, { data: { id: 'B2' } }) === 'B2');
  t('dataId: ausente → ""', MP.dataIdDeNotificacion({}, {}) === '');

  // --- promoción del lead (idempotencia + gate) ---
  t('promoción: pendiente_pago → promover', MP.promocionAfiliacion('pendiente_pago') === 'promover');
  t('promoción: afiliacion_en_proceso → idempotente (doble notificación no duplica)', MP.promocionAfiliacion('afiliacion_en_proceso') === 'idempotente');
  t('promoción: nuevo/otro → ignorar', MP.promocionAfiliacion('nuevo') === 'ignorar' && MP.promocionAfiliacion(undefined) === 'ignorar');

  console.log(`\n${fail ? '✗' : '✓'} smoke-mercadopago: ${ok} ok, ${fail} fallo(s)`);
  process.exit(fail ? 1 : 0);
})();
