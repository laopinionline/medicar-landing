// Smoke R3 — el push al referente es GENÉRICO: 🚩 INVARIANTE = TEXTO_R3 NO contiene síntomas ni NADA de salud.
// El push aparece en la lockscreen (visible sin abrir la app, sin gate de quién mira) → nunca dato de salud ahí.
// Este smoke FALLA si alguien mete el síntoma/salud en el texto del push. El síntoma se ve al abrir, vía la CF que loguea.
const { TEXTO_R3 } = require('../functions/referente');
let ok = 0, fail = 0;
const t = (l, c, x) => { (c ? ok++ : fail++); console.log(`${c ? '✓' : '✗'} ${l}${x !== undefined ? ' → ' + x : ''}`); };

// Shape mínimo para el push (title + body, como pushATurno).
t('TEXTO_R3 tiene title + body (string no vacío)', typeof TEXTO_R3.title === 'string' && TEXTO_R3.title.length > 0 && typeof TEXTO_R3.body === 'string' && TEXTO_R3.body.length > 0);

// ★ El invariante: NADA de salud en el texto. Lista de términos clínicos/de salud que JAMÁS deben aparecer.
const serial = JSON.stringify(TEXTO_R3).toLowerCase();
// (NO incluir 'medic' — colisiona con la marca "MEDICAR" del title; se usa 'medicament'/'médic' para medicamento/médico.)
const SALUD = ['sintoma', 'síntoma', 'dolor', 'fiebre', 'pecho', 'cabeza', 'tos', 'presion', 'presión', 'mareo',
  'nausea', 'náusea', 'sangr', 'bandera', 'grave', 'urgente', 'emergencia', 'diagn', 'medicament', 'médic', 'salud', 'relato'];
const leak = SALUD.filter((s) => serial.includes(s));
t('★ TEXTO_R3 NO contiene NINGÚN término de salud (push genérico)', leak.length === 0, leak.length ? '¡FILTRÓ! ' + leak.join(',') : 'genérico, sin salud');

// Es genérico de verdad: menciona "abrí la app" (el síntoma se ve AL ABRIR, no en el push).
t('el texto invita a ABRIR la app (el contenido vive en la app, logueado)', /abr[ií].*app|abrila|abrí la app/i.test(TEXTO_R3.body));

console.log(`\n${ok}/${ok + fail} checks OK`);
process.exit(fail ? 1 : 0);
