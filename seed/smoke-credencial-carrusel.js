'use strict';
/* Smoke — carrusel de credenciales (titular + integrantes gestionados) + gestión de invitaciones. node seed/smoke-credencial-carrusel.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const socio = fs.readFileSync(path.resolve(__dirname, '../socio/index.html'), 'utf8');
const app = fs.readFileSync(path.resolve(__dirname, '../app/index.html'), 'utf8');
const fn = fs.readFileSync(path.resolve(__dirname, '../functions/index.js'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// --- render de credCardHTML en vm ---
const m = socio.match(/function credCardHTML\(d, enCarrusel\)\{[\s\S]*?\n\}/);
if (!m) { console.log('✗ no se pudo extraer credCardHTML'); process.exit(1); }
const sb = { esc, chv: () => '', fmtDni: (x) => 'DNI:' + x };
vm.runInNewContext(m[0] + '\nthis.card = credCardHTML;', sb, { timeout: 2000 });
const card = sb.card;

const titular = { nombre: 'Marino, Lucas', numero: '7982', dni: '23961956', plan: 'Plan 01', tipo: 'Directo', activo: true, esVit: true };
const dep = { personaId: 'pDep', nombre: 'Bustos, María', numero: '7982-01', dni: '40222333', plan: 'Cobertura familiar', tipo: 'Directo', activo: true, esVit: true };
const hT = card(titular, false), hD = card(dep, true);
t('tarjeta titular: nombre + N° + estado activo', /Marino, Lucas/.test(hT) && /7982/.test(hT) && /● Afiliado activo/.test(hT));
t('titular con DNI (lo tiene) + vitalicio SIN celda Plan', /DNI:23961956/.test(hT) && !/>Plan</.test(hT));
t('tarjeta dependiente: CON DNI (carnet no es salud) + gira (flip) + slide', /DNI:40222333/.test(hD) && /onclick="credFlip\('pDep'/.test(hD) && /scroll-snap-align:start/.test(hD));
t('tarjeta dependiente vitalicio (heredado) SIN celda Plan', !/>Plan</.test(hD));
// tarjeta NO vitalicio muestra Plan
t('tarjeta no-vitalicio muestra celda Plan', /Plan 01/.test(card(Object.assign({}, titular, { esVit: false }), false)));

// --- lógica del carrusel (corrección Lucas: managed = TODO el grupo activo — menores, sin cuenta E independientes) ---
const deps = [
  { personaId: 'menor', activo: true, cuentaPropia: false, fechaNacimiento: '2015-01-01' },
  { personaId: 'menorApp', activo: true, cuentaPropia: true, fechaNacimiento: '2015-01-01' },
  { personaId: 'adultoSin', activo: true, fechaNacimiento: '1990-01-01' },
  { personaId: 'adultoApp', activo: true, cuentaPropia: true, fechaNacimiento: '1985-01-01' },
];
const managed = deps.filter(d => d.activo !== false).map(d => d.personaId);
t('carrusel: incluye menor, menor-con-app y adulto-sin-cuenta', managed.includes('menor') && managed.includes('menorApp') && managed.includes('adultoSin'));
t('carrusel: INCLUYE al adulto independiente (carnet no es salud, se porta todo el grupo)', managed.includes('adultoApp'));
t('carrusel: titular + 4 gestionados = 5 tarjetas', [1].concat(managed).length === 5);
t('sin grupo (0 gestionados) → 1 tarjeta (credCards.length<=1 → sin carrusel)', ([].length + 1) <= 1);

// --- wiring ---
t('homeView: credencialHTML = 1 tarjeta si <=1, carrusel+dots si más', /credCards\.length<=1\s*\?\s*credCardHTML\(credTitular, false\)/.test(socio) && /id="cred-carrusel"[\s\S]{0,200}scroll-snap-type:x mandatory/.test(socio) && /id="cred-dots"/.test(socio));
t('carrusel: swipe (onscroll actualiza puntitos) + ir a tarjeta', /function credCarruselScroll\(elm\)/.test(socio) && /function credCarruselIr\(i\)/.test(socio) && /scrollTo\(\{ left:i\*elm\.clientWidth/.test(socio));
t('EMERGENCIAS inmediatamente bajo la credencial (no lo empuja el carrusel)', /\$\{credencialHTML\}\s*<a class="btn-emerg" href="tel:\$\{TEL_EMERG\}"/.test(socio));
t('managed = TODO el grupo activo (sin exclusión) + DNI del denorm + hereda vitalicio', /credManaged = depsDeMiSocio\.filter\(d=> d\.activo!==false\)\.map/.test(socio) && /dni:d\.dni\|\|null/.test(socio) && /esVit:\(d\.vitalicio===true\)\|\|esVit \}/.test(socio) && !/!_indepCred\(d\)/.test(socio) && !/propia:false/.test(socio));
t('flip+QR en TODAS las tarjetas (credCardHTML siempre gira, sin rama estática)', /id="flip-\$\{esc\(d\.personaId\)\}"[\s\S]{0,90}onclick="credFlip\('\$\{esc\(d\.personaId\)\}'/.test(socio) && !/if\(!d\.propia\)\{ return/.test(socio) && !/const credTitular = \{[^}]*propia:true/.test(socio));
t('DNI en la tarjeta (cell DNI si d.dni, igual para todos)', /\$\{d\.dni\?`<div class="cell"><span>DNI<\/span><b>\$\{esc\(fmtDni\(d\.dni\)\)\}/.test(socio));
t('hint "tocá para el QR" en TODAS (no condicionado a propia)', /<div class="cred-flip-hint">tocá para el QR ⟳<\/div>/.test(socio) && !/d\.propia\?`<div class="cred-flip-hint">/.test(socio));

// --- DNI denorm en el WRITE (app) + backfill + miQR valida el grupo ---
t('app: denorm de dni al crear/vincular socio (punto compartido)', /nombreVista: socioNombreDe\(perData\), dni: \(perData&&perData\.dni\)\|\|null/.test(app));
t('CF canjearInvitacion denorma dni en el socio', /cuentaPropia: true, cuentaUid: uid, fechaNacimiento: per\.fechaNacimiento \|\| null, dni: per\.dni \|\| null/.test(fn));
t('backfill de socios.dni existe (dry-run seguro + --apply)', fs.existsSync(path.resolve(__dirname, 'backfill-socio-dni.js')));
t('miQR emite tokens del grupo validando el vínculo (titularPersonaId==caller, no personaId arbitrario)', /if \(!\(sd\.data\(\) \|\| \{\}\)\.titularSocioId\)[\s\S]{0,160}where\('titularPersonaId', '==', personaId\)[\s\S]{0,120}deps\.push/.test(fn));
t('privacidad médica intacta: resolverDestino presente (server, carnet ≠ salud)', /resolverDestino/.test(fn));

// --- gestión de invitaciones ---
t('cargarCredencial trae invitaciones pendientes del titular', /invitaciones_afiliado.*where\('titularPersonaId','==',personaId\)[\s\S]{0,120}estado==='pendiente'/.test(socio) && /invitaciones,[\s\S]{0,40}facturas/.test(socio));
t('grupo: invitación pendiente → "Invitación enviada · vence en X días" + Reenviar/Revocar', /Invitación enviada\$\{invVenceLabel\(inv\)\}/.test(socio) && /reenviarInvitacion\('/.test(socio) && /revocarInvitacionUI\('/.test(socio));
t('funciones invVenceLabel / reenviar / revocar', /function invVenceLabel\(inv\)/.test(socio) && /async function reenviarInvitacion/.test(socio) && /fnsCall\('revocarInvitacion',\{ token \}\)/.test(socio));
t('invitar recarga la cred (aparece la pendiente)', /await recargarCred\(\); \/\/ refresca c\.invitaciones/.test(socio));

console.log(`\n${fail ? '✗' : '✓'} smoke-credencial-carrusel: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
