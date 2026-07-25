'use strict';
/* Smoke — wiring de Mercado Pago en el puente (CF + webhook + socio + panel). node seed/smoke-mp-wiring.js */
const fs = require('fs'), path = require('path');
const R = (p) => path.resolve(__dirname, '..', p);
const fn = fs.readFileSync(R('functions/index.js'), 'utf8');
const socio = fs.readFileSync(R('socio/index.html'), 'utf8');
const app = fs.readFileSync(R('app/index.html'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// ---- secrets + módulo ----
t('secrets: MP_ACCESS_TOKEN + MP_WEBHOOK_SECRET por defineSecret', /defineSecret\('MP_ACCESS_TOKEN'\)/.test(fn) && /defineSecret\('MP_WEBHOOK_SECRET'\)/.test(fn));
t('require del módulo MP', /const MP = require\('\.\/mercadopago'\)/.test(fn));

// ---- checkoutAfiliacion: rama por modo ----
t('checkoutAfiliacion: bind del secret MP_ACCESS_TOKEN', /exports\.checkoutAfiliacion = onCall\(\{ secrets: \[MP_ACCESS_TOKEN\] \}/.test(fn));
t('MP: crea preference con AMOUNT del server (monto: total)', /MP\.crearPreferencia\(\{[\s\S]{0,200}monto: total/.test(fn));
t('MP: external_reference = uid del prospecto', /externalReference: request\.auth\.uid/.test(fn));
t('MP: expiración 48 h', /48 \* 3600 \* 1000/.test(fn));
t('MP: el lead queda pendiente_pago (no afiliacion_en_proceso) hasta el webhook', /estado: 'pendiente_pago'[\s\S]{0,120}pagoAfiliacion/.test(fn));
t('MP: falla de preference → HttpsError, NO persiste in-process', /MP preference falló[\s\S]{0,120}throw new HttpsError/.test(fn));
t('SIMULADO INTACTO: rama simulado sigue marcando afiliacion_en_proceso + pago simulado', /estado: 'afiliacion_en_proceso', pago: \{ modo: 'simulado', estado: 'aprobado' \}/.test(fn));
t('gate de estado sigue: no re-checkout si ya afiliacion_en_proceso', /estado === 'afiliacion_en_proceso'\) throw new HttpsError\('failed-precondition', 'Ya tenés una afiliación en proceso\.'\)/.test(fn));

// ---- webhook ----
t('webhookAfiliacionMP: onRequest con ambos secrets', /exports\.webhookAfiliacionMP = onRequest\(\{ secrets: \[MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET\] \}/.test(fn));
t('webhook: valida FIRMA (nunca confía en el body)', /MP\.validarFirma\(\{ xSignature: req\.get\('x-signature'\)/.test(fn));
t('webhook: firma inválida → 401', /firma inválida[\s\S]{0,80}status\(401\)/.test(fn));
t('webhook: CONSULTA la API por el estado real', /MP\.consultarPago\(\{ accessToken: MP_ACCESS_TOKEN\.value\(\), paymentId: dataId \}\)/.test(fn));
t('webhook: solo APPROVED promueve (rejected/pending no)', /pago\.status === 'approved' && pago\.externalReference\) \{[\s\S]{0,120}confirmarAfiliacionPago/.test(fn));
t('webhook: 200 SIEMPRE (idempotencia cubre el reintento)', (fn.match(/res\.status\(200\)\.send\('ok'\)/g) || []).length >= 2);

// ---- confirmación idempotente ----
t('confirmarAfiliacionPago: usa promocionAfiliacion (idempotencia+gate)', /const accion = MP\.promocionAfiliacion\(lead\.estado\)/.test(fn));
t('confirmación: idempotente → yaEstaba; ignorar → motivo; promover → set afiliacion_en_proceso', /accion === 'idempotente'\) return \{ ok: true, yaEstaba: true \}/.test(fn) && /accion === 'ignorar'\)/.test(fn) && /estado: 'afiliacion_en_proceso'[\s\S]{0,160}mpPaymentId/.test(fn));

// ---- socio ----
t('socio: puentePagar redirige a initPoint si modo mercadopago', /r\.modo==='mercadopago' && r\.initPoint\)\{ window\.location\.href=r\.initPoint; return; \}/.test(socio));
t('socio: paso de pago adapta banner por modo (Mercado Pago vs SIMULACIÓN)', /Pago seguro con <b>Mercado Pago/.test(socio) && /SIMULACIÓN — no se realiza ningún cobro real/.test(socio));
t('socio: lee el modo (config) para adaptar', /function puenteCargarModo\(\)/.test(socio) && /collection\('configuracion'\)\.doc\('pasarela'\)/.test(socio));
t('socio: estado pendiente_pago en la home + reintento', /est==='pendiente_pago'\)\{/.test(socio) && /Tu pago quedó pendiente/.test(socio) && /Reintentar el pago/.test(socio));
t('socio: SW bumpeado a v38', /medicar-socio-v38/.test(fs.readFileSync(R('socio/sw.js'), 'utf8')));

// ---- panel ----
t('panel: badge de estado pendiente_pago', /pendiente_pago:\['Pago pendiente'/.test(app) && /pendiente_pago:1/.test(app));
t('panel: Activar sigue gated a afiliacion_en_proceso (pendiente_pago NO activable)', /activar=\(p\.estado==='afiliacion_en_proceso'\)/.test(app));

console.log(`\n${fail ? '✗' : '✓'} smoke-mp-wiring: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
