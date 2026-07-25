'use strict';
/* Smoke — despacho: prefill del domicilio (TRAMO 1) + flujo AUTO/otro tipo de lugar (FIX #2).
 *  - afiliado con domicilio, sin tocar → #dom READONLY con la dirección + #tlugar HIDDEN='domiciliaria' + selector
 *    OCULTO + toggle "Otro domicilio/lugar" (auto-domiciliaria).
 *  - "Otro domicilio/lugar" (d.otroLugar) → #dom editable + selector COMPLETO + "Volver al domicilio de la ficha".
 *  - paciente sin ficha → selector visible siempre, #dom vacío editable, sin toggle.
 *  - dspCrear lee #dom + #tlugar → episodio; NO escribe de vuelta a la ficha. node seed/smoke-despacho-prefill.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.resolve(__dirname, '../app/index.html'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
const m = app.match(/function dDespForm\(d\)\{[\s\S]*?\n\}/);
if (!m) { console.log('✗ no se pudo extraer dDespForm'); process.exit(1); }
function render(d){
  const sb = { esc, afEnsureCalles(){}, afCallesOpts(){ return ''; }, dCapsula(){ return ''; }, dAlta(){ return ''; }, dAntecedentes(){ return ''; }, CODIGOS: [] };
  vm.runInNewContext(m[0] + '\nthis.OUT = dDespForm(d);', Object.assign(sb, { d }), { timeout: 2000 });
  return sb.OUT;
}
const selPresente = (h) => /<select id="tlugar">/.test(h);
const hiddenDomiciliaria = (h) => /<input type="hidden" id="tlugar" value="domiciliaria">/.test(h);

// 1) AUTO — afiliado con domicilio, sin tocar (otroLugar falsy)
const A = render({ paciente: { id: 'p1', direccion: 'Av. de Mayo 361, 1' } });
t('AUTO: #dom READONLY con el domicilio de la ficha', /<input id="dom" type="text" value="Av\. de Mayo 361, 1" readonly/.test(A));
t('AUTO: #tlugar HIDDEN = domiciliaria (mismo dato que el selector manual)', hiddenDomiciliaria(A));
t('AUTO: selector de tipo de lugar OCULTO', !selPresente(A));
t('AUTO: toggle "Otro domicilio / lugar" → dspOtroLugar(true)', /dspOtroLugar\(true\)/.test(A) && /Otro domicilio \/ lugar/.test(A));
t('AUTO: nota domiciliaria automático + no modifica la ficha', /Domiciliaria<\/b> \(automático\)/.test(A) && /No modifica la ficha/.test(A));

// 2) escaping del value en AUTO
const A2 = render({ paciente: { id: 'p2', direccion: 'Calle "X" & <b>3</b>' } });
t('AUTO escaping: value escapado (&quot; &amp; &lt;)', /value="Calle &quot;X&quot; &amp; &lt;b&gt;3&lt;\/b&gt;" readonly/.test(A2));

// 3) OTRO — afiliado + otroLugar:true
const O = render({ paciente: { id: 'p1', direccion: 'Av. de Mayo 361, 1' }, otroLugar: true });
t('OTRO: #dom EDITABLE (list=calles-list) con el domicilio precargado', /<input id="dom" list="calles-list"[^>]*value="Av\. de Mayo 361, 1"[^>]*oninput="dspDomChange\(\)"/.test(O));
t('OTRO: selector de tipo de lugar COMPLETO visible', selPresente(O) && /Vía pública/.test(O) && /Instituto educativo/.test(O));
t('OTRO: sin #tlugar hidden (manda el selector)', !hiddenDomiciliaria(O));
t('OTRO: botón "Volver al domicilio de la ficha" → dspOtroLugar(false)', /dspOtroLugar\(false\)/.test(O) && /Volver al domicilio de la ficha/.test(O));

// 4) SIN FICHA (paciente null) — selector siempre, #dom vacío editable, sin toggle
const N = render({ paciente: null });
t('SIN FICHA: selector visible', selPresente(N));
t('SIN FICHA: #dom editable vacío', /<input id="dom" list="calles-list"[^>]*value=""/.test(N));
t('SIN FICHA: sin readonly y sin toggle dspOtroLugar', !/readonly/.test(N) && !/dspOtroLugar/.test(N));

// 5) afiliado SIN direccion → como "sin ficha" (selector visible, sin toggle, editable vacío)
const S0 = render({ paciente: { id: 'p4', direccion: '' } });
t('afiliado sin direccion: selector visible + sin toggle + #dom vacío', selPresente(S0) && !/dspOtroLugar/.test(S0) && /<input id="dom" list="calles-list"[^>]*value=""/.test(S0));

// 6) REGRESIÓN dspCrear: lee #dom + #tlugar → episodio; NO writeback a la ficha
const dspCrear = app.slice(app.indexOf('async function dspCrear('), app.indexOf('async function dspCrear(') + 3200);
t('regresión: dspCrear lee #dom y #tlugar', /getElementById\('dom'\)/.test(dspCrear) && /getElementById\('tlugar'\)/.test(dspCrear));
t('regresión: domicilio + tipoLugar + calleId van al EPISODIO', /domicilio:domicilio, tipoLugar:tipoLugar/.test(dspCrear) && /calleId:domCanon\.calleId/.test(dspCrear));
t('AISLAMIENTO: dspCrear NO escribe a pacientes/ ni personas/', !/collection\('pacientes'\)[\s\S]{0,120}direccion/.test(dspCrear) && !/collection\('personas'\)/.test(dspCrear));
t('dspOtroLugar existe y resetea el toggle al elegir paciente', /function dspOtroLugar\(on\)\{ dspState\(\)\.otroLugar=!!on; render\(\); \}/.test(app) && /d\.otroLugar=false;/.test(app));

console.log(`\n${fail ? '✗' : '✓'} smoke-despacho-prefill: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
