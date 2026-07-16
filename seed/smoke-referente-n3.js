// Smoke Referente R1 — N3: el doc derivado estado_referido NUNCA lleva un campo clínico crudo, y la traducción
// a lenguaje humano no filtra severidad/síntoma/score. Prueba el núcleo PURO (functions/referente.js).
const { PONDERACIONES, docEstadoReferido, frasePonderacion, generarCodigo, esFormatoCodigo, CODE_ALFABETO } = require('../functions/referente');
let ok = 0, fail = 0;
const t = (l, c, x) => { (c ? ok++ : fail++); console.log(`${c ? '✓' : '✗'} ${l}${x !== undefined ? ' → ' + x : ''}`); };

// ── un reporte de síntomas CRUDO, con toda la basura clínica que NO debe cruzar ──
const reporteCrudo = {
  personaId: 'pTitular',
  personaNombre: 'DEMO, Titular', personaTelefono: '2477000002',
  sintomas: [{ id: 's1', nombre: 'Dolor de pecho', banderaRoja: true }],
  texto: 'me duele mucho el pecho desde anoche',
  tieneBanderaRoja: true,
  news2Score: 9, news2Nivel: 'alto', nivel: 'ROJO', score: 9, severidad: 'grave',
  creadoEn: 12345,
};
// Marcadores crudos INEQUÍVOCOS (a propósito NO incluyo 'sintomas' ni '9': colisionan como substring con el
// valor legítimo del enum 'con_sintomas' y con el timestamp — el doc derivado LEGÍTIMAMENTE contiene esos).
const CLINICOS = ['texto', 'tieneBanderaRoja', 'news2Score', 'news2Nivel', 'severidad', 'banderaRoja',
  'personaNombre', 'personaTelefono', 'Dolor', 'pecho', 'ROJO', 'grave'];

// ── La derivación de la CF: SOLO existencia → 'con_sintomas'. Lee el personaId, ignora TODO lo demás. ──
function derivarComoLaCF(reporte) {
  const personaId = reporte && reporte.personaId; // ← lo ÚNICO que la CF lee del crudo
  return { personaId, doc: docEstadoReferido('con_sintomas', 999 /* ts server simulado */) };
}
const { doc } = derivarComoLaCF(reporteCrudo);

// 1) shape cerrado: EXACTAMENTE {ponderacion, actualizadoEn}
const keys = Object.keys(doc).sort();
t('estado_referido tiene EXACTAMENTE [actualizadoEn, ponderacion]', JSON.stringify(keys) === JSON.stringify(['actualizadoEn', 'ponderacion']), JSON.stringify(keys));
t('ponderacion ∈ {sin_sintomas, con_sintomas}', PONDERACIONES.includes(doc.ponderacion), doc.ponderacion);

// 2) ★ NINGÚN campo/valor clínico crudo aparece en el doc derivado
const serial = JSON.stringify(doc);
const filtrados = CLINICOS.filter(c => serial.includes(c));
t('★ estado_referido NO contiene NINGÚN campo/valor clínico crudo', filtrados.length === 0, filtrados.length ? '¡FILTRÓ! ' + filtrados.join(',') : 'limpio');

// 3) docEstadoReferido es fail-closed: rechaza valores fuera del enum (no escribe basura)
let lanzó = false; try { docEstadoReferido('rojo', 1); } catch (_) { lanzó = true; }
t('docEstadoReferido rechaza un valor fuera del enum (fail-closed)', lanzó);

// 4) ★ la traducción a humano NO filtra nada clínico, en ninguno de los dos valores
for (const p of PONDERACIONES) {
  const frase = frasePonderacion(p);
  const leak = CLINICOS.filter(c => frase.includes(c));
  t(`★ frasePonderacion('${p}') sin nada clínico`, leak.length === 0, leak.length ? '¡FILTRÓ! ' + leak.join(',') : `"${frase}"`);
}
t("frasePonderacion('sin_sintomas') = 'No se reportaron síntomas.'", frasePonderacion('sin_sintomas') === 'No se reportaron síntomas.');
t("frasePonderacion('con_sintomas') habla de síntomas SIN severidad", /reportaron síntomas/.test(frasePonderacion('con_sintomas')) && !/grave|rojo|alto|score/i.test(frasePonderacion('con_sintomas')));

// 5) formato del código: legible, sin caracteres ambiguos
const cod = generarCodigo((n) => n - 1); // determinista: siempre el último char del alfabeto
t('generarCodigo da forma MED-XXXXXX', /^MED-.{6}$/.test(cod), cod);
t('esFormatoCodigo acepta el generado', esFormatoCodigo(cod));
t('el alfabeto NO tiene ambiguos (0/O/1/I/L)', !/[01OIL]/.test(CODE_ALFABETO));
t('esFormatoCodigo rechaza basura', !esFormatoCodigo('MED-000000') && !esFormatoCodigo('hola') && !esFormatoCodigo(''));

console.log(`\n${ok}/${ok + fail} checks OK`);
process.exit(fail ? 1 : 0);
