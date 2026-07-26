'use strict';
/* MEDICAR — invitación de integrante (cuenta propia de socio), núcleo PURO (sin Firebase). Dos piezas:
 *  - estadoInvitacion(doc, ahoraMs): estado EFECTIVO del token contando el vencimiento
 *    ('inexistente' | 'pendiente' | 'usado' | 'revocado' | 'vencido').
 *  - ruedaAlTitular(edad, tieneCuenta): PRIVACIDAD de turnos. ¿El turno de esta persona rueda al titular (visible) o
 *    queda privado? Rueda SALVO ADULTO con cuenta propia (= independiente). Menor (con o sin cuenta) o adulto sin
 *    cuenta → rueda al titular (conserva lo asistencial). El cumple-18 flip es automático (edad se computa en vivo). */

function msDe(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v.toMillis) return v.toMillis();
  if (v._seconds != null) return v._seconds * 1000;
  if (v.seconds != null) return v.seconds * 1000;
  return 0;
}

function estadoInvitacion(doc, ahoraMs) {
  if (!doc) return 'inexistente';
  if (doc.estado === 'usado') return 'usado';
  if (doc.estado === 'revocado') return 'revocado';
  const exp = msDe(doc.expiraEn);
  if (exp && (ahoraMs || 0) > exp) return 'vencido';
  return doc.estado === 'pendiente' ? 'pendiente' : 'inexistente';
}

// Privacidad de turnos. independiente = adulto (>=18) && tiene cuenta propia → su turno NO rueda al titular.
function ruedaAlTitular(edad, tieneCuenta) {
  const esAdulto = (typeof edad === 'number' && edad >= 18);
  return !(esAdulto && !!tieneCuenta);
}

module.exports = { estadoInvitacion, ruedaAlTitular, msDe };
