// Smoke A2-b — Recordatorio ~2hs antes (Cloud Tasks). Prueba la LÓGICA pura (sin dispositivo real):
//   · revalidación al disparar: turno cancelado/atendido/inexistente → NO manda
//   · idempotencia: recordatorioEnviadoEn seteado → NO re-manda
//   · borde <2hs: turno inminente → NO encola
//   · timezone: instante exacto AR (UTC−3) sin DST
//   · N3: el texto del recordatorio NO interpola nada clínico
//   · reprogramación: task ID determinístico e inyectivo (turno nuevo ⇒ id nuevo ⇒ nunca cruzadas)
const { planRecordatorio, instanteTurno, debeRecordar, textoRecordatorioTurno } = require('../functions/push-turno');
let ok = 0, fail = 0;
const t = (l, c, x) => { (c ? ok++ : fail++); console.log(`${c ? '✓' : '✗'} ${l}${x !== undefined ? ' → ' + x : ''}`); };
const D = (iso) => new Date(iso);

// ── timezone: instante exacto del turno (AR = UTC−3 todo el año, sin DST) ──
t('instante: 2026-07-20 10:30 AR = 13:30Z', instanteTurno('2026-07-20', '10:30').toISOString() === '2026-07-20T13:30:00.000Z');
t('instante: 2026-12-25 00:00 AR = 03:00Z (sin DST en verano)', instanteTurno('2026-12-25', '00:00').toISOString() === '2026-12-25T03:00:00.000Z');
t('instante: fecha basura → null', instanteTurno('xx', '10:30') === null);
t('instante: hora imposible 99:99 → null', instanteTurno('2026-07-20', '99:99') === null);

// ── borde <2hs: qué se encola y qué no ── (turno instante = 2026-07-20T13:30Z; recordatorio = 11:30Z)
let p;
p = planRecordatorio('2026-07-20', '10:30', D('2026-07-20T08:00:00Z')); // 5.5h antes
t('plan: turno lejano → encola', p.enviar === true, p.razon);
t('plan: cuando = turno − 2hs (11:30Z)', p.cuando.toISOString() === '2026-07-20T11:30:00.000Z');
p = planRecordatorio('2026-07-20', '10:30', D('2026-07-20T12:00:00Z')); // turno a 1.5h → recordatorio ya pasó
t('plan: turno <2hs (inminente) → NO encola', p.enviar === false && p.razon === 'inminente');
p = planRecordatorio('2026-07-20', '10:30', D('2026-07-20T11:30:00Z')); // exactamente 2hs
t('plan: exactamente 2hs → NO encola (task para "ahora" no sirve)', p.enviar === false && p.razon === 'inminente');
p = planRecordatorio('2026-07-20', '10:30', D('2026-07-20T11:29:59Z')); // 1s más de 2hs
t('plan: apenas >2hs → encola', p.enviar === true);
p = planRecordatorio('nope', '10:30', D('2026-07-20T08:00:00Z'));
t('plan: fecha inválida → NO encola', p.enviar === false && p.razon === 'fecha-invalida');

// ── revalidación al disparar (red de seguridad) + idempotencia ──
const base = { estado: 'creado', reservadoPorUid: 'uidTitular', fecha: '2026-07-20', hora: '10:30', medicoNombre: 'Dra. Ruiz', nombreVista: 'Pérez, Ana' };
t('revalida: creado + uid → manda', debeRecordar({ ...base }).mandar === true);
t('revalida: confirmado → manda', debeRecordar({ ...base, estado: 'confirmado' }).mandar === true);
t('★ revalida: CANCELADO → NO manda', debeRecordar({ ...base, estado: 'cancelado' }).mandar === false, debeRecordar({ ...base, estado: 'cancelado' }).razon);
t('revalida: atendido → NO manda', debeRecordar({ ...base, estado: 'atendido' }).mandar === false);
t('★ revalida: turno INEXISTENTE (null) → NO manda', debeRecordar(null).mandar === false, debeRecordar(null).razon);
t('revalida: sin reservadoPorUid → NO manda', debeRecordar({ ...base, reservadoPorUid: '' }).mandar === false);
t('★ idempotencia: recordatorioEnviadoEn seteado → NO re-manda', debeRecordar({ ...base, recordatorioEnviadoEn: 123 }).mandar === false, debeRecordar({ ...base, recordatorioEnviadoEn: 123 }).razon);

// ── N3: el texto del recordatorio NO filtra nada clínico ──
const clinico = { ...base, motivo: 'DOLOR_ABDOMINAL', news2: 99, nivel: 'ROJO', desenlace: 'internacion', score: 7 };
const CLIN = ['DOLOR_ABDOMINAL', '99', 'ROJO', 'internacion', 'motivo', 'news2', 'nivel', 'score', 'desenlace'];
const rec = textoRecordatorioTurno(clinico); const full = rec.title + ' ' + rec.body;
t('N3: incluye hora/médico/destino', /10:30/.test(full) && /Dra\. Ruiz/.test(full) && /Pérez, Ana/.test(full));
const filtrado = CLIN.filter((c) => full.includes(c));
t('★ N3: NO interpola NADA clínico', filtrado.length === 0, filtrado.length ? '¡FILTRÓ! ' + filtrado.join(',') : 'limpio');

// ── reprogramación: task ID determinístico e inyectivo (turno nuevo ⇒ id nuevo) ──
const taskIdDeTurno = (turnoId) => String(turnoId).split('').reverse().join(''); // = el de index.js
t('taskId: determinístico (mismo turnoId ⇒ mismo id)', taskIdDeTurno('AbC123') === taskIdDeTurno('AbC123'));
t('★ taskId: turnos distintos ⇒ ids distintos (no se cruzan)', taskIdDeTurno('turnoAAA') !== taskIdDeTurno('turnoBBB'));

console.log(`\n${ok}/${ok + fail} checks OK`);
process.exit(fail ? 1 : 0);
