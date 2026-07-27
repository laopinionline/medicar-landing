'use strict';
// Smoke — asistente-ruteo.js: el semáforo determinista. salud/rojo/urgencia → claude · admin/resto → ollama.
// Corre junto al escaneo real de banderas (para rojo/urgencia). node seed/smoke-asistente-ruteo.js
const { escanear } = require('../functions/banderas-rojas');
const { clasificar, ramas } = require('../functions/asistente-ruteo');
let ok = 0, fail = 0;
const cat = (txt) => clasificar(txt, escanear(txt)).categoria;
const rama0 = (txt) => ramas(cat(txt))[0]; // rama elegida (primaria)
const esClaude = (l, txt) => { const r = rama0(txt); const p = r === 'claude'; console.log(`${p ? '✓' : '✗ FALLO'} claude  ${l} [${cat(txt)}]${p ? '' : ' → dio ' + r}`); p ? ok++ : fail++; };
const esOllama = (l, txt) => { const r = rama0(txt); const p = r === 'ollama'; console.log(`${p ? '✓' : '✗ FALLO'} ollama  ${l} [${cat(txt)}]${p ? '' : ' → dio ' + r}`); p ? ok++ : fail++; };

console.log('\n— SALUD → claude —');
esClaude('dolor benigno', 'me duele un poco la espalda hace dos días');
esClaude('fiebre / medicación', '¿qué se toma para la fiebre?');
esClaude('testigo suegra 79', 'mi suegra de 79 tiene fiebre y mucho dolor de cabeza');
esClaude('testigo tobillo', 'me torcí el tobillo, ¿le pongo frío o calor?');
esClaude('testigo nena 6', 'mi nena de 6 tiene 38.2 y mocos, ¿qué le doy?');
esClaude('definición cuadro', '¿qué es una lumbalgia?');
esClaude('resfrío', 'tengo tos y mocos hace unos días');
esClaude('descompuesto', 'estoy descompuesto, con náuseas');
esClaude('piel', 'me salió un sarpullido en el brazo');
esClaude('interacción fármacos', 'tomo enalapril y quiero tomar ibuprofeno para un dolor');
esClaude('golpe', 'me pegué un golpe fuerte en la rodilla');
esClaude('presión info', 'quiero saber sobre la presión alta');

console.log('\n— ROJO / URGENCIA → claude —');
esClaude('rojo pecho', 'me duele el pecho fuerte y me falta el aire');
esClaude('rojo desmayo', 'me desmayé recién');
esClaude('urgencia declarada', 'necesito que hoy mismo lo vea un médico a mi nene');

console.log('\n— COMERCIAL (planes/precio/cuota/afiliación) → claude (sales-sensitive, no-venta al socio) —');
esClaude('cobertura plan', '¿qué cubre mi plan?');
esClaude('cambio de plan', 'quiero cambiar de plan, ¿me conviene?');
esClaude('pagar cuota', 'quiero pagar mi cuota de este mes');
esClaude('plan familiar cubre hijos', '¿el plan familiar cubre a mis hijos?');
esClaude('anotar en el plan', 'quiero anotar a mi hijo en el plan');
esClaude('precio de un plan', '¿cuánto sale el Plan Joven?');
esClaude('quiere afiliarse', 'quiero afiliarme a MEDICAR, ¿cómo hago?');

console.log('\n— RESTO (admin/agenda/pagos/fuera de tema) → ollama —');
esOllama('deuda (sin palabra comercial)', '¿cuánto debo y para cuándo vence?');
esOllama('turno (agenda)', '¿cómo pido un turno por videollamada?');
esOllama('TRAMPA "tengo una factura"', 'tengo una factura pendiente, ¿la puedo pagar?');
esOllama('comprobantes', '¿dónde veo mis comprobantes?');
esOllama('fuera de tema', 'contame un chiste');
esOllama('credencial (nº de afiliado ≠ comercial)', '¿dónde está mi número de afiliado?');

