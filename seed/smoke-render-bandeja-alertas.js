// Smoke de RENDER — bandeja de guardia (G1+G2). Ejecuta bandejaAlertas() con fixtures: gate por presencia
// (médico sin presencia → botón "Estoy de guardia", NO el pool; presente/despachante → pool), lista sin crudo,
// crudo al abrir, badge de "descubierta". Extrae por NOMBRE de función.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
function fn(nombre) {
  const m = src.match(new RegExp('function\\s+' + nombre + '\\s*\\('));
  if (!m) throw new Error('no encontré function ' + nombre);
  let i = src.indexOf('{', m.index), depth = 0, j = i;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } } }
  return src.slice(m.index, j);
}
let ok = 0, fail = 0; const t = (l, c, x) => { (c ? ok++ : fail++); console.log(`${c ? '✓' : '✗'} ${l}${x !== undefined ? ' → ' + x : ''}`); };

const stubs = `
  const S = __S__;
  function esc(x){ return String(x==null?'':x); }
  function pedHace(){ return 'hace 2 min'; }
  function tms(x){ return typeof x==='number'?x:null; }
  function alertasAttach(){}
  function guardiaPresenciaCargar(){}
`;
const code = stubs + '\n' + fn('presenteAhora') + '\n' + fn('guardiaHead') + '\n' + fn('hhmm') + '\n' + fn('poolAlertasView') + '\n' + fn('bandejaAlertas') + '\n';
function render(S) { return vm.runInNewContext(`(function(){ ${code}\n return bandejaAlertas(); })()`, { __S__: S, Date }); }

const ALERTAS = [
  { id: 'a1', personaNombre: 'Pérez, Ana', personaTelefono: '2477000010', origenReporteId: 'REP1', tieneBanderaRoja: true, descubierta: true, creadoEn: 2 },
  { id: 'a2', personaNombre: 'Gómez, Luis', personaTelefono: '', origenReporteId: 'REP2', tieneBanderaRoja: false, descubierta: false, creadoEn: 1 },
];
const CRUDO = ['Dolor de pecho', 'me duele'];
const FUT = Date.now() + 3600000, PAST = Date.now() - 3600000;

// 1) ★ médico SIN presencia → botón "Estoy de guardia", NO el pool
let r = render({ user: { rol: 'medico', uid: 'm1' }, guardiaPresente: null, alertas: ALERTAS, alertaAbierta: null });
t('★ médico sin presencia → botón "Estoy de guardia"', /doConfirmarPresencia\(\)/.test(r) && /Estoy de guardia/.test(r));
t('★ médico sin presencia NO ve el pool (sin nombres de alertas)', !/Pérez, Ana/.test(r) && !/Gómez, Luis/.test(r));

// 2) médico presencia EXPIRADA → también botón (auto-expira)
r = render({ user: { rol: 'medico', uid: 'm1' }, guardiaPresente: { presenteHasta: PAST }, alertas: ALERTAS, alertaAbierta: null });
t('médico con presencia expirada → botón (no pool)', /Estoy de guardia/.test(r) && !/Pérez, Ana/.test(r));

// 3) ★ médico PRESENTE → ve el pool + "presente hasta HH:MM"
r = render({ user: { rol: 'medico', uid: 'm1' }, guardiaPresente: { presenteHasta: FUT }, alertas: ALERTAS, alertaAbierta: null });
t('★ médico presente → ve el pool (nombres)', /Pérez, Ana/.test(r) && /Gómez, Luis/.test(r));
t('médico presente → "presente hasta HH:MM"', /presente hasta \d\d:\d\d/.test(r));
t('★ badge de DESCUBIERTA en la que entró sin guardia', /nadie de guardia la tomó a tiempo/.test(r));
t('la LISTA no trae crudo (sin síntomas/relato)', !CRUDO.some(c => r.includes(c)) && !/Síntomas:/.test(r));

// 4) despachante → pool SIEMPRE (sin gate de presencia)
r = render({ user: { rol: 'despachante', uid: 'd1' }, alertas: ALERTAS, alertaAbierta: null });
t('despachante → ve el pool siempre (respaldo)', /Pérez, Ana/.test(r) && !/Estoy de guardia/.test(r));

// 5) presente + una alerta ABIERTA → crudo (síntomas/relato) desde el reporte
r = render({ user: { rol: 'medico', uid: 'm1' }, guardiaPresente: { presenteHasta: FUT }, alertas: ALERTAS, alertaAbierta: 'a1', alertaReporte: { sintomas: [{ nombre: 'Dolor de pecho' }], texto: 'me duele desde anoche' } });
t('★ al ABRIR: muestra Síntomas + Relato (crudo desde el reporte)', /Síntomas:.*Dolor de pecho/s.test(r) && /me duele desde anoche/.test(r));

// 6) presente + pool vacío
r = render({ user: { rol: 'medico', uid: 'm1' }, guardiaPresente: { presenteHasta: FUT }, alertas: [], alertaAbierta: null });
t('presente + pool vacío → "No hay alertas activas"', /No hay alertas activas/.test(r));

console.log(`\n${ok}/${ok + fail} checks OK`);
process.exit(fail ? 1 : 0);
