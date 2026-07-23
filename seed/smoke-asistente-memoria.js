'use strict';
// Smoke — MEMORIA POR SOCIO: memoria-nucleo (validarMemoria/escanearOlvido/parseResumen) + inyección en buildContexto.
const { validarMemoria, tieneContenido, escanearOlvido, parseResumen, LIMITES } = require('../functions/memoria-nucleo');
const { buildContexto, bloqueMemoria } = require('../functions/asistente-prompt');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };
const HOY = '2026-07-23';

// ===== validarMemoria: estructura ACOTADA, determinista =====
const m1 = validarMemoria({
  temas: [{ t: 'dolor de rodilla', fecha: '2026-07-20' }, { t: 'consulta por plan' }],
  seguimientos: [{ t: 'dolor de pie izquierdo hace 3 días', desde: '2026-07-18' }],
  pendientes: [{ t: 'quiere pasar a plan Familiar' }],
  preferencias: [{ t: 'que le hablen de usted' }],
}, HOY);
t('valida: conserva los 4 arrays', m1.temas.length === 2 && m1.seguimientos.length === 1 && m1.pendientes.length === 1 && m1.preferencias.length === 1);
t('valida: respeta fecha ISO provista', m1.temas[0].fecha === '2026-07-20');
t('valida: default de fecha faltante = hoy', m1.temas[1].fecha === HOY);
t('valida: seguimientos usan campo "desde"', m1.seguimientos[0].desde === '2026-07-18');
t('valida: preferencias SIN fecha', m1.preferencias[0].desde === undefined && m1.preferencias[0].fecha === undefined);

// N3 / anti-inyección: descarta scores, niveles, claves extra y arrays no-whitelist.
const m2 = validarMemoria({
  temas: [{ t: 'cefalea', fecha: '2026-07-23', score: 9, nivel: 'N3', categoria: 'salud' }],
  scoreGlobal: 7, diagnostico: 'migraña', clinico: [{ t: 'x' }],
}, HOY);
t('N3: el ítem NO conserva score/nivel/categoria', JSON.stringify(m2.temas[0]) === JSON.stringify({ t: 'cefalea', fecha: '2026-07-23' }));
t('N3: descarta claves top-level no-whitelist (scoreGlobal/diagnostico)', m2.scoreGlobal === undefined && m2.diagnostico === undefined);
t('N3: descarta arrays no-whitelist (clinico)', m2.clinico === undefined);

// Truncado por largo + capeo de cantidad.
const largo = 'x'.repeat(300);
const m3 = validarMemoria({
  temas: Array.from({ length: 30 }, (_, i) => ({ t: 'tema ' + i + ' ' + largo })),
  seguimientos: Array.from({ length: 20 }, () => ({ t: largo })),
}, HOY);
t('capea temas a ' + LIMITES.temas.cap, m3.temas.length === LIMITES.temas.cap);
t('capea seguimientos a ' + LIMITES.seguimientos.cap, m3.seguimientos.length === LIMITES.seguimientos.cap);
t('trunca t de temas a ' + LIMITES.temas.max, m3.temas[0].t.length === LIMITES.temas.max);
t('trunca t de seguimientos a ' + LIMITES.seguimientos.max, m3.seguimientos[0].t.length === LIMITES.seguimientos.max);

// Ítems vacíos / basura → fuera. Propuesta no-objeto → estructura vacía.
const m4 = validarMemoria({ temas: [{ t: '   ' }, { t: '' }, 'string-suelto', null] }, HOY);
t('descarta ítems sin texto real', m4.temas.length === 1 && m4.temas[0].t === 'string-suelto');
const m5 = validarMemoria('no soy un objeto', HOY);
t('propuesta no-objeto → 4 arrays vacíos', m5.temas.length === 0 && m5.seguimientos.length === 0 && m5.pendientes.length === 0 && m5.preferencias.length === 0);
t('tieneContenido: false en vacío / true con algo', tieneContenido(m5) === false && tieneContenido(m1) === true);

