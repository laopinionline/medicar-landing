'use strict';
/* MEDICAR — DNI argentino, NÚCLEO del PDF417 del dorso (puro, sin Firebase). Parsea la cadena de campos separados por
 * '@', corrige la ñ/ü (spec del PoC poc-dni-pdf417-WA: la ñ llega como 'NXX' y la ü como 'UXX'), y cruza contra la
 * ficha del integrante (DNI + apellido/nombre + fecha de nacimiento). Todo el cruce es SERVER-SIDE (una CF lo invoca);
 * el cliente nunca auto-certifica. Degradación: sin cadena (WASM no decodificó) el caller solo registra las fotos.
 *
 * Formato AR (tarjeta nueva): tramite@APELLIDO@NOMBRE@SEXO@DNI@EJEMPLAR@DD/MM/AAAA@... — el parse es TOLERANTE (toma
 * apellido/nombre por posición y el DNI/fecha por patrón) para sobrevivir variantes de orden. */

// Corrección ñ/ü (spec del PoC): 'NXX' -> 'Ñ', 'UXX' -> 'Ü'. Aislada para ajustar si la spec cambia.
function corregirEnies(s) {
  return String(s || '').replace(/NXX/g, 'Ñ').replace(/UXX/g, 'Ü');
}

// Normalización AGRESIVA para el MATCH: mayúsculas, sin acentos, ñ->n, ü->u, colapsa espacios/puntuación. Así
// "PEÑA"/"PENA"/"peña" comparan igual y el orden apellido/nombre no importa (se compara como conjunto de tokens).
function normMatch(s) {
  return corregirEnies(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // saca acentos (ya sin ñ/ü por la línea de abajo)
    .toUpperCase()
    .replace(/Ñ/g, 'N').replace(/Ü/g, 'U')
    .replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
const soloDigitos = (x) => String(x || '').replace(/\D/g, '');
// tokens de nombre como conjunto (orden-agnóstico)
function tokensNombre(s) { return normMatch(s).split(' ').filter(Boolean).sort(); }

// DD/MM/AAAA -> AAAA-MM-DD (formato del lead). null si no matchea.
function fechaISO(ddmmaaaa) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(ddmmaaaa || '').trim());
  return m ? (m[3] + '-' + m[2] + '-' + m[1]) : null;
}

// Parsea la cadena cruda del PDF417. Devuelve { apellido, nombre, dni, sexo, fechaNac(ISO) } o null si no hay '@'.
function parsePDF417(raw) {
  const s = corregirEnies(String(raw || '').trim());
  if (!s || s.indexOf('@') < 0) return null;
  const f = s.split('@').map((x) => x.trim());
  const apellido = f[1] || '';
  const nombre = f[2] || '';
  const sexo = (f[3] || '').toUpperCase().slice(0, 1);
  // DNI: primer token de 7-8 dígitos (el trámite suele tener 9+). Fecha: primer DD/MM/AAAA.
  let dni = '';
  for (let i = 0; i < f.length; i++) { const d = soloDigitos(f[i]); if (d.length >= 7 && d.length <= 8) { dni = d; break; } }
  let fechaNac = null;
  for (let i = 0; i < f.length; i++) { const iso = fechaISO(f[i]); if (iso) { fechaNac = iso; break; } }
  if (!apellido && !nombre && !dni) return null;
  return { apellido, nombre, dni, sexo, fechaNac };
}

// Cruza el parse contra la ficha del integrante del lead: { nombre (completo), dni, fechaNacimiento(ISO) }.
// Devuelve flags por campo + verificado (los TRES: dni + nombre + fecha). Nombre = mismo conjunto de tokens
// (apellido+nombre del barcode vs nombre completo de la ficha), orden-agnóstico.
function matchIntegrante(parsed, ficha) {
  parsed = parsed || {}; ficha = ficha || {};
  const dniOk = !!parsed.dni && soloDigitos(parsed.dni) === soloDigitos(ficha.dni) && soloDigitos(ficha.dni).length >= 7;
  const tokFicha = tokensNombre(ficha.nombre);
  const tokBarcode = tokensNombre((parsed.apellido || '') + ' ' + (parsed.nombre || ''));
  const nombreOk = tokFicha.length > 0 && tokBarcode.length > 0 && tokFicha.join(' ') === tokBarcode.join(' ');
  const fechaOk = !!parsed.fechaNac && !!ficha.fechaNacimiento && parsed.fechaNac === String(ficha.fechaNacimiento).slice(0, 10);
  return { dniOk, nombreOk, fechaOk, verificado: dniOk && nombreOk && fechaOk };
}

module.exports = { corregirEnies, normMatch, tokensNombre, fechaISO, parsePDF417, matchIntegrante, soloDigitos };
