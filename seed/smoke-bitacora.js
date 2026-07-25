'use strict';
/* Smoke — TRAMO 2 bitácora operativa (front + wiring). Reglas ya cubiertas por rules-tests/bitacora.test.js (25/25).
 * Acá: render de bitPanel/bitCard/modal en vm, forma del doc de create (matchea la regla), y wiring (cap/tab/route/
 * super-sec/detach/modal/botón en las 3 superficies + badge cuenta). node seed/smoke-bitacora.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.resolve(__dirname, '../app/index.html'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

// --- extraer el bloque BITÁCORA (desde BIT_ROL_LBL hasta antes de la sección NOVEDADES) y ejecutarlo en vm ---
const ini = app.indexOf('const BIT_ROL_LBL=');
const fin = app.indexOf('/* ===================== NOVEDADES');
if (ini < 0 || fin < 0 || fin < ini) { console.log('✗ no se pudo delimitar el bloque BITÁCORA'); process.exit(1); }
const bloque = app.slice(ini, fin);
const sb = {
  esc, S: { user: { uid: 'u1', rol: 'admin', nombre: 'Ana' }, bitPendCount: 0 },
  puede: (c) => c === 'gestionar_bitacora', tms: (x) => (x && x.ms) || 0, render(){}, navPush(){},
  db: { collection(){ return { where(){ return { onSnapshot(){ return () => {}; } }; }, onSnapshot(){ return () => {}; }, add(){ return Promise.resolve(); }, doc(){ return { set(){ return Promise.resolve(); } }; } }; } },
  FV: () => ({ __srv: true }),
};
vm.createContext(sb);
vm.runInContext(bloque, sb);

// 1) bitPanel — gate + estados
sb.S.bit = null;
const pAdmin = sb.bitPanel();
t('bitPanel (admin): loading inicial + filtros', /Bitácora operativa/.test(pAdmin) && /Pendientes/.test(pAdmin) && /Cargando…/.test(pAdmin));
sb.S.user.rol = 'chofer'; sb.puede = () => false; sb.S.bit = null;
t('bitPanel: NO-admin ve "Solo para administradores"', /Solo para administradores/.test(sb.bitPanel()));
sb.S.user.rol = 'admin'; sb.puede = (c) => c === 'gestionar_bitacora';

// 2) bitCard — pendiente (con botón resolver) vs resuelta
const cardP = sb.bitCard({ id: 'n1', rol: 'chofer', reportadoPorNombre: 'Juan', texto: 'Apellido mal', estado: 'pendiente', creadoEn: { ms: 1 }, refTipo: 'afiliado', refId: '20015' });
t('bitCard pendiente: rol + autor + texto + chip afiliado + botón Marcar resuelta', /Chofer · Juan/.test(cardP) && /Apellido mal/.test(cardP) && /Afiliado 20015/.test(cardP) && /Marcar resuelta/.test(cardP) && /bitResolver\('n1'\)/.test(cardP));
const cardR = sb.bitCard({ id: 'n2', rol: 'medico', texto: 'listo', estado: 'resuelta', creadoEn: { ms: 1 }, resueltoEn: { ms: 2 } });
t('bitCard resuelta: "Resuelta ✓" y SIN botón resolver', /Resuelta ✓/.test(cardR) && !/Marcar resuelta/.test(cardR));

// 3) bitPanel con items + filtro pendiente esconde las resueltas
sb.S.bit = { items: [ { id: 'a', rol: 'chofer', texto: 'PEND-uno', estado: 'pendiente', creadoEn: { ms: 2 } }, { id: 'b', rol: 'medico', texto: 'RES-dos', estado: 'resuelta', creadoEn: { ms: 1 } } ], filtro: 'pendiente', err: '' };
const pl = sb.bitPanel();
t('bitPanel filtro=pendiente: muestra la pendiente, oculta la resuelta', /PEND-uno/.test(pl) && !/RES-dos/.test(pl) && /id="bit-pend-list"/.test(pl));
sb.S.bit.filtro = 'resuelta';
t('bitPanel filtro=resuelta: muestra la resuelta, oculta la pendiente', /RES-dos/.test(sb.bitPanel()) && !/PEND-uno/.test(sb.bitPanel()));

// 4) modal de reporte — form + estado enviado
sb.S.bitReport = { refTipo: 'despacho', refId: 'ep9', busy: false, sent: false, err: '' };
const modal = sb.bitReportModalHTML();
t('modal: textarea + select refTipo (despacho preseleccionado) + refId + Enviar', /id="bit-texto"/.test(modal) && /id="bit-reftipo"/.test(modal) && /value="despacho" selected/.test(modal) && /value="ep9"/.test(modal) && /bitReportEnviar\(\)/.test(modal));
sb.S.bitReport = { sent: true };
t('modal: estado "Novedad enviada" tras enviar', /Novedad enviada/.test(sb.bitReportModalHTML()));
sb.S.bitReport = null;
t('modal: oculto sin S.bitReport', sb.bitReportModalHTML() === '');

// 5) botón reportar (helper)
t('bitReportBtn: abre el modal con refTipo/refId', /bitReportAbrir\('despacho','ep9'\)/.test(sb.bitReportBtn('despacho', 'ep9')) && /Reportar una novedad/.test(sb.bitReportBtn('', '')));

// 6) forma del doc de create (matchea la regla): reportadoPorUid==uid, 'pendiente', SIN campos de resolución, refTipo acotado
const src = bloque;
t('create: reportadoPorUid = S.user.uid', /reportadoPorUid:S\.user\.uid/.test(src));
t("create: nace 'pendiente'", /estado:'pendiente'/.test(src));
t('create: NO incluye resueltoPorUid/resueltoEn', !/resueltoPorUid:.*add|resueltoEn:FV\(\)[\s\S]{0,40}add/.test(src) && /reportadoPorUid[\s\S]{0,200}creadoEn:FV\(\)/.test(src));
t("create: refTipo solo si 'afiliado'||'despacho' (regla lo exige acotado o ausente)", /refTipo==='afiliado'\|\|refTipo==='despacho'/.test(src));
t('resolver: set estado resuelta + resueltoPorUid==uid + resueltoEn', /estado:'resuelta', resueltoPorUid:S\.user\.uid, resueltoEn:FV\(\)/.test(src));
t('badge: cuenta where estado==pendiente → S.bitPendCount', /where\('estado','==','pendiente'\)/.test(src) && /S\.bitPendCount=s\.size/.test(src));

// 7) WIRING en app/index.html (fuera del bloque)
t("wiring: cap 'gestionar_bitacora' en CAPS", /\['gestionar_bitacora','Bitácora \(novedades operativas\)'\]/.test(app));
t('wiring: tab cap-driven con badge en getTabs', /const puedeBit = puede\('gestionar_bitacora'\); if\(puedeBit\) bitBadgeAttach\(\)/.test(app) && /bitTab = puedeBit/.test(app) && /\.\.\.bitTab/.test(app));
t('wiring: capRoute bitacora→bitPanel', /bitacora:bitPanel/.test(app));
t('wiring: SUPER_SECS + superView + superNav detach', /\['bitacora','Bitácora',true\]/.test(app) && /sec==='bitacora'\) body=bitPanel\(\)/.test(app) && /superSec==='bitacora'\)\{ bitDetach\(\); S\.bit=null; \}/.test(app));
t('wiring: detach map bitacora', /bitacora:\s*\(\)=>\{ bitDetach\(\);\s*S\.bit=null;/.test(app));
t('wiring: modal en el shell', /\$\{bitReportModalHTML\(\)\}/.test(app));
t('wiring: botón en las 3 superficies (choferHome/mHome/bandeja)', (app.match(/bitReportBtn\(/g) || []).length >= 4); // 3 superficies + helper def

console.log(`\n${fail ? '✗' : '✓'} smoke-bitacora: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
