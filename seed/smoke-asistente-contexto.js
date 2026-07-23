'use strict';
// Smoke — asistente-prompt.js: buildContexto (MÍNIMO, nunca PII/clínico), stripEscalar, parseBotones.
const { SYSTEM, buildContexto, stripEscalar, parseBotones, limpiarBotonesDelTexto, voseoAr } = require('../functions/asistente-prompt');
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
t('contexto trae catálogo REAL (Joven/Familiar/Senior personales)', /Plan Joven \$20\.000/.test(ctx) && /Plan Familiar desde \$40\.000/.test(ctx) && /Plan Senior \$60\.000/.test(ctx));
t('catálogo: Área Protegida y Corporativo NO personales (derivar comercial)', /Área Protegida.*por LOCAL/.test(ctx) && /NO son planes personales/.test(ctx) && /Corporativo/.test(ctx));
t('catálogo: Familiar suma $10.000 por integrante adicional', /por cada integrante adicional se suman \$10\.000/.test(ctx));
t('contexto trae 443044', ctx.includes('443044'));

// --- AJUSTE: facturación EXPLÍCITA (afirma ausencia + última factura; el precio del plan NO es deuda) ---
const ctxPagada = buildContexto({ nombre: 'Juan', plan: { nombre: 'Plan 01', precio: 18000 }, cubre: ['emergencias'], factura: null, ultimaFactura: { nro: 'FC-2026-000010', estado: 'pagada' }, planes: [], tel: '443044' });
t('sin pendiente: afirma "NO debés nada"', /NO tenés ninguna factura pendiente\. NO debés nada/.test(ctxPagada));
t('sin pendiente: nombra la última PAGADA con su nº', /FC-2026-000010/.test(ctxPagada) && /PAGADA/.test(ctxPagada));
t('sin pendiente: NO dice "pendiente de $"', !/pendiente de \$/.test(ctxPagada));
t('plan: aclara que la cuota NO es deuda', /cuota REAL de cuenta, NO una deuda/.test(ctxPagada));
const ctxSinFac = buildContexto({ nombre: 'Ana', plan: null, factura: null, ultimaFactura: null, planes: [], tel: '443044' });
t('sin facturas: "No hay facturas registradas todavía"', /No hay facturas registradas todavía/.test(ctxSinFac));

// --- FIX (testigos): CUOTA = dato de TU CUENTA (contable), NUNCA el precio de lista del catálogo. ---
const ctxPlan01 = buildContexto({ nombre: 'Lucas', plan: { nombre: 'Plan 01', precio: 18000 }, cubre: ['emergencias'], factura: null, ultimaFactura: null, planes: [], tel: '443044' });
t('cuota: bloque TU CUENTA presente como fuente', /TU CUENTA/.test(ctxPlan01) && /LA fuente para TODA pregunta sobre "mi plan"/.test(ctxPlan01));
t('cuota: da la cuota REAL del socio (Plan 01 / $18000) en TU CUENTA', /Tu plan asignado: Plan 01\./.test(ctxPlan01) && /Tu cuota \(la que PAGÁS vos\): \$18000/.test(ctxPlan01));
t('cuota: aclara que es su cuota real, NO el precio de lista del catálogo', /NO el precio de lista del catálogo/.test(ctxPlan01));
t('cuota: REGLA DE FUENTES — mi cuota se responde con TU CUENTA, nunca con el catálogo', /para "mi plan\/mi cuota\/cuánto pago" respondé con TU CUENTA .*NUNCA con el CATÁLOGO/.test(ctxPlan01));
t('cuota: plan interno (Plan 01) → sin mapearlo a un plan comercial', /planes internos, ej\. "Plan 01"\).*sin mapearlo/.test(ctxPlan01));
t('catálogo rotulado SOLO-comparar (NO es la cuota del socio)', /precios de LISTA .*SOLO para comparar.*NO es la cuota que paga el socio/.test(ctxPlan01));
t('SYSTEM (fix cuota): mi cuota con TU CUENTA, nunca con el precio de lista del catálogo', /respondé SIEMPRE con el bloque TU CUENTA .*NUNCA con el precio de lista del CATÁLOGO/.test(SYSTEM));
t('SYSTEM (fix cuota): plan interno "Plan 01" no se traduce a comercial', /plan interno, ej\. "Plan 01"\).*sin "traducirlo"/.test(SYSTEM));
t('SYSTEM (fix cuota): precios del catálogo son de LISTA para comparar, no la cuota', /precios del CATÁLOGO .*son de LISTA, para COMPARAR .*NO son la cuota que paga el socio/.test(SYSTEM));

// --- AJUSTE: strip robusto de tokens de botón en la prosa ---
t('limpia [Cambiar mi plan] de la prosa', limpiarBotonesDelTexto('Te conviene el Familiar. [Cambiar mi plan]') === 'Te conviene el Familiar.');
t('NO deja frase colgada: "hacé clic en [X]"', limpiarBotonesDelTexto('Podés cambiar tu plan haciendo clic en [Cambiar mi plan].') === 'Podés cambiar tu plan.');
t('NO deja conector colgado: "con [X]."', limpiarBotonesDelTexto('Reservá con [Pedir turno].') === 'Reservá.');
t('NO duplica puntuación tras limpiar', !/\.\./.test(limpiarBotonesDelTexto('Mirá [Ver comprobantes]..')));
t('catch-all: token inventado por el modelo "[Facturas]"', limpiarBotonesDelTexto('Mirá tus datos en [Facturas].') === 'Mirá tus datos.');
t('saca el relleno "Según el contexto," y recapitaliza', limpiarBotonesDelTexto('Según el contexto, tenés una factura de $18000.') === 'Tenés una factura de $18000.');
t('saca "según el sistema" mid-frase', !/seg[uú]n el sistema/i.test(limpiarBotonesDelTexto('Bueno, según el sistema no debés nada.')));

