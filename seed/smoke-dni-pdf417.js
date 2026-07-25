'use strict';
/* Smoke — núcleo DNI PDF417 (functions/dni-pdf417.js): parse @-fields, corrección ñ/ü (NXX/UXX), cruce por integrante
 * (DNI + nombre + fecha), orden-agnóstico, degradación. node seed/smoke-dni-pdf417.js */
const D = require('../functions/dni-pdf417');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// cadena AR típica: tramite@APELLIDO@NOMBRE@SEXO@DNI@EJEMPLAR@DD/MM/AAAA@...  (ñ codificada NXX)
const RAW = '00123456789@PENXXA@JUAN CARLOS@M@30123456@A@15/07/1985@10/01/2016@190@0';

// --- corrección ñ/ü ---
t("corregirEnies: NXX→Ñ, UXX→Ü", D.corregirEnies('PENXXA MUNXXOZ UXXBER') === 'PEÑA MUÑOZ ÜBER');
t("corregirEnies: sin marcadores no toca nada", D.corregirEnies('PEREZ') === 'PEREZ');

// --- parse ---
const p = D.parsePDF417(RAW);
t('parse: apellido con ñ corregida (PEÑA)', p && p.apellido === 'PEÑA');
t('parse: nombre completo', p.nombre === 'JUAN CARLOS');
t('parse: dni por patrón (7-8 díg, no el trámite)', p.dni === '30123456');
t('parse: sexo', p.sexo === 'M');
t('parse: fechaNac DD/MM/AAAA → ISO', p.fechaNac === '1985-07-15');
t('fechaISO helper', D.fechaISO('09/03/1970') === '1970-03-09' && D.fechaISO('basura') === null);

// --- degradación ---
t('parse: sin "@" → null (WASM no decodificó → Plan B)', D.parsePDF417('no-es-barcode') === null);
t('parse: vacío → null', D.parsePDF417('') === null);

// --- match: verificado (los tres campos), orden-agnóstico, DNI con puntos ---
const ficha = { nombre: 'Juan Carlos Peña', dni: '30.123.456', fechaNacimiento: '1985-07-15' };
const mOk = D.matchIntegrante(p, ficha);
t('match: verificado=true (dni+nombre+fecha)', mOk.verificado === true && mOk.dniOk && mOk.nombreOk && mOk.fechaOk);
t('match: nombre orden-agnóstico (apellido/nombre del barcode vs nombre completo de la ficha)', D.matchIntegrante(p, { nombre: 'Peña Juan Carlos', dni: '30123456', fechaNacimiento: '1985-07-15' }).nombreOk === true);
t('match: DNI con puntos normaliza igual', mOk.dniOk === true);

// --- mismatch por campo ---
t('mismatch DNI → dniOk=false, verificado=false', (() => { const m = D.matchIntegrante(p, { nombre: 'Juan Carlos Peña', dni: '99999999', fechaNacimiento: '1985-07-15' }); return !m.dniOk && m.nombreOk && !m.verificado; })());
t('mismatch NOMBRE → nombreOk=false', (() => { const m = D.matchIntegrante(p, { nombre: 'Pedro Gómez', dni: '30123456', fechaNacimiento: '1985-07-15' }); return m.dniOk && !m.nombreOk && !m.verificado; })());
t('mismatch FECHA → fechaOk=false', (() => { const m = D.matchIntegrante(p, { nombre: 'Juan Carlos Peña', dni: '30123456', fechaNacimiento: '1990-01-01' }); return m.dniOk && m.nombreOk && !m.fechaOk && !m.verificado; })());

// --- ñ real en la ficha vs NXX en el barcode: normalización cierra el círculo ---
t('ñ del barcode (NXX) matchea la ñ real de la ficha', (() => { const pp = D.parsePDF417('1@PENXXA@ANA@F@27000111@A@01/01/1990@x'); return D.matchIntegrante(pp, { nombre: 'Ana Peña', dni: '27000111', fechaNacimiento: '1990-01-01' }).nombreOk === true; })());

// --- parse tolerante: dni de 8 dígitos y trámite largo conviven ---
t('parse: elige el DNI (8 díg) y no el trámite (11 díg)', D.parsePDF417('12345678901@LOPEZ@ANA@F@28999888@A@02/02/1992@z').dni === '28999888');

console.log(`\n${fail ? '✗' : '✓'} smoke-dni-pdf417: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