// ===== escanearOlvido: pedido de borrado (determinista) =====
const OLVIDO_SI = ['olvidate de esto', 'olvidá de todo esto', 'borrá lo que hablamos', 'borrame el historial',
  'eliminá la memoria', 'borrá la conversación', 'olvidate de lo que te dije', 'no te acuerdes de esto',
  'Olvidate de todo lo que hablamos por favor'];
const OLVIDO_NO = ['me olvidé de tomar la pastilla', 'olvidé mi contraseña', 'borrá el turno del martes',
  'no me acuerdo de la fecha', '¿cuánto sale mi plan?', 'olvidate de tomar la pastilla, es todo por hoy',
  'quiero que recuerdes que soy alérgico'];
OLVIDO_SI.forEach((s) => t('olvido SÍ: "' + s + '"', escanearOlvido(s) === true));
OLVIDO_NO.forEach((s) => t('olvido NO: "' + s + '"', escanearOlvido(s) === false));

// ===== parseResumen: extrae JSON y valida; basura → null =====
const pr = parseResumen('Acá va: {"temas":[{"t":"tos","fecha":"2026-07-23"}],"score":9} listo', HOY);
t('parseResumen: extrae el JSON embebido y valida', pr && pr.temas.length === 1 && pr.temas[0].t === 'tos');
t('parseResumen: aplica N3 al JSON del modelo (sin score)', pr && pr.temas[0].score === undefined);
t('parseResumen: sin JSON → null', parseResumen('no hay json acá', HOY) === null);
t('parseResumen: JSON roto → null', parseResumen('{ roto: ', HOY) === null);

// ===== Inyección en buildContexto: SUBORDINADA a TU CUENTA =====
const ctx = buildContexto({
  nombre: 'Lucas', plan: { nombre: 'Plan 01', precio: 18000 }, cubre: ['emergencias'],
  factura: null, ultimaFactura: null,
  memoria: { temas: [{ t: 'dolor de pie', fecha: '2026-07-20' }], seguimientos: [{ t: 'sigue el dolor de pie', desde: '2026-07-20' }], pendientes: [], preferencias: [] },
  tel: '443044',
});
t('inyección: aparece el bloque "DE CHARLAS ANTERIORES"', /DE CHARLAS ANTERIORES/.test(ctx));
t('inyección: retoma el tema previo (dolor de pie)', /dolor de pie/.test(ctx));
t('inyección: TU CUENTA aparece ANTES que la memoria', ctx.indexOf('TU CUENTA') >= 0 && ctx.indexOf('TU CUENTA') < ctx.indexOf('DE CHARLAS ANTERIORES'));
t('inyección: regla de precedencia — MANDA TU CUENTA si contradice', /si algo acá contradice TU CUENTA.*MANDA TU CUENTA/.test(ctx));
t('inyección: es SECUNDARIO / no recitar', /es SECUNDARIO/.test(ctx) && /no lo recites/.test(ctx));
// Sin memoria (o vacía) → NO se inyecta bloque.
const ctxSin = buildContexto({ nombre: 'Ana', plan: null, factura: null, ultimaFactura: null, tel: '443044' });
t('sin memoria: NO aparece bloque de charlas anteriores', !/DE CHARLAS ANTERIORES/.test(ctxSin));
t('bloqueMemoria: vacío → ""', bloqueMemoria({ temas: [], seguimientos: [], pendientes: [], preferencias: [] }) === '' && bloqueMemoria(null) === '');
t('bloqueMemoria: formatea seguimientos/pendientes/preferencias', /Seguimiento abierto: sigue el dolor de pie/.test(bloqueMemoria(ctx && { seguimientos: [{ t: 'sigue el dolor de pie', desde: '2026-07-20' }], pendientes: [{ t: 'cambiar plan' }], preferencias: [{ t: 'de usted' }] })));

console.log(`\n${fail ? '✗' : '✓'} smoke-asistente-memoria: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
