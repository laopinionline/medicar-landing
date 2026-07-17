'use strict';
/*
 * Referente R1 — núcleo PURO (sin Firebase), para poder smoke-testear la garantía N3.
 *
 * N3 EN PIEDRA (guardas innegociables de Lucas):
 *  1. estado_referido/{titularId} contiene SOLO { ponderacion, actualizadoEn }. ponderacion ∈ {sin_sintomas,
 *     con_sintomas}. NADA MÁS. La CF que lo escribe NO copia severidad/síntoma/score/nivel del reporte crudo.
 *  2. El referente lee estado_referido, JAMÁS reportes_sintomas. La ponderación cruza YA TRADUCIDA.
 *
 * Este módulo es el ÚNICO que arma el doc derivado (docEstadoReferido) y el ÚNICO que traduce a lenguaje
 * humano (frasePonderacion). Ninguno recibe ni referencia el reporte crudo: la derivación es por EXISTENCIA
 * (hubo reporte → 'con_sintomas'), nunca por contenido. Así N3 queda garantizado por construcción.
 */

// Los DOS únicos valores posibles de la ponderación (binario, decisión de Lucas). Sin niveles intermedios en R1.
const PONDERACIONES = ['sin_sintomas', 'con_sintomas'];

// El ÚNICO builder del doc derivado. Shape cerrado: exactamente {ponderacion, actualizadoEn}. Lanza si el valor
// no es del enum (fail-closed: nunca escribe un estado_referido con un valor inventado). `ts` = timestamp server.
function docEstadoReferido(ponderacion, ts) {
  if (!PONDERACIONES.includes(ponderacion)) throw new Error('[referente] ponderacion inválida: ' + ponderacion);
  return { ponderacion, actualizadoEn: ts };
}

// Traducción crudo→humano N3-safe: mapea SOLO el enum a una frase. Ni números, ni síntomas, ni severidad.
function frasePonderacion(ponderacion) {
  if (ponderacion === 'con_sintomas') return 'Se reportaron síntomas recientemente.';
  return 'No se reportaron síntomas.'; // default (incluye 'sin_sintomas' y ausencia de dato)
}

// Alfabeto del código: base32 SIN caracteres ambiguos (sin 0/O/1/I/L) → dictable por teléfono / WhatsApp.
const CODE_ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LARGO = 6; // 30^6 ≈ 729M combinaciones — colisión despreciable (y el CF igual reintenta si choca)

// Genera un código legible "MED-XXXXXX". `randomInt(n)` devuelve un entero en [0, n) — se inyecta para poder
// testear el formato de forma determinista (el CF pasa uno basado en crypto).
function generarCodigo(randomInt) {
  let s = '';
  for (let i = 0; i < CODE_LARGO; i++) s += CODE_ALFABETO[randomInt(CODE_ALFABETO.length)];
  return 'MED-' + s;
}

// ¿El string tiene la forma de un código válido? (validación barata previa al lookup en el canje)
function esFormatoCodigo(codigo) {
  return typeof codigo === 'string' && new RegExp('^MED-[' + CODE_ALFABETO + ']{' + CODE_LARGO + '}$').test(codigo);
}

// ── Síntoma-con-consentimiento (Fase 1) ──
// Texto del consentimiento CONFIRMADO por Lucas (version 1). Es el ARTEFACTO LEGAL: cada registro en
// consentimientos/ copia texto+version. Si legal lo cambia, sube version (los viejos conservan lo aceptado).
const CONSENT_SINTOMAS = {
  version: 1,
  texto: 'Autorizo a la persona que designé como mi referente en MEDICAR a ver los síntomas que reporto, incluyendo la descripción que yo escriba. Entiendo que es información de mi salud, que la comparto por mi propia decisión, que se comparte solo mi reporte más reciente, y que puedo revocar esta autorización en cualquier momento desde la aplicación.',
};
// ¿Hay un texto de consentimiento REAL? (invariante: sin esto, otorgar RECHAZA — nunca se graba consentimiento vacío).
function consentSintomasOk() { return !!(CONSENT_SINTOMAS && CONSENT_SINTOMAS.version >= 1 && String(CONSENT_SINTOMAS.texto || '').trim().length > 0); }

// Doc derivado per-referente del síntoma exacto: SOLO nombres de síntomas + relato libre (lo que Lucas habilitó).
// NADA más del reporte crudo (ni banderaRoja, ni score, ni ids). Lo escribe/lee SOLO la CF (Admin SDK).
function docSintomaReferido(reporte, ts) {
  const r = reporte || {};
  return {
    sintomas: (Array.isArray(r.sintomas) ? r.sintomas : []).map((s) => (s && s.nombre) || '').filter(Boolean),
    texto: String(r.texto || ''),
    actualizadoEn: ts,
  };
}

module.exports = { PONDERACIONES, docEstadoReferido, frasePonderacion, generarCodigo, esFormatoCodigo, CODE_ALFABETO, CODE_LARGO, CONSENT_SINTOMAS, consentSintomasOk, docSintomaReferido };
