'use strict';
/*
 * MEDICAR IA — ESCANEO DETERMINISTA DE BANDERAS ROJAS (F1). NO usa el modelo.
 * Corre sobre el TEXTO DEL SOCIO y decide —y solo esto decide— si la PWA muestra "Emergencias 443044".
 * El [[ESCALAR]] del modelo es señal SECUNDARIA; el trigger de urgencia es esto, código auditable y mantenible.
 * Se mantiene editando PATRONES + el smoke (seed/smoke-banderas-rojas.js). Error hacia ESCALAR (falsos positivos OK).
 */

// Normaliza: minúsculas, sin acentos, colapsa espacios. (Español rioplatense; "ñ" se preserva no importa.)
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Patrones curados por categoría. Regex sobre texto normalizado. Amplios a propósito (mejor derivar de más).
const PATRONES = [
  { k: 'desmayo',       re: /desmay|me desvaneci|perd(i|io|ido) (el|del) (conocimiento|sentido)|perdida de(l)? conocimiento|me descompuse y cai/ },
  { k: 'dolor_pecho',   re: /dolor (de|en el|en mi|fuerte en el) ?pecho|pecho (apretad|oprimid)|opresion en el pecho|me aprieta el pecho|puntada en el pecho/ },
  { k: 'falta_aire',    re: /no (puedo|podia) respirar|me falta el aire|falta de aire|me ahog|dificultad para respirar|me cuesta respirar|no me entra el aire/ },
  { k: 'sangrado',      re: /sangr|hemorragia|perdida de sangre|vomito con sangre|sangre en (la|el|las|los)|escupo sangre/ },
  { k: 'convulsion',    re: /convuls|ataque de epilep|le agarro un ataque/ },
  { k: 'neuro',         re: /no (siento|muevo|puedo mover) (el|la|mi|un) (brazo|pierna|cara|mano|lado)|se me traba la lengua|no puedo hablar|boca torcida|media cara|se me durmio (media|la) cara|paralis/ },
  { k: 'dolor_subito',  re: /dolor (muy fuerte|intenso|insoportable|terrible)( y)? (subito|de golpe|de repente|repentino)|el peor dolor de cabeza|dolor de cabeza (brutal|terrible|insoportable)/ },
  { k: 'inconsciente',  re: /no reacciona|esta inconsciente|no responde|no se despierta|no me responde/ },
  { k: 'autolesion',    re: /me quiero morir|quitarme la vida|suicid|hacerme dano|no quiero vivir/ },
  { k: 'obstetrico',    re: /perdi liquido|rompi bolsa|sangrado en el embarazo|no siento al bebe|contracciones/ },
];

// Escanea el texto. Devuelve { rojo:boolean, matched:[keys] }. Nunca lanza.
function escanear(texto) {
  const t = norm(texto);
  const matched = [];
  for (const p of PATRONES) { if (p.re.test(t)) matched.push(p.k); }
  return { rojo: matched.length > 0, matched };
}

module.exports = { escanear, norm, PATRONES };
