'use strict';
/* Smoke — "Mi grupo familiar" + Invitar renderiza para TODO titular con dependientes (incluido VITALICIO, que no tiene
 * esResponsablePago). Gate robusto: c.dependientes (por titularPersonaId) sin re-filtro frágil. node seed/smoke-grupo-familiar-render.js */
const fs = require('fs'), path = require('path');
const socio = fs.readFileSync(path.resolve(__dirname, '../socio/index.html'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// Réplica EXACTA de los gates del código (homeView).
const depsDeMiSocio = (socio_, c) => (socio_ && !socio_.titularSocioId ? (c.dependientes || []) : []);
const puedeInvitar = (socio_) => !!(socio_ && !socio_.titularSocioId);
const seccionRenderiza = (socio_, c) => depsDeMiSocio(socio_, c).length > 0;
const invitarVisible = (socio_, c, dep) => puedeInvitar(socio_) && dep.cuentaPropia !== true && dep.activo !== false;

const dep = { personaId: 'dp', titularSocioId: 'S1', titularPersonaId: 'P1', nombreVista: 'Bustos, María Paula', activo: true };
const cGrupo = { dependientes: [dep] };
const cVacio = { dependientes: [] };

// 1) TITULAR VITALICIO (esResponsablePago undefined, sin titularSocioId) con dependiente → sección + Invitar
const titVit = { id: 'S1', personaId: 'P1', vitalicio: true, esResponsablePago: undefined, titularSocioId: undefined, planId: 'plan01' };
t('titular VITALICIO con dependiente → sección renderiza', seccionRenderiza(titVit, cGrupo) === true);
t('titular VITALICIO → botón Invitar visible (NO exige esResponsablePago)', invitarVisible(titVit, cGrupo, dep) === true);

// 2) TITULAR COMÚN (esResponsablePago true)
const titComun = { id: 'S1', personaId: 'P1', esResponsablePago: true, titularSocioId: undefined, planId: 'plan01' };
t('titular común con dependiente → sección + Invitar', seccionRenderiza(titComun, cGrupo) && invitarVisible(titComun, cGrupo, dep));

// 3) SOCIO SIN GRUPO → no hay sección
const titSolo = { id: 'S2', personaId: 'P2', titularSocioId: undefined };
t('socio SIN dependientes → NO renderiza la sección', seccionRenderiza(titSolo, cVacio) === false);

// 4) DEPENDIENTE (tiene titularSocioId) → no ve una sección de grupo (no es titular)
const esDep = { id: 'S3', personaId: 'P3', titularSocioId: 'S1' };
t('un dependiente NO ve la sección de grupo (no es titular)', seccionRenderiza(esDep, cGrupo) === false && puedeInvitar(esDep) === false);

// 5) dependiente que YA tiene cuenta → chip "tiene su app", sin botón Invitar
const depConApp = { personaId: 'dp2', titularSocioId: 'S1', nombreVista: 'X', activo: true, cuentaPropia: true };
t('integrante con cuentaPropia → sin Invitar (chip "tiene su app")', invitarVisible(titVit, { dependientes: [depConApp] }, depConApp) === false);

// 6) WIRING: el código usa el gate robusto (sin esResponsablePago en puedeInvitar; depsDeMiSocio por !titularSocioId)
t('código: puedeInvitar NO exige esResponsablePago', /const puedeInvitar = !!\(socio && !socio\.titularSocioId\)/.test(socio) && !/puedeInvitar = socio && socio\.esResponsablePago===true/.test(socio));
t('código: depsDeMiSocio usa c.dependientes directo (sin re-filtro titularSocioId)', /const depsDeMiSocio = \(socio && !socio\.titularSocioId \? \(c\.dependientes\|\|\[\]\) : \[\]\)/.test(socio) && !/filter\(d=>d\.titularSocioId===socio\.id\)/.test(socio));
t('código: la sección "Mi grupo familiar" sigue conectada en el return', /\$\{grupoSec\}/.test(socio) && /Mi grupo familiar/.test(socio));

// 7) SELECTOR "¿Para quién?" — excluye al INDEPENDIENTE (adulto con cuenta); mantiene al menor con cuenta
const edadDe = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); if (!m) return null; const h = new Date(); let e = h.getFullYear() - (+m[1]); if (((h.getMonth() + 1) * 100 + h.getDate()) < ((+m[2]) * 100 + (+m[3]))) e--; return e; };
const esIndependienteDep = (d) => d.cuentaPropia === true && (edadDe(d.fechaNacimiento) || 0) >= 18;
const activeDeps = (deps) => deps.filter(d => d.activo !== false && d.personaId && !esIndependienteDep(d));
const adultoConCuenta = { personaId: 'a', activo: true, cuentaPropia: true, fechaNacimiento: '1985-01-01' };
const menorConCuenta = { personaId: 'm', activo: true, cuentaPropia: true, fechaNacimiento: '2015-01-01' };
const sinCuenta = { personaId: 's', activo: true, fechaNacimiento: '1990-01-01' };
t('selector: EXCLUYE al adulto con cuenta (independiente)', !activeDeps([adultoConCuenta]).length);
t('selector: MANTIENE al menor con cuenta (titular gestiona)', activeDeps([menorConCuenta]).length === 1);
t('selector: MANTIENE al que no tiene cuenta', activeDeps([sinCuenta]).length === 1);
t('código: el selector filtra esIndependienteDep (adulto+cuenta)', /const esIndependienteDep = \(d\)=> d\.cuentaPropia===true && \(edadDe\(d\.fechaNacimiento\)\|\|0\) >= 18/.test(socio) && /!esIndependienteDep\(d\)/.test(socio));

// 8) ITEM 2 — canje doble password + coincidencia; login con reset por email
t('canje: doble campo (Repetir contraseña) al crear', /Repetir contraseña/.test(socio) && /id="ipw2"/.test(socio));
t('canje: valida coincidencia (no crea si difieren)', /if\(pw!==pw2\)\{ set\(\{ err:'Las contraseñas no coinciden\.'/.test(socio));
t('login: "Olvidé mi contraseña" → sendPasswordResetEmail', /Olvidé mi contraseña/.test(socio) && /function doResetPassword/.test(socio) && /auth\.sendPasswordResetEmail\(email\)/.test(socio));

console.log(`\n${fail ? '✗' : '✓'} smoke-grupo-familiar-render: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
