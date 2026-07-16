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
// Deliberadamente NO toca r.sintomas / r.texto → el crudo no se duplica. `descubierta` (G2): entró sin ningún
// médico presente de guardia → FLAG ortogonal al estado (NO la saca del pool; el que llega después la ve igual).
function docAlerta(reporte, reporteId, ts, descubierta) {
  const r = reporte || {};
  return {
    personaId: r.personaId || '',
    personaNombre: r.personaNombre || '',      // identidad (para la lista), denorm — no clínico
    personaTelefono: r.personaTelefono || '',  // contacto (botón llamar), denorm — no clínico
    origenReporteId: reporteId,                // REFERENCIA: la fuente de verdad del crudo (reportes_sintomas)
    tieneBanderaRoja: r.tieneBanderaRoja === true, // flag de PRIORIDAD (triage) — un bit, NO el crudo
    descubierta: descubierta === true,         // G2: nadie de guardia presente al entrar (marcador, no estado)
    estado: 'nueva',
    creadoEn: ts,
    atendidaPor: null,
    atendidaEn: null,
  };
}

// Guardia G2 — helpers PUROS (sin Firebase) para el cronograma y el "atendiendo", testeables por smoke.

// Estados de episodio en los que el médico lo tiene ABIERTO (sigue con su paciente).
const EPISODIO_ABIERTO = ['despacho', 'en_camino', 'arribo', 'atencion'];

// ¿Hay una guardia MÉDICA vigente ahora para confirmar presencia? guardias normalizadas a {rol, estado, inicioMs,
// finMs}. Devuelve la vigente (rol medico, no cerrada, inicio <= now < fin) o null. Instantes ABSOLUTOS (ms UTC) →
// sin trampa de timezone. La presencia SOLO vale dentro de una franja → no se puede falsear fuera del cronograma.
function guardiaVigente(guardias, nowMs) {
  for (const g of (guardias || [])) {
    if (g && g.rol === 'medico' && g.estado !== 'cerrada' && g.inicioMs <= nowMs && nowMs < g.finMs) return g;
  }
  return null;
}

// Las personaIds (=pacienteId) que un médico ATIENDE = pacientes de sus episodios ABIERTOS. Para el override del
// "episodio que sobrevive": la alerta de esa persona le sigue visible aunque termine su guardia.
function personasAtendidas(episodios) {
  const s = {};
  for (const e of (episodios || [])) { if (e && EPISODIO_ABIERTO.includes(e.estado) && e.pacienteId) s[e.pacienteId] = true; }
  return Object.keys(s);
}

module.exports = { docAlerta, guardiaVigente, personasAtendidas, EPISODIO_ABIERTO };
