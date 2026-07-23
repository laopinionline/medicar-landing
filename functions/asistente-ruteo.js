'use strict';
/*
 * MEDICAR IA — CLASIFICADOR DETERMINISTA de ruteo (modo 'ruteo'). NO usa el modelo. Corre junto al escaneo de banderas.
 * Decide la CATEGORÍA del mensaje; el MAPA categoría→proveedor y la cascada son parametrizables por config (DATA):
 *   - rojo / urgencia_declarada (scan.rojo)                 → claude  (lo delicado va al mejor modelo)
 *   - salud (léxico: síntomas/cuerpo/fármacos/edades…)      → claude
 *   - resto (admin/facturas/planes/agenda/app/fuera de tema)→ ollama
 * Criterio: ante duda de SALUD, mandá a claude (barato el falso positivo salud; caro tratar salud con el 8B).
 */
const { norm } = require('./banderas-rojas');

// LÉXICO de SALUD (benigno + no-rojo). Raíces morfológicas, como banderas. Anclas ESTRECHAS para no pisar lo admin:
// nada de "tengo una…" suelto (pisa "tengo una factura"); "años/nene/abuela…" solo CERCA de un término de salud.
const SALUD = new RegExp([
  'me duele|te duele|le duele|me duelen|duele|doliendo|\\bdolor|dolorid|molest|ardor|\\barde\\b|picaz|comezon|hinch|inflam',
  'fiebre|febril|temperatura|3[789][.,]\\d|3[789]\\s*(grados|de fiebre|de temperatura)|decim|escalofr|tirit',
  '\\btos\\b|mocos|\\bmoco\\b|congesti|resfri|resfrio|gripe|gripal|angina|amigdal|estornud|flema',
  'nausea|nauseas|\\bvomit|diarrea|descompuest|indigest|acidez|reflujo|empach',
  '\\bmareo|maree|mare[oa]d|cansancio|debilidad|fatiga|decaid|malestar|no me siento bien|me siento mal|estoy mal',
  'grano|sarpullido|roncha|alergi|urticaria|erupcion|mancha en la piel|ampolla',
  'torci|torce|esguince|\\bgolpe|golpee|golpeo|\\bcaida|me cai|lastim|moret|raspon|quemadur|\\bcorte\\b|cortadura',
  'paracetamol|ibuprofeno|aspirina|antibiotic|antiinflamatori|antitermic|\\bremedio|pastilla|medicaci|medicament|jarabe|\\bgotas\\b|\\bdosis\\b',
  'que (me )?tomo|que le doy|que puedo tomar|que se toma|tomar algo|algo para el|algo para la|sirve para',
  'presion (alta|arterial)|hipertens|diabet|colesterol|\\basma\\b|migrana|jaqueca|contractur|lumbalgia|cervical|artros|artritis',
  '\\bsintoma|me agarr[oó] (un |una )?(dolor|fiebre|mareo|nausea|tos|resfrio|angina|malestar|dolor|puntada)',
  '(mi |la |el |una |un )(nene|nena|hijo|hija|bebe|beba|nieto|nieta|abuel\\w+|suegr\\w+|madre|padre|\\bmama\\b|\\bpapa\\b|marido|esposa|mujer)\\b.{0,40}(fiebre|dolor|duele|tos|vomit|mocos|descompuest|mal|38|39|4[01]|grados|sintoma|se siente)',
  '\\bde \\d{1,3} años\\b.{0,40}(fiebre|dolor|duele|tos|con\\b|tiene|vomit|mocos|mal|grados)',
].join('|'));

// Categoría del mensaje (usa el resultado del escaneo de banderas para lo rojo).
function clasificar(mensaje, scan) {
  if (scan && scan.rojo) {
    return { categoria: (scan.matched || []).includes('urgencia_declarada') ? 'urgencia' : 'rojo' };
  }
  return { categoria: SALUD.test(norm(mensaje)) ? 'salud' : 'resto' };
}

// MAPA categoría→proveedor + cascada. DEFAULTS en código; config.ruteo.{mapa,cascada} overridea (DATA, sin redeploy).
const MAPA_DEFAULT = { rojo: 'claude', urgencia: 'claude', salud: 'claude', resto: 'ollama' };

// Orden de ramas a intentar (cascada = respaldo mutuo). Devuelve [elegida] o [elegida, otra].
function ramas(categoria, ruteoCfg) {
  const mapa = Object.assign({}, MAPA_DEFAULT, (ruteoCfg && ruteoCfg.mapa) || {});
  const elegida = mapa[categoria] || 'ollama';
  const otra = elegida === 'claude' ? 'ollama' : 'claude';
  const cascada = !ruteoCfg || ruteoCfg.cascada !== false; // default ON (respaldo mutuo)
  return cascada ? [elegida, otra] : [elegida];
}

module.exports = { clasificar, ramas, SALUD, MAPA_DEFAULT };
