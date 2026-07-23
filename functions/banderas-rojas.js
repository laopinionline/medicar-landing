'use strict';
/*
 * MEDICAR IA — ESCANEO DETERMINISTA DE BANDERAS ROJAS. NO usa el modelo.
 * Corre sobre el TEXTO DEL SOCIO y decide —y solo esto decide— si la PWA muestra "Emergencias 443044".
 * COBERTURA por PROXIMIDAD + SINÓNIMOS por categoría: raíces morfológicas (dol/duel/doli/apret…) cerca del
 * ANCLA de la categoría (pecho/torax…), en cualquier orden, ventana ~30 chars. El ancla protege las trampas:
 * "presion"/"arde" solo disparan CERCA de "pecho" (no "presion arterial" ni "arde la garganta").
 * CRITERIO: el falso positivo (banner de más) es barato; el falso negativo es carísimo → ante la duda, dispara.
 * La supresión por NEGACIÓN es conservadora: solo negación limpia y adyacente ("no me falta el aire"); ante
 * ambigüedad/contraste dispara igual.
 */

// Normalización EXPLÍCITA antes del match: minúsculas + sin tildes + espacios colapsados (maree=mareé, torax=tórax).
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Proximidad bidireccional: (a cerca de b) | (b cerca de a), ventana W chars (default 30).
function prox(a, b, W) { W = W || 30; return '(?:' + a + ').{0,' + W + '}(?:' + b + ')|(?:' + b + ').{0,' + W + '}(?:' + a + ')'; }

const TORAX = 'pecho|torax|toracic|esternon';                                        // ancla torácica
const MOLESTIA = 'dol|duel|doli|presion|opresion|aprie|apret|arde|ardor|punzad|puntad|quema|quemazon|fuego|opres'; // dolor/molestia (raíces)

// URGENCIA DECLARADA POR TIEMPO (sin síntoma): el socio pide atención médica CON inmediatez → declara una urgencia.
// INMEDIATEZ ("ya/ahora/hoy mismo/urge/no puede esperar") cerca de ATENCIÓN médica ("médico/que lo vea/atiendan/guardia"), ventana 40.
const INMEDIATEZ = 'hoy mismo|\\bhoy\\b|ahora mismo|\\bahora\\b|ya mismo|\\bya\\b|en este momento|urge|no (?:puede|puedo|podemos|aguanta|aguanto) esperar|no da para esperar|de inmediato|inmediat|cuanto antes|lo antes posible|enseguida';
// ATENCIÓN médica a una PERSONA: "médico/médica", "que lo/me vea/n", "(lo/la/me/te/nos) atiend(a/an)". Anclas ESTRECHAS:
// "guardia"/"atiende" SUELTOS (sin pronombre) o "medicamento/medicación" NO cuentan (evita "¿la guardia atiende hoy?").
const ATENCION = 'medic[oa]s?\\b|que (?:lo|la|me|te|nos) vea[n]?|(?:lo|la|me|te|nos) atiend';
// EXCLUSIÓN: consulta de AGENDA / DISPONIBILIDAD / ADMINISTRATIVA → NO es urgencia declarada ("¿pido turno para hoy?",
// "¿hay guardia médica disponible para hoy?", "que me atienda administración").
const EXCL_AGENDA = /\bturno|\bcita|\bagend|\breprogram|\bhorario|\bsobreturno|\bdisponible|\badministr/;
const URGENCIA_DECLARADA = new RegExp(prox(INMEDIATEZ, ATENCION, 40));

