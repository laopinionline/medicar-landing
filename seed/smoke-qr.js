'use strict';
/* Smoke — Paquete QR (FRENTE 3): credencial flip+QR local · escáner del médico (zxing local) ·
   CFs miQR/resolverQR/asignarmeAtencion/calificacionAlCerrar · calificación del socio · notas internas.
   node seed/smoke-qr.js */
const fs = require('fs'), path = require('path');
const R = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const socio = R('socio/index.html');
const app = R('app/index.html');
const fns = R('functions/index.js');
const sw = R('socio/sw.js');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// ── Vendorizado local (SIN CDN) ──
t('vendor qrcode-generator presente (socio, MIT)', fs.existsSync(path.resolve(__dirname, '../socio/vendor/qr/qrcode.js')));
t('vendor zxing reader.js presente (app)', fs.existsSync(path.resolve(__dirname, '../app/vendor/zxing/reader.js')));
t('vendor zxing wasm presente (app)', fs.existsSync(path.resolve(__dirname, '../app/vendor/zxing/zxing_reader.wasm')));
t('socio carga el qrcode.js local (no CDN)', /<script src="\.\/vendor\/qr\/qrcode\.js"><\/script>/.test(socio));
t('app carga el reader.js local (no CDN)', /<script src="\.\/vendor\/zxing\/reader\.js"><\/script>/.test(app));
t('app overridea locateFile del wasm al vendorizado (no jsdelivr)', /locateFile[\s\S]{0,80}\.\/vendor\/zxing\/zxing_reader\.wasm/.test(app));

// ── Credencial FLIP + QR en el socio ──
t('socio: credCardHTML devuelve el contenedor flip', /class="cred-flip"[\s\S]{0,120}onclick="credFlip\(/.test(socio));
t('socio: cara trasera con slot para el QR', /cred-qr-slot/.test(socio));
t('socio: credFlip togglea la clase sin re-render', /function credFlip[\s\S]{0,260}classList\.toggle\('flipped'\)/.test(socio));
t('socio: renderQRPara genera el SVG con qrcode(0,\'M\')', /function renderQRPara[\s\S]{0,520}qrcode\(0,'M'\)[\s\S]{0,80}createSvgTag/.test(socio));
t('socio: tokenQRde pide miQR una sola vez (cache en S.qr)', /function tokenQRde[\s\S]{0,160}fnsCall\('miQR'/.test(socio));
t('socio: CSS del flip (rotateY + backface-visibility)', /\.cred-flip\.flipped\s+\.cred-flip-inner\{transform:rotateY\(180deg\)\}/.test(socio) && /backface-visibility:hidden/.test(socio));

// ── Calificación del socio (post-cierre) ──
t('socio: carga calificaciones pendientes (where personaId + estado pendiente)', /collection\('calificaciones'\)\.where\('personaId','==',personaId\)/.test(socio) && /x\.estado==='pendiente'/.test(socio));
t('socio: card de calificación en el home', /calificacionCardHTML\(c\)/.test(socio) && /function calificacionCardHTML/.test(socio));
t('socio: doCalificar completa pendiente→calificada (merge)', /function doCalificar[\s\S]{0,420}estado:'calificada'[\s\S]{0,100}\{merge:true\}/.test(socio));
t('socio: doCalificar acota el comentario (slice 500)', /slice\(0,500\)/.test(socio));

// ── Escáner del médico (app) ──
t('app: botón "Escanear credencial" en el buscador', /onclick="dspEscanearQR\(\)"/.test(app));
t('app: dspEscanearQR abre cámara environment', /getUserMedia\(\{ video:\{ facingMode:'environment'/.test(app));
t('app: lee QR con zxing (formats QRCode)', /readBarcodesFromImageData[\s\S]{0,80}formats:\['QRCode'\]/.test(app));
t('app: el 1er match resuelve por resolverQR (staff-gated)', /function dspQRDecodificado[\s\S]{0,300}fnsCall\('resolverQR'/.test(app));
t('app: abre la ficha por el espejo pacientes/{personaId}', /pacientes'\)\.doc\(r\.personaId\)/.test(app));
t('app: dspScanStop apaga cámara y overlay', /function dspScanStop[\s\S]{0,200}getTracks\(\)\.forEach\(t=>[\s\S]{0,20}\.stop\(\)/.test(app));

// ── Asignarme la atención (app) ──
t('app: detecta episodio activo en la ficha', /activeEp=d\.hist\.find\(e=>\['despacho','en_camino','arribo','atencion'\]\.includes\(e\.estado\)\)/.test(app));
t('app: botón Asignarme sólo para médico', /btnAsignarme[\s\S]{0,120}dspAsignarme/.test(app) && /esMed \? \(yaMia/.test(app));
t('app: dspAsignarme llama la CF asignarmeAtencion', /function dspAsignarme[\s\S]{0,260}fnsCall\('asignarmeAtencion'/.test(app));
t('app: "Sin atención activa" cuando no hay episodio', /Sin atención activa/.test(app));

// ── Notas internas del staff (app) — el socio JAMÁS las ve ──
t('app: clinForm tiene la nota interna del socio', /Nota interna del socio/.test(app) && /clin-socnota/.test(app));
t('app: clinCerrar escribe notas_socio con medicoId==uid + visibleSocio:false', /collection\('notas_socio'\)\.add\(\{[\s\S]{0,200}medicoId: S\.user\.uid[\s\S]{0,160}visibleSocio: false/.test(app));
t('app: la ficha muestra promedio + notas internas (staff-only)', /function notasSocioHTML/.test(app) && /Notas internas del staff/.test(app));
t('app: carga notas_socio del paciente (where personaId)', /collection\('notas_socio'\)\.where\('personaId','==',pac\.id\)/.test(app));

// ── CFs de servidor ──
t('fns: miQR mintea token opaco (q_ + base64url) lazy', /_mintQR[\s\S]{0,140}q_'\s*\+\s*crypto\.randomBytes\(18\)\.toString\('base64url'\)/.test(fns));
t('fns: miQR mintea también los QR de dependientes activos', /exports\.miQR[\s\S]{0,600}titularPersonaId', '==', personaId[\s\S]{0,160}deps\.push/.test(fns));
t('fns: resolverQR staff-gated + log en accesos_qr', /exports\.resolverQR[\s\S]{0,600}Solo el staff[\s\S]{0,500}collection\('accesos_qr'\)\.add/.test(fns));
t('fns: asignarmeAtencion médico-only + estado activo + asignadoPorEscaneo', /exports\.asignarmeAtencion[\s\S]{0,600}Solo un médico[\s\S]{0,700}asignadoPorEscaneo: true/.test(fns));
t('fns: calificacionAlCerrar solo en la transición → cerrado', /exports\.calificacionAlCerrar[\s\S]{0,240}before\.estado === 'cerrado' \|\| after\.estado !== 'cerrado'/.test(fns));
t('fns: calificacionAlCerrar idempotente + solo socios', /exports\.calificacionAlCerrar[\s\S]{0,700}socios'\)\.where\('personaId'[\s\S]{0,200}exists\) return null; \/\/ idempotente/.test(fns));

// ── SW bump ──
t('socio SW bumpeado (≥ v46) + qrcode.js en el shell', /medicar-socio-v(4[6-9]|[5-9]\d)/.test(sw) && /\.\/vendor\/qr\/qrcode\.js/.test(sw));

console.log(`\n${fail ? '✗' : '✓'} smoke-qr: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
