'use strict';
/*
 * Tramo 6 — Test de presentación del badge "Baja" en dspListaHTML (búsqueda del despacho).
 * NO usa Firestore: extrae la función REAL de app/index.html y la corre con stubs.
 *   node seed/test-badge-baja.js
 * Casos: activo:false → badge · activo:true → sin badge · sin campo activo → sin badge.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const m = src.match(/function dspListaHTML\(d\)\{[\s\S]*?\n\}/);
if (!m) throw new Error('no encontré dspListaHTML');

// Stubs mínimos del entorno de render.
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const calcEdad = () => 30;
const dspListaHTML = new Function('esc', 'calcEdad', m[0] + '\n; return dspListaHTML;')(esc, calcEdad);

const BADGE = /class="badge br"[^>]*>Baja<\/span>/;
let fails = 0;
const check = (cond, msg) => { if (!cond) { console.error('  ✗ ' + msg); fails++; } else console.log('  ✓ ' + msg); };

const render = (paciente) => dspListaHTML({ q: 'x', resultados: [Object.assign({ id: 'p1', apellido: 'PEREZ', nombre: 'Juan', dni: '123', fechaNacimiento: '' }, paciente)] });

console.log('\n[test-badge-baja]');
const rBaja = render({ activo: false });
check(BADGE.test(rBaja), 'activo:false → muestra badge "Baja"');
check(rBaja.includes('PEREZ Juan'), 'activo:false → el nombre sigue visible (junto al badge)');

const rActivo = render({ activo: true });
check(!BADGE.test(rActivo), 'activo:true → SIN badge');

const rSinCampo = render({});
check(!BADGE.test(rSinCampo), 'sin campo activo (paciente no-socio) → SIN badge');

// Guarda: no se filtró (el de baja sigue en la lista) ni cambió el conteo.
check(/Resultados \(1\)/.test(rBaja), 'activo:false → sigue apareciendo en resultados (no se filtra)');

console.log(`\n${fails === 0 ? '✅ TODOS LOS TESTS PASARON' : '❌ ' + fails + ' FALLO(S)'}\n`);
process.exit(fails === 0 ? 0 : 1);
