'use strict';
/* Smoke — DNI UI + wiring. Render del checklist del socio (afiliación en proceso) y de los badges del panel en vm,
 * + cableado (CF, SDK storage, SW v37, vendor local, aviso-override). node seed/smoke-dni-ui.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = (p) => path.resolve(__dirname, '..', p);
const socio = fs.readFileSync(R('socio/index.html'), 'utf8');
const app = fs.readFileSync(R('app/index.html'), 'utf8');
const fn = fs.readFileSync(R('functions/index.js'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

// ---- 1) SOCIO: dniChecklistHTML en vm ----
const bloqSocio = socio.slice(socio.indexOf('function dniIntegrantes()'), socio.indexOf('function bootView()'));
function renderChecklist(prospecto, dniUp){
  const sb = { esc, S: { prospecto, dniUp: dniUp || null }, window: {}, document: {}, auth: {}, db: {}, firebase: {}, URL: {}, console };
  vm.runInNewContext(bloqSocio + '\nthis.OUT = dniChecklistHTML();', sb, { timeout: 2000 });
  return sb.OUT;
}
const lead = { nombre: 'Juan Pérez', integrantes: [{ nombre: 'Ana Pérez' }, { nombre: 'Leo Pérez' }], fotos: { titular: { frente: true, dorso: true }, int_2: { frente: true, dorso: false } }, identidadVerificada: { titular: true } };
const h = renderChecklist(lead, null);
t('checklist: una fila por persona (titular + 2 integrantes)', /Juan Pérez/.test(h) && /Ana Pérez/.test(h) && /Leo Pérez/.test(h));
t('checklist: titular con ambas fotos → badge "DNI verificado ✓"', /Juan Pérez[\s\S]{0,180}DNI verificado ✓/.test(h));
t('checklist: slots Frente/Dorso con input file image/*', /Frente/.test(h) && /Dorso/.test(h) && /type="file" accept="image\/\*"/.test(h));
t('checklist: dispara dniSubir(clave,which)', /dniSubir\('titular','frente'/.test(h) && /dniSubir\('int_2','dorso'/.test(h));
t('checklist: foto hecha muestra ✅ y "Cambiar"; falta muestra 📷 y "Tomar / subir"', /✅/.test(h) && /Cambiar/.test(h) && /📷/.test(h) && /Tomar \/ subir/.test(h));
const hBusy = renderChecklist(lead, { clave: 'int_2', which: 'dorso', msg: 'Leyendo el código…' });
t('checklist: estado ocupado muestra el mensaje de progreso', /Leyendo el código…/.test(hBusy));

// ---- 2) PANEL: badge + completitud en vm ----
const bloqApp = app.slice(app.indexOf('function prospDniClaves(p)'), app.indexOf('function mktActivarProspecto(id)'));
const sbApp = {}; vm.runInNewContext(bloqApp + '\nthis.badge=prospDniBadge; this.completo=prospDniCompleto; this.verifTodo=prospDniVerificadoTodo; this.claves=prospDniClaves;', sbApp, { timeout: 2000 });
t('panel badge: verificado → "DNI verificado ✓" verde', /DNI verificado ✓/.test(sbApp.badge({ identidadVerificada: { titular: true } }, 'titular')));
t('panel badge: fotos sin verificar', /fotos sin verificar/.test(sbApp.badge({ fotos: { titular: { frente: true, dorso: true } } }, 'titular')));
t('panel badge: sin fotos', /sin fotos/.test(sbApp.badge({}, 'titular')));
t('panel completitud: false si a un integrante le falta el dorso', sbApp.completo(lead) === false);
t('panel completitud: true si TODOS tienen frente+dorso', sbApp.completo({ integrantes: [{}], fotos: { titular: { frente: true, dorso: true }, int_2: { frente: true, dorso: true } } }) === true);
t('panel claves: titular + int_2 + int_3', JSON.stringify(sbApp.claves({ integrantes: [{}, {}] })) === JSON.stringify(['titular', 'int_2', 'int_3']));

// ---- 3) WIRING ----
t('CF verificarDniIntegrante existe', /exports\.verificarDniIntegrante = onCall/.test(fn));
t('CF: CONSTATA las fotos leyendo Storage (no confía en el cliente)', /admin\.storage\(\)\.bucket\(DNI_BUCKET\)/.test(fn) && /bucket\.file\(base \+ n\)\.exists\(\)/.test(fn));
t('CF: parsea+cruza server-side y setea identidadVerificada', /parsePDF417\(pdf417\)/.test(fn) && /matchIntegrante\(parsed, ficha\)/.test(fn) && /identidadVerificada/.test(fn));
t('CF: degradación — sin pdf417 solo registra fotos', /if \(pdf417\) \{/.test(fn) && /decodificado: false/.test(fn));
t('CF: clave validada (titular|int_N)', /\^\(titular\|int_\\d\{1,2\}\)\$/.test(fn));
t('socio: SDK firebase-storage-compat cargado', /firebase-storage-compat\.js/.test(socio));
t('socio: checklist conectado en "afiliación en proceso"', /\$\{dniChecklistHTML\(\)\}/.test(socio) && /subí el <b>DNI \(frente y dorso\)/.test(socio));
t('socio: zxing local (vendor/zxing/reader.js + wasm local, sin CDN)', /\.\/vendor\/zxing\/reader\.js/.test(socio) && /\.\/vendor\/zxing\/zxing_reader\.wasm/.test(socio));
t('socio: SW bumpeado a v37', /medicar-socio-v37/.test(fs.readFileSync(R('socio/sw.js'), 'utf8')));
t('vendor: reader.js + zxing_reader.wasm presentes en el repo', fs.existsSync(R('socio/vendor/zxing/reader.js')) && fs.existsSync(R('socio/vendor/zxing/zxing_reader.wasm')));
t('panel: aviso-override + audit en Activar', /if\(!prospDniCompleto\(p\) \|\| !prospDniVerificadoTodo\(p\)\)/.test(app) && /audit\('prospecto_activado_dni_incompleto'/.test(app) && /confirm\(falta/.test(app));
t('storage.rules: match DNI (dueño escribe, admin lee)', /match \/prospectos\/\{uid\}\/dni\/\{archivo=\*\*\}/.test(fs.readFileSync(R('storage.rules'), 'utf8')));

console.log(`\n${fail ? '✗' : '✓'} smoke-dni-ui: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
