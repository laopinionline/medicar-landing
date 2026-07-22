'use strict';
// Smoke — asistente-guardrail.js. Bloquea (fármaco+dosis) y (diagnóstico afirmativo); deja pasar lo legítimo.
const { revisar, MSG_SEGURO } = require('../functions/asistente-guardrail');
let ok = 0, fail = 0;
const bloquea = (l, txt, motivo) => { const r = revisar(txt); const c = !r.ok && r.motivo === motivo && r.respuesta === MSG_SEGURO; console.log(`${c ? '✓' : '✗ FALLO'} bloquea ${l}${c ? '' : ' → ' + JSON.stringify(r)}`); c ? ok++ : fail++; };
const pasa = (l, txt) => { const r = revisar(txt); const c = r.ok && r.respuesta === txt; console.log(`${c ? '✓' : '✗ FALLO'} pasa    ${l}${c ? '' : ' → ' + JSON.stringify(r)}`); c ? ok++ : fail++; };

console.log('\n— BLOQUEA —');
bloquea('fármaco + dosis (ibuprofeno 400mg)', 'Podés tomar ibuprofeno 400 mg cada 8 horas.', 'farmaco_dosis');
bloquea('antibiótico + posología', 'Te conviene amoxicilina, una cápsula cada 12 hs.', 'farmaco_dosis');
bloquea('diagnóstico afirmativo (infarto)', 'Por lo que contás, es un infarto. Andá a la guardia.', 'diagnostico');
bloquea('diagnóstico (tenés neumonía)', 'Tenés neumonía, hay que tratarla.', 'diagnostico');

console.log('\n— PASA (legítimo) —');
pasa('orientación general', 'Descansá, tomá líquidos y si empeora pedí un turno. [Pedir turno]');
pasa('escalada', 'Eso conviene que lo vea un médico ahora. [[ESCALAR]]');
pasa('admin plan', 'Tu plan Individual cubre emergencias, urgencias y consultas. [Ver comprobantes]');
pasa('menciona médico sin recetar', 'No te puedo indicar remedios; te sugiero verlo con un médico.');
pasa('nombra fármaco SIN dosis (no es indicación)', 'No te voy a decir si tomar ibuprofeno; consultá al médico.');

console.log(`\n${fail ? '✗' : '✓'} smoke-asistente-guardrail: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
