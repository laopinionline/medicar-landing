'use strict';
/* Smoke — PARIDAD del callejero: functions/callejero-core.js (server) vs callejero.js (browser) → salida IDÉNTICA en una
 * batería amplia. + JSON byte-equal (functions/calles-pergamino.json == app/calles-pergamino.json). Blinda "un solo
 * núcleo, cero divergencia" mecánicamente. node seed/smoke-callejero-paridad.js */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const R = (p) => path.resolve(__dirname, '..', p);
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// 1) JSON byte-equal (la data no puede derivar)
const jApp = fs.readFileSync(R('app/calles-pergamino.json'));
const jFn = fs.readFileSync(R('functions/calles-pergamino.json'));
const h = (b) => crypto.createHash('sha256').update(b).digest('hex');
t('JSON functions == app (byte-equal)', Buffer.compare(jApp, jFn) === 0 && h(jApp) === h(jFn));

const calles = JSON.parse(jFn.toString());
t('JSON: 589 calles', calles.length === 589);

// 2) cargar ambos núcleos con el MISMO JSON
const Browser = require(R('callejero.js'));      // callejero.js exporta CommonJS (guard module.exports); usa cargarDesde
const Core = require(R('functions/callejero-core.js'));
Browser.cargarDesde(calles);
Core.cargarDesde(calles);
t('ambos núcleos cargados', Browser.cargado() === true && Core.cargado() === true);

// 3) batería de direcciones: las 589 reales (con altura) + edge cases (alias, rural, ambiguo, acentos, abreviaturas, vacío)
const bateria = [];
calles.forEach((c, i) => { bateria.push(c + ' ' + (100 + (i % 900))); });      // cada calle real con una altura
[
  'Mitre 1234', 'BARTOLOME MITRE 1234', 'mitre 500',                            // alias mitre → bartolome-mitre
  'saenz peña 100', 'Roque Saenz Peña 100', 'liniers 800', 'pedroni 45',        // más alias
  'Av. de Mayo 361', 'AVENIDA DE MAYO 361', 'avda de mayo 361',                 // prefijos/normalización
  'San Martín 500', 'SAN MARTIN 500',                                           // acentos
  'Ruta 8 km 5', 'Zona Rural s/n', 'Estancia La Blanca', 'Chacra 12',           // rurales → null
  'Calle Que No Existe 999', 'xyzzy 10', '',                                     // fuera / vacío
  'Sta. Fe 100', 'Bme. Mitre 200', 'Dr. Felipe Gomez 30',                       // abreviaturas
].forEach((a) => bateria.push(a));

let divergencias = 0, primera = null;
bateria.forEach((addr) => {
  const rb = Browser.resolver(addr), rc = Core.resolver(addr);
  if (JSON.stringify(rb) !== JSON.stringify(rc)) { divergencias++; if (!primera) primera = { addr, rb, rc }; }
});
t(`PARIDAD en ${bateria.length} direcciones (0 divergencias)`, divergencias === 0);
if (divergencias) console.log('  primera divergencia:', JSON.stringify(primera));

// 4) sanity de resolución (no todo null): las reales resuelven, las rurales/inexistentes dan null
t('sanity: "Bartolome Mitre 1234" resuelve a bartolome-mitre', JSON.stringify(Core.resolver('Bartolome Mitre 1234')) === JSON.stringify({ calleId: 'bartolome-mitre', altura: 1234 }));
t('sanity: alias "Mitre 1234" → bartolome-mitre (canon)', Core.resolver('Mitre 1234').calleId === 'bartolome-mitre');
t('sanity: rural "Ruta 8 km 5" → calleId null', Core.resolver('Ruta 8 km 5').calleId === null);
t('sanity: inexistente "Calle Que No Existe 999" → calleId null (altura sí se lee)', Core.resolver('Calle Que No Existe 999').calleId === null);

console.log(`\n${fail ? '✗' : '✓'} smoke-callejero-paridad: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
