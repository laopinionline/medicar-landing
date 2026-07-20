'use strict';
/* Smoke — Turnos Fase B (asistencia). Núcleo puro functions/asistencia.js: transiciones (válidas/ inválidas + ventana
 * de deshacer 48hs) y el barrido (>=2 días → sin_registrar). node seed/smoke-asistencia.js */
const { puedeMarcar, debeBarrer, dentroDeGracia, GRACE_MS } = require('../functions/asistencia');
let ok = 0, fail = 0;
const eq = (l, got, exp) => { const p = JSON.stringify(got) === JSON.stringify(exp); console.log(`${p ? '✓' : '✗ FALLO'} ${l}${p ? '' : `  → ${JSON.stringify(got)} != ${JSON.stringify(exp)}`}`); p ? ok++ : fail++; };
const AHORA = 1_000_000_000_000; // ms fijo
const hace = (h) => AHORA - h * 3600 * 1000;

console.log('\npuedeMarcar — primera marca');
eq('creado → atendido',            puedeMarcar('creado', 'atendido', null, AHORA), { ok: true });
eq('creado → ausente',             puedeMarcar('creado', 'ausente', null, AHORA), { ok: true });
eq('creado → creado (nada que deshacer)', puedeMarcar('creado', 'creado', null, AHORA), { ok: false, motivo: 'nada-que-deshacer' });
eq('sin_registrar → atendido (marca tardía)', puedeMarcar('sin_registrar', 'atendido', null, AHORA), { ok: true });
eq('resultado inválido',           puedeMarcar('creado', 'cancelado', null, AHORA), { ok: false, motivo: 'resultado-invalido' });
eq('cancelado terminal',           puedeMarcar('cancelado', 'atendido', null, AHORA), { ok: false, motivo: 'cancelado-terminal' });

console.log('\npuedeMarcar — deshacer/corregir (ventana 48hs)');
eq('atendido → ausente dentro de 48hs (hace 10h)',  puedeMarcar('atendido', 'ausente', hace(10), AHORA), { ok: true });
eq('atendido → creado dentro de 48hs (deshacer)',   puedeMarcar('atendido', 'creado', hace(1), AHORA), { ok: true });
eq('ausente → atendido dentro de 48hs',             puedeMarcar('ausente', 'atendido', hace(47), AHORA), { ok: true });
eq('atendido → ausente FUERA de 48hs (hace 49h)',   puedeMarcar('atendido', 'ausente', hace(49), AHORA), { ok: false, motivo: 'fuera-de-gracia' });
eq('borde exacto 48hs → permitido',                 puedeMarcar('atendido', 'creado', AHORA - GRACE_MS, AHORA), { ok: true });
eq('atendido sin marcadoEn → sin-marca',            puedeMarcar('atendido', 'ausente', null, AHORA), { ok: false, motivo: 'sin-marca' });

console.log('\ndentroDeGracia');
eq('hace 10h → true',  dentroDeGracia(hace(10), AHORA), true);
eq('hace 49h → false', dentroDeGracia(hace(49), AHORA), false);
eq('sin marca → false', dentroDeGracia(null, AHORA), false);

console.log('\ndebeBarrer (>= 2 días atrás → sin_registrar)');
eq('hoy → NO',                debeBarrer('2026-07-20', '2026-07-20'), false);
eq('ayer (1 día) → NO (gracia)', debeBarrer('2026-07-19', '2026-07-20'), false);
eq('anteayer (2 días) → SÍ',  debeBarrer('2026-07-18', '2026-07-20'), true);
eq('hace 5 días → SÍ',        debeBarrer('2026-07-15', '2026-07-20'), true);
eq('futuro → NO',             debeBarrer('2026-07-25', '2026-07-20'), false);
eq('fecha mal formada → NO',  debeBarrer('2026-7-1', '2026-07-20'), false);

console.log(`\n${fail ? '✗' : '✓'} smoke-asistencia: ${ok} ok, ${fail} fallo(s)\n`);
process.exit(fail ? 1 : 0);
