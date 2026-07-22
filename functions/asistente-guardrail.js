'use strict';
/*
 * MEDICAR IA — GUARDRAIL DE SALIDA (F1). Determinista, sobre la RESPUESTA del modelo. Última red antes de mostrarla.
 * Si la respuesta trae (fármaco + dosis) o un DIAGNÓSTICO afirmativo, se reemplaza por un mensaje seguro y se marca
 * para loguear el incidente (asistente_incidentes, solo-staff). Conservador: exige señal fuerte para no romper
 * respuestas legítimas (el error hacia "bloquear de más" es el seguro acá).
 */
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Fármacos comunes por nombre (no exhaustivo; se mantiene con el smoke).
const FARMACO = /(ibuprofeno|paracetamol|aspirina|amoxicilina|azitromicina|cefalexina|ciprofloxacin|diclofenac|naproxeno|omeprazol|loratadina|amoxidal|corticoid|antibiotic\w*|antiinflamatori\w*|analgesic\w*)/;
// Dosis / posología (lo que convierte una mención en una INDICACIÓN).
const DOSIS = /\b\d+\s?(mg|ml|mcg|g|comprimid\w*|pastill\w*|gotas|capsul\w*)\b|\bcada \d+ ?(hs?|horas)\b|\b\d+ (veces|vez) (al|por) dia\b|\btomate?\b|\btoma \d/;
// Diagnóstico afirmativo (afirma una enfermedad concreta como conclusión).
const DIAGNOSTICO = /\b(tenes|tienes|es un|es una|estas con|padeces|sufris de|se trata de|lo que tenes es|seguro es)\b[^.]{0,40}\b(infarto|acv|neumonia|apendicitis|covid|dengue|gripe|angina|infeccion urinaria|infeccion|fractura|trombosis|meningitis|apendice|cancer|tumor)\b/;

const MSG_SEGURO = 'Eso no te lo puedo orientar por acá. Para algo así, lo mejor es que lo veas con un médico.';

// Revisa la respuesta. Devuelve { ok, respuesta, motivo }. Si !ok → respuesta es el mensaje seguro.
function revisar(respuesta) {
  const t = norm(respuesta);
  let motivo = null;
  if (FARMACO.test(t) && DOSIS.test(t)) motivo = 'farmaco_dosis';
  else if (DIAGNOSTICO.test(t)) motivo = 'diagnostico';
  if (motivo) return { ok: false, respuesta: MSG_SEGURO, motivo };
  return { ok: true, respuesta: String(respuesta || ''), motivo: null };
}

module.exports = { revisar, MSG_SEGURO, norm };