console.log('\n— MAPA/cascada parametrizables + PROSPECTO forzado a claude —');
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };
t('salud → cascada [claude, ollama]', JSON.stringify(ramas('salud')) === JSON.stringify(['claude', 'ollama']));
t('comercial → claude', ramas('comercial')[0] === 'claude');
t('resto → cascada [ollama, claude]', JSON.stringify(ramas('resto')) === JSON.stringify(['ollama', 'claude']));
t('cascada OFF → una sola rama', JSON.stringify(ramas('salud', { cascada: false })) === JSON.stringify(['claude']));
t('override mapa salud→ollama (DATA)', ramas('salud', { mapa: { salud: 'ollama' } })[0] === 'ollama');
t('override mapa comercial→ollama (rollback por DATA)', ramas('comercial', { mapa: { comercial: 'ollama' } })[0] === 'ollama');
t('PROSPECTO: resto → claude (forzado)', ramas('resto', undefined, true)[0] === 'claude');
t('PROSPECTO: salud → claude', ramas('salud', undefined, true)[0] === 'claude');
t('SOCIO: resto → ollama (sin forzar)', ramas('resto', undefined, false)[0] === 'ollama');

// ── tramo/chat-recall: RECUERDO de sesiones previas → claude (carve determinista) ──
const catH = (txt, hay) => clasificar(txt, escanear(txt), { hayHistoria: hay }).categoria;
const ramaH = (txt, hay) => ramas(catH(txt, hay))[0];
const claudeH = (l, txt, hay) => { const r = ramaH(txt, hay); const p = r === 'claude'; console.log(`${p ? '✓' : '✗ FALLO'} claude  ${l} [${catH(txt, hay)}]${p ? '' : ' → dio ' + r}`); p ? ok++ : fail++; };
const ollamaH = (l, txt, hay) => { const r = ramaH(txt, hay); const p = r === 'ollama'; console.log(`${p ? '✓' : '✗ FALLO'} ollama  ${l} [${catH(txt, hay)}]${p ? '' : ' → dio ' + r}`); p ? ok++ : fail++; };

console.log('\n— RECUERDO FUERTE (marcador de otra sesión) → claude, haya o no hilo —');
claudeH('de qué hablamos', '¿de qué hablamos la última vez?', false);
claudeH('de qué hablamos (con hilo abierto igual)', '¿de qué hablamos la última vez?', true);
claudeH('la otra vez', '¿te acordás de lo que te dije la otra vez?', false);
claudeH('conversación anterior', '¿podés recordarme la conversación anterior?', false);
claudeH('lo que veníamos hablando', 'seguimos con lo que veníamos hablando', false);
claudeH('hablamos ayer', 'lo que hablamos ayer, ¿lo tenés?', false);

console.log('\n— RECUERDO AMBIGUO ("te acordás" sin marcador): sesión fresca → claude · hilo vivo → ollama —');
claudeH('te acordás X (sesión fresca)', '¿te acordás lo de la humedad?', false);
ollamaH('te acordás X (hilo vivo → intra-hilo, ollama)', '¿te acordás lo de la humedad?', true);
ollamaH('te acordás X (hilo vivo, otra)', '¿te acordás lo del tobillo?', true);

console.log('\n— REGRESIÓN: casual sigue en ollama; salud/comercial intactos —');
esOllama('casual sin recuerdo', 'contame un chiste');
esOllama('turno (agenda)', '¿cómo pido un turno?');
esClaude('salud intacta', 'me duele la cabeza hace dos días');
esClaude('comercial intacto', '¿cuánto sale el Plan Joven?');
t('MAPA: recuerdo → claude', ramas('recuerdo')[0] === 'claude');
t('recuerdo → cascada [claude, ollama]', JSON.stringify(ramas('recuerdo')) === JSON.stringify(['claude', 'ollama']));
t('rollback DATA: recuerdo→ollama por override', ramas('recuerdo', { mapa: { recuerdo: 'ollama' } })[0] === 'ollama');
t('CF pasa hayHistoria a clasificar', /iaClasificar\(mensaje, scan, \{ hayHistoria: historia\.length > 0 \}\)/.test(require('fs').readFileSync(require('path').resolve(__dirname, '../functions/index.js'), 'utf8')));
t('CF loguea inyección de memoria ([ia:memoria])', /\[ia:memoria\] bloque inyectado/.test(require('fs').readFileSync(require('path').resolve(__dirname, '../functions/index.js'), 'utf8')));

console.log(`\n${fail ? '✗' : '✓'} smoke-asistente-ruteo: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
