'use strict';
/*
 * Guardia G1 — núcleo PURO (sin Firebase) para smoke-testear el shape de la alerta.
 *
 * MODELO REFERENCIA (no copia): la alerta APUNTA al reporte (origenReporteId), NO duplica el crudo clínico.
 * Una sola fuente de verdad del dato de salud = reportes_sintomas (una sola regla N3 que mantener). La alerta
 * lleva solo ruteo/identidad (personaId/Nombre/Telefono, denorm, no clínicos) + un flag de prioridad de triage
 * (tieneBanderaRoja, un bit) + estado. NUNCA sintomas/texto — eso vive solo en reportes_sintomas.
 *
 * Es el INVERSO del referente: el referente recibía un binario N3-safe (estado_referido); la guardia recibe una
 * alerta que REFERENCIA el crudo (el staff sí lo ve, abriendo el reporte). El afiliado/referente no leen alertas.
 */

// El ÚNICO builder de la alerta. Toma el reporte crudo pero copia SOLO ruteo + flag de prioridad + la REFERENCIA.
// Deliberadamente NO toca r.sintomas / r.texto → el crudo no se duplica.
function docAlerta(reporte, reporteId, ts) {
  const r = reporte || {};
  return {
    personaId: r.personaId || '',
    personaNombre: r.personaNombre || '',      // identidad (para la lista), denorm — no clínico
    personaTelefono: r.personaTelefono || '',  // contacto (botón llamar), denorm — no clínico
    origenReporteId: reporteId,                // REFERENCIA: la fuente de verdad del crudo (reportes_sintomas)
    tieneBanderaRoja: r.tieneBanderaRoja === true, // flag de PRIORIDAD (triage) — un bit, NO el crudo
    estado: 'nueva',
    creadoEn: ts,
    atendidaPor: null,
    atendidaEn: null,
  };
}

module.exports = { docAlerta };
