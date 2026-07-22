'use strict';
// Smoke — asistente-prompt.js: buildContexto (MÍNIMO, nunca PII/clínico), stripEscalar, parseBotones.
const { SYSTEM, buildContexto, stripEscalar, parseBotones, limpiarBotonesDelTexto } = require('../functions/asistente-prompt');
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

// --- AJUSTE: facturación EXPLÍCITA (afirma ausencia + última factura; el precio del plan NO es deuda) ---
const ctxPagada = buildContexto({ nombre: 'Juan', plan: { nombre: 'Plan 01', precio: 18000 }, cubre: ['emergencias'], factura: null, ultimaFactura: { nro: 'FC-2026-000010', estado: 'pagada' }, planes: [], tel: '443044' });
t('sin pendiente: afirma "NO debés nada"', /NO tenés ninguna factura pendiente\. NO debés nada/.test(ctxPagada));
t('sin pendiente: nombra la última PAGADA con su nº', /FC-2026-000010/.test(ctxPagada) && /PAGADA/.test(ctxPagada));
t('sin pendiente: NO dice "pendiente de $"', !/pendiente de \$/.test(ctxPagada));
t('plan: aclara que la cuota NO es deuda', /PRECIO DEL PLAN, NO una deuda/.test(ctxPagada));
const ctxSinFac = buildContexto({ nombre: 'Ana', plan: null, factura: null, ultimaFactura: null, planes: [], tel: '443044' });
t('sin facturas: "No hay facturas registradas todavía"', /No hay facturas registradas todavía/.test(ctxSinFac));

// --- AJUSTE: strip robusto de tokens de botón en la prosa ---
t('limpia [Cambiar mi plan] de la prosa', limpiarBotonesDelTexto('Te conviene el Familiar. [Cambiar mi plan]') === 'Te conviene el Familiar.');
t('limpia [[control]] residual', limpiarBotonesDelTexto('Ok [[ESCALAR]] listo') === 'Ok listo');
t('limpia varios tokens y no deja espacios dobles', /\[/.test(limpiarBotonesDelTexto('Mirá [Ver comprobantes] o [Pagar] .')) === false);
t('no toca texto sin tokens', limpiarBotonesDelTexto('Tu plan cubre emergencias.') === 'Tu plan cubre emergencias.');

// --- AJUSTE: reglas nuevas en el SYSTEM ---
t('SYSTEM: nunca afirma deudas que el contexto no trae', /NUNCA afirmes deudas ni importes que el contexto no traiga/.test(SYSTEM));
t('SYSTEM: plan es COMERCIAL, no deriva a médico', /Cambiar o elegir un plan es un tema COMERCIAL/.test(SYSTEM) && /NUNCA lo derives a un médico/.test(SYSTEM));

// --- CONTEXTO: NUNCA filtra PII / clínico (aunque se lo pasen de más, buildContexto solo usa campos conocidos) ---
const ctx2 = buildContexto({ nombre: 'Ana', dni: '30111222', historiaClinica: 'diabetes, hipertensión', personaId: 'p1', plan: null, factura: null, planes: [], tel: '443044' });
t('contexto NO incluye DNI', !ctx2.includes('30111222'));
t('contexto NO incluye historia clínica', !/diabetes|hipertensi/i.test(ctx2));
t('contexto NO incluye personaId', !ctx2.includes('p1'));
t('sin plan → "sin plan asignado"', ctx2.includes('sin plan asignado'));
t('sin factura → afirma "NO debés nada"', ctx2.includes('NO debés nada'));

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
