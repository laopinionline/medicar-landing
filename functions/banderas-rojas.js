'use strict';
/*
 * MEDICAR IA — ESCANEO DETERMINISTA DE BANDERAS ROJAS (F1 + fix negación). NO usa el modelo.
 * Corre sobre el TEXTO DEL SOCIO y decide —y solo esto decide— si la PWA muestra "Emergencias 443044".
 * PRINCIPIO: error hacia ESCALAR. La supresión por negación es CONSERVADORA: solo cuando la negación es
 * INEQUÍVOCA y ADYACENTE ("no me falta el aire", "ya no me duele el pecho"). Ante CUALQUIER ambigüedad
 * (pero / tanto / no sé / antes sí / un poco…) o si hay otra bandera viva en el mismo mensaje → DISPARA IGUAL.
 */

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Patrones. Ampliados (dolor_pecho/falta_aire) para capturar el síntoma aunque venga hedgeado; la capa de
// negación/ambigüedad decide después. OJO: los que llevan "no" INTRÍNSECO (no puedo respirar) tienen el "no"
// DENTRO del match → nunca se suprimen (el "no" no queda ANTES del match).
const PATRONES = [
  { k: 'desmayo',       re: /desmay|me desvaneci|perd(i|io|ido) (el|del) (conocimiento|sentido)|perdida de(l)? conocimiento|me descompuse y cai/ },
  { k: 'dolor_pecho',   re: /dolor (de|en el|en mi|fuerte en el) ?pecho|due?le.{0,10}pecho|pecho.{0,10}due?le|pecho (apretad|oprimid)|opresion en el pecho|me aprieta el pecho|puntada en el pecho/ },
  { k: 'falta_aire',    re: /no (puedo|podia) respirar|me falta.{0,14}aire|falta de aire|me ahog|dificultad para respirar|me cuesta respirar|no me entra el aire/ },
  { k: 'sangrado',      re: /sangr|hemorragia|perdida de sangre|vomito con sangre|sangre en (la|el|las|los)|escupo sangre/ },
  { k: 'convulsion',    re: /convuls|ataque de epilep|le agarro un ataque/ },
  { k: 'neuro',         re: /no (siento|muevo|puedo mover) (el|la|mi|un) (brazo|pierna|cara|mano|lado)|se me traba la lengua|no puedo hablar|boca torcida|media cara|se me durmio (media|la) cara|paralis/ },
  { k: 'dolor_subito',  re: /dolor (muy fuerte|intenso|insoportable|terrible)( y)? (subito|de golpe|de repente|repentino)|el peor dolor de cabeza|dolor de cabeza (brutal|terrible|insoportable)/ },
  { k: 'inconsciente',  re: /no reacciona|esta inconsciente|no responde|no se despierta|no me responde/ },
  { k: 'autolesion',    re: /me quiero morir|quitarme la vida|suicid|hacerme dano|no quiero vivir/ },
  { k: 'obstetrico',    re: /perdi liquido|rompi bolsa|sangrado en el embarazo|no siento al bebe|contracciones/ },
];

// Marcadores de AMBIGÜEDAD / contraste / duda / hedge: si aparecen junto a una bandera, DISPARA IGUAL (conservador).
const AMBIGUO = /\b(pero|sino|igual|tanto|no se|capaz|creo|medio|mas o menos|antes si|un poco|algo|todavia|aun|a veces|por momentos)\b/;
// Negador LIMPIO y adyacente inmediatamente antes del síntoma ("no me ...", "ya no me ...", "tampoco ...").
const NEG_ADYACENTE = /\b(no|ya no|tampoco|nunca)\s(me\s|te\s|le\s|se\s)?$/;

// Escanea. Devuelve { rojo, matched:[keys] }. Nunca lanza.
function escanear(texto) {
  const t = norm(texto);
  const hits = [];
  for (const p of PATRONES) { const m = p.re.exec(t); if (m) hits.push({ k: p.k, idx: m.index }); }
  if (!hits.length) return { rojo: false, matched: [] };
  // Ambigüedad en cualquier parte del mensaje → NO suprimir nada (error hacia escalar).
  if (AMBIGUO.test(t)) return { rojo: true, matched: hits.map((h) => h.k) };
  // Sin ambigüedad: se suprime SOLO el hit cuya negación es limpia y adyacente. Si algún hit queda vivo → rojo.
  const negadoLimpio = (idx) => NEG_ADYACENTE.test(t.slice(Math.max(0, idx - 16), idx));
  const vivos = hits.filter((h) => !negadoLimpio(h.idx));
  return { rojo: vivos.length > 0, matched: hits.map((h) => h.k) };
}

module.exports = { escanear, norm, PATRONES };
