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

// ════════════════════ ENGANCHE QR — el médico entra al escáner (tramo/qr-medico-enganche) ════════════════════
// 1 · Entrada en la superficie del médico (mHome): botón prominente, un tap, reusa dspEscanearQR.
t('ENG · botón "Escanear credencial" en el Inicio del médico (aria-label propio)', /aria-label="Escanear credencial del socio"[\s\S]{0,300}onclick="dspEscanearQR\(\)"|onclick="dspEscanearQR\(\)"[\s\S]{0,300}aria-label="Escanear credencial del socio"/.test(app));
t('ENG · el botón vive DENTRO de mHome (Inicio del médico), arriba', /function mHome\(\)\{[\s\S]{0,4000}aria-label="Escanear credencial del socio"/.test(app));
t('ENG · escáner REUSADO sin fork: una sola definición de dspEscanearQR', (app.match(/function dspEscanearQR\(/g)||[]).length===1);
t('ENG · dos puntos de entrada al MISMO escáner (despacho + médico)', (app.match(/onclick="dspEscanearQR\(\)"/g)||[]).length===2);

// 2 · Destino del escaneo: el router del médico renderiza la ficha del escaneo (misma vista que el despachante).
t('ENG · router médico: t==home && dsp.stage!=buscar → dDesp() (ficha del escaneo)', /r==='medico'\)\{if\(t==='home' && S\.dsp && S\.dsp\.stage && S\.dsp\.stage!=='buscar'\)return dDesp\(\)/.test(app));
t('ENG · NO se tocó asignarmeAtencion (la ficha sigue ofreciéndolo por episodio activo)', /function dspAsignarme[\s\S]{0,260}fnsCall\('asignarmeAtencion'/.test(app) && /esMed \? \(yaMia/.test(app));

// 3+4 · Nav: el "atrás" cierra la ficha del escaneo también para el médico (aditivo, despachante intacto).
t('ENG · navDesc captura el stage también para el médico', /\(S\.tab==='despacho' \|\| S\.user\.rol==='medico'\) && S\.dsp && S\.dsp\.stage\)\{ d\.stage=S\.dsp\.stage;/.test(app));
t('ENG · navRestore resetea la ficha del escaneo en el back (médico)', /\(S\.tab==='despacho' \|\| S\.user\.rol==='medico'\) && S\.dsp && S\.dsp\.stage && S\.dsp\.stage!=='buscar'[\s\S]{0,80}dspReset\(\)/.test(app));

// Fricción de cámara (celular real): mensajes claros + reintentar + cancelar (nada de error mudo/spinner eterno).
t('ENG · cámara denegada → mensaje de permiso + Reintentar (dspScanErr)', /catch\(e\)\{ dspScanErr\('Necesitás permitir el acceso a la cámara[\s\S]{0,120}'\); return; \}/.test(app) && /function dspScanErr[\s\S]{0,120}dspScanRetryShow\(true\)/.test(app));
t('ENG · fallo de red al resolver → "Sin conexión — …reintentá" (distinto de "QR no reconocido")', /navigator\.onLine===false\)\|\|\(e&&\['unavailable','deadline-exceeded','internal'\]\.includes\(e\.code\)\)[\s\S]{0,80}Sin conexión[\s\S]{0,80}QR no reconocido/.test(app));
t('ENG · overlay con botón Reintentar (oculto) + Cancelar', /id="qr-scan-retry" onclick="dspScanReintentar\(\)"[\s\S]{0,200}display:none/.test(app) && /onclick="dspScanStop\(\)"[\s\S]{0,250}Cancelar/.test(app));
t('ENG · dspScanReintentar reabre cámara (reusa dspEscanearQR)', /function dspScanReintentar\(\)\{ dspScanRetryShow\(false\); dspEscanearQR\(\); \}/.test(app));

// 5 · Regresión: despacho intacto (su escáner sigue en dDespBuscar + su router).
t('REG · despacho: el botón del escáner sigue en dDespBuscar (buscador del despachante)', /function dDespBuscar[\s\S]{0,1100}onclick="dspEscanearQR\(\)"/.test(app));
t('REG · router despachante intacto (t==despacho → dDesp)', /r==='despachante'\)\{if\(t==='despacho'\)return dDesp\(\)/.test(app));

// ════════════════════ GATE DE PUERTA — app/ es el SISTEMA (staff), no la app del socio ════════════════════
// afiliado PURO (sin rol staff) → NO entra: rebote con mensaje + link al PWA (antes: redirect silencioso).
t('GATE · afiliado puro → S.reboteStaff=true + signOut (NO redirect silencioso)', /const roles=rolesRaw\.filter\(r=>r!=='afiliado'\);\s*if\(!roles\.length\)\{[\s\S]{0,220}S\.reboteStaff=true;[\s\S]{0,220}await auth\.signOut\(\)/.test(app));
t('GATE · el redirect silencioso window.location.replace(../socio/) YA NO está en la rama afiliado-puro', !/if\(!roles\.length\)\{[\s\S]{0,200}window\.location\.replace\('\.\.\/socio\/'\)/.test(app));
t('GATE · solo queda 1 replace(../socio/) (la defensa muerta de entrarConRol, no la puerta)', (app.match(/window\.location\.replace\('\.\.\/socio\/'\)/g)||[]).length===1);

// render dispatch: el rebote se muestra ANTES que login (aunque S.user quedó null tras el signOut).
t('GATE · render dispatch: S.reboteStaff → reboteStaffView() antes que login', /S\.reboteStaff\?reboteStaffView\(\):\(S\.user\?/.test(app));
t('GATE · resetSession PRESERVA el rebote a través del signOut', /const reb=keepErr\?S\.reboteStaff:false;/.test(app) && /if\(reb\) S\.reboteStaff=reb;/.test(app));

// El mensaje + link (doctrina de Lucas).
t('GATE · reboteStaffView: "Este es el acceso del sistema" + "Los socios usan la app de MEDICAR"', /function reboteStaffView\(\)\{[\s\S]{0,900}Este es el acceso del sistema[\s\S]{0,200}Los socios usan la app de MEDICAR/.test(app));
t('GATE · reboteStaffView: link/botón al PWA de socios (../socio/)', /function reboteStaffView[\s\S]{0,900}href="\.\.\/socio\/" class="btn-r"[\s\S]{0,120}Ir a la app de MEDICAR/.test(app));
t('GATE · salirRebote limpia el flag y vuelve al login', /function salirRebote\(\)\{ S\.reboteStaff=false; render\(\); \}/.test(app));

// Doble sombrero + regresión del no-rol/prospecto (SIN cambios).
t('GATE · doble sombrero: filtra afiliado y conserva los roles staff → entra como staff', /const roles=rolesRaw\.filter\(r=>r!=='afiliado'\)/.test(app));
t('REG · no-rol/prospecto: sigue con el mensaje genérico + signOut (sin cambios)', /if\(!rolesRaw\.length\)\{\s*S\.loginErr='Tu cuenta no tiene rol asignado\. Contactá al administrador\.';\s*await auth\.signOut\(\)/.test(app));

// ── SW bump ──
t('socio SW bumpeado (≥ v46) + qrcode.js en el shell', /medicar-socio-v(4[6-9]|[5-9]\d)/.test(sw) && /\.\/vendor\/qr\/qrcode\.js/.test(sw));

console.log(`\n${fail ? '✗' : '✓'} smoke-qr: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
