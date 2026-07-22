'use strict';
// Smoke — navegación "Volver" (socio). Verifica el ruteo de hardwareBack (botón atrás Android) + que los 2 Volver
// rotos (cambiar-plan / mis-referentes) ahora van a home, y que los de APILADAS siguen con navBack.
const vm = require('vm');
const { lines, konst, fn } = require('./lib/extract');
const L = lines('socio/index.html');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// ---------- ruteo de hardwareBack ----------
const src = konst(L, 'SUBVISTAS_SOCIO') + '\n' + fn(L, 'hardwareBack');
function run(view, cred) {
  const sb = { S: { view, cred } };
  sb.set = (p) => { if (p && p.view !== undefined) sb.S.view = p.view; };
  sb.minimizado = false;
  sb.minimizarApp = () => { sb.minimizado = true; };
  vm.createContext(sb);
  vm.runInContext(src + '\nhardwareBack();', sb);
  return { finalView: sb.S.view, minimizado: sb.minimizado };
}
console.log('— hardwareBack (botón atrás Android) —');
t('sub-vista cambiar-plan → home', run('cambiar-plan', { x: 1 }).finalView === 'home');
t('sub-vista mis-referentes → home', run('mis-referentes', { x: 1 }).finalView === 'home');
t('sub-vista reporte (APILADA) → home', run('reporte', { x: 1 }).finalView === 'home');
t('sub-vista asistente → home', run('asistente', { x: 1 }).finalView === 'home');
t('sub-vista recibo → home', run('recibo', { x: 1 }).finalView === 'home');
t('home → NO cambia de vista + minimiza (no blanco)', (r => r.finalView === 'home' && r.minimizado)(run('home', { x: 1 })));
t('referente → minimiza (no hay atrás propio)', (r => r.minimizado)(run('referente', { x: 1 })));
t('login (sin cred) → minimiza', (r => r.minimizado)(run('login', null)));
t('sub-vista SIN cred → no va a home, minimiza', (r => r.finalView === 'cambiar-plan' && r.minimizado)(run('cambiar-plan', null)));

// ---------- los handlers de los "Volver" en el código ----------
const raw = L.join('\n');
console.log('\n— handlers de "Volver" en cada vista —');
const volverDe = (viewFn) => {
  const body = fn(L, viewFn);
  const m = body.match(/onclick="([^"]+)"[^>]*>Volver/);
  return m ? m[1] : '(no encontrado)';
};
t('cambiarPlanView Volver → set({view:\'home\'})', volverDe('cambiarPlanView').includes("set({view:'home'})"));
t('misReferentesView Volver → set({view:\'home\'})', volverDe('misReferentesView').includes("set({view:'home'})"));
t('cambiarPlanView Volver YA NO usa navBack', !volverDe('cambiarPlanView').includes('navBack'));
t('misReferentesView Volver YA NO usa navBack', !volverDe('misReferentesView').includes('navBack'));
// las de APILADAS siguen con navBack (siguen andando por navRestore)
t('reporteFormView Volver sigue con navBack', /onclick="navBack\(\)"[^>]*>Cancelar|onclick="navBack\(\)"[^>]*>Volver|onclick="navBack\(\)"[^>]*>Cerrar/.test(fn(L, 'reporteFormView')));
t('comprobantesFullView Volver sigue con navBack', fn(L, 'comprobantesFullView').includes('navBack()'));

console.log(`\n${fail ? '✗' : '✓'} smoke-nav-back: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
