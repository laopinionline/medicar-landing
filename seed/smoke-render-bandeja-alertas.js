// Smoke de RENDER — bandeja de guardia (G1). Ejecuta bandejaAlertas() con fixtures: NO tira (lección F-3),
// la LISTA no muestra el crudo (síntomas/texto), y el crudo aparece SOLO al abrir (S.alertaReporte cargado).
// Extrae por NOMBRE de función (no line-slices).
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
  function alertasAttach(){ /* no-op en el smoke: S.alertas ya viene */ }
`;
function render(S) {
  return vm.runInNewContext(`(function(){ ${stubs}\n${fn('bandejaAlertas')}\n return bandejaAlertas(); })()`, { __S__: S });
}

const ALERTAS = [
  { id: 'a1', personaNombre: 'Pérez, Ana', personaTelefono: '2477000010', origenReporteId: 'REP1', tieneBanderaRoja: true, creadoEn: 2 },
  { id: 'a2', personaNombre: 'Gómez, Luis', personaTelefono: '', origenReporteId: 'REP2', tieneBanderaRoja: false, creadoEn: 1 },
];
const CRUDO = ['Dolor de pecho', 'me duele', 'internacion'];

// 1) lista con alertas, NADA abierto → identidad+prioridad, SIN crudo
let r = render({ alertas: ALERTAS, alertaAbierta: null, alertaReporte: null });
t('bandejaAlertas no throw + string', typeof r === 'string');
t('lista muestra identidad (Pérez, Ana / Gómez, Luis)', /Pérez, Ana/.test(r) && /Gómez, Luis/.test(r));
t('prioridad: 🔴 en la de bandera roja', /🔴/.test(r));
t('acciones Ver + Atender', /alertaVer\(/.test(r) && /alertaAtender\(/.test(r));
t('Llamar solo si hay teléfono', /href="tel:2477000010"/.test(r) && !/href="tel:"/.test(r));
t('★ la LISTA no trae el crudo (sin síntomas/relato)', !CRUDO.some(c => r.includes(c)) && !/Síntomas:/.test(r), 'lista limpia');

// 2) una alerta ABIERTA con el reporte cargado → aparece el crudo (síntomas/relato)
r = render({ alertas: ALERTAS, alertaAbierta: 'a1', alertaReporte: { id: 'REP1', sintomas: [{ nombre: 'Dolor de pecho' }], texto: 'me duele desde anoche' } });
t('★ al ABRIR: muestra Síntomas + Relato (crudo desde el reporte)', /Síntomas:.*Dolor de pecho/s.test(r) && /me duele desde anoche/.test(r));

// 3) abierta pero el reporte todavía no cargó → "Abriendo…", sin crudo
r = render({ alertas: ALERTAS, alertaAbierta: 'a1', alertaReporte: null });
t('abriendo (reporte no cargado) → placeholder, sin crudo', /Abriendo el reporte/.test(r) && !CRUDO.some(c => r.includes(c)));

// 4) estados de lista
t('lista vacía → "No hay alertas activas"', /No hay alertas activas/.test(render({ alertas: [], alertaAbierta: null, alertaReporte: null })));
t('sin cargar (undefined) → "Cargando…"', /Cargando…/.test(render({ alertas: null, alertaAbierta: null, alertaReporte: null })));

console.log(`\n${ok}/${ok + fail} checks OK`);
process.exit(fail ? 1 : 0);
