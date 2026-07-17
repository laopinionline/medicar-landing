// Smoke Guardia G1/G2 — la alerta REFERENCIA (no duplica crudo); triggers conviven; y G2: descubierta como flag,
// guardiaVigente valida el cronograma (presencia no falseable), personasAtendidas para el episodio que sobrevive.
const { docAlerta, guardiaVigente, personasAtendidas } = require('../functions/guardia');
const { docSintomaReferido } = require('../functions/referente');
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
const esperadas = ['atendidaEn', 'atendidaPor', 'creadoEn', 'descubierta', 'estado', 'origenReporteId', 'personaId', 'personaNombre', 'personaTelefono', 'tieneBanderaRoja'].sort();
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

// 4) ★ los dos triggers vivos escriben COSAS DISTINTAS sobre el mismo reporte (conviven, no se pisan):
//    derivarAlerta → alertas/ (guardia, REFERENCIA sin crudo) · derivarSintomaReferido → sintoma_referido/ (referente,
//    el síntoma consentido: nombres + relato). Colecciones y shapes distintos.
const dSint = docSintomaReferido(reporte, 1); // lo que escribe derivarSintomaReferido (solo a vínculos consentidos)
t('sintoma_referido (referente) = nombres + relato consentidos, SIN referencia de ruteo', Array.isArray(dSint.sintomas) && dSint.texto === 'me duele el pecho desde anoche' && dSint.origenReporteId === undefined && dSint.estado === undefined);
t('★ alerta (guardia) ≠ sintoma_referido (referente): docs/colecciones distintos', a.origenReporteId !== undefined && a.sintomas === undefined && dSint.sintomas !== undefined && dSint.origenReporteId === undefined);

// ── G2: descubierta = flag ortogonal al estado (no la saca del pool) ──
const aDesc = docAlerta(reporte, 'REP1', 1, true);
t('descubierta:true cuando entra sin médico presente', aDesc.descubierta === true && aDesc.estado === 'nueva', 'sigue nueva → sigue en el pool');
t('descubierta default false', docAlerta(reporte, 'REP1', 1).descubierta === false);
t('★ descubierta NO cambia el estado (pool = estado nueva)', aDesc.estado === 'nueva'); // el que llega después la ve igual

// ── G2: guardiaVigente valida el cronograma (presencia SOLO dentro de una franja médica) ──
const NOW = 1000;
const franjas = [
  { rol: 'medico', estado: 'programada', inicioMs: 500, finMs: 1500 },   // vigente (500 <= 1000 < 1500)
  { rol: 'medico', estado: 'cerrada', inicioMs: 500, finMs: 1500 },       // cerrada → no
  { rol: 'chofer', estado: 'programada', inicioMs: 500, finMs: 1500 },    // chofer → no cuenta para médico
];
const vig = guardiaVigente(franjas, NOW);
t('★ hay franja médica vigente → devuelve su fin (presenteHasta)', vig && vig.finMs === 1500);
t('★ FUERA de franja (now después del fin) → null (no se puede marcar presente)', guardiaVigente([{ rol: 'medico', estado: 'programada', inicioMs: 100, finMs: 900 }], NOW) === null);
t('antes de la franja → null', guardiaVigente([{ rol: 'medico', estado: 'programada', inicioMs: 1200, finMs: 2000 }], NOW) === null);
t('franja cerrada → null (no vale aunque el horario incluya el ahora)', guardiaVigente([{ rol: 'medico', estado: 'cerrada', inicioMs: 500, finMs: 1500 }], NOW) === null);
t('guardia de CHOFER no habilita presencia médica', guardiaVigente([{ rol: 'chofer', estado: 'programada', inicioMs: 500, finMs: 1500 }], NOW) === null);
t('sin guardias → null', guardiaVigente([], NOW) === null);

// ── G2: personasAtendidas (episodio que sobrevive) = pacientes de episodios ABIERTOS ──
const eps = [
  { medicoId: 'm1', estado: 'atencion', pacienteId: 'pAna' },   // abierto
  { medicoId: 'm1', estado: 'despacho', pacienteId: 'pLuis' },  // abierto
  { medicoId: 'm1', estado: 'cerrado', pacienteId: 'pViejo' },  // cerrado → fuera
  { medicoId: 'm1', estado: 'cancelado', pacienteId: 'pX' },    // cancelado → fuera
];
const at = personasAtendidas(eps).sort();
t('★ atendiendo = solo pacientes de episodios ABIERTOS', JSON.stringify(at) === JSON.stringify(['pAna', 'pLuis']), JSON.stringify(at));
t('episodio cerrado/cancelado NO deja al paciente en atendiendo', !at.includes('pViejo') && !at.includes('pX'));

console.log(`\n${ok}/${ok + fail} checks OK`);
process.exit(fail ? 1 : 0);
