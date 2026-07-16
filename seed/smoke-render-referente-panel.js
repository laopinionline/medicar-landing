// Smoke de RENDER — panel del referente con el feed. Ejecuta referentePanelView() con fixtures y verifica que
// NO tira (lección F-3: un ref pelado en un template solo crashea al correr) y que INCLUYE el feed "Para vos".
// Extrae funciones por NOMBRE (regex + conteo de llaves), no por línea (evita la staleness de los slices).
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'socio', 'index.html'), 'utf8');

// Extrae `function nombre(...){ ... }` balanceando llaves desde la primera '{'.
function fn(nombre) {
  const m = src.match(new RegExp('function\\s+' + nombre + '\\s*\\('));
  if (!m) throw new Error('no encontré function ' + nombre);
  let i = src.indexOf('{', m.index), depth = 0, j = i;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } } }
  return src.slice(m.index, j);
}

const stubs = `
  const S = __S__;
  const TEL_EMERG = '4444-4444';
  const IC = { phone: '' };
  const FEED_CAT = { medicar:{band:'#eee',tag:'t',lbl:'MEDICAR'}, salud:{band:'#eee',tag:'t',lbl:'Salud'} };
  function chv(){ return ''; }
  function esc(x){ return String(x==null?'':x); }
  function feedLoad(){ /* en el smoke S.feed ya viene cargado */ }
  function feedAbrir(){}
  function render(){}
  function set(){}
`;
const code = stubs + '\n' + fn('frasePonderacion') + '\n' + fn('homeFeedBlock') + '\n' + fn('referentePanelView') + '\n';

function run(label, S, checks) {
  try {
    const r = vm.runInNewContext(`(function(){ ${code}\n return referentePanelView(); })()`, { console, __S__: S }, { timeout: 3000 });
    if (typeof r !== 'string') throw new Error('devolvió ' + typeof r);
    const extra = checks ? checks(r) : '';
    console.log(`✓ ${label} → string(${r.length}) ${extra}`);
    return true;
  } catch (e) { console.log(`✗ ${label} → THROW: ${e.name}: ${e.message}`); return false; }
}
let ok = 0, fail = 0; const t = b => b ? ok++ : fail++;

const FEED = [
  { cat: 'medicar', titulo: 'Campaña de vacunación', bajada: 'Info útil', fuenteNombre: 'MEDICAR', link: 'https://x', imagenUrl: '' },
  { cat: 'salud', titulo: 'Consejos de verano', bajada: '', fuenteNombre: 'La Opinión', link: '', imagenUrl: '' },
];
const vinc = [{ titularPersonaId: 'pA', titularNombre: 'DEMO, Titular', ponderacion: 'sin_sintomas' }];

t(run('panel con 1 titular + feed cargado', { ref: { vinculos: vinc, sel: 0 }, feed: FEED, cred: null }, r => {
  const feed = r.includes('Para vos') && r.includes('Campaña de vacunación');
  const pond = r.includes('No se reportaron síntomas');
  const titular = r.includes('DEMO, Titular');
  const emerg = r.includes('EMERGENCIAS');
  return `[feed:${feed} · ponderacion:${pond} · titular:${titular} · emergencias:${emerg}]`;
}));
t(run('panel con feed VACÍO → oculta la sección, no rompe', { ref: { vinculos: vinc, sel: 0 }, feed: [], cred: null }, r => {
  return `[sinFeed:${!r.includes('Para vos')} · siguePonderacion:${r.includes('No se reportaron síntomas')}]`;
}));
t(run('panel multi-titular (selector) + feed', { ref: { vinculos: [...vinc, { titularPersonaId: 'pB', titularNombre: 'DEMO, Dos', ponderacion: 'con_sintomas' }], sel: 1 }, feed: FEED, cred: null }, r => {
  return `[selector:${r.includes('DEMO, Dos')} · feed:${r.includes('Para vos')} · pondB:${r.includes('Se reportaron síntomas')}]`;
}));

console.log(`\n${ok}/${ok + fail} render del panel del referente sin throw`);
process.exit(fail ? 1 : 0);
