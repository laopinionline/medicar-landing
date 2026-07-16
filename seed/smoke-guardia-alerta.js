// Smoke Guardia G1 — la alerta REFERENCIA el reporte, NO duplica el crudo clínico; y los dos triggers
// (derivarAlerta + derivarEstadoReferido) sobre el mismo reporte escriben cosas DISTINTAS (conviven).
const { docAlerta } = require('../functions/guardia');
const { docEstadoReferido } = require('../functions/referente');
let ok = 0, fail = 0;
const t = (l, c, x) => { (c ? ok++ : fail++); console.log(`${c ? '✓' : '✗'} ${l}${x !== undefined ? ' → ' + x : ''}`); };

// Un reporte crudo con síntomas/texto que NO deben duplicarse en la alerta.
const reporte = {
  personaId: 'pAna', personaNombre: 'Pérez, Ana', personaTelefono: '2477000010',
  sintomas: [{ id: 's1', nombre: 'Dolor de pecho', banderaRoja: true }],
  texto: 'me duele el pecho desde anoche', tieneBanderaRoja: true, creadoEn: 1,
};
const a = docAlerta(reporte, 'REP123', 777);

// 1) shape de la alerta: SOLO ruteo + referencia + prioridad + estado
const keys = Object.keys(a).sort();
const esperadas = ['atendidaEn', 'atendidaPor', 'creadoEn', 'estado', 'origenReporteId', 'personaId', 'personaNombre', 'personaTelefono', 'tieneBanderaRoja'].sort();
t('alerta tiene exactamente las claves de ruteo/referencia', JSON.stringify(keys) === JSON.stringify(esperadas), JSON.stringify(keys));
t('referencia al reporte (origenReporteId)', a.origenReporteId === 'REP123');
t('nace en estado "nueva"', a.estado === 'nueva' && a.atendidaPor === null && a.atendidaEn === null);
t('prioridad = flag de bandera roja (un bit)', a.tieneBanderaRoja === true);

// 2) ★ NO duplica el crudo: ni sintomas ni texto en la alerta
const serial = JSON.stringify(a);
const CRUDO = ['sintomas', 'Dolor de pecho', 'me duele', 'texto'];
const filtrados = CRUDO.filter(c => serial.includes(c));
t('★ la alerta NO copia el crudo (sin sintomas/texto)', filtrados.length === 0, filtrados.length ? '¡DUPLICÓ! ' + filtrados.join(',') : 'solo referencia');
t('★ el crudo vive SOLO en el reporte (la alerta no lo tiene)', a.sintomas === undefined && a.texto === undefined);

// 3) reporte sin bandera roja → prioridad normal
const a2 = docAlerta({ personaId: 'pB', tieneBanderaRoja: false }, 'REP9', 1);
t('sin bandera roja → tieneBanderaRoja false', a2.tieneBanderaRoja === false);

// 4) ★ los dos triggers escriben COSAS DISTINTAS sobre el mismo reporte (conviven, no se pisan)
const dEstado = docEstadoReferido('con_sintomas', 1); // lo que escribe derivarEstadoReferido (referente, binario)
t('estado_referido = binario N3 (referente), sin referencia ni crudo', dEstado.ponderacion === 'con_sintomas' && dEstado.origenReporteId === undefined && dEstado.sintomas === undefined);
t('★ alerta (guardia) ≠ estado_referido (referente): docs distintos', a.origenReporteId !== undefined && dEstado.ponderacion !== undefined && a.ponderacion === undefined);

console.log(`\n${ok}/${ok + fail} checks OK`);
process.exit(fail ? 1 : 0);
