// Smoke — fix del referente que regresa (login directo email/pass sin código).
// Cubre: (a) ruteo tras auth por destinoTrasAuth (referente→panel · socio→su credencial · bad-creds no aplica acá)
//        (b) render de referenteLoginView (email/pass, sin código, links correctos) sin throw.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'socio', 'index.html'), 'utf8');
function fn(nombre) {
  const m = src.match(new RegExp('function\\s+' + nombre + '\\s*\\('));
  if (!m) throw new Error('no encontré function ' + nombre);
  let i = src.indexOf('{', m.index), depth = 0, j = i;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } } }
  return src.slice(m.index, j);
}
let ok = 0, fail = 0; const t = (l, c, x) => { (c ? ok++ : fail++); console.log(`${c ? '✓' : '✗'} ${l}${x !== undefined ? ' → ' + x : ''}`); };

// ── (a) destinoTrasAuth (función pura de ruteo) ──
const destinoTrasAuth = vm.runInNewContext(fn('destinoTrasAuth') + '; destinoTrasAuth', {});
t('referente PURO que vuelve (esRef, sin-vinculo) → PANEL', destinoTrasAuth(true, 'sin-vinculo') === 'referente', destinoTrasAuth(true, 'sin-vinculo'));
t('★ SOCIO que entra por "acceso de referente" (no esRef, ok) → SU CREDENCIAL (home)', destinoTrasAuth(false, 'ok') === 'home', destinoTrasAuth(false, 'ok'));
t('★ SOCIO+referente por acceso de referente (esRef, ok) → SU CREDENCIAL (home, afiliado-primero)', destinoTrasAuth(true, 'ok') === 'home', destinoTrasAuth(true, 'ok'));
t('staff que entra por ahí (ok=staff) → staff (nunca panel referente)', destinoTrasAuth(true, 'staff') === 'staff');
t('no-socio SIN claim referente (bad path) → no-afiliado (no panel vacío)', destinoTrasAuth(false, 'no-afiliado') === 'no-afiliado');
t('sin vínculo y sin claim → sin-vinculo', destinoTrasAuth(false, 'sin-vinculo') === 'sin-vinculo');

// ── (b) render de referenteLoginView ──
const stubs = `const S=__S__; const TEL_EMERG='4444'; function chv(){return '';} function esc(x){return String(x==null?'':x);}`;
function render(S) {
  return vm.runInNewContext(`(function(){ ${stubs}\n${fn('referenteLoginView')}\n return referenteLoginView(); })()`, { __S__: S });
}
try {
  const r = render({ err: '', busy: false });
  t('referenteLoginView no throw + es string', typeof r === 'string');
  t('★ tiene email + password (login directo)', /id="rlem"/.test(r) && /id="rlpw"/.test(r));
  t('★ NO pide código (sin input de código)', !/id="rcodv"/.test(r) && !/MED-XXXXXX/.test(r));
  t('tiene "Entrar" + link a "Tengo un código" + Volver', /doReferenteLogin\(\)/.test(r) && /irReferenteAuth\(\)/.test(r) && /volverALogin\(\)/.test(r));
  const rErr = render({ err: 'Email o contraseña incorrectos.', busy: false });
  t('★ muestra el error sin perder la pantalla (credenciales mal)', /Email o contraseña incorrectos\./.test(rErr) && /id="rlem"/.test(rErr));
} catch (e) { t('render referenteLoginView', false, 'THROW ' + e.message); }

// ── (c) el link de entrada está en la pantalla del CÓDIGO ──
const rc = vm.runInNewContext(`(function(){ ${stubs}\n${fn('referenteCodigoView')}\n return referenteCodigoView(); })()`, { __S__: { err:'', busy:false } });
t('la pantalla del código ofrece "Ya tengo acceso de referente"', /irReferenteLogin\(\)/.test(rc) && /Ya tengo acceso de referente/.test(rc));

console.log(`\n${ok}/${ok + fail} checks OK`);
process.exit(fail ? 1 : 0);
