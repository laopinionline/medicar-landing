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

const { neutralizarEmergencia } = require('../functions/asistente-guardrail');
console.log('\n— NEUTRALIZAR 443044 cuando rojo=false (determinista) —');
const neu = (l, texto, rojo, expect) => { const r = neutralizarEmergencia(texto, rojo); const c = expect(r); console.log(`${c ? '✓' : '✗ FALLO'} ${l}${c ? '' : ' → ' + JSON.stringify(r)}`); c ? ok++ : fail++; };
// rojo=true → NO toca (emergencia real)
neu('rojo=true: conserva el 443044', 'Convendría verlo ya. Llamá al 443044.', true, r => !r.cambiado && /443044/.test(r.texto));
// rojo=false + 443044 como cierre benigno → dropea la frase + redirige
neu('rojo=false: dropea la frase del 443044', 'Para la panza, descansá e hidratate. Por favor, llama a Emergencias 443044.', false, r => r.cambiado && !/443044/.test(r.texto) && /turno|médico/i.test(r.texto));
neu('rojo=false: conserva la orientación benigna', 'Para la panza, descansá e hidratate. Por favor, llama a Emergencias 443044.', false, r => /descansá|hidratate/i.test(r.texto));
// rojo=false + "cubre emergencias" (cobertura, SIN número) → NO toca
neu('rojo=false: NO toca "cubre emergencias" (cobertura)', 'Tu plan cubre emergencias, urgencias y consultas.', false, r => !r.cambiado && /cubre emergencias/.test(r.texto));
// rojo=false + sin 443044 → no-op
neu('rojo=false: sin 443044 → no cambia', 'Podés pedir un turno desde la app. [Pedir turno]', false, r => !r.cambiado);
// rojo=false + respuesta SOLO emergencia → queda el redirect
neu('rojo=false: respuesta solo-emergencia → redirect', 'Llamá al 443044 ahora.', false, r => r.cambiado && !/443044/.test(r.texto) && /turno|médico/i.test(r.texto));
// rojo=false + 443044 INCONDICIONAL + ya menciona turno → strip sin duplicar el cierre
neu('rojo=false: 443044 incondicional + ya tiene turno → strip sin duplicar', 'Pedí un turno desde la app. Igual, llamá al 443044.', false, r => r.cambiado && !/443044/.test(r.texto) && (r.texto.match(/turno/gi) || []).length === 1);
// rojo=false + 443044 CONDICIONAL (umbral del modo consultorio) → se CONSERVA (red de seguridad), no se toca
neu('rojo=false: 443044 condicional (umbral) → intacto', 'Dale paracetamol y reposo. Si le cuesta respirar o no le baja la fiebre, llamá al 443044.', false, r => !r.cambiado && /443044/.test(r.texto));

console.log(`\n${fail ? '✗' : '✓'} smoke-asistente-guardrail: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