const PATRONES = [
  // Dolor/molestia TORÁCICA por proximidad (captura doliendo/presión/arde/apretado + brazo). El ancla evita "presion arterial".
  { k: 'dolor_pecho',   re: new RegExp(prox(TORAX, MOLESTIA)) },
  // Crisis HIPERTENSIVA: presion/tension + lectura de crisis (sistólica ≥18 o diastólica ≥11) o colloquial (por las nubes).
  // NO dispara con lecturas normales (12/8, 14/9) ni con una fecha "19/11" sin la palabra presion cerca.
  { k: 'hipertension',  re: /(presion|tension)[^.]{0,20}((1[89]|[2-3]\d) ?([\/x.-]| sobre ) ?\d{1,3}|\d{1,3} ?([\/x.-]| sobre ) ?(1[1-9]|[2-9]\d))|(presion|tension)[^.]{0,15}(por las nubes|disparad|altisim)/ },
  // Falta de aire / dificultad respiratoria (sinónimos + gerundios).
  { k: 'falta_aire',    re: /no (puedo|podia) respirar|respir.{0,20}(dificultad|cuesta|costando|mal|entrecortad|agitad)|(cuesta|costando|dificultad|trabajo).{0,20}respir|me falta.{0,16}aire|falta de aire|me ahog|me agito|me quedo sin (aire|resuello)|sin aire|no me entra.{0,6}aire|me asfixi/ },
  // Desmayo / pérdida de conocimiento / mareo con caída.
  { k: 'desmayo',       re: /desmay|me desvaneci|perd(i|io|ido) (el|del) (conocimiento|sentido)|perdida de(l)? conocimiento|me descompuse y cai|se me fue la cabeza|casi me caigo|me maree.{0,20}(cai|caig|caer|desmay|piern|piso)|(cai|caig|desplom).{0,20}mare/ },
  // Sangrado / hemorragia.
  { k: 'sangrado',      re: /sangr|hemorragia|perdida de sangre|vomito con sangre|sangre en (la|el|las|los)|escupo sangre|con sangre/ },
  // Convulsión.
  { k: 'convulsion',    re: /convuls|ataque de epilep|le agarro un ataque|se convulsion/ },
  // Neurológico (ACV): fuerza/habla/cara.
  { k: 'neuro',         re: /no (siento|muevo|puedo mover) (el|la|mi|un) (brazo|pierna|cara|mano|lado)|se me traba la lengua|no puedo hablar|boca torcida|media cara|se me (durmio|doblo|torcio|desvio|cayo) (media |la |el )?(cara|lado|boca)|cara (torcid|caid|dormid)|paralis/ },
  // Dolor súbito / cefalea en trueno.
  { k: 'dolor_subito',  re: /(dolor|puntada|punzada) (muy fuerte|intenso|insoportable|terrible)?.{0,25}(subito|de golpe|de repente|repentino)|el peor dolor de cabeza|dolor de cabeza (brutal|terrible|insoportable)|(de golpe|subito).{0,20}(cabeza|dolor|pecho)/ },
  // Inconsciencia (de un tercero, típico).
  { k: 'inconsciente',  re: /no reacciona|esta inconsciente|no responde|no se despierta|no me responde|no reacciona a nada/ },
  { k: 'autolesion',    re: /me quiero morir|quitarme la vida|suicid|hacerme dano|no quiero vivir/ },
  { k: 'obstetrico',    re: /perdi liquido|rompi bolsa|sangrado en el embarazo|no siento al bebe|contracciones/ },
];

// Marcadores de AMBIGÜEDAD / contraste / duda / hedge: si aparecen junto a una bandera, DISPARA IGUAL (conservador).
const AMBIGUO = /\b(pero|sino|igual|tanto|no se|capaz|creo|medio|mas o menos|antes si|un poco|algo|todavia|aun|a veces|por momentos)\b/;
// Negador LIMPIO y adyacente inmediatamente antes del síntoma ("no me ...", "ya no me ...", "tampoco ...").
const NEG_ADYACENTE = /\b(no|ya no|tampoco|nunca)\s(me\s|te\s|le\s|se\s)?$/;

function escanear(texto) {
  const t = norm(texto);
  const hits = [];
  for (const p of PATRONES) { const m = p.re.exec(t); if (m) hits.push({ k: p.k, idx: m.index }); }
  // Urgencia declarada por TIEMPO (sin síntoma): inmediatez + atención médica, SALVO consulta de agenda (turno/cita).
  const mu = URGENCIA_DECLARADA.exec(t);
  if (mu && !EXCL_AGENDA.test(t)) hits.push({ k: 'urgencia_declarada', idx: mu.index });
  if (!hits.length) return { rojo: false, matched: [] };
  if (AMBIGUO.test(t)) return { rojo: true, matched: hits.map((h) => h.k) };
  const negadoLimpio = (idx) => NEG_ADYACENTE.test(t.slice(Math.max(0, idx - 16), idx));
  const vivos = hits.filter((h) => !negadoLimpio(h.idx));
  return { rojo: vivos.length > 0, matched: hits.map((h) => h.k) };
}

module.exports = { escanear, norm, PATRONES, prox };
