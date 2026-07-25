'use strict';
/* Checkout — resolución server-side del domicilio (recompute-and-use). PURO: recibe el `resolver` del callejero
 * (callejero-core) inyectado, así se testea sin Firebase. Devuelve:
 *   { dom: {texto,calleId,altura,pisoDepto} | null, mismatch: bool }
 *   - dom null  → FUERA del callejero (rural / ambiguo / calle inexistente / sin texto) → el checkout RECHAZA.
 *   - dom       → SIEMPRE con el calleId/altura del SERVER (nunca el declarado por el cliente).
 *   - mismatch  → lo declarado por el cliente difiere de lo recomputado → el caller LOGuea (sin PII) y persiste el server.
 * NO rechaza por mismatch (evita falsos positivos de clientes cacheados); el blindaje real = recompute-and-use + reject-null. */
function resolverDomCheckout(o, resolver) {
  o = o || {};
  const texto = String(o.texto || '').trim().slice(0, 200);
  const pisoDepto = String(o.pisoDepto || '').trim().slice(0, 60);
  if (!texto) return { dom: null, mismatch: false };
  const r = resolver(texto) || {};
  if (!r.calleId || !(r.altura > 0)) return { dom: null, mismatch: false }; // fuera del callejero
  const decCalle = String(o.calleId || '').trim();
  const decAltura = Number(o.altura) || 0;
  const mismatch = (decCalle !== r.calleId) || (decAltura !== r.altura);
  return { dom: { texto, calleId: r.calleId, altura: r.altura, pisoDepto }, mismatch };
}
module.exports = { resolverDomCheckout };
