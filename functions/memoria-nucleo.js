'use strict';
/*
 * MEDICAR IA — MEMORIA POR SOCIO (núcleo puro, testeable por smoke).
 * Doc asistente_memoria/{personaId} — SOLO lo escribe la CF (Admin SDK); ningún cliente lo lee/pisa.
 *
 * Estructura ACOTADA (no texto libre): 4 arrays con largo máximo por ítem y capeo de cantidad. El resumidor
 * (SIEMPRE claude) propone JSON; la CF lo pasa por validarMemoria() ANTES de escribir → el modelo no puede
 * inyectar claves, scores ni clasificaciones internas (N3: guardamos lo que el socio dijo/consultó, jamás niveles).
 */

// Límites por campo (Lucas): temas ≤10·t≤80 · seguimientos ≤5·t≤120 · pendientes ≤5·t≤120 · preferencias ≤5·t≤100.
const LIMITES = {
  temas:        { cap: 10, max: 80,  fecha: 'fecha' },
  seguimientos: { cap: 5,  max: 120, fecha: 'desde' },
  pendientes:   { cap: 5,  max: 120, fecha: 'desde' },
  preferencias: { cap: 5,  max: 100, fecha: null },
};
const CAMPOS = Object.keys(LIMITES);

const esFechaISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const limpiarTexto = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

// Convierte una PROPUESTA cruda (del modelo) en el doc canónico. Determinista: solo los 4 arrays conocidos,
// trunca texto, capea cantidad, normaliza fechas (default = `hoy`), descarta ítems vacíos y CUALQUIER clave extra
// (p.ej. score/nivel/categoria que el modelo intente colar). `hoy` = 'YYYY-MM-DD' (lo pasa la CF en hora AR).
function validarMemoria(propuesta, hoy) {
  const H = esFechaISO(hoy) ? hoy : '';
  const p = (propuesta && typeof propuesta === 'object') ? propuesta : {};
  const out = {};
  for (const campo of CAMPOS) {
    const { cap, max, fecha } = LIMITES[campo];
    const arr = Array.isArray(p[campo]) ? p[campo] : [];
    const items = [];
    for (const raw of arr) {
      if (items.length >= cap) break;
      const src = (raw && typeof raw === 'object') ? raw : { t: raw };
      const t = limpiarTexto(src.t, max);
      if (!t) continue;                                  // sin texto real → fuera
      const item = { t };
      if (fecha) item[fecha] = esFechaISO(src[fecha]) ? src[fecha] : H; // solo fecha ISO; si no, hoy
      items.push(item);                                  // NADA más entra: sin scores/niveles/claves extra
    }
    out[campo] = items;
  }
  return out;
}

// ¿La memoria validada tiene ALGO? (para no escribir/injectar vacío).
function tieneContenido(mem) {
  return !!mem && CAMPOS.some((c) => Array.isArray(mem[c]) && mem[c].length > 0);
}

// ESCANEO DETERMINISTA de pedido de OLVIDO. Imperativo dirigido a la CONVERSACIÓN/memoria (no a un turno ni a otra
// cosa). Sin falsos positivos con "me olvidé de..." / "olvidé mi contraseña" (esos no son imperativos de borrado).
// Match → la CF borra el doc ENTERO (over-delete seguro, decisión Lucas).
// Conector CORTO entre el verbo y el objeto (no comodín largo) → sin cruzar cláusulas. "olvidate de tomar la
// pastilla, es todo por hoy" NO matchea (tras "olvidate de " viene "tomar", que no es objeto de conversación).
const RE_OLVIDO = new RegExp(
  '(' +
    // "olvidate/olvidá (de/que) <esto|todo esto|lo que hablamos|la conversación|el historial|la memoria>"
    'olvid[aá](?:te|lo|l[ao]s)?\\s+(?:de\\s+|que\\s+)?(esto|eso|todo esto|lo que (?:hablamos|charlamos|dije|te dije|te cont[eé])|todo lo que (?:hablamos|dije)|la charla|la conversaci[oó]n|el historial|la memoria)' +
  '|' +
    // "borrá/borrame/eliminá (de) <lo que hablamos|la charla|el historial|la memoria|esto>"
    '(?:borr[aá](?:me|lo|l[ao]s)?|elimin[aá])\\s+(?:de\\s+)?(esto|eso|lo que (?:hablamos|charlamos|dije|te dije|te cont[eé])|todo lo que (?:hablamos|dije)|la charla|la conversaci[oó]n|el historial|la memoria)' +
  '|' +
    // "no (te) acuerdes de esto / lo que hablamos"
    'no (?:te )?acuerd(?:es|e)\\s+(?:de\\s+)?(esto|eso|nada de esto|lo que (?:hablamos|dije))' +
  ')', 'i');
