'use strict';
/*
 * A2 — texto de las push de turno. N3 EN PIEDRA: SOLO fecha/hora/médico (+ nombreVista del destino).
 * NUNCA valores/scores/motivo/nivel/alertas. El turno ni siquiera contiene esos campos; este builder
 * usa EXPLÍCITAMENTE solo fecha/hora/medicoNombre/nombreVista → clínico-free por construcción.
 * Módulo puro (sin Firebase) para poder verificarlo por smoke.
 */
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
function fechaLegible(fecha) {
  const p = String(fecha || '').split('-').map(Number);
  if (p.length !== 3 || p.some(isNaN)) return String(fecha || '');
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return DIAS[d.getUTCDay()] + ' ' + String(p[2]).padStart(2, '0') + '/' + String(p[1]).padStart(2, '0');
}
// Aviso al reservar. 'destino' = para quién es el turno (el titular o su dependiente).
function textoAvisoTurno(t) {
  const f = fechaLegible(t && t.fecha);
  const h = (t && t.hora) || '';
  const med = (t && t.medicoNombre) || 'tu médico';
  const para = (t && t.nombreVista) ? ` para ${t.nombreVista}` : '';
  return { title: 'Turno reservado', body: `Tenés un turno${para} el ${f} a las ${h} con ${med}.` };
}
// Recordatorio (~2hs antes). Mismo N3.
function textoRecordatorioTurno(t) {
  const f = fechaLegible(t && t.fecha);
  const h = (t && t.hora) || '';
  const med = (t && t.medicoNombre) || 'tu médico';
  const para = (t && t.nombreVista) ? ` de ${t.nombreVista}` : '';
  return { title: 'Recordatorio de turno', body: `Tu turno${para} es hoy a las ${h} con ${med} (${f}).` };
}

// ── Programación del recordatorio (A2-b) ──
// Cuánto antes del turno se manda el recordatorio.
const RECORDATORIO_MS_ANTES = 2 * 60 * 60 * 1000; // 2 hs

// Instante EXACTO del turno como Date (UTC). fecha/hora están en hora de Argentina.
// AR = UTC−3 todo el año (sin DST desde 2009) → offset FIJO -03:00, explícito para NO depender
// del reloj del runtime (lección onSchedule: nada de UTC implícito). Fecha/hora inválida → null.
function instanteTurno(fecha, hora) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '')) || !/^\d{2}:\d{2}$/.test(String(hora || ''))) return null;
  const d = new Date(`${fecha}T${hora}:00-03:00`);
  return isNaN(d.getTime()) ? null : d;
}

// Plan del recordatorio en el momento de reservar. Devuelve { enviar, razon, cuando }.
//  - fecha/hora inválida → enviar:false (nunca encolar basura).
//  - BORDE <2hs (turno inminente, p.ej. reservado para dentro de 1h): enviar:false, razon:'inminente'.
//    Decisión: NO encolamos un "recordatorio 2hs antes" cuyo instante ya pasó — sería un push al toque,
//    redundante con el AVISO al reservar de A2-a. No mandar > mandar algo raro en el pasado.
//  - resto → enviar:true, cuando = instanteTurno − 2hs.
// 'ahora' es un Date (instante absoluto); la comparación es timezone-agnóstica.
function planRecordatorio(fecha, hora, ahora) {
  const turno = instanteTurno(fecha, hora);
  if (!turno) return { enviar: false, razon: 'fecha-invalida', cuando: null };
  const cuando = new Date(turno.getTime() - RECORDATORIO_MS_ANTES);
  if (cuando.getTime() <= ahora.getTime()) return { enviar: false, razon: 'inminente', cuando };
  return { enviar: true, razon: 'ok', cuando };
}

// Estados de turno en los que TODAVÍA tiene sentido recordar.
const ESTADOS_NOTIFICABLES = ['creado', 'confirmado'];

// Decisión de la CF destino al momento de disparar (revalidación + idempotencia), como función PURA
// para poder smoke-testearla sin Firestore. 'turno' = doc releído (o null si no existe).
//  - null (inexistente) / estado no notificable (cancelado, atendido) → NO manda (red de seguridad).
//  - recordatorioEnviadoEn ya seteado → NO manda (idempotencia ante reintentos de Cloud Tasks).
//  - sin reservadoPorUid → NO manda (no hay a quién rutear).
function debeRecordar(turno) {
  if (!turno) return { mandar: false, razon: 'inexistente' };
  if (!ESTADOS_NOTIFICABLES.includes(turno.estado)) return { mandar: false, razon: 'estado:' + turno.estado };
  if (turno.recordatorioEnviadoEn) return { mandar: false, razon: 'ya-enviado' };
  if (!turno.reservadoPorUid) return { mandar: false, razon: 'sin-uid' };
  return { mandar: true, razon: 'ok' };
}

module.exports = { fechaLegible, textoAvisoTurno, textoRecordatorioTurno, instanteTurno, planRecordatorio, debeRecordar, ESTADOS_NOTIFICABLES, RECORDATORIO_MS_ANTES };
