'use strict';
/*
 * Autogestión de plan — núcleo PURO (sin Firebase), para smoke-testear el diff de coberturas + la carencia.
 *
 * NO clasifica upgrade/downgrade: decide la carencia POR COBERTURA con el diff de coberturas{prestacionId:bool}.
 *  - GANADA (en el plan nuevo y NO en el viejo)  → carencia (carenciaDias del plan nuevo, desde ahora).
 *  - MANTENIDA (en ambos)                        → conserva su carencia previa SI sigue vigente; si no, sin carencia.
 *  - PERDIDA (en el viejo y NO en el nuevo)       → fuera (no entra en el map).
 * Esto cubre upgrade (gana → carencia), downgrade (no gana → inmediato) y lateral (mixto) uniforme.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

// prestacionIds cubiertos (valor === true) de un mapa coberturas{prestacionId:bool}.
function coberturasSet(cob) { return Object.keys(cob || {}).filter((k) => (cob || {})[k] === true); }

// Diff de coberturas viejo↔nuevo → {ganadas, mantenidas, perdidas} (arrays de prestacionId).
function diffCoberturas(viejoCob, nuevoCob) {
  const v = new Set(coberturasSet(viejoCob));
  const n = coberturasSet(nuevoCob);
  const nSet = new Set(n);
  return {
    ganadas: n.filter((k) => !v.has(k)),
    mantenidas: n.filter((k) => v.has(k)),
    perdidas: [...v].filter((k) => !nSet.has(k)),
  };
}

// Nueva carenciaPorCobertura (en ms). `carenciaActualMs` = {prestacionId: msHasta} (el estado previo).
// Ganadas → nowMs + carenciaDias (si carenciaDias 0 → inmediato, NO entra). Mantenidas → conservan su ms previo
// SI es futuro (carencia viva de un cambio anterior). Perdidas y no-cubiertas → no entran. Devuelve solo entradas
// con fecha futura (map limpio, sin residuos vencidos).
function nuevaCarencia(carenciaActualMs, viejoCob, nuevoCob, carenciaDias, nowMs) {
  const { ganadas, mantenidas } = diffCoberturas(viejoCob, nuevoCob);
  const prev = carenciaActualMs || {};
  const out = {};
  const hastaGanada = nowMs + Math.max(0, Number(carenciaDias) || 0) * DIA_MS;
  for (const k of ganadas) { if (hastaGanada > nowMs) out[k] = hastaGanada; }        // carenciaDias>0
  for (const k of mantenidas) { if (prev[k] != null && prev[k] > nowMs) out[k] = prev[k]; } // conserva carencia viva
  return out;
}

// ¿Qué coberturas quedan EN CARENCIA (para el mensaje al socio / el retorno de la CF)?
function coberturasEnCarencia(carenciaMs, nowMs) {
  return Object.keys(carenciaMs || {}).filter((k) => carenciaMs[k] > nowMs);
}

module.exports = { coberturasSet, diffCoberturas, nuevaCarencia, coberturasEnCarencia, DIA_MS };