// --- AJUSTE: voseo rioplatense determinista ---
t('voseo: "Puedes ver" → "Podés ver" (preserva mayúscula)', voseoAr('Puedes ver la app. Si tienes dudas, quieres saber.') === 'Podés ver la app. Si tenés dudas, querés saber.');
t('voseo: "para ti" → "para vos"', voseoAr('es bueno para ti') === 'es bueno para vos');
t('voseo: NO toca compuestos ("mantienes")', voseoAr('mantienes tu plan') === 'mantienes tu plan');
t('voseo: no rompe voseo ya correcto', voseoAr('tenés y podés') === 'tenés y podés');

// --- MICRO-LOTE ---
t('catálogo SIN especialidades (no promete pediátrica/geriátrica)', !/pedi[aá]trica|geri[aá]trica especializada/i.test(ctx));
t('Familiar: atiende todas las edades incl. chicos', /todas las edades, incluidos los chicos/.test(ctx));
t('Familiar: fórmula de cálculo explícita (ej. 4 = $60.000)', /2 de base \+ 2 adicionales = \$60\.000/.test(ctx));
t('SYSTEM: generalista, nunca afirmar especialistas', /medicina GENERALISTA/.test(SYSTEM) && /NUNCA afirmes que hay especialistas/.test(SYSTEM));
t('strip: "ir a [X] y…" no deja frase colgada', limpiarBotonesDelTexto('Podés ir a [Ver comprobantes] y revisar.') === 'Podés revisar.');
t('voseo imperativo: "llama al" → "llamá al"', voseoAr('Si es urgente, llama al 443044.') === 'Si es urgente, llamá al 443044.');
t('voseo imperativo: "toma agua" → "tomá agua"', voseoAr('Descansá y toma agua.') === 'Descansá y tomá agua.');
t('voseo imperativo: "espera un" → "esperá un"', voseoAr('Espera un momento.') === 'Esperá un momento.');
t('voseo guarda: "la llama" (animal) NO se toca', voseoAr('La llama es un animal.') === 'La llama es un animal.');
t('voseo guarda: "la toma de presión" NO se toca', voseoAr('La toma de presión fue normal.') === 'La toma de presión fue normal.');
t('limpia [[control]] residual', limpiarBotonesDelTexto('Ok [[ESCALAR]] listo') === 'Ok listo');
t('limpia varios tokens y no deja espacios dobles', /\[/.test(limpiarBotonesDelTexto('Mirá [Ver comprobantes] o [Pagar] .')) === false);
t('no toca texto sin tokens', limpiarBotonesDelTexto('Tu plan cubre emergencias.') === 'Tu plan cubre emergencias.');

// --- AJUSTE: reglas nuevas en el SYSTEM ---
t('SYSTEM: nunca afirma deudas que el contexto no trae', /NUNCA afirmes deudas ni importes que el contexto no traiga/.test(SYSTEM));
t('SYSTEM: plan es COMERCIAL, no deriva a médico', /Cambiar o elegir un plan es un tema COMERCIAL/.test(SYSTEM) && /NUNCA lo derives a un médico/.test(SYSTEM));
t('SYSTEM: a persona SOLO Joven/Familiar/Senior', /ofrecé SOLO Plan Joven \/ Familiar \/ Senior/.test(SYSTEM));
t('SYSTEM: Área Protegida/Corporativo NO personales → comercial', /Área Protegida.*Corporativo.*NO son planes personales/.test(SYSTEM) && /derivá a contacto comercial/.test(SYSTEM));
t('SYSTEM: no decir "según el contexto/sistema"', /NUNCA digas "según el contexto"/.test(SYSTEM));
t('SYSTEM: botón al final / frase que se entienda sin él', /ponelo AL FINAL o en una frase que se entienda SIN él/.test(SYSTEM));

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

// --- taxonomía (punto 2): "hablar con un médico" = pedir turno. El token viejo YA NO es botón; el chip = [Pedir turno]. ---
t('parseBotones: [Hablar con un médico] YA NO genera botón (fuera de whitelist)', parseBotones('Te recomiendo [Hablar con un médico].').length === 0);
t('parseBotones: [Pedir turno] → accion turno (chip = botón sticky)', parseBotones('Para eso [Pedir turno].').some((x) => x.accion === 'turno'));
t('limpia el token [Hablar con un médico]: no sobrevive corchete en la prosa', !/\[/.test(limpiarBotonesDelTexto('Podés hablar con [Hablar con un médico].')) && limpiarBotonesDelTexto('Podés hablar con [Hablar con un médico].') === 'Podés hablar.');

console.log(`\n${fail ? '✗' : '✓'} smoke-asistente-contexto: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
