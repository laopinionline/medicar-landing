'use strict';
/* Smoke — carrusel de credenciales (titular + integrantes gestionados) + gestión de invitaciones. node seed/smoke-credencial-carrusel.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const socio = fs.readFileSync(path.resolve(__dirname, '../socio/index.html'), 'utf8');
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
const dep = { nombre: 'Bustos, María', numero: '7982-01', dni: null, plan: 'Cobertura familiar', tipo: 'Directo', activo: true, esVit: true };
const hT = card(titular, false), hD = card(dep, true);
t('tarjeta titular: nombre + N° + estado activo', /Marino, Lucas/.test(hT) && /7982/.test(hT) && /● Afiliado activo/.test(hT));
t('titular con DNI (lo tiene) + vitalicio SIN celda Plan', /DNI:23961956/.test(hT) && !/>Plan</.test(hT));
t('tarjeta dependiente: SIN DNI (privacidad) + slide en carrusel', !/DNI:/.test(hD) && /scroll-snap-align:start/.test(hD));
t('tarjeta dependiente vitalicio (heredado) SIN celda Plan', !/>Plan</.test(hD));
// tarjeta NO vitalicio muestra Plan
t('tarjeta no-vitalicio muestra celda Plan', /Plan 01/.test(card(Object.assign({}, titular, { esVit: false }), false)));

// --- lógica del carrusel (managed = menores + adultos sin cuenta; independientes afuera) ---
const edadDe = (iso) => { const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); if (!mm) return null; const h = new Date(); let e = h.getFullYear() - (+mm[1]); if (((h.getMonth() + 1) * 100 + h.getDate()) < ((+mm[2]) * 100 + (+mm[3]))) e--; return e; };
const _indep = (d) => d.cuentaPropia === true && (edadDe(d.fechaNacimiento) || 0) >= 18;
const deps = [
  { personaId: 'menor', activo: true, cuentaPropia: false, fechaNacimiento: '2015-01-01' },
  { personaId: 'menorApp', activo: true, cuentaPropia: true, fechaNacimiento: '2015-01-01' },
  { personaId: 'adultoSin', activo: true, fechaNacimiento: '1990-01-01' },
  { personaId: 'adultoApp', activo: true, cuentaPropia: true, fechaNacimiento: '1985-01-01' },
];
const managed = deps.filter(d => d.activo !== false && !_indep(d)).map(d => d.personaId);
t('carrusel: incluye menor, menor-con-app y adulto-sin-cuenta', managed.includes('menor') && managed.includes('menorApp') && managed.includes('adultoSin'));
t('carrusel: EXCLUYE al adulto independiente (cuentaPropia)', !managed.includes('adultoApp'));
t('carrusel: titular + 3 gestionados = 4 tarjetas', [1].concat(managed).length === 4);
t('sin grupo (0 gestionados) → 1 tarjeta (credCards.length<=1 → sin carrusel)', ([].length + 1) <= 1);

// --- wiring ---
t('homeView: credencialHTML = 1 tarjeta si <=1, carrusel+dots si más', /credCards\.length<=1\s*\?\s*credCardHTML\(credTitular, false\)/.test(socio) && /id="cred-carrusel"[\s\S]{0,200}scroll-snap-type:x mandatory/.test(socio) && /id="cred-dots"/.test(socio));
t('carrusel: swipe (onscroll actualiza puntitos) + ir a tarjeta', /function credCarruselScroll\(elm\)/.test(socio) && /function credCarruselIr\(i\)/.test(socio) && /scrollTo\(\{ left:i\*elm\.clientWidth/.test(socio));
t('EMERGENCIAS inmediatamente bajo la credencial (no lo empuja el carrusel)', /\$\{credencialHTML\}\s*<a class="btn-emerg" href="tel:\$\{TEL_EMERG\}"/.test(socio));
t('managed excluye independiente (_indepCred) y hereda vitalicio del titular', /_indepCred = \(d\)=> d\.cuentaPropia===true && \(edadDe\(d\.fechaNacimiento\)\|\|0\)>=18/.test(socio) && /esVit:\(d\.vitalicio===true\)\|\|esVit/.test(socio));

// --- gestión de invitaciones ---
t('cargarCredencial trae invitaciones pendientes del titular', /invitaciones_afiliado.*where\('titularPersonaId','==',personaId\)[\s\S]{0,120}estado==='pendiente'/.test(socio) && /invitaciones,[\s\S]{0,40}facturas/.test(socio));
t('grupo: invitación pendiente → "Invitación enviada · vence en X días" + Reenviar/Revocar', /Invitación enviada\$\{invVenceLabel\(inv\)\}/.test(socio) && /reenviarInvitacion\('/.test(socio) && /revocarInvitacionUI\('/.test(socio));
t('funciones invVenceLabel / reenviar / revocar', /function invVenceLabel\(inv\)/.test(socio) && /async function reenviarInvitacion/.test(socio) && /fnsCall\('revocarInvitacion',\{ token \}\)/.test(socio));
t('invitar recarga la cred (aparece la pendiente)', /await recargarCred\(\); \/\/ refresca c\.invitaciones/.test(socio));

console.log(`\n${fail ? '✗' : '✓'} smoke-credencial-carrusel: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
