'use strict';
// Smoke — asistente-prompt.js: buildContexto (MÍNIMO, nunca PII/clínico), stripEscalar, parseBotones.
const { SYSTEM, buildContexto, stripEscalar, parseBotones } = require('../functions/asistente-prompt');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// --- CONTEXTO: incluye lo mínimo ---
const ctx = buildContexto({
  nombre: 'Juan',
  plan: { nombre: 'Individual', precio: 18000 }, cubre: ['emergencias', 'urgencias'],
  factura: { monto: 18000, vence: '05/08' },
  planes: [{ nombre: 'Individual', precio: 18000 }, { nombre: 'Familiar', precio: 28000 }],
  tel: '443044',
});
t('contexto trae el nombre', ctx.includes('Juan'));
t('contexto trae plan + precio', ctx.includes('Individual') && ctx.includes('18000'));
t('contexto trae qué cubre', ctx.includes('emergencias'));
t('contexto trae factura + vencimiento', ctx.includes('18000') && ctx.includes('05/08'));
t('contexto trae catálogo (Familiar)', ctx.includes('Familiar') && ctx.includes('28000'));
t('contexto trae 443044', ctx.includes('443044'));

// --- CONTEXTO: NUNCA filtra PII / clínico (aunque se lo pasen de más, buildContexto solo usa campos conocidos) ---
const ctx2 = buildContexto({ nombre: 'Ana', dni: '30111222', historiaClinica: 'diabetes, hipertensión', personaId: 'p1', plan: null, factura: null, planes: [], tel: '443044' });
t('contexto NO incluye DNI', !ctx2.includes('30111222'));
t('contexto NO incluye historia clínica', !/diabetes|hipertensi/i.test(ctx2));
t('contexto NO incluye personaId', !ctx2.includes('p1'));
t('sin plan → "sin plan asignado"', ctx2.includes('sin plan asignado'));
t('sin factura → "sin deuda pendiente"', ctx2.includes('sin deuda pendiente'));

// --- SYSTEM prompt: reglas duras presentes ---
t('SYSTEM: dosis puntual NO, tipo de medicación SÍ (útil, no candado)', /DOSIS puntual/.test(SYSTEM) && /medicación en general SÍ/.test(SYSTEM));
t('SYSTEM: explica conceptos (no se lava las manos)', /EXPLICÁS con soltura/.test(SYSTEM) && /Explicar conceptos y cuadros en general SÍ/.test(SYSTEM));
t('SYSTEM: no afirma enfermedad a la persona (no es "no diagnostico" a secas)', /No le AFIRMÁS a ESTA persona/.test(SYSTEM));
t('SYSTEM: orienta y CIERRA sin derivar por reflejo', /ORIENTÁS Y CERRÁS/.test(SYSTEM) && /NO mandes al médico en cada mensaje/.test(SYSTEM));
t('SYSTEM define la etiqueta [[ESCALAR]]', SYSTEM.includes('[[ESCALAR]]'));
t('SYSTEM: no ejecuta acciones', /NO EJECUTÁS ACCIONES/.test(SYSTEM));
t('SYSTEM (fix 3): 443044 SOLO emergencias, no turnos ni molestias leves', /443044 = EMERGENCIAS MÉDICAS/.test(SYSTEM) && /NUNCA para turnos/.test(SYSTEM) && /molestias leves/.test(SYSTEM));
t('SYSTEM: PRIORIDAD ABSOLUTA de bandera roja intacta (firme)', /PRIORIDAD ABSOLUTA/.test(SYSTEM) && /esto no se negocia/.test(SYSTEM));
t('SYSTEM (fix 1): regla de retractación de síntomas', /CORRIGE o DESMIENTE un síntoma/.test(SYSTEM));

// --- stripEscalar ---
const s1 = stripEscalar('Eso conviene verlo con un médico ahora.\n[[ESCALAR]]');
t('strip: saca la etiqueta del texto visible', !s1.texto.includes('[[ESCALAR]]'));
t('strip: reporta tag=true', s1.tag === true);
const s2 = stripEscalar('Tu plan cubre emergencias.');
t('strip: sin etiqueta → tag=false, texto intacto', s2.tag === false && s2.texto === 'Tu plan cubre emergencias.');

// --- parseBotones (whitelist) ---
const b = parseBotones('Te conviene el Familiar. [Cambiar mi plan] o mirá [Ver comprobantes].');
t('parseBotones: detecta Cambiar mi plan', b.some((x) => x.accion === 'plan'));
t('parseBotones: detecta Ver comprobantes', b.some((x) => x.accion === 'comprobantes'));
t('parseBotones: ignora texto fuera de whitelist', !b.some((x) => x.label === '[Hackear]'));

console.log(`\n${fail ? '✗' : '✓'} smoke-asistente-contexto: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
