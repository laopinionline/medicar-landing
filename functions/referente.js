'use strict';
/*
 * Referente — núcleo PURO (sin Firebase), para poder smoke-testear las garantías del modelo.
 *
 * EN PIEDRA: el referente tiene UN SOLO nivel de acceso a la salud del titular = el síntoma exacto CON
 * consentimiento explícito. Sin consentimiento NO ve NADA de salud. (El binario intermedio estado_referido
 * "reportó/no reportó" fue ELIMINADO — era un nivel sin sentido en el uso real.)
 *
 * docSintomaReferido (abajo) es el ÚNICO builder del dato de salud que cruza al referente, y copia SOLO lo que
 * Lucas habilitó (nombres de síntomas + relato), nada más del reporte crudo. El referente JAMÁS lee
 * reportes_sintomas crudo: lee el derivado consentido, y solo vía CF (para loguear cada acceso).
 */

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

// ── Síntoma-con-consentimiento (único nivel de salud del referente) ──
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

// ── R3: alerta al referente (push genérico) ──
// TEXTO DEL PUSH — GENÉRICO A PROPÓSITO. 🚩 INVARIANTE: NO contiene síntomas ni NADA de salud. El push aparece en la
// lockscreen (visible sin abrir la app, sin gate de quién mira) → jamás lleva dato de salud ahí. El síntoma se ve al
// ABRIR la app, vía leerSintomaReferido (que loguea el acceso). smoke-r3-push.js falla si alguien mete salud acá.
const TEXTO_R3 = {
  title: 'MEDICAR',
  body: 'Tu familiar reportó algo. Abrí la app para ver.',
};

module.exports = { generarCodigo, esFormatoCodigo, CODE_ALFABETO, CODE_LARGO, CONSENT_SINTOMAS, consentSintomasOk, docSintomaReferido, TEXTO_R3 };
