'use strict';
/*
 * Turnos FASE B — asistencia (atendido/ausente). Núcleo PURO (sin Firebase) para las transiciones + el barrido.
 *
 * Máquina de estados: creado | cancelado | atendido | ausente | sin_registrar.
 *  - creado → atendido | ausente        (médico marca; primera marca, sin límite de tiempo)
 *  - sin_registrar → atendido | ausente (marca TARDÍA de un turno que barrió el sistema)
 *  - atendido ⇄ ausente, y → creado     (DESHACER/corrección, SOLO dentro de 48hs de marcadoEn)
 *  - cancelado                          (TERMINAL — lo cierra el socio antes del turno; no se revierte a mano)
 */
const GRACE_MS = 48 * 60 * 60 * 1000; // ventana de deshacer/corrección
const RESULTADOS = ['atendido', 'ausente', 'creado']; // 'creado' = deshacer

// ¿Se puede llevar el turno de `actual` a `nuevo`? Devuelve { ok } o { ok:false, motivo }.
function puedeMarcar(actual, nuevo, marcadoEnMs, ahoraMs) {
  if (!RESULTADOS.includes(nuevo)) return { ok: false, motivo: 'resultado-invalido' };
  if (actual === 'cancelado') return { ok: false, motivo: 'cancelado-terminal' };
  if (actual === 'creado' || actual === 'sin_registrar') {
    if (nuevo === 'creado') return { ok: false, motivo: 'nada-que-deshacer' }; // no hay marca previa que deshacer
    return { ok: true }; // primera marca → atendido | ausente
  }
  if (actual === 'atendido' || actual === 'ausente') {
    if (marcadoEnMs == null) return { ok: false, motivo: 'sin-marca' };
    if ((Number(ahoraMs) || 0) - (Number(marcadoEnMs) || 0) > GRACE_MS) return { ok: false, motivo: 'fuera-de-gracia' };
    return { ok: true }; // corrección/deshacer dentro de la ventana (a atendido | ausente | creado)
  }
  return { ok: false, motivo: 'estado-desconocido' };
}

// ¿el médico marcó dentro de la ventana de deshacer? (para mostrar/ocultar "Deshacer" en la UI)
function dentroDeGracia(marcadoEnMs, ahoraMs) {
  if (marcadoEnMs == null) return false;
  return (Number(ahoraMs) || 0) - (Number(marcadoEnMs) || 0) <= GRACE_MS;
}

// Barrido: un turno 'creado' se cierra como 'sin_registrar' cuando su fecha quedó >=2 días atrás (1 día pasado + 1
// de gracia). fecha/hoy en 'YYYY-MM-DD'. Devuelve true si hay que barrerlo.
function debeBarrer(fechaTurno, hoy) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaTurno || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(hoy || ''))) return false;
  const dias = (Date.parse(hoy + 'T00:00:00Z') - Date.parse(fechaTurno + 'T00:00:00Z')) / 86400000;
  return dias >= 2;
}

module.exports = { GRACE_MS, RESULTADOS, puedeMarcar, dentroDeGracia, debeBarrer };