function escanearOlvido(mensaje) { return RE_OLVIDO.test(String(mensaje || '')); }

// SYSTEM del RESUMIDOR (SIEMPRE claude). Salida = SOLO un JSON con la estructura; distila lo que el SOCIO dijo/pidió,
// fusiona con la memoria previa (cierra lo resuelto, conserva lo abierto), NUNCA scores/diagnósticos/clasificaciones.
const SYSTEM_RESUMIDOR = `Sos el memorizador del asistente de MEDICAR. Recibís la MEMORIA PREVIA del socio (JSON) y el TRANSCRIPT de la última charla. Devolvé SOLO un JSON con la memoria ACTUALIZADA — sin texto antes ni después, sin \`\`\`.

Estructura EXACTA (solo estas claves; arrays; cada texto corto y en 3ª persona sobre el socio):
{
 "temas":        [{"t":"tema que consultó","fecha":"AAAA-MM-DD"}],
 "seguimientos": [{"t":"algo de salud abierto a seguir","desde":"AAAA-MM-DD"}],
 "pendientes":   [{"t":"trámite/pedido/deseo administrativo pendiente","desde":"AAAA-MM-DD"}],
 "preferencias": [{"t":"preferencia de TRATO o comunicación (ej. prefiere que le hablen de usted)"}]
}

REGLAS:
- Guardá SOLO lo que el socio DIJO o CONSULTÓ (síntomas que contó, trámites que pidió, preferencias que expresó). Memoria COMPLETA: administrativa Y de salud.
- "preferencias" es SOLO para preferencias de TRATO/COMUNICACIÓN (cómo quiere que le hablen). Un DESEO o TRÁMITE (ej. "quiere pasar al plan Familiar") va en "pendientes", NUNCA en "preferencias". No dupliques el mismo ítem en dos campos.
- FUSIONÁ con la memoria previa: conservá lo que sigue abierto, sacá lo ya resuelto, no dupliques.
- Textos BREVES y concretos (una línea). Usá la fecha de hoy que te paso para lo nuevo.
- PROHIBIDO: diagnósticos, niveles de gravedad, scores, clasificaciones internas, datos de terceros, números de factura/DNI. Nada de eso va a la memoria.
- Si no hay nada digno de recordar, devolvé todos los arrays vacíos.
Devolvé ÚNICAMENTE el JSON.`;

// Arma el mensaje de usuario del resumidor: memoria previa + transcript + fecha de hoy.
function promptResumen(memPrevia, historia, hoy) {
  const prev = JSON.stringify(memPrevia && typeof memPrevia === 'object' ? memPrevia : {});
  const turnos = (Array.isArray(historia) ? historia : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => (m.role === 'user' ? 'SOCIO' : 'ASISTENTE') + ': ' + String(m.content).replace(/\s+/g, ' ').trim())
    .join('\n');
  return 'HOY: ' + String(hoy || '') + '\nMEMORIA PREVIA:\n' + prev + '\n\nTRANSCRIPT:\n' + turnos + '\n\nDevolvé el JSON de la memoria actualizada.';
}

// Extrae el primer objeto JSON de la salida del modelo y lo valida. Falla suave → null (la CF NO escribe).
function parseResumen(texto, hoy) {
  const s = String(texto || '');
  const i = s.indexOf('{'); const j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  let obj;
  try { obj = JSON.parse(s.slice(i, j + 1)); } catch (_) { return null; }
  return validarMemoria(obj, hoy);
}

module.exports = { validarMemoria, tieneContenido, escanearOlvido, SYSTEM_RESUMIDOR, promptResumen, parseResumen, LIMITES, CAMPOS };
