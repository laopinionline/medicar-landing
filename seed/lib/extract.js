'use strict';
/*
 * Extracción de funciones del HTML por NOMBRE (brace-matching) — robusta a mover/borrar código.
 * Reemplaza el viejo `slice(a,b)` por número de línea fija, que se descalibraba con cualquier edición de arriba
 * y daba falso "0/X". Compartido por los seed/smoke-render-*.js.
 *
 * Uso:
 *   const { lines, fn, fns } = require('./lib/extract');
 *   const L = lines('app/index.html');
 *   const src = fns(L, ['esc','facMoney','cobPanel','cobDeudaView']);   // concatena las que pidas, en ese orden
 */
const fs = require('fs');
const path = require('path');

// Lee un archivo del repo (ruta relativa a la raíz del repo) y devuelve sus líneas.
function lines(relPath) {
  const abs = path.join(__dirname, '..', '..', relPath);
  return fs.readFileSync(abs, 'utf8').split('\n');
}

// Extrae UNA función por nombre: desde `function NAME(` (o `async function NAME(`) hasta que las llaves cierran
// a profundidad 0. Sirve para one-liners (start==end) y multilínea. Lanza si no la encuentra (falla RUIDOSO, nunca
// silencioso — el punto de la migración).
function fn(L, name) {
  const re = new RegExp('^(async )?function ' + name + '\\s*\\(');
  const start = L.findIndex((l) => re.test(l));
  if (start < 0) throw new Error(`extract.fn: no se encontró la función "${name}"`);
  let depth = 0, started = false, end = -1;
  for (let i = start; i < L.length; i++) {
    for (const ch of L[i]) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
    if (started && depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error(`extract.fn: no cerró la función "${name}" (llaves desbalanceadas)`);
  return L.slice(start, end + 1).join('\n');
}

// Extrae varias funciones (por nombre) y las concatena en el orden pedido.
function fns(L, names) { return names.map((n) => fn(L, n)).join('\n'); }

// Extrae una REGIÓN contigua: desde el inicio de firstName hasta el cierre (brace-match) de lastName, con TODO lo que
// haya en el medio (reemplazo line-independiente del viejo block-slice). Sirve cuando un smoke necesita un bloque de
// muchas funciones (helpers+vistas+motor) sin enumerarlas una por una.
function range(L, firstName, lastName) {
  const reA = new RegExp('^(async )?function ' + firstName + '\\s*\\(');
  const start = L.findIndex((l) => reA.test(l));
  if (start < 0) throw new Error(`extract.range: no se encontró la función inicial "${firstName}"`);
  const reB = new RegExp('^(async )?function ' + lastName + '\\s*\\(');
  const lb = L.findIndex((l, i) => i >= start && reB.test(l));
  if (lb < 0) throw new Error(`extract.range: no se encontró la función final "${lastName}" después de "${firstName}"`);
  let depth = 0, started = false, end = -1;
  for (let i = lb; i < L.length; i++) {
    for (const ch of L[i]) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
    if (started && depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error(`extract.range: no cerró la función final "${lastName}"`);
  return L.slice(start, end + 1).join('\n');
}

// Extrae una declaración `const NAME = ...;` por nombre (one-liner o multilínea con {}/[] anidados). Cierra en el
// primer `;` a profundidad 0 de llaves/corchetes. Para los smokes que necesitan un mapa/array de datos del código.
function konst(L, name) {
  const re = new RegExp('^\\s*const ' + name + '\\s*=');
  const start = L.findIndex((l) => re.test(l));
  if (start < 0) throw new Error(`extract.konst: no se encontró "const ${name}"`);
  let depth = 0, end = -1;
  for (let i = start; i < L.length; i++) {
    for (const ch of L[i]) { if (ch === '{' || ch === '[') depth++; else if (ch === '}' || ch === ']') depth--; }
    if (depth <= 0 && /;\s*$/.test(L[i].replace(/\/\/.*$/, '').trimEnd())) { end = i; break; }
    if (depth <= 0 && L[i].includes(';')) { end = i; break; }
  }
  if (end < 0) throw new Error(`extract.konst: no cerró "const ${name}" (falta ;)`);
  return L.slice(start, end + 1).join('\n');
}

// Auto-detecta: si hay `function NAME(` la extrae como función; si no, la busca como `const NAME =`. Así el smoke
// no tiene que saber si un símbolo es función o arrow-const (ej. socio `esc` es const, app `esc` es function).
function sym(L, name) {
  const reF = new RegExp('^(async )?function ' + name + '\\s*\\(');
  return L.some((l) => reF.test(l)) ? fn(L, name) : konst(L, name);
}
function syms(L, names) { return names.map((n) => sym(L, n)).join('\n'); }

// Extrae un BLOQUE anclado a un marcador (regex): desde la primera línea que matchea, hasta que las llaves cierran a
// profundidad 0 (tras abrir al menos una). Para snippets que NO son una función pero forman un bloque con llaves (ej.
// la clasificación de acceso dentro de cargarCredencial). Anclado a código estable, no a número de línea.
function blockFrom(L, startRe) {
  const start = L.findIndex((l) => startRe.test(l));
  if (start < 0) throw new Error(`extract.blockFrom: no matcheó ${startRe}`);
  let depth = 0, started = false, end = -1;
  for (let i = start; i < L.length; i++) {
    for (const ch of L[i]) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
    if (started && depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error(`extract.blockFrom: no cerró el bloque de ${startRe}`);
  return L.slice(start, end + 1).join('\n');
}

module.exports = { lines, fn, fns, range, konst, sym, syms, blockFrom };
