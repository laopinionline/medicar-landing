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
module.exports = { fechaLegible, textoAvisoTurno, textoRecordatorioTurno };
