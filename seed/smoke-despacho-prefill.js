'use strict';
/* Smoke — TRAMO 1 despacho-prefill-domicilio: dDespForm() precarga #dom con d.paciente.direccion (editable, esc,
 * paciente nuevo vacío) y dspCrear sigue leyendo #dom → episodio SIN escribir de vuelta a la ficha.
 * node seed/smoke-despacho-prefill.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.resolve(__dirname, '../app/index.html'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// esc REAL (calco del de la app: escapa &<>"') para verificar el escaping del value
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
const m = app.match(/function dDespForm\(d\)\{[\s\S]*?\n\}/);
if (!m) { console.log('✗ no se pudo extraer dDespForm'); process.exit(1); }
function render(d){
  const sb = { esc, afEnsureCalles(){}, afCallesOpts(){ return ''; }, dCapsula(){ return ''; }, dAlta(){ return ''; }, dAntecedentes(){ return ''; }, CODIGOS: [] };
  vm.runInNewContext(m[0] + '\nthis.OUT = dDespForm(d);', Object.assign(sb, { d }), { timeout: 2000 });
  return sb.OUT;
}

// 1) afiliado con direccion → #dom precargado con el value (editable) + nota
const h1 = render({ paciente: { id: 'p1', direccion: 'Av. de Mayo 361, 1' } });
t('afiliado: #dom precargado con d.paciente.direccion', /<input id="dom"[^>]*value="Av\. de Mayo 361, 1"/.test(h1));
t('afiliado: nota "Precargado del domicilio de la ficha" + "no modifica la ficha"', /Precargado del domicilio de la ficha/.test(h1) && /no modifica la ficha/.test(h1));

// 2) escaping: una direccion con comillas/HTML no rompe el atributo value
const h2 = render({ paciente: { id: 'p2', direccion: 'Calle "X" & <b>3</b>' } });
t('escaping: value escapado (&quot; &amp; &lt;), sin comillas crudas que rompan el atributo', /value="Calle &quot;X&quot; &amp; &lt;b&gt;3&lt;\/b&gt;"/.test(h2));

// 3) paciente NUEVO (sin paciente) → #dom vacío, sin nota
const h3 = render({ paciente: null });
t('paciente nuevo (null): #dom con value vacío', /<input id="dom"[^>]*value=""/.test(h3));
t('paciente nuevo: sin nota de precarga', !/Precargado del domicilio de la ficha/.test(h3));

// 4) afiliado SIN direccion cargada → #dom vacío, sin nota
const h4 = render({ paciente: { id: 'p4', direccion: '' } });
t('afiliado sin direccion: #dom vacío', /<input id="dom"[^>]*value=""/.test(h4));
t('afiliado sin direccion: sin nota', !/Precargado del domicilio de la ficha/.test(h4));

// 5) REGRESIÓN dspCrear: sigue leyendo #dom → episodio (domicilio/calleId), y NO escribe #dom a pacientes/personas
const dspCrear = app.slice(app.indexOf('async function dspCrear('), app.indexOf('async function dspCrear(') + 3200);
t('regresión: dspCrear lee #dom', /getElementById\('dom'\)/.test(dspCrear));
t('regresión: el domicilio va al EPISODIO (domicilio + calleId canónico)', /domicilio:domicilio/.test(dspCrear) && /calleId:domCanon\.calleId/.test(dspCrear));
t('AISLAMIENTO: dspCrear NO escribe direccion a pacientes/ ni personas/ (no writeback de ficha)', !/collection\('pacientes'\)[\s\S]{0,120}direccion/.test(dspCrear) && !/collection\('personas'\)/.test(dspCrear));

console.log(`\n${fail ? '✗' : '✓'} smoke-despacho-prefill: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
