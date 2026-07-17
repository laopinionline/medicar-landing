// Smoke R1.5 — búsqueda: 🚩 INVARIANTE CERO ORÁCULO. Todo fallo (no existe / sin login / apellido incorrecto) devuelve
// EXACTAMENTE el mismo {encontrado:false} — un atacante no puede distinguir "número válido, apellido no" de "no existe".
// Y anti-spam de la solicitud (una pendiente por par, no auto, no duplicar vínculo). Núcleo puro, sin Firebase.
const { resultadoBusqueda, apellidoCoincide, normNombre, puedeSolicitar } = require('../functions/referente');
let ok = 0, fail = 0;
const t = (l, c, x) => { (c ? ok++ : fail++); console.log(`${c ? '✓' : '✗'} ${l}${x !== undefined ? ' → ' + x : ''}`); };

const persona = { id: 'pLucia', apellido: 'Pérez' };

// ── 1) CERO ORÁCULO: los 4 fallos devuelven el MISMO objeto genérico ──
const rNoExiste   = resultadoBusqueda({ persona: null, apellidoInput: 'Pérez', tieneLogin: false, nombreCompleto: '' });
const rSinLogin   = resultadoBusqueda({ persona, apellidoInput: 'Pérez', tieneLogin: false, nombreCompleto: 'Pérez, Lucía' });
const rApeMal     = resultadoBusqueda({ persona, apellidoInput: 'Gómez', tieneLogin: true, nombreCompleto: 'Pérez, Lucía' }); // número válido, apellido incorrecto
const rTodoMal    = resultadoBusqueda({ persona: null, apellidoInput: 'X', tieneLogin: false, nombreCompleto: '' });
const GEN = JSON.stringify({ encontrado: false });
t('no-existe → {encontrado:false}', JSON.stringify(rNoExiste) === GEN, JSON.stringify(rNoExiste));
t('sin-login → {encontrado:false}', JSON.stringify(rSinLogin) === GEN, JSON.stringify(rSinLogin));
t('★ número válido + apellido INCORRECTO → {encontrado:false}', JSON.stringify(rApeMal) === GEN, JSON.stringify(rApeMal));
t('★★ apellido-incorrecto === no-existe (MISMO resultado, sin oráculo)', JSON.stringify(rApeMal) === JSON.stringify(rNoExiste));
t('★ el fallo NO filtra nombre ni id (solo {encontrado:false})', !('nombre' in rApeMal) && !('titularPersonaId' in rApeMal));
t('todos los fallos son IDÉNTICOS entre sí', new Set([rNoExiste, rSinLogin, rApeMal, rTodoMal].map(x => JSON.stringify(x))).size === 1);

// ── 2) ACIERTO completo: persona + login + apellido → revela nombre + id ──
const rOk = resultadoBusqueda({ persona, apellidoInput: 'pérez', tieneLogin: true, nombreCompleto: 'Pérez, Lucía' });
t('acierto (persona+login+apellido) → encontrado:true', rOk.encontrado === true);
t('acierto devuelve nombre COMPLETO', rOk.nombre === 'Pérez, Lucía');
t('acierto devuelve el id opaco', rOk.titularPersonaId === 'pLucia');

// ── 3) match de apellido: insensible a mayúsculas/tildes; vacío → false ──
t('apellido: "PÉREZ" coincide con "perez" (mayúsc/tildes)', apellidoCoincide('PÉREZ', 'perez'));
t('apellido: "Gómez" NO coincide con "Pérez"', !apellidoCoincide('Gómez', 'Pérez'));
t('apellido vacío → NO coincide (no matchea todo)', !apellidoCoincide('', '') && !apellidoCoincide('', 'Pérez'));
t('normNombre saca tildes y baja a minúscula', normNombre('  PÉreZ ') === 'perez');

// ── 4) anti-spam de la solicitud ──
t('puedeSolicitar limpio → ok', puedeSolicitar({}).ok === true);
t('★ auto-referencia → rechaza', puedeSolicitar({ esAutoReferencia: true }).ok === false);
t('★ ya vínculo activo → rechaza', puedeSolicitar({ yaVinculoActivo: true }).ok === false);
t('★ ya pendiente (una por par) → rechaza', puedeSolicitar({ yaPendiente: true }).ok === false);

console.log(`\n${ok}/${ok + fail} checks OK`);
process.exit(fail ? 1 : 0);
