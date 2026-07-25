'use strict';
/* Smoke — endurecimiento de checkoutAfiliacion (pre-pasarela real):
 *  1) resolverDomCheckout (puro): recompute-and-use + reject-null + mismatch flag (sin rechazo).
 *  2) wiring del CF: gate de estado (doble checkout), re-resolución del titular + integrantes que no comparten,
 *     persistencia del dato del SERVER, log de mismatch SIN PII, comparteDomicilio intacto.
 * node seed/smoke-checkout-endurecimiento.js */
const fs = require('fs'), path = require('path');
const R = (p) => path.resolve(__dirname, '..', p);
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

const { resolverDomCheckout } = require(R('functions/checkout-dom.js'));
const Core = require(R('functions/callejero-core.js'));
Core.cargarDesde(require(R('functions/calles-pergamino.json')));
const resolver = Core.resolver;
const run = (o) => resolverDomCheckout(o, resolver);

// 1) FLUJO LEGÍTIMO: cliente manda texto + calleId/altura correctos → dom con dato del server, sin mismatch
{
  const r = run({ texto: 'Bartolome Mitre 1234', calleId: 'bartolome-mitre', altura: 1234, pisoDepto: '2 B' });
  t('legítimo: dom con calleId/altura del server', r.dom && r.dom.calleId === 'bartolome-mitre' && r.dom.altura === 1234);
  t('legítimo: pisoDepto preservado, sin mismatch', r.dom.pisoDepto === '2 B' && r.mismatch === false);
}
// 2) SLUG INVENTADO: texto válido pero calleId inventado → RECOMPUTE corrige (persiste el del server), mismatch=true
{
  const r = run({ texto: 'Bartolome Mitre 1234', calleId: 'slug-inventado-por-el-cliente', altura: 1234 });
  t('slug inventado: corregido por recompute (persiste bartolome-mitre, NO el inventado)', r.dom && r.dom.calleId === 'bartolome-mitre');
  t('slug inventado: marca mismatch (para el log)', r.mismatch === true);
}
// 3) ALTURA INVENTADA: texto dice 1234 pero el cliente declara altura 99 → server toma 1234, mismatch=true
{
  const r = run({ texto: 'Bartolome Mitre 1234', calleId: 'bartolome-mitre', altura: 99 });
  t('altura declarada ≠ texto: server usa la del texto (1234), mismatch', r.dom.altura === 1234 && r.mismatch === true);
}
// 4) FUERA DEL CALLEJERO: rural / calle inexistente / texto vacío → dom null (RECHAZO), aunque el cliente mienta el calleId
{
  t('rural "Ruta 8 km 5" → dom null (rechazo)', run({ texto: 'Ruta 8 km 5', calleId: 'x', altura: 5 }).dom === null);
  t('inexistente + calleId falso → dom null (rechazo, no lo salva el calleId del cliente)', run({ texto: 'Calle Que No Existe 999', calleId: 'bartolome-mitre', altura: 999 }).dom === null);
  t('texto vacío → dom null', run({ texto: '', calleId: 'bartolome-mitre', altura: 100 }).dom === null);
}
// 5) alias: el cliente manda el nombre corto; el server canoniza
{
  const r = run({ texto: 'Mitre 500', calleId: 'mitre', altura: 500 });
  t('alias "Mitre" → server canoniza a bartolome-mitre', r.dom && r.dom.calleId === 'bartolome-mitre');
}

// 6) WIRING del CF (grep sobre functions/index.js)
const fn = fs.readFileSync(R('functions/index.js'), 'utf8');
t('gate de estado: rechaza si estado === afiliacion_en_proceso (doble checkout)', /estado === 'afiliacion_en_proceso'\) throw new HttpsError\('failed-precondition', 'Ya tenés una afiliación en proceso\.'\)/.test(fn));
t('titular re-resuelto server-side (resolverDomServer)', /const domTitular = resolverDomServer\(d\.domicilio, 'titular'\)/.test(fn));
t('integrante que NO comparte re-resuelto server-side', /const dm = resolverDomServer\(m\.domicilio, 'integrante'\)/.test(fn));
t('comparteDomicilio INTACTO (solo re-resuelve si no comparte)', /if \(!comparteDomicilio\) \{ const dm = resolverDomServer/.test(fn));
t('log de mismatch SIN PII (solo etiqueta, no texto/calle/altura)', /logger\.warn\('\[checkoutAfiliacion\] domicilio declarado ≠ recomputado[^']*', \{ etiqueta \}\)/.test(fn));
t('carga el JSON del callejero en el arranque de functions', /CallejeroCore\.cargarDesde\(require\('\.\/calles-pergamino\.json'\)\)/.test(fn));
t('resolverDomServer devuelve el dom del server (recompute-and-use)', /const \{ dom, mismatch \} = resolverDomCheckout\(o, CallejeroCore\.resolver\)/.test(fn));

// 7) callejero.js (browser) conserva cargarDesde + export CommonJS (para la paridad) sin romper el browser
const cj = fs.readFileSync(R('callejero.js'), 'utf8');
t('callejero.js: inyector cargarDesde aditivo', /function cargarDesde\(arr\)/.test(cj) && /cargarDesde: cargarDesde/.test(cj));
t('callejero.js: export CommonJS guardado (no afecta browser)', /if \(typeof module !== 'undefined' && module\.exports\) module\.exports = API/.test(cj) && /global\.Callejero = API/.test(cj));

console.log(`\n${fail ? '✗' : '✓'} smoke-checkout-endurecimiento: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
