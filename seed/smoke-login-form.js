'use strict';
/* Smoke — doctrina "el form no se borra": el login de socio/ conserva el email tipeado ante error. node seed/smoke-login-form.js */
const fs = require('fs'), path = require('path');
const socio = fs.readFileSync(path.resolve(__dirname, '../socio/index.html'), 'utf8');
const app = fs.readFileSync(path.resolve(__dirname, '../app/index.html'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// socio: el input de email bindea S.loginEmail (se conserva) + doLogin lo setea en el catch y en el early-return
t('socio: el input de email conserva lo tipeado (value=${esc(S.loginEmail...)})', /<input id="em"[^>]*value="\$\{esc\(S\.loginEmail\|\|''\)\}"/.test(socio));
t('socio: doLogin setea loginEmail en el error (form no se borra)', /set\(\{ busy:false, err:msg, loginEmail:email \}\)/.test(socio));
t('socio: doLogin conserva el email también en el early-return de campos vacíos', /Ingresá tu email y contraseña\.', loginEmail:email/.test(socio) || /err:'Ingresá tu email y contraseña\.', loginEmail:email/.test(socio));

// app: NO tiene el defecto (el catch manipula el DOM, sin render() → los inputs no se limpian)
t('app: el login NO re-renderiza en el error (usa el.textContent, sin render → conserva el form)', /catch\(err\)\{[\s\S]{0,160}el\.textContent=mapAuthError\(err\)/.test(app) && !/catch\(err\)\{[\s\S]{0,120}render\(\)/.test(app));

console.log(`\n${fail ? '✗' : '✓'} smoke-login-form: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
