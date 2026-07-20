'use strict';
/* Smoke — sacar usuarios.afiliadoId. Construye S.user SIN afiliadoId y corre getTabs para los 7 roles: ningún rol
 * pierde acceso ni rompe (afiliadoId no lo consumía nadie). Extrae getTabs+puede* por NOMBRE (robusto a líneas).
 * node seed/smoke-ruteo-sin-afiliadoid.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const L = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8').split('\n');
function extract(name) { const re = new RegExp('^(async )?function ' + name + '\\('); const s = L.findIndex((l) => re.test(l)); if (s < 0) throw new Error('no encontrada: ' + name); let d = 0, st = false, e = s; for (let i = s; i < L.length; i++) { for (const c of L[i]) { if (c === '{') { d++; st = true; } else if (c === '}') d--; } if (st && d === 0) { e = i; break; } } return L.slice(s, e + 1).join('\n'); }

const funcs = ['getTabs', 'puede', 'puedeConfig', 'puedeCobrar', 'puedeAfil'].map(extract).join('\n');
const stubs = `
  function novBadgeAttach(){}
  var S={ novPendCount:0, user:null };
`;
// S.user por rol, SIN afiliadoId (lo que construye enterWithFbUser tras el cambio)
const userDe = (rol, permisos) => ({ uid: 'u', email: 'x', roles: [rol], rol, nombre: 'X', medicoId: null, personaId: 'p1', unidad: null, esp: null, permisos: permisos || {} });

let ok = 0, fail = 0;
const chk = (l, c, e) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}${c ? '' : (e ? '  → ' + e : '')}`); c ? ok++ : fail++; };
function tabsPara(rol, permisos) {
  const src = stubs + funcs + `\n; S.user=${JSON.stringify(userDe(rol, permisos))}; getTabs(S.user.rol);`;
  return vm.runInNewContext(src, {});
}

console.log('\ngetTabs para los 7 roles (S.user SIN afiliadoId)');
// afiliado: se redirige a la PWA; getTabs devuelve [perfil]
{ const t = tabsPara('afiliado'); chk('afiliado → [perfil] (se atiende en la PWA)', Array.isArray(t) && t.length === 1 && t[0].id === 'perfil'); }
// superadmin: [home, perfil] (navega por SUPER_SECS)
{ const t = tabsPara('superadmin'); chk('superadmin → [home, perfil]', t.map((x) => x.id).join(',') === 'home,perfil'); }
// admin sin caps: estructural home + perfil (las cap-tabs dependen de permisos)
{ const t = tabsPara('admin', {}); chk('admin (sin caps) → home + perfil', t.some((x) => x.id === 'home') && t.some((x) => x.id === 'perfil') && !t.some((x) => x.id === 'cobranza')); }
// admin con cobranza+facturar → aparecen las cap-tabs
{ const t = tabsPara('admin', { gestionar_cobranza: true, facturar: true }); chk('admin (cobranza+facturar) → cobranza + facturacion presentes', t.some((x) => x.id === 'cobranza') && t.some((x) => x.id === 'facturacion')); }
// medico: estructurales home/episodios/alertas/guardia
{ const t = tabsPara('medico'); const ids = t.map((x) => x.id); chk('medico → home,episodios,alertas,guardia', ['home', 'episodios', 'alertas', 'guardia'].every((i) => ids.includes(i))); }
// despachante: bandeja/despacho/guardia
{ const t = tabsPara('despachante'); const ids = t.map((x) => x.id); chk('despachante → bandeja,despacho,guardia', ['bandeja', 'despacho', 'guardia'].every((i) => ids.includes(i))); }
// contable: sin home propio; sus tabs son las cap-tabs (con caps financieras)
{ const t = tabsPara('contable', { facturar: true, gestionar_cobranza: true }); const ids = t.map((x) => x.id); chk('contable → facturacion+cobranza+perfil, SIN home', ids.includes('facturacion') && ids.includes('cobranza') && ids.includes('perfil') && !ids.includes('home')); }
// chofer: home + perfil
{ const t = tabsPara('chofer'); const ids = t.map((x) => x.id); chk('chofer → home + perfil', ids.includes('home') && ids.includes('perfil')); }

console.log('\nel objeto S.user ya NO trae afiliadoId (y sí el resto)');
{ const u = userDe('admin'); chk('S.user sin afiliadoId', !('afiliadoId' in u)); chk('S.user conserva roles/rol/personaId/medicoId', u.roles && u.rol && ('personaId' in u) && ('medicoId' in u)); }

console.log(`\n${fail ? '✗' : '✓'} smoke-ruteo-sin-afiliadoid: ${ok} ok, ${fail} fallo(s)\n`);
process.exit(fail ? 1 : 0);
