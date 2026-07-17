// Smoke Síntoma-con-consentimiento (F1) — el doc derivado copia SOLO nombres de síntomas + relato (nada más del
// crudo), y el consentimiento tiene texto real (invariante).
const { docSintomaReferido, consentSintomasOk, CONSENT_SINTOMAS } = require('../functions/referente');
let ok = 0, fail = 0;
const t = (l, c, x) => { (c ? ok++ : fail++); console.log(`${c ? '✓' : '✗'} ${l}${x !== undefined ? ' → ' + x : ''}`); };

// Reporte crudo con MÁS campos que los que Lucas habilitó (banderaRoja, ids, score, etc.).
const reporte = {
  personaId: 'pTit', personaNombre: 'Pérez, Ana', personaTelefono: '2477000010',
  sintomas: [{ id: 's1', nombre: 'Dolor de pecho', banderaRoja: true }, { id: 's2', nombre: 'Fiebre', banderaRoja: false }],
  texto: 'me duele el pecho desde anoche', tieneBanderaRoja: true, news2Score: 9, creadoEn: 1,
};
const doc = docSintomaReferido(reporte, 100); // ts sin dígitos que colisionen con valores del crudo

// 1) shape: SOLO {sintomas(nombres), texto, actualizadoEn}
const keys = Object.keys(doc).sort();
t('sintoma_referido tiene EXACTAMENTE [actualizadoEn, sintomas, texto]', JSON.stringify(keys) === JSON.stringify(['actualizadoEn', 'sintomas', 'texto']), JSON.stringify(keys));
t('sintomas = solo los NOMBRES (array de strings)', JSON.stringify(doc.sintomas) === JSON.stringify(['Dolor de pecho', 'Fiebre']), JSON.stringify(doc.sintomas));
t('texto = el relato libre', doc.texto === 'me duele el pecho desde anoche');

// 2) ★ NO copia otros campos del crudo (banderaRoja, ids, score, teléfono, nombre)
const serial = JSON.stringify(doc);
// (news2Score:9 se caza por 'news2'; el valor suelto '9' colisiona con el ts, se omite a propósito.)
const NO_DEBEN = ['banderaRoja', 'news2', 'tieneBanderaRoja', 's1', 's2', 'personaTelefono', '2477000010', 'Pérez'];
const filtrados = NO_DEBEN.filter(x => serial.includes(x));
t('★ NO copia banderaRoja/ids/score/teléfono/nombre — solo nombres+relato', filtrados.length === 0, filtrados.length ? '¡FILTRÓ! ' + filtrados.join(',') : 'limpio');

// 3) reporte vacío/sin síntomas → doc seguro
const vacio = docSintomaReferido({}, 1);
t('reporte vacío → sintomas [] y texto ""', Array.isArray(vacio.sintomas) && vacio.sintomas.length === 0 && vacio.texto === '');
t('síntoma sin nombre → se filtra (no strings vacíos)', docSintomaReferido({ sintomas: [{ id: 'x' }, { nombre: 'Tos' }] }, 1).sintomas.length === 1);

// 4) ★ invariante del consentimiento: texto REAL (version>=1 + texto no vacío)
t('★ consentSintomasOk() = true (texto v1 real)', consentSintomasOk() === true);
t('CONSENT_SINTOMAS.version === 1', CONSENT_SINTOMAS.version === 1);
t('CONSENT_SINTOMAS.texto no vacío + menciona revocar', CONSENT_SINTOMAS.texto.length > 50 && /revocar/i.test(CONSENT_SINTOMAS.texto));

console.log(`\n${ok}/${ok + fail} checks OK`);
process.exit(fail ? 1 : 0);
